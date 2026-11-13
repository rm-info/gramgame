import { auth } from './auth.svelte';
import { pb, type UserRecord } from './pb';

/** Préférences pédagogiques du compte actif (stockées sur le record users). */
class ProfileState {
	get gradeLevel(): string | null {
		return auth.user?.grade_level || null;
	}
	get loaded() {
		return !auth.loading;
	}

	async upsertGradeLevel(grade: string) {
		const user = auth.user;
		if (!user) throw new Error('Pas de compte actif.');
		const updated = await pb
			.collection('users')
			.update<UserRecord>(user.id, { grade_level: grade });
		auth.setRecord(updated);
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
