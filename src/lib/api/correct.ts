import { callGram } from './_helpers';

export interface CorrectInput {
	exercise_id: string;
	responses: Record<string, string>;
	hard_mode?: boolean;
}

export interface PerBlank {
	position: number;
	given: string | null;
	correct: string;
	ok: boolean;
}

export interface CorrectionResult {
	score: number;
	score_total: number;
	per_blank: PerBlank[];
	per_rule_breakdown: Record<string, { ok: number; total: number }>;
	/** Détail par groupe de confusion (vide si la règle n'a qu'un groupe). */
	per_group_breakdown?: Record<string, { ok: number; total: number }>;
	hard_mode?: boolean;
	appreciation: string;
	suggested_next_rule_id: string | null;
}

export function correctAttempt(input: CorrectInput): Promise<CorrectionResult> {
	return callGram<CorrectionResult>('correct', input as unknown as Record<string, unknown>);
}
