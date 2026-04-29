import { supabase } from '$lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface CorrectInput {
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

export async function correctAttempt(input: CorrectInput): Promise<CorrectionResult> {
	const { data, error } = await supabase.functions.invoke('correct-attempt', {
		body: input
	});
	if (error) {
		if (error instanceof FunctionsHttpError) {
			try {
				const body = await error.context.json();
				if (body?.error) throw new Error(body.error);
			} catch (e) {
				if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
			}
		}
		throw new Error(error instanceof Error ? error.message : 'Erreur réseau.');
	}
	return data as CorrectionResult;
}
