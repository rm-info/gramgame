import { invokeFunction } from './_helpers';

export interface CorrectInput {
	username: string;
	exercise_id: string;
	responses: Record<string, string>;
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
	appreciation: string;
	suggested_next_rule_id: string | null;
}

export function correctAttempt(input: CorrectInput): Promise<CorrectionResult> {
	return invokeFunction<CorrectionResult>('correct-attempt', input as unknown as Record<string, unknown>);
}
