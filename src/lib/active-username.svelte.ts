import { auth } from './auth.svelte';
import { supabase } from './supabase';

const STORAGE_KEY = 'gramgame.active_username';

/**
 * Username "actif" pour la session courante (parmi ceux que l'utilisateur
 * possède). Persisté en localStorage pour rester d'une session navigateur à
 * l'autre. Une page de "switch d'apprenant" plus tard permettra à un parent
 * de basculer d'un enfant à l'autre sans relogin.
 */
class ActiveUsernameState {
	username: string | null = $state(null);
	available: string[] = $state([]);
	loaded = $state(false);
	loading = $state(false);

	async load() {
		if (typeof window === 'undefined') return;

		if (!auth.user) {
			this.username = null;
			this.available = [];
			this.loaded = true;
			return;
		}

		this.loading = true;
		const { data, error } = await supabase
			.from('usernames')
			.select('username')
			.eq('user_id', auth.user.id);
		this.loading = false;
		this.loaded = true;

		if (error) {
			console.error('Failed to load owned usernames', error);
			this.available = [];
			return;
		}

		this.available = (data ?? []).map((r) => r.username);

		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && this.available.includes(stored)) {
			this.username = stored;
		} else if (this.available.length > 0) {
			this.username = this.available[0];
			localStorage.setItem(STORAGE_KEY, this.username);
		} else {
			this.username = null;
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	set(name: string) {
		if (!this.available.includes(name)) {
			throw new Error(`Username "${name}" non disponible.`);
		}
		this.username = name;
		if (typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, name);
		}
	}

	/**
	 * Tente de "claim" un username : pose user_id sur sa ligne usernames si
	 * elle est non claim et que l'email JWT correspond. RLS impose les checks.
	 * Idempotent : si déjà claim par l'utilisateur courant, ne fait rien.
	 */
	async claim(name: string): Promise<{ ok: boolean; reason?: string }> {
		if (!auth.user) return { ok: false, reason: 'Pas de session.' };

		// 1. UPDATE — RLS autorise seulement si user_id IS NULL et JWT email = real_email.
		const { data: updated, error: updateError } = await supabase
			.from('usernames')
			.update({ user_id: auth.user.id })
			.eq('username', name)
			.is('user_id', null)
			.select();

		if (updateError) {
			console.error('Claim UPDATE failed', updateError);
			return { ok: false, reason: updateError.message };
		}

		if (updated && updated.length > 0) {
			return { ok: true };
		}

		// 2. UPDATE n'a rien mis à jour. On essaie de voir l'état actuel via SELECT.
		// RLS sur SELECT autorise seulement si auth.uid() = user_id (déjà claim par nous).
		const { data: existing } = await supabase
			.from('usernames')
			.select('user_id')
			.eq('username', name)
			.maybeSingle();

		if (existing && existing.user_id === auth.user.id) {
			// Déjà claim par nous-mêmes, OK.
			return { ok: true };
		}

		// 3. Ni update ni read : soit la ligne n'existe pas, soit elle est claim
		// par quelqu'un d'autre, soit (le plus probable) l'email JWT ne match pas
		// real_email — auquel cas la ligne existe mais nous est invisible. Le
		// message expose l'email de la session pour aider à debug.
		return {
			ok: false,
			reason: `impossible de revendiquer ce compte. Email de session : « ${auth.user.email ?? '?'} ». Si l'inscription a été faite avec un email différent, fais une nouvelle inscription propre.`
		};
	}

	reset() {
		this.username = null;
		this.available = [];
		this.loaded = false;
		if (typeof window !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
	}
}

export const activeUsername = new ActiveUsernameState();
