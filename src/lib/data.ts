import type { RecordModel } from 'pocketbase';

/**
 * Normalise les records PocketBase vers les formes utilisées par les pages
 * (noms de champs historiques : rule_id, created_at, created_by_username…).
 */

export interface BlankRow {
	position: number;
	correct: string;
	distractor: string;
}

export interface ExerciseRow {
	id: string;
	rule_id: string;
	theme: string;
	grade_level: string;
	num_blanks: number;
	text: string;
	blanks: BlankRow[];
	llm_model: string;
	created_at: string;
	created_by_username: string;
	verified: boolean;
	verified_at: string | null;
	verified_by_username: string | null;
	rule: { id: string; display_name: string; candidates: string[] } | null;
}

export function mapExercise(r: RecordModel): ExerciseRow {
	const rule = r.expand?.rule as RecordModel | undefined;
	return {
		id: r.id,
		rule_id: r.rule,
		theme: r.theme,
		grade_level: r.grade_level,
		num_blanks: r.num_blanks,
		text: r.text ?? '',
		blanks: Array.isArray(r.blanks) ? r.blanks : [],
		llm_model: r.llm_model ?? '',
		created_at: r.created,
		created_by_username: r.owner_username,
		verified: !!r.verified,
		verified_at: r.verified_at || null,
		verified_by_username: r.verified_by_username || null,
		rule: rule
			? {
					id: rule.id,
					display_name: rule.display_name,
					candidates: Array.isArray(rule.candidates) ? rule.candidates : []
				}
			: null
	};
}

export interface AttemptRow {
	id: string;
	score: number;
	score_total: number;
	completed_at: string;
	exercise: ExerciseRow | null;
}

export function mapAttempt(r: RecordModel): AttemptRow {
	const ex = r.expand?.exercise as RecordModel | undefined;
	return {
		id: r.id,
		score: r.score,
		score_total: r.score_total,
		completed_at: r.created,
		exercise: ex ? mapExercise(ex) : null
	};
}
