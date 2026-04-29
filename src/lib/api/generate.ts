import { invokeFunction } from './_helpers';

export interface GenerateInput {
	username: string;
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

export function generateExercise(input: GenerateInput): Promise<GeneratedExercise> {
	return invokeFunction<GeneratedExercise>('generate-exercise', input as unknown as Record<string, unknown>);
}
