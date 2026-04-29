import { supabase } from './supabase';
import { activeUsername } from './active-username.svelte';

class ProfileState {
	gradeLevel: string | null = $state(null);
	loading = $state(false);
	loaded = $state(false);
	loadedFor: string | null = $state(null);

	async load() {
		const username = activeUsername.username;
		if (!username) {
			this.gradeLevel = null;
			this.loaded = true;
			this.loadedFor = null;
			return;
		}
		this.loading = true;
		const { data, error } = await supabase
			.from('user_profiles')
			.select('grade_level')
			.eq('username', username)
			.maybeSingle();
		this.loading = false;
		this.loaded = true;
		this.loadedFor = username;
		if (error) {
			console.error('Failed to load profile', error);
			this.gradeLevel = null;
			return;
		}
		this.gradeLevel = data?.grade_level ?? null;
	}

	async upsertGradeLevel(grade: string) {
		const username = activeUsername.username;
		if (!username) throw new Error('Pas de username actif.');
		const { error } = await supabase
			.from('user_profiles')
			.upsert({ username, grade_level: grade });
		if (error) throw error;
		this.gradeLevel = grade;
		this.loaded = true;
		this.loadedFor = username;
	}

	reset() {
		this.gradeLevel = null;
		this.loaded = false;
		this.loadedFor = null;
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
