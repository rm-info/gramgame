import { supabase } from './supabase';
import { auth } from './auth.svelte';

export interface UserProfile {
	user_id: string;
	grade_level: string;
	created_at: string;
}

export interface UsernameRow {
	username: string;
}

class ProfileState {
	profile: UserProfile | null = $state(null);
	username: string | null = $state(null);
	loading = $state(false);
	loaded = $state(false);

	async load() {
		if (!auth.user) {
			this.profile = null;
			this.username = null;
			this.loaded = true;
			return;
		}
		this.loading = true;

		// Charge en parallèle : profil pédagogique + username
		const [profileRes, usernameRes] = await Promise.all([
			supabase
				.from('user_profiles')
				.select('user_id, grade_level, created_at')
				.eq('user_id', auth.user.id)
				.maybeSingle(),
			supabase
				.from('usernames')
				.select('username')
				.eq('auth_email', auth.user.email)
				.maybeSingle()
		]);

		this.loading = false;
		this.loaded = true;

		if (profileRes.error) {
			console.error('Failed to load profile', profileRes.error);
			this.profile = null;
		} else {
			this.profile = profileRes.data;
		}

		if (usernameRes.error) {
			console.error('Failed to load username', usernameRes.error);
			this.username = null;
		} else {
			this.username = usernameRes.data?.username ?? null;
		}
	}

	async upsertGradeLevel(gradeLevel: string) {
		if (!auth.user) throw new Error('Pas de session active.');
		const { data, error } = await supabase
			.from('user_profiles')
			.upsert({
				user_id: auth.user.id,
				grade_level: gradeLevel
			})
			.select()
			.single();
		if (error) throw error;
		this.profile = data;
	}

	reset() {
		this.profile = null;
		this.username = null;
		this.loaded = false;
	}
}

export const profileState = new ProfileState();

export const GRADE_LEVELS = [
	'CP',
	'CE1',
	'CE2',
	'CM1',
	'CM2',
	'6e',
	'5e',
	'4e',
	'3e',
	'2nde',
	'1re',
	'Terminale',
	'Adulte'
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];
