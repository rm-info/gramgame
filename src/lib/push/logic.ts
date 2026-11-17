// Rappels d'évaluations : quand programmer, quoi afficher. Fonctions pures,
// utilisées par l'app (programmation) et par le service worker (affichage).
// Testées dans src/lib/push/logic.test.ts.

/** Heure du rappel quotidien (heure de l'appareil) : après l'école. */
export const REMINDER_TIME = '17:30';

/** Ce qu'il faut savoir d'une évaluation (réponse de /api/gram/evals/mine). */
export interface EvalLite {
	id: string;
	title: string;
	state: 'draft' | 'upcoming' | 'open' | 'closed';
	status: 'todo' | 'in_progress' | 'submitted' | 'missed';
	opens_at: string | null;
	closes_at: string | null;
	time_limit_min: number;
	/** false : l'auteur a coupé les rappels. */
	reminders?: boolean;
}

export interface DailySchedule {
	type: 'daily';
	time: string;
	tz: string;
	start?: string;
	until?: string;
}

const ms = (iso: string | null | undefined): number | null => {
	if (!iso) return null;
	const t = Date.parse(String(iso).replace(' ', 'T'));
	return Number.isNaN(t) ? null : t;
};

/** Date locale AAAA-MM-JJ dans le fuseau donné. */
export function localDate(t: number, tz: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/** Heure locale HH:MM dans le fuseau donné. */
export function localTime(t: number, tz: string): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
}

export function addDays(ymd: string, n: number): string {
	const d = new Date(`${ymd}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/**
 * L'élève doit encore la faire : pas commencée, ou commencée sans limite de
 * temps (une épreuve chronométrée commencée se rend toute seule).
 */
function stillToDo(m: EvalLite): boolean {
	if (m.reminders === false) return false;
	return m.status === 'todo' || (m.status === 'in_progress' && !m.time_limit_min);
}

/** Évaluations à faire maintenant. */
export function pendingNow(list: EvalLite[]): EvalLite[] {
	return list.filter((m) => m.state === 'open' && stillToDo(m));
}

/** Dernier jour où le rappel de 17 h 30 tombe avant la fin (null : pas de fin). */
function lastReminderDay(m: EvalLite, tz: string): string | null {
	const closes = ms(m.closes_at);
	if (closes === null) return null;
	const day = localDate(closes, tz);
	return localTime(closes, tz) <= REMINDER_TIME ? addDays(day, -1) : day;
}

/** Premier jour où le rappel de 17 h 30 tombe après l'ouverture. */
function firstReminderDay(m: EvalLite, tz: string, now: number): string {
	const opens = ms(m.opens_at);
	const t = opens !== null && opens > now ? opens : now;
	const day = localDate(t, tz);
	return localTime(t, tz) < REMINDER_TIME ? day : addDays(day, 1);
}

/**
 * Un seul rappel quotidien par élève, tant qu'il reste une évaluation à faire
 * (ouverte, ou qui ouvrira : il n'aura pas besoin de rouvrir l'app). null : rien
 * à programmer.
 */
export function reminderSchedule(list: EvalLite[], tz: string, now: number): DailySchedule | null {
	const rel = list.filter((m) => (m.state === 'open' || m.state === 'upcoming') && stillToDo(m));
	if (!rel.length) return null;
	// Chaque évaluation : du premier au dernier jour de rappel.
	const spans = rel
		.map((m) => ({ from: firstReminderDay(m, tz, now), to: lastReminderDay(m, tz) }))
		.filter((s) => s.to === null || s.to >= s.from);
	if (!spans.length) return null;
	const from = spans.map((s) => s.from).sort()[0];
	const to = spans.some((s) => s.to === null) ? null : spans.map((s) => s.to as string).sort().reverse()[0];
	const firstOccurrence = firstReminderDay({ ...rel[0], opens_at: null }, tz, now);
	const schedule: DailySchedule = { type: 'daily', time: REMINDER_TIME, tz };
	if (from > firstOccurrence) schedule.start = from;
	if (to) schedule.until = to;
	return schedule;
}

/** Texte de la notification à partir de la liste à jour (null : plus rien à faire). */
export function notificationContent(
	list: EvalLite[],
	now: number,
	tz: string,
	username?: string
): { title: string; body: string; url: string } | null {
	const todo = pendingNow(list);
	if (!todo.length) return null;
	const today = localDate(now, tz);
	const lastDay = todo.filter((m) => {
		const c = ms(m.closes_at);
		return c !== null && localDate(c, tz) === today;
	});
	const who = username ? ` (${username})` : '';
	const title = todo.length === 1 ? `📝 Une évaluation à faire${who}` : `📝 ${todo.length} évaluations à faire${who}`;
	let body =
		todo.length === 1
			? `« ${todo[0].title} » t'attend sur GramGame.`
			: `${todo
					.slice(0, 3)
					.map((m) => `« ${m.title} »`)
					.join(', ')}${todo.length > 3 ? '…' : ''}.`;
	if (lastDay.length === 1) body += ` Dernier jour pour « ${lastDay[0].title} » !`;
	else if (lastDay.length > 1) body += ` Dernier jour pour ${lastDay.length} d'entre elles !`;
	const url = todo.length === 1 ? `/evaluations/${todo[0].id}/passer` : '/evaluations';
	return { title, body, url };
}

/** Texte de secours : rappel connu mais liste illisible (hors ligne, session expirée…). */
export const FALLBACK = {
	title: '📝 GramGame',
	body: 'Tu as une évaluation à faire. Ouvre GramGame pour la voir.',
	url: '/evaluations'
};

/** Rappel inconnu sur cet appareil (supprimé entre-temps, données effacées) : texte neutre. */
export const UNKNOWN = {
	title: '📝 GramGame',
	body: 'Ouvre GramGame pour voir tes évaluations.',
	url: '/evaluations'
};
