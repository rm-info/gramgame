// Suivi des élèves pour les parents et les profs : statistiques calculées
// côté serveur à partir des tentatives, pour les seuls élèves liés (un admin
// voit tous les élèves). Rien d'autre n'est exposé (pas l'adresse mail).

const g = require(`${__hooks}/lib/gram.js`);

const DAY = 24 * 3600 * 1000;
const MAX_ATTEMPTS_PER_STUDENT = 400;

function dateMs(s) {
	return s ? new Date(String(s).replace(' ', 'T')).getTime() : 0;
}

/**
 * Statut de maîtrise d'une notion à partir de ses tentatives (récentes
 * d'abord) : moyenne des 3 dernières.
 *   acquis          ≥ 80 % (et au moins 2 tentatives)
 *   en_cours        50–80 %, ou ≥ 80 % sur une seule tentative
 *   a_retravailler  < 50 %
 */
function masteryStatus(pcts) {
	if (!pcts.length) return 'non_commence';
	const last = pcts.slice(0, 3);
	const avg = last.reduce((s, x) => s + x, 0) / last.length;
	if (avg >= 0.8) return pcts.length >= 2 ? 'acquis' : 'en_cours';
	if (avg >= 0.5) return 'en_cours';
	return 'a_retravailler';
}

/**
 * Statistiques d'un élève.
 * attempts : [{ created, score, score_total, hard_mode, rule, breakdown }] (récentes d'abord)
 * rules    : { id: { name, category } }
 */
function studentStats(attempts, rules, now) {
	const t = now || Date.now();
	const pct = (a) => (a.score_total > 0 ? a.score / a.score_total : 0);
	const within = (days) => attempts.filter((a) => t - dateMs(a.created) <= days * DAY);
	const avg = (list) => (list.length ? Math.round((list.reduce((s, a) => s + pct(a), 0) / list.length) * 100) : null);

	const last7 = within(7);
	const last30 = within(30);

	// Par notion
	const byRule = {};
	for (const a of attempts) {
		if (!a.rule) continue;
		const r = (byRule[a.rule] = byRule[a.rule] || { pcts: [], hard: 0, last: null });
		r.pcts.push(pct(a));
		if (a.hard_mode) r.hard++;
		if (!r.last) r.last = a.created;
	}
	const notions = Object.keys(byRule)
		.map((id) => {
			const r = byRule[id];
			const last3 = r.pcts.slice(0, 3);
			return {
				rule_id: id,
				name: (rules[id] && rules[id].name) || id,
				category: (rules[id] && rules[id].category) || '',
				attempts: r.pcts.length,
				hard_attempts: r.hard,
				last_pct: Math.round(r.pcts[0] * 100),
				avg_last3_pct: Math.round((last3.reduce((s, x) => s + x, 0) / last3.length) * 100),
				last_date: r.last,
				status: masteryStatus(r.pcts)
			};
		})
		.sort((a, b) => dateMs(b.last_date) - dateMs(a.last_date));

	// Points faibles sur 30 jours : catégories détaillées (confusion, groupe du
	// verbe, signe de ponctuation…) ratées plus d'une fois sur trois.
	const weak = {};
	for (const a of last30) {
		const groups = a.breakdown && a.rule && a.breakdown[a.rule] && a.breakdown[a.rule].groups;
		if (!groups || typeof groups !== 'object') continue;
		for (const label of Object.keys(groups)) {
			const v = groups[label] || {};
			const key = `${a.rule}::${label}`;
			const w = (weak[key] = weak[key] || { rule_id: a.rule, label, ok: 0, total: 0 });
			w.ok += Number(v.ok) || 0;
			w.total += Number(v.total) || 0;
		}
	}
	const weak_points = Object.values(weak)
		.filter((w) => w.total >= 3 && w.ok / w.total < 0.67)
		.map((w) => ({
			rule_id: w.rule_id,
			rule_name: (rules[w.rule_id] && rules[w.rule_id].name) || w.rule_id,
			label: w.label,
			ok: w.ok,
			total: w.total,
			pct: Math.round((w.ok / w.total) * 100)
		}))
		.sort((a, b) => a.pct - b.pct)
		.slice(0, 6);

	const recent = attempts.slice(0, 10).map((a) => ({
		date: a.created,
		rule_id: a.rule,
		rule_name: (rules[a.rule] && rules[a.rule].name) || a.rule || '—',
		score: a.score,
		score_total: a.score_total,
		hard_mode: !!a.hard_mode
	}));

	return {
		attempts_total: attempts.length,
		attempts_7d: last7.length,
		avg_7d: avg(last7),
		avg_30d: avg(last30),
		last_activity: attempts.length ? attempts[0].created : null,
		notions,
		weak_points,
		recent
	};
}

/** Charge les tentatives d'un élève avec la règle de chaque exercice. */
function loadAttempts(app, studentId) {
	const recs = app.findRecordsByFilter('attempts', 'user = {:u}', '-created', MAX_ATTEMPTS_PER_STUDENT, 0, { u: studentId });
	const exIds = [...new Set(recs.map((r) => r.getString('exercise')))];
	const ruleOf = {};
	if (exIds.length) {
		for (const ex of app.findRecordsByIds('exercises', exIds)) ruleOf[ex.id] = ex.getString('rule');
	}
	return recs.map((r) => ({
		created: r.getString('created'),
		score: r.getInt('score'),
		score_total: r.getInt('score_total'),
		hard_mode: r.getBool('hard_mode'),
		rule: ruleOf[r.getString('exercise')] || '',
		breakdown: g.jsonField(r, 'per_rule_breakdown')
	}));
}

function loadRules(app) {
	const rules = {};
	for (const r of app.findAllRecords('rules')) {
		rules[r.id] = { name: r.getString('display_name'), category: r.getString('category') };
	}
	return rules;
}

module.exports = { masteryStatus, studentStats, loadAttempts, loadRules };
