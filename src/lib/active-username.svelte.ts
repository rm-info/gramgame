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
	 * Tente de "claim" un username via une fonction Postgres SECURITY DEFINER
	 * (côté serveur, à l'abri des subtilités RLS). Idempotent : si déjà claim
	 * par l'utilisateur courant, retourne ok.
	 */
	async claim(name: string): Promise<{ ok: boolean; reason?: string }> {
		if (!auth.user) return { ok: false, reason: 'Pas de session.' };

		const { data, error } = await supabase.rpc('claim_username', {
			target_username: name
		});

		if (error) {
			console.error('claim_username rpc failed', error);
			return { ok: false, reason: error.message };
		}

		if (data === 'ok') return { ok: true };

		const reasons: Record<string, string> = {
			not_authenticated: 'Pas de session active.',
			no_email: 'Aucun email associé à ta session.',
			not_found: `Le compte « ${name} » n'existe pas.`,
			taken_by_other: `Le compte « ${name} » appartient à un autre utilisateur.`,
			email_mismatch: `L'email de ta session (${auth.user.email ?? '?'}) ne correspond pas à l'email d'inscription du compte « ${name} ». Reconnecte-toi avec le bon email, ou refais une inscription.`
		};
		return {
			ok: false,
			reason: reasons[data as string] ?? `Erreur inattendue : ${data}`
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
