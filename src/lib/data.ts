import type { RecordModel } from 'pocketbase';

/**
 * Normalise les records PocketBase vers les formes utilisées par les pages
 * (noms de champs historiques : rule_id, created_at, created_by_username…).
 */

export type RuleType = 'multiple_choice' | 'free_text' | 'qcm';

export interface RuleConfig {
	generator?: 'verb_groups' | 'llm_qcm' | 'conj_present';
	check?: string;
	highlight?: boolean;
	balance?: boolean;
	pool?: string;
	focus?: string;
	/** QCM : 'hide_highlight' = le mode difficile masque le passage [[ ]]. */
	hard_mode?: 'hide_highlight';
	/** Consigne affichée en mode difficile. */
	hard_consigne?: string;
}

/**
 * Un trou (texte à trous) ou une question (QCM).
 *  - multiple_choice : position, correct
 *  - free_text       : + verb, person, subject, accepted (formes acceptées)
 *  - qcm             : + prompt (phrase, [[ ]] = passage en surbrillance), explanation
 */
export interface BlankRow {
	position: number;
	correct: string;
	/** Ancien format (avant les groupes de confusion) — ignoré. */
	distractor?: string;
	prompt?: string;
	explanation?: string;
	accepted?: string[];
	verb?: string;
	person?: string;
	subject?: string;
	category?: string;
}

export interface RuleInfo {
	id: string;
	display_name: string;
	rule_type: RuleType;
	candidates: string[];
	groups: string[][] | null;
	config: RuleConfig;
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
	rule: RuleInfo | null;
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
					rule_type: (rule.rule_type || 'multiple_choice') as RuleType,
					candidates: Array.isArray(rule.candidates) ? rule.candidates : [],
					groups: Array.isArray(rule.groups) ? rule.groups : null,
					config: rule.config && typeof rule.config === 'object' ? rule.config : {}
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

export const PERSON_LABELS: Record<string, string> = {
	'1s': 'je',
	'2s': 'tu',
	'3s': 'il / elle',
	'1p': 'nous',
	'2p': 'vous',
	'3p': 'ils / elles'
};

/** Découpe « Le [[chien]] dort » en segments, le passage [[…]] étant marqué. */
export function highlightSegments(prompt: string): { text: string; mark: boolean }[] {
	const out: { text: string; mark: boolean }[] = [];
	const re = /\[\[([^\]]+)\]\]/g;
	let last = 0;
	for (const m of prompt.matchAll(re)) {
		const idx = m.index ?? 0;
		if (idx > last) out.push({ text: prompt.slice(last, idx), mark: false });
		out.push({ text: m[1], mark: true });
		last = idx + m[0].length;
	}
	if (last < prompt.length) out.push({ text: prompt.slice(last), mark: false });
	return out;
}
