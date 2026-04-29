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

		// On essaie d'updater. RLS autorise seulement si user_id IS NULL et
		// JWT email = real_email.
		const { data, error } = await supabase
			.from('usernames')
			.update({ user_id: auth.user.id })
			.eq('username', name)
			.is('user_id', null)
			.select();

		if (error) {
			console.error('Claim failed', error);
			return { ok: false, reason: error.message };
		}

		// Si data est vide, soit la ligne n'existe pas, soit elle est déjà claim.
		// On vérifie l'état actuel.
		if (!data || data.length === 0) {
			const { data: existing } = await supabase
				.from('usernames')
				.select('user_id')
				.eq('username', name)
				.maybeSingle();
			if (!existing) {
				return { ok: false, reason: 'Username inconnu.' };
			}
			if (existing.user_id !== auth.user.id) {
				return { ok: false, reason: 'Ce username appartient à un autre compte.' };
			}
			// Déjà claim par nous-mêmes, OK.
		}
		return { ok: true };
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
