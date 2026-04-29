import { supabase } from '$lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface GenerateInput {
	rule_id: string;
	theme: string;
	grade_level: string;
	num_blanks: number;
}

export interface GeneratedExercise {
	id: string;
	text: string;
	blanks: { position: number }[];
	rule: { id: string; display_name: string; candidates: string[] };
}

export async function generateExercise(input: GenerateInput): Promise<GeneratedExercise> {
	const { data, error } = await supabase.functions.invoke('generate-exercise', {
		body: input
	});
	if (error) {
		await throwFunctionError(error);
	}
	return data as GeneratedExercise;
}

async function throwFunctionError(error: unknown): Promise<never> {
	if (error instanceof FunctionsHttpError) {
		try {
			const body = await error.context.json();
			if (body?.error) throw new Error(body.error);
		} catch (e) {
			if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
		}
	}
	const msg = error instanceof Error ? error.message : 'Erreur réseau.';
	throw new Error(msg);
}
