// Rappels d'évaluations par notification, côté app (élève).
//
// Le serveur PUSH (https://push.lab.rm-info.fr) ne connaît qu'un identifiant
// opaque et un horaire. C'est l'app qui décide : à chaque ouverture (et après
// chaque copie rendue), elle regarde les évaluations à faire et programme UN
// rappel quotidien à 17 h 30, ou le supprime. Au moment du rappel, le service
// worker relit la liste à jour pour écrire la notification.

import { pb } from '$lib/pb';
import { evalsApi } from '$lib/api/evals';
import { PushClient } from './push-client.js';
import {
	kvGet,
	kvSet,
	kvDelete,
	reminderAll,
	reminderDelete,
	reminderGet,
	reminderPut,
	reminderClear,
	pushClientStorage,
	type LocalReminder
} from './idb';
import { reminderSchedule, type EvalLite } from './logic';

export type PushStatus =
	| 'loading'
	| 'unavailable' // pas de clé côté serveur : option masquée
	| 'unsupported' // navigateur sans notifications push
	| 'ios_install' // iPhone / iPad : installer l'app sur l'écran d'accueil d'abord
	| 'denied' // notifications bloquées dans les réglages
	| 'off'
	| 'on'
	| 'revoked' // clé désactivée par l'opérateur du serveur PUSH
	| 'error';

interface PushConfig {
	enabled: boolean;
	base_url?: string;
	app_key?: string;
}

type PushErr = Error & { status?: number; code?: string };

const isIOS = () =>
	/iPad|iPhone|iPod/.test(navigator.userAgent) ||
	(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class PushReminders {
	status = $state<PushStatus>('loading');
	busy = $state(false);
	error = $state<string | null>(null);

	private client: PushClient | null = null;
	private userId = '';
	private username = '';
	private initFor = '';

	/** Au démarrage, pour un élève connecté. */
	async init(userId: string, username: string) {
		if (this.initFor === userId) return;
		this.initFor = userId;
		this.userId = userId;
		this.username = username;
		this.error = null;
		try {
			const cfg = await fetch('/api/gram/push-config').then((r) => r.json() as Promise<PushConfig>);
			if (!cfg.enabled || !cfg.base_url || !cfg.app_key) {
				this.status = 'unavailable';
				return;
			}
			if (isIOS() && !PushClient.isStandalone()) {
				this.status = 'ios_install';
				return;
			}
			if (!PushClient.isSupported()) {
				this.status = 'unsupported';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			this.client = new PushClient({ baseUrl: cfg.base_url, appKey: cfg.app_key, registration, storage: pushClientStorage });
			// Pour le service worker (changement d'abonnement, suppression d'un rappel).
			await kvSet('config', { baseUrl: cfg.base_url, appKey: cfg.app_key });
			if (Notification.permission === 'denied') {
				this.status = 'denied';
				return;
			}
			const { enabled, reset } = await this.client.sync();
			if (reset) await this.resync();
			this.status = enabled ? 'on' : 'off';
			if (enabled) await this.refresh();
		} catch (e) {
			this.fail(e);
		}
	}

	/** Bouton « Me rappeler mes évaluations » (doit venir d'un clic). */
	async enable() {
		if (!this.client) return;
		this.busy = true;
		this.error = null;
		try {
			const { reset } = await this.client.enable();
			if (reset) await this.resync();
			this.status = 'on';
			await this.refresh();
		} catch (e) {
			if ((e as PushErr).code === 'permission_denied') {
				this.status = Notification.permission === 'denied' ? 'denied' : 'off';
			} else this.fail(e);
		}
		this.busy = false;
	}

	async disable() {
		if (!this.client) return;
		this.busy = true;
		this.error = null;
		try {
			await this.client.disable();
			await reminderClear();
			this.status = 'off';
		} catch (e) {
			this.fail(e);
		}
		this.busy = false;
	}

	/** Relit les évaluations de l'élève et met le rappel à jour. */
	async refresh() {
		if (this.status !== 'on') return;
		try {
			await this.syncEvals((await evalsApi.mine()).evaluations);
		} catch (e) {
			this.fail(e);
		}
	}

	/** Met à jour le rappel à partir d'une liste déjà chargée (accueil, page des évaluations). */
	async syncEvals(list: EvalLite[]) {
		if (this.status !== 'on' || !this.client || !this.userId) return;
		try {
			// Le service worker relit les évaluations avec la session de ce compte.
			if (pb.authStore.isValid && pb.authStore.record?.id === this.userId) {
				await kvSet(`auth:${this.userId}`, { token: pb.authStore.token, username: this.username });
			}
			let id = await kvGet<string>(`rid:${this.userId}`);
			if (!id) {
				id = `gg-${crypto.randomUUID()}`;
				await kvSet(`rid:${this.userId}`, id);
			}
			const schedule = reminderSchedule(list, PushClient.timeZone(), Date.now());
			const current = await reminderGet(id);
			if (!schedule) {
				if (current) {
					await this.client.deleteReminder(id);
					await reminderDelete(id);
				}
				return;
			}
			if (current && JSON.stringify(current.schedule) === JSON.stringify(schedule)) return;
			// Toujours écrire en local AVANT le serveur (la notification doit trouver le rappel).
			const rec: LocalReminder = { id, userId: this.userId, username: this.username, schedule: { ...schedule } };
			await reminderPut(rec);
			try {
				await this.client.putReminder(id, schedule);
			} catch (e) {
				if ((e as PushErr).code === 'no_occurrence') await reminderDelete(id);
				else throw e;
			}
		} catch (e) {
			this.fail(e);
		}
	}

	/** Déconnexion d'un compte : plus de rappels pour lui sur cet appareil. */
	async forget(userId: string) {
		try {
			const id = await kvGet<string>(`rid:${userId}`);
			await kvDelete(`auth:${userId}`);
			if (id) {
				await reminderDelete(id);
				if (this.client && this.status === 'on') await this.client.deleteReminder(id);
			}
		} catch {
			// hors ligne : le service worker s'en chargera (session invalide → texte générique)
		}
		if (this.userId === userId) this.initFor = '';
	}

	/** Le serveur PUSH avait oublié l'appareil : on lui renvoie tous les rappels locaux. */
	private async resync() {
		if (!this.client) return;
		const all = await reminderAll();
		await this.client.replaceReminders(all.map((r) => ({ id: r.id, schedule: r.schedule })));
	}

	private fail(e: unknown) {
		const err = e as PushErr;
		if (err?.status === 403 && err.code === 'app_disabled') {
			this.status = 'revoked';
			return;
		}
		console.warn('Rappels push :', e);
		this.error = err?.message || String(e);
		if (this.status === 'loading') this.status = 'error';
	}
}

export const pushReminders = new PushReminders();
