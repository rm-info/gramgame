import { supabase } from './supabase';
import { auth } from './auth.svelte';

export interface UserProfile {
	user_id: string;
	display_name: string;
	grade_level: string;
	created_at: string;
}

class ProfileState {
	profile: UserProfile | null = $state(null);
	loading = $state(false);
	loaded = $state(false);

	async load() {
		if (!auth.user) {
			this.profile = null;
			this.loaded = true;
			return;
		}
		this.loading = true;
		const { data, error } = await supabase
			.from('user_profiles')
			.select('*')
			.eq('user_id', auth.user.id)
			.maybeSingle();
		this.loading = false;
		this.loaded = true;
		if (error) {
			console.error('Failed to load profile', error);
			this.profile = null;
			return;
		}
		this.profile = data;
	}

	async upsert(displayName: string, gradeLevel: string) {
		if (!auth.user) throw new Error('Pas de session active.');
		const { data, error } = await supabase
			.from('user_profiles')
			.upsert({
				user_id: auth.user.id,
				display_name: displayName,
				grade_level: gradeLevel
			})
			.select()
			.single();
		if (error) throw error;
		this.profile = data;
	}

	reset() {
		this.profile = null;
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
