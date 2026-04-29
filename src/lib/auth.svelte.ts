import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

class AuthState {
	session: Session | null = $state(null);
	user: User | null = $state(null);
	loading = $state(true);
	private initialized = false;

	async init() {
		if (this.initialized) return;
		this.initialized = true;

		const { data } = await supabase.auth.getSession();
		this.session = data.session;
		this.user = data.session?.user ?? null;
		this.loading = false;

		supabase.auth.onAuthStateChange((_event, session) => {
			this.session = session;
			this.user = session?.user ?? null;
		});
	}

	async signOut() {
		await supabase.auth.signOut();
	}
}

export const auth = new AuthState();
