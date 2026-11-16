import { gramRequest } from './_helpers';
import type { BlankRow, ExerciseExtra, RuleConfig, RuleType } from '$lib/data';
import type { PerBlank } from './correct';

export type CorrectionMode = 'immediate' | 'after_close' | 'manual';
export type EvalState = 'draft' | 'upcoming' | 'open' | 'closed';

export const CORRECTION_LABELS: Record<CorrectionMode, string> = {
	immediate: 'dès que la copie est rendue',
	after_close: "à la date de fin de l'évaluation",
	manual: 'quand je la publie'
};

/** Règle d'une partie (sans réponses). */
export interface PartRule {
	id: string;
	display_name: string;
	rule_type: RuleType;
	candidates: string[];
	groups: string[][] | null;
	config: Pick<RuleConfig, 'hard_mode' | 'hard_consigne'>;
}

export interface PartSummary {
	exercise_id: string;
	rule_id: string;
	rule_name: string;
	rule_type: RuleType;
	theme: string;
	count: number;
	points: number;
	hard_mode: boolean;
}

/** Une question du sujet élève (jamais la réponse). */
export interface PaperItem {
	position: number;
	options?: string[];
	verb?: string;
	prompt?: string;
	tokens?: string[];
	source?: string;
	target?: string;
	instruction?: string;
}

export interface PaperPart extends PartSummary {
	rule: PartRule;
	text: string;
	items: PaperItem[];
	extra: ExerciseExtra | null;
	responses: Record<string, string>;
}

export interface PartResult {
	exercise: string;
	points: number;
	earned: number;
	score: number;
	score_total: number;
	hard_mode: boolean;
	per_blank: PerBlank[];
	per_group_breakdown?: Record<string, { ok: number; total: number }>;
}

export interface CopyPart extends PartSummary {
	rule: PartRule;
	text: string;
	blanks: BlankRow[];
	extra: ExerciseExtra | null;
	responses: Record<string, string>;
	result: PartResult | null;
}

export interface CorrectedCopy {
	submitted_at: string;
	auto_submitted: boolean;
	score_points: number;
	total_points: number;
	note20: number;
	parts: CopyPart[];
}

export interface StudentView {
	evaluation: {
		id: string;
		title: string;
		author_username: string;
		grade_level: string;
		time_limit_min: number;
		opens_at: string | null;
		closes_at: string | null;
		correction_mode: CorrectionMode;
	};
	state: EvalState;
	parts: PartSummary[];
	now: string;
	submission: {
		started_at: string;
		deadline: string | null;
		submitted_at: string | null;
		auto_submitted: boolean;
	} | null;
	paper?: PaperPart[];
	correction_visible?: boolean;
	copy?: CorrectedCopy;
}

export interface MyEval {
	id: string;
	title: string;
	author_username: string;
	state: EvalState;
	opens_at: string | null;
	closes_at: string | null;
	time_limit_min: number;
	parts_count: number;
	status: 'todo' | 'in_progress' | 'submitted' | 'missed';
	submitted_at: string | null;
	correction_visible: boolean;
	note20: number | null;
}

export interface AuthorEvalRow {
	id: string;
	title: string;
	status: 'draft' | 'published';
	state: EvalState;
	grade_level: string;
	opens_at: string | null;
	closes_at: string | null;
	parts_count: number;
	targets: number;
	started: number;
	submitted: number;
	average20: number | null;
	created: string;
}

export interface EvalPartRecord {
	exercise: string;
	points: number;
	hard_mode: boolean;
	request?: { rule_id: string; theme: string; num_blanks: number };
}

export interface ResultsStudent {
	id: string;
	username: string;
	classes: string[];
	status: 'not_started' | 'in_progress' | 'submitted';
	submission_id: string | null;
	started_at?: string;
	submitted_at?: string | null;
	auto_submitted?: boolean;
	note20?: number;
	score_points?: number;
	total_points?: number;
	parts?: { exercise: string; earned: number; points: number; score: number; score_total: number }[];
	/** Durée (copie rendue), en secondes. */
	duration_s?: number | null;
	/** Réponses données, justes ou fausses. */
	answered?: number;
	answered_total?: number;
	answered_pct?: number;
	/** Sorties de la page pendant l'épreuve. */
	leaves?: number;
	away_seconds?: number;
	/** Hors de la page en ce moment. */
	away_now?: boolean;
	/** Questions corrigées à la main. */
	overrides?: number;
}

/** Copie vue par l'auteur. */
export type AuthorCopy = CorrectedCopy & {
	id: string;
	student_username: string;
	title: string;
	started_at: string;
	leaves: number;
	away_seconds: number;
};

export interface QuestionStat {
	exercise: string;
	position: number;
	correct: string;
	context: string;
	ok: number;
	total: number;
}

/** Mails « nouvelle évaluation » (élèves visés actuellement). */
export interface MailSummary {
	targets: number;
	sent: number;
	/** Échec à l'envoi (nouvel essai à minuit, sauf abandon). */
	failed: number;
	/** Envoi en cours. */
	sending: number;
	gave_up: number;
	/** Envoi prévu à minuit ce jour-là (AAAA-MM-JJ), sinon null. */
	scheduled_day: string | null;
}

/** Résultat de l'envoi immédiat à la publication (null si rien à faire ; failed = -1 : erreur). */
export interface PublishMails {
	sent: number;
	failed: number;
}

export interface EvalResults {
	evaluation: {
		id: string;
		title: string;
		author: string;
		author_username: string;
		grade_level: string;
		status: 'draft' | 'published';
		state: EvalState;
		parts: PartSummary[];
		classes: { id: string; name: string }[];
		students: string[];
		opens_at: string;
		closes_at: string;
		time_limit_min: number;
		correction_mode: CorrectionMode;
		correction_released: boolean;
		correction_visible: boolean;
		started: number;
		mails: MailSummary;
	};
	students: ResultsStudent[];
	stats: {
		submitted: number;
		average20: number | null;
		min20: number | null;
		max20: number | null;
		questions: QuestionStat[];
	};
}

export const evalsApi = {
	authorList: () => gramRequest<{ evaluations: AuthorEvalRow[] }>('GET', 'evals'),
	mine: () => gramRequest<{ evaluations: MyEval[] }>('GET', 'evals/mine'),
	results: (id: string) => gramRequest<EvalResults>('GET', `evals/${id}/results`),
	copy: (id: string, sub: string) => gramRequest<AuthorCopy>('GET', `evals/${id}/copies/${sub}`),
	override: (id: string, sub: string, exercise: string, position: number, ok: boolean | null) =>
		gramRequest<AuthorCopy>('POST', `evals/${id}/copies/${sub}/override`, { exercise, position, ok }),
	duplicate: (id: string) => gramRequest<{ id: string }>('POST', `evals/${id}/duplicate`, {}),
	leave: (id: string, back: boolean) => gramRequest<{ ok: boolean }>('POST', `evals/${id}/leave`, { back }),
	addPart: (id: string, body: Record<string, unknown>) =>
		gramRequest<{ part: PartSummary }>('POST', `evals/${id}/parts`, body),
	regenerate: (id: string, ex: string) => gramRequest<{ part: PartSummary }>('POST', `evals/${id}/parts/${ex}/regenerate`, {}),
	removePart: (id: string, ex: string) => gramRequest<{ ok: boolean }>('DELETE', `evals/${id}/parts/${ex}`),
	publish: (id: string, publish: boolean) => gramRequest<{ status: string }>('POST', `evals/${id}/publish`, { publish }),
	sendMails: (id: string) => gramRequest<PublishMails>('POST', `evals/${id}/mails`, {}),
	release: (id: string) => gramRequest<{ correction_released: boolean }>('POST', `evals/${id}/release`, {}),
	paper: (id: string) => gramRequest<StudentView>('GET', `evals/${id}/paper`),
	start: (id: string) => gramRequest<StudentView>('POST', `evals/${id}/start`, {}),
	save: (id: string, responses: Record<string, Record<string, string>>) =>
		gramRequest<{ saved_at: string }>('POST', `evals/${id}/save`, { responses }),
	submit: (id: string, responses: Record<string, Record<string, string>>) =>
		gramRequest<StudentView>('POST', `evals/${id}/submit`, { responses })
};

/** « 15 nov. à 14:30 » */
export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso.replace(' ', 'T'));
	if (isNaN(d.getTime())) return '';
	return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** 754 → « 12 min 34 s » ; 40 → « 40 s ». */
export function fmtDuration(sec: number | null | undefined): string {
	if (sec === null || sec === undefined) return '—';
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	if (h) return `${h} h ${String(m).padStart(2, '0')}`;
	if (m) return `${m} min ${String(s).padStart(2, '0')} s`;
	return `${s} s`;
}

export const fmtNote = (n: number | null | undefined) =>
	n === null || n === undefined ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
