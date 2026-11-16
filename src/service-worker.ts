/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Service worker de GramGame : uniquement les notifications de rappel
// (pas de cache hors ligne). Enregistré automatiquement par SvelteKit.
//
// Le serveur PUSH envoie { id, t } à l'heure prévue. On retrouve le compte
// concerné en local (IndexedDB), on relit ses évaluations sur GramGame pour un
// texte à jour, et on affiche TOUJOURS une notification (sinon Safari coupe
// l'abonnement).

import { kvGet, reminderAll, reminderDelete, reminderGet, pushClientStorage } from '$lib/push/idb';
import { FALLBACK, UNKNOWN, notificationContent, type EvalLite } from '$lib/push/logic';

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-96.png';

sw.addEventListener('push', (event) => {
	event.waitUntil(
		handlePush(event).catch(() =>
			// Quoi qu'il arrive, une notification.
			sw.registration.showNotification(UNKNOWN.title, { body: UNKNOWN.body, icon: ICON, badge: BADGE, data: { url: UNKNOWN.url } })
		)
	);
});

async function handlePush(event: PushEvent) {
	let data: { id?: string; t?: number } = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		// pas du JSON
	}
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const rec = data.id ? await reminderGet(data.id) : undefined;
	let content: { title: string; body: string; url: string } = rec ? FALLBACK : UNKNOWN;
	let nothingLeft = false;

	if (rec) {
		const auth = await kvGet<{ token: string; username: string }>(`auth:${rec.userId}`);
		if (auth?.token) {
			try {
				const ctrl = new AbortController();
				const timer = setTimeout(() => ctrl.abort(), 6000);
				const r = await fetch('/api/gram/evals/mine', { headers: { Authorization: auth.token }, signal: ctrl.signal });
				clearTimeout(timer);
				if (r.ok) {
					const list = ((await r.json()) as { evaluations: EvalLite[] }).evaluations;
					// Plusieurs comptes élèves sur l'appareil : on précise lequel.
					const several = (await reminderAll()).length > 1;
					const c = notificationContent(list, Date.now(), tz, several ? rec.username : undefined);
					if (c) content = c;
					else nothingLeft = true;
				}
			} catch {
				// hors ligne, délai dépassé : texte générique
			}
		}
	}

	if (nothingLeft && rec) {
		// Tout a été rendu entre-temps (sur un autre appareil…) : on prévient une
		// dernière fois et on arrête le rappel.
		content = { title: '📝 GramGame', body: 'Toutes tes évaluations sont faites. Bravo !', url: '/evaluations' };
		await stopReminder(rec.id).catch(() => {});
	}

	await sw.registration.showNotification(content.title, {
		body: content.body,
		icon: ICON,
		badge: BADGE,
		lang: 'fr',
		tag: rec ? `gramgame-evals-${rec.userId}` : 'gramgame-evals',
		data: { url: content.url }
	});
}

/** Supprime un rappel côté serveur PUSH et en local. */
async function stopReminder(id: string) {
	const cfg = await kvGet<{ baseUrl: string; appKey: string }>('config');
	const { token } = (await pushClientStorage.get()) as { token?: string };
	if (cfg && token) {
		await fetch(`${cfg.baseUrl}/v1/reminders/${encodeURIComponent(id)}`, {
			method: 'DELETE',
			headers: { 'X-App-Key': cfg.appKey, Authorization: `Bearer ${token}` }
		});
	}
	await reminderDelete(id);
}

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL((event.notification.data?.url as string) || '/evaluations', sw.location.origin).href;
	event.waitUntil(
		(async () => {
			const all = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const client = all.find((c) => new URL(c.url).origin === sw.location.origin) as WindowClient | undefined;
			if (client) {
				await client.focus();
				return client.navigate(url).catch(() => null);
			}
			return sw.clients.openWindow(url);
		})()
	);
});

// Chrome / Firefox peuvent renouveler l'abonnement : on le dit au serveur PUSH
// (même jeton, mêmes rappels). Safari ne déclenche pas cet évènement : l'app
// revérifie l'abonnement à chaque ouverture.
sw.addEventListener('pushsubscriptionchange', (event) => {
	const ev = event as Event & { newSubscription?: PushSubscription | null; waitUntil(p: Promise<unknown>): void };
	ev.waitUntil(
		(async () => {
			const cfg = await kvGet<{ baseUrl: string; appKey: string }>('config');
			const stored = (await pushClientStorage.get()) as { token?: string; vapidKey?: string };
			if (!cfg || !stored.token) return;
			const sub =
				ev.newSubscription ||
				(await sw.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: stored.vapidKey }));
			await fetch(`${cfg.baseUrl}/v1/subscription`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', 'X-App-Key': cfg.appKey, Authorization: `Bearer ${stored.token}` },
				body: JSON.stringify(sub.toJSON())
			});
			await pushClientStorage.set({ ...stored, endpoint: sub.endpoint });
		})()
	);
});
