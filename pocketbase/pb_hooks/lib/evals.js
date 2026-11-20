// Évaluations : sujets sans réponses, délais, notes, copies.
//
// Fonctions pures en haut (testées dans pocketbase/tests/evals.test.cjs),
// fonctions qui touchent la base en bas.

const MAX_PARTS = 6;
/** Marge réseau après la fin du temps : une copie envoyée juste après compte encore. */
const GRACE_MS = 30 * 1000;
const POINTS_MIN = 1;
const POINTS_MAX = 100;

// ────────────────────────────────────────────────────────────────────────────
// Fonctions pures
// ────────────────────────────────────────────────────────────────────────────

/** Générateur pseudo-aléatoire reproductible (même élève → même ordre). */
function seededRng(seed) {
	let h = 2166136261;
	for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffled(arr, rng) {
	const out = arr.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = out[i];
		out[i] = out[j];
		out[j] = tmp;
	}
	return out;
}

const stripMarkers = (s) => String(s || '').replace(/\[\[|\]\]/g, '');

function normalizeWord(w) {
	return String(w || '')
		.toLowerCase()
		.replace(/[’']/g, "'")
		.trim();
}

/** Groupes de confusion d'une règle (comme lib/gram.js). */
function ruleGroups(rule) {
	const cands = Array.isArray(rule.candidates) ? rule.candidates : [];
	const groups = Array.isArray(rule.groups) ? rule.groups.filter((g) => Array.isArray(g) && g.length >= 2) : [];
	return groups.length > 0 ? groups : [cands];
}

/**
 * Sujet d'une partie tel qu'envoyé à l'élève : AUCUNE réponse, explication ou
 * correction. Les questions indépendantes et les propositions sont mélangées
 * (ordre propre à chaque élève, stable d'un rechargement à l'autre).
 */
function publicPart(rule, exercise, hardMode, rng) {
	const t = rule.rule_type;
	const blanks = (Array.isArray(exercise.blanks) ? exercise.blanks : [])
		.slice()
		.sort((a, b) => a.position - b.position);
	const out = { text: '', items: [], extra: null };

	if (t === 'multiple_choice') {
		const groups = ruleGroups(rule);
		out.text = exercise.text;
		out.items = blanks.map((b) => {
			const n = normalizeWord(b.correct);
			const group = groups.find((g) => g.some((w) => normalizeWord(w) === n)) || rule.candidates;
			// Mode difficile : tous les mots de la règle, comme à l'entraînement.
			return { position: b.position, options: hardMode ? rule.candidates.slice() : group.slice() };
		});
	} else if (t === 'free_text') {
		out.text = exercise.text;
		out.items = blanks.map((b) => ({ position: b.position, verb: b.verb || '' }));
	} else if (t === 'qcm') {
		out.text = exercise.text;
		const hide = hardMode && rule.config && rule.config.hard_mode === 'hide_highlight';
		out.items = shuffled(blanks, rng).map((b) => ({
			position: b.position,
			prompt: hide ? stripMarkers(b.prompt) : String(b.prompt || '')
		}));
	} else if (t === 'span') {
		out.text = exercise.text;
		out.items = shuffled(blanks, rng).map((b) => ({
			position: b.position,
			tokens: Array.isArray(b.tokens) ? b.tokens.slice() : []
		}));
	} else if (t === 'punctuation') {
		const extra = exercise.extra || {};
		out.extra = { words: Array.isArray(extra.words) ? extra.words.slice() : [] };
	} else if (t === 'transform') {
		out.text = exercise.text;
		out.items = shuffled(blanks, rng).map((b) => {
			const item = { position: b.position, source: b.source || '', target: b.target || '' };
			if (b.instruction) item.instruction = b.instruction;
			if (!hardMode) item.options = shuffled(Array.isArray(b.options) ? b.options : [], rng);
			return item;
		});
	}
	return out;
}

/** Nombre de questions d'une partie (ponctuation : nombre de phrases). */
function partCount(ruleType, blanks) {
	const list = Array.isArray(blanks) ? blanks : [];
	if (ruleType === 'punctuation') return list.filter((b) => ['.', '?', '!'].indexOf(b.correct) >= 0).length;
	return list.length;
}

const ms = (iso) => {
	if (!iso) return null;
	const t = Date.parse(String(iso).replace(' ', 'T'));
	return isNaN(t) ? null : t;
};

/** 'draft' | 'upcoming' | 'open' | 'closed' */
function evalState(ev, now) {
	if (ev.status !== 'published') return 'draft';
	const opens = ms(ev.opens_at);
	const closes = ms(ev.closes_at);
	if (opens !== null && now < opens) return 'upcoming';
	if (closes !== null && now >= closes) return 'closed';
	return 'open';
}

/** Fin de l'épreuve pour un élève (ms) : durée limite et/ou fermeture ; null = pas de limite. */
function deadlineOf(ev, startedMs) {
	let d = null;
	const limit = Number(ev.time_limit_min) || 0;
	if (limit > 0 && startedMs !== null) d = startedMs + limit * 60000;
	const closes = ms(ev.closes_at);
	if (closes !== null) d = d === null ? closes : Math.min(d, closes);
	return d;
}

function correctionVisible(ev, now) {
	if (ev.correction_mode === 'immediate' || ev.correction_released) return true;
	if (ev.correction_mode === 'after_close') {
		const closes = ms(ev.closes_at);
		return closes !== null && now >= closes;
	}
	return false;
}

const round2 = (x) => Math.round(x * 100) / 100;

/** Points gagnés sur une partie. */
function earnedPoints(score, total, points) {
	return total > 0 ? round2((score / total) * points) : 0;
}

/** Note sur 20 (arrondie au dixième). */
function noteOn20(earned, total) {
	return total > 0 ? Math.round((earned / total) * 200) / 10 : 0;
}

/**
 * Contrôle des réglages (création, modification, publication).
 * Renvoie un message d'erreur ou null.
 */
function validateSettings(ev, forPublish) {
	if (!String(ev.title || '').trim()) return "Donne un titre à l'évaluation.";
	const limit = Number(ev.time_limit_min) || 0;
	if (limit < 0 || limit > 240) return 'La durée doit être comprise entre 0 (sans limite) et 240 minutes.';
	if (['immediate', 'after_close', 'manual'].indexOf(ev.correction_mode) < 0) return 'Mode de correction inconnu.';
	const opens = ms(ev.opens_at);
	const closes = ms(ev.closes_at);
	if (opens !== null && closes !== null && closes <= opens) return 'La date de fin doit être après la date de début.';
	if (ev.correction_mode === 'after_close' && closes === null) {
		return 'Pour donner la correction à la fin, indique une date de fin.';
	}
	const parts = Array.isArray(ev.parts) ? ev.parts : [];
	for (const p of parts) {
		const pts = Number(p.points);
		if (!(pts >= POINTS_MIN && pts <= POINTS_MAX)) {
			return `Chaque partie vaut entre ${POINTS_MIN} et ${POINTS_MAX} points.`;
		}
	}
	if (forPublish) {
		if (!parts.length) return 'Ajoute au moins un exercice.';
		const nTargets = (ev.classes || []).length + (ev.students || []).length;
		if (!nTargets) return 'Choisis au moins une classe ou un élève.';
	}
	return null;
}

/** Statistiques par question à partir des résultats des copies rendues. */
function questionStats(parts, resultsList) {
	const stats = {};
	for (const results of resultsList) {
		for (const r of results || []) {
			for (const b of r.per_blank || []) {
				if (b.extra) continue; // ponctuation : signe en trop
				const key = `${r.exercise}:${b.position}`;
				stats[key] = stats[key] || {
					exercise: r.exercise,
					position: b.position,
					correct: b.correct,
					context: b.context || '',
					ok: 0,
					total: 0
				};
				stats[key].total++;
				if (b.ok) stats[key].ok++;
			}
		}
	}
	const order = {};
	(parts || []).forEach((p, i) => (order[p.exercise] = i));
	return Object.keys(stats)
		.map((k) => stats[k])
		.sort((a, b) => (order[a.exercise] ?? 0) - (order[b.exercise] ?? 0) || a.position - b.position);
}

const PUNCT_MARKS = ['.', ',', '?', '!'];

/**
 * Réponses données (justes ou fausses) sur une partie.
 * Ponctuation : l'élève ne sait pas combien de signes sont attendus, donc un
 * signe oublié est une erreur, pas une absence de réponse. Dès qu'il a posé au
 * moins un signe (n'importe où), toute la partie compte comme traitée.
 */
function answeredCount(ruleType, blanks, resp) {
	const list = Array.isArray(blanks) ? blanks : [];
	const r = resp && typeof resp === 'object' ? resp : {};
	if (ruleType === 'punctuation') {
		const any = Object.keys(r).some((k) => PUNCT_MARKS.indexOf(String(r[k] ?? '').trim()) >= 0);
		return { answered: any ? list.length : 0, total: list.length };
	}
	let answered = 0;
	for (const b of list) if (String(r[String(b.position)] ?? '').trim() !== '') answered++;
	return { answered, total: list.length };
}

/** Durée en secondes entre deux dates (null si l'une manque). */
function durationSeconds(startIso, endIso) {
	const a = ms(startIso);
	const b = ms(endIso);
	return a === null || b === null ? null : Math.max(0, Math.round((b - a) / 1000));
}

/** Recalcule les points d'une copie à partir des réponses jugées (per_blank[].ok). */
function recompute(results) {
	let earned = 0;
	let total = 0;
	const out = (results || []).map((r) => {
		const per = r.per_blank || [];
		const score = per.filter((b) => b.ok).length;
		const scoreTotal = per.length || r.score_total || 1;
		const got = earnedPoints(score, scoreTotal, r.points);
		earned += got;
		total += r.points;
		return Object.assign({}, r, { score, score_total: scoreTotal, earned: got });
	});
	return { results: out, score_points: round2(earned), total_points: total, note20: noteOn20(earned, total) };
}

/**
 * Correction manuelle d'une question par l'auteur : ok = true / false, ou null
 * pour revenir à la correction automatique. Renvoie null si la question n'existe pas.
 */
function applyOverride(results, exerciseId, position, ok) {
	let found = false;
	const next = (results || []).map((r) => {
		if (r.exercise !== exerciseId) return r;
		const per = (r.per_blank || []).map((b) => {
			if (Number(b.position) !== Number(position)) return b;
			found = true;
			const auto = b.overridden ? !!b.ok_auto : !!b.ok;
			const nb = Object.assign({}, b);
			if (ok === null) {
				nb.ok = auto;
				delete nb.overridden;
				delete nb.ok_auto;
				if (nb.judged_by === 'prof') nb.judged_by = nb.judged_by_auto || undefined;
				delete nb.judged_by_auto;
			} else {
				nb.ok = !!ok;
				nb.ok_auto = auto;
				nb.overridden = true;
				if (nb.judged_by !== 'prof') nb.judged_by_auto = nb.judged_by;
				nb.judged_by = 'prof';
			}
			return nb;
		});
		return Object.assign({}, r, { per_blank: per });
	});
	return found ? recompute(next) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Fonctions qui touchent la base
// ────────────────────────────────────────────────────────────────────────────

function jsonField(record, name) {
	return require(`${__hooks}/lib/gram.js`).jsonField(record, name);
}

/** Slice Go → vrai tableau JS. */
function stringList(record, name) {
	const s = record.getStringSlice(name) || [];
	const out = [];
	for (let i = 0; i < s.length; i++) out.push(String(s[i]));
	return out;
}

/** Record evaluations → objet simple. */
function evalData(rec) {
	return {
		id: rec.id,
		title: rec.getString('title'),
		author: rec.getString('author'),
		author_username: rec.getString('author_username'),
		grade_level: rec.getString('grade_level'),
		status: rec.getString('status'),
		parts: jsonField(rec, 'parts') || [],
		classes: stringList(rec, 'classes'),
		students: stringList(rec, 'students'),
		opens_at: rec.getString('opens_at'),
		closes_at: rec.getString('closes_at'),
		time_limit_min: rec.getInt('time_limit_min'),
		correction_mode: rec.getString('correction_mode'),
		correction_released: rec.getBool('correction_released'),
		no_reminders: rec.getBool('no_reminders'),
		created: rec.getString('created')
	};
}

function countSubmissions(app, evalId) {
	return app.countRecords('eval_submissions', $dbx.hashExp({ evaluation: evalId }));
}

/** Classes de l'élève (ids). */
function classIdsOf(app, studentId) {
	return app
		.findRecordsByFilter('class_members', 'student = {:s}', '', 0, 0, { s: studentId })
		.map((m) => m.getString('class'));
}

/** L'élève est-il visé par l'évaluation (directement ou par une de ses classes) ? */
function isTarget(app, ev, studentId) {
	if (ev.students.indexOf(studentId) >= 0) return true;
	if (!ev.classes.length) return false;
	const mine = classIdsOf(app, studentId);
	return ev.classes.some((c) => mine.indexOf(c) >= 0);
}

/** Élèves visés (ids) : liste directe + membres actuels des classes. */
function targetIds(app, ev) {
	const ids = {};
	for (const s of ev.students) ids[s] = true;
	for (const c of ev.classes) {
		for (const m of app.findRecordsByFilter('class_members', 'class = {:c}', '', 0, 0, { c })) {
			ids[m.getString('student')] = true;
		}
	}
	return Object.keys(ids);
}

/** Élèves qu'un auteur peut viser : liés (acceptés), + membres de ses classes. */
function allowedStudentIds(app, author) {
	const role = author.getString('role');
	const ids = {};
	if (role === 'admin') {
		for (const u of app.findRecordsByFilter('users', "role = 'eleve'", '', 0, 0)) ids[u.id] = true;
		return ids;
	}
	for (const l of app.findRecordsByFilter('links', "supervisor = {:me} && status = 'accepted'", '', 0, 0, {
		me: author.id
	})) {
		ids[l.getString('student')] = true;
	}
	if (role === 'prof') {
		for (const c of app.findRecordsByFilter('classes', 'teacher = {:me}', '', 0, 0, { me: author.id })) {
			for (const m of app.findRecordsByFilter('class_members', 'class = {:c}', '', 0, 0, { c: c.id })) {
				ids[m.getString('student')] = true;
			}
		}
	}
	return ids;
}

/** Contrôle des élèves et classes visés. Message d'erreur ou null. */
function validateTargets(app, author, classIds, studentIds) {
	const role = author.getString('role');
	if (classIds.length && role !== 'prof' && role !== 'admin') return 'Seul un professeur peut viser une classe.';
	for (const c of classIds) {
		let rec;
		try {
			rec = app.findRecordById('classes', c);
		} catch (_) {
			return 'Classe introuvable.';
		}
		if (rec.getString('teacher') !== author.id) return `La classe « ${rec.getString('name')} » n'est pas la tienne.`;
	}
	if (studentIds.length) {
		const allowed = allowedStudentIds(app, author);
		for (const s of studentIds) {
			if (!allowed[s]) return "Tu ne peux donner une évaluation qu'à tes élèves (liés ou dans tes classes).";
		}
	}
	return null;
}

/** Infos d'une partie pour l'affichage (nom de la règle, nombre de questions). */
function partInfo(app, part) {
	const gr = require(`${__hooks}/lib/grading.js`);
	const ex = app.findRecordById('exercises', part.exercise);
	const rule = gr.loadRule(app, ex.getString('rule'));
	const blanks = jsonField(ex, 'blanks') || [];
	return {
		exercise: ex,
		rule,
		summary: {
			exercise_id: ex.id,
			rule_id: rule.id,
			rule_name: rule.display_name,
			rule_type: rule.rule_type,
			theme: ex.getString('theme'),
			count: partCount(rule.rule_type, blanks),
			points: Number(part.points) || 0,
			hard_mode: !!part.hard_mode && gr.hardModeAllowed(rule)
		}
	};
}

/** Règle telle qu'utile au front (pas de réponses dedans). */
function publicRule(rule) {
	return {
		id: rule.id,
		display_name: rule.display_name,
		rule_type: rule.rule_type,
		candidates: rule.candidates,
		groups: rule.groups,
		config: { hard_mode: rule.config.hard_mode, hard_consigne: rule.config.hard_consigne }
	};
}

/** Nettoie les réponses envoyées par l'élève : { exerciseId: { position: texte } }. */
function cleanAllResponses(app, ev, raw) {
	const gr = require(`${__hooks}/lib/grading.js`);
	const out = {};
	if (!raw || typeof raw !== 'object') return out;
	for (const p of ev.parts) {
		if (!raw[p.exercise]) continue;
		// Type : seule la longueur maximale en dépend.
		let type = '';
		try {
			type = app.findRecordById('rules', app.findRecordById('exercises', p.exercise).getString('rule')).getString('rule_type');
		} catch (_) {}
		out[p.exercise] = gr.cleanResponses(type, raw[p.exercise]);
	}
	return out;
}

/** Corrige la copie et la marque rendue. */
function finalize(app, sub, ev, auto) {
	if (sub.getString('submitted_at')) return sub;
	const gr = require(`${__hooks}/lib/grading.js`);
	const logger = app.logger();
	const responses = jsonField(sub, 'responses') || {};
	const results = [];
	let earned = 0;
	let total = 0;
	for (const part of ev.parts) {
		let info;
		try {
			info = partInfo(app, part);
		} catch (err) {
			logger.error('Évaluation : partie introuvable', 'exercise', part.exercise, 'error', String(err));
			continue;
		}
		const exercise = gr.exerciseData(info.exercise);
		const rule = info.rule;
		const resp = gr.cleanResponses(rule.rule_type, responses[part.exercise] || {});
		// Question sans réponse = fausse (les correcteurs ne notent que les réponses données).
		if (rule.rule_type !== 'punctuation') {
			for (const b of exercise.blanks) if (!Object.prototype.hasOwnProperty.call(resp, String(b.position))) resp[String(b.position)] = '';
		}
		const hard = info.summary.hard_mode;
		let grading;
		try {
			grading = gr.gradeExercise(exercise, rule, resp, hard, logger);
		} catch (err) {
			logger.error('Évaluation : correction échouée', 'exercise', part.exercise, 'error', String(err));
			grading = { score: 0, score_total: exercise.blanks.length, per_blank: [], per_rule_breakdown: {}, per_group_breakdown: {} };
		}
		const scoreTotal = grading.score_total || exercise.blanks.length || 1;
		const pts = info.summary.points;
		const got = earnedPoints(grading.score, scoreTotal, pts);
		earned += got;
		total += pts;
		results.push({
			exercise: part.exercise,
			points: pts,
			earned: got,
			score: grading.score,
			score_total: scoreTotal,
			hard_mode: hard,
			per_blank: grading.per_blank,
			per_rule_breakdown: grading.per_rule_breakdown,
			per_group_breakdown: grading.per_group_breakdown || {}
		});
	}
	sub.set('results', results);
	sub.set('score_points', round2(earned));
	sub.set('total_points', total);
	sub.set('note20', noteOn20(earned, total));
	sub.set('submitted_at', new DateTime());
	sub.set('auto_submitted', !!auto);
	app.save(sub);
	return sub;
}

/** Copie en cours dont le temps est écoulé : on la rend avec ce qui a été enregistré. */
function finalizeIfOverdue(app, sub, ev, now) {
	if (sub.getString('submitted_at')) return sub;
	const d = deadlineOf(ev, ms(sub.getString('started_at')));
	if (d !== null && now > d + GRACE_MS) return finalize(app, sub, ev, true);
	return sub;
}

/** Copie corrigée, prête à afficher (avec les sujets complets et les réponses). */
function correctedCopy(app, ev, sub) {
	const results = jsonField(sub, 'results') || [];
	const responses = jsonField(sub, 'responses') || {};
	const parts = [];
	for (const part of ev.parts) {
		let info;
		try {
			info = partInfo(app, part);
		} catch (_) {
			continue;
		}
		const ex = info.exercise;
		const r = results.find((x) => x.exercise === part.exercise) || null;
		parts.push(
			Object.assign({}, info.summary, {
				rule: publicRule(info.rule),
				text: ex.getString('text'),
				blanks: jsonField(ex, 'blanks') || [],
				extra: jsonField(ex, 'extra'),
				responses: responses[part.exercise] || {},
				result: r
			})
		);
	}
	return {
		submitted_at: sub.getString('submitted_at'),
		auto_submitted: sub.getBool('auto_submitted'),
		score_points: sub.getFloat('score_points'),
		total_points: sub.getFloat('total_points'),
		note20: sub.getFloat('note20'),
		parts
	};
}


/** Évaluation de l'auteur (write : modification, réservée à l'auteur). */
function loadForAuthor(app, auth, id, write) {
	let rec;
	try {
		rec = app.findRecordById('evaluations', id);
	} catch (_) {
		return { status: 404, error: 'Évaluation introuvable.' };
	}
	const mine = rec.getString('author') === auth.id;
	if (!mine && (write || auth.getString('role') !== 'admin')) return { status: 404, error: 'Évaluation introuvable.' };
	return { rec, ev: evalData(rec) };
}

/** Évaluation publiée visant cet élève. */
function loadForStudent(app, auth, id) {
	if (auth.getString('role') !== 'eleve') return { status: 403, error: 'Réservé aux élèves.' };
	let rec;
	try {
		rec = app.findRecordById('evaluations', id);
	} catch (_) {
		return { status: 404, error: 'Évaluation introuvable.' };
	}
	const ev = evalData(rec);
	if (ev.status !== 'published' || !isTarget(app, ev, auth.id)) return { status: 404, error: 'Évaluation introuvable.' };
	return { rec, ev };
}

function findSubmission(app, evalId, studentId) {
	try {
		return app.findFirstRecordByFilter('eval_submissions', 'evaluation = {:e} && student = {:s}', { e: evalId, s: studentId });
	} catch (_) {
		return null;
	}
}

const iso = (t) => (t === null || t === undefined ? null : new Date(t).toISOString());

function partSummaries(app, ev) {
	const out = [];
	for (const p of ev.parts) {
		try {
			out.push(partInfo(app, p).summary);
		} catch (_) {}
	}
	return out;
}

/** Ce que voit l'élève : présentation, sujet sans réponses pendant l'épreuve, copie corrigée ensuite. */
function studentView(app, ev, sub, now) {
	const view = {
		evaluation: {
			id: ev.id,
			title: ev.title,
			author_username: ev.author_username,
			grade_level: ev.grade_level,
			time_limit_min: ev.time_limit_min,
			opens_at: ev.opens_at || null,
			closes_at: ev.closes_at || null,
			correction_mode: ev.correction_mode
		},
		state: evalState(ev, now),
		parts: partSummaries(app, ev),
		now: iso(now),
		submission: null
	};
	if (!sub) return view;
	sub = finalizeIfOverdue(app, sub, ev, now);
	const deadline = deadlineOf(ev, ms(sub.getString('started_at')));
	view.submission = {
		started_at: sub.getString('started_at'),
		deadline: iso(deadline),
		submitted_at: sub.getString('submitted_at') || null,
		auto_submitted: sub.getBool('auto_submitted')
	};
	if (!view.submission.submitted_at) {
		const gr = require(`${__hooks}/lib/grading.js`);
		const saved = jsonField(sub, 'responses') || {};
		view.paper = [];
		for (const p of ev.parts) {
			let info;
			try {
				info = partInfo(app, p);
			} catch (_) {
				continue;
			}
			const pub = publicPart(info.rule, gr.exerciseData(info.exercise), info.summary.hard_mode, seededRng(`${sub.id}:${p.exercise}`));
			view.paper.push(
				Object.assign({}, info.summary, {
					rule: publicRule(info.rule),
					text: pub.text,
					items: pub.items,
					extra: pub.extra,
					responses: saved[p.exercise] || {}
				})
			);
		}
	} else {
		view.correction_visible = correctionVisible(ev, now);
		if (view.correction_visible) view.copy = correctedCopy(app, ev, sub);
	}
	return view;
}

/** Parties chargées une fois (pour compter les réponses de toute une classe). */
function loadPartInfos(app, ev) {
	const out = [];
	for (const p of ev.parts) {
		try {
			const info = partInfo(app, p);
			out.push({ exercise: p.exercise, ruleType: info.rule.rule_type, blanks: jsonField(info.exercise, 'blanks') || [] });
		} catch (_) {}
	}
	return out;
}

/** Réponses données sur toute la copie : { answered, total, pct }. */
function answeredStats(infos, responses) {
	let answered = 0;
	let total = 0;
	for (const info of infos) {
		const c = answeredCount(info.ruleType, info.blanks, (responses || {})[info.exercise]);
		answered += c.answered;
		total += c.total;
	}
	return { answered, total, pct: total ? Math.round((answered / total) * 100) : 0 };
}

/** Retour de l'élève sur la page : temps passé ailleurs ajouté. */
function markBack(app, sub, now) {
	const left = ms(sub.getString('left_at'));
	if (left === null) return;
	const away = Math.max(0, Math.min(now - left, 6 * 3600 * 1000));
	sub.set('away_seconds', sub.getInt('away_seconds') + Math.round(away / 1000));
	sub.set('left_at', '');
	app.save(sub);
}

/**
 * Copie d'une évaluation (pour une autre classe) : mêmes parties (exercices
 * recopiés), même barème et mêmes réglages ; sans élèves, sans dates, en préparation.
 */
function duplicate(app, auth, ev) {
	const rec = new Record(app.findCollectionByNameOrId('evaluations'));
	const title = `${ev.title} (copie)`.slice(0, 100);
	rec.set('title', title);
	rec.set('author', auth.id);
	rec.set('author_username', auth.getString('username'));
	rec.set('grade_level', ev.grade_level);
	rec.set('status', 'draft');
	rec.set('parts', []);
	rec.set('time_limit_min', ev.time_limit_min);
	rec.set('correction_mode', ev.correction_mode === 'after_close' ? 'manual' : ev.correction_mode);
	rec.set('correction_released', false);
	rec.set('no_reminders', !!ev.no_reminders);
	app.save(rec);
	const parts = [];
	for (const p of ev.parts) {
		let src;
		try {
			src = app.findRecordById('exercises', p.exercise);
		} catch (_) {
			continue;
		}
		const ex = new Record(app.findCollectionByNameOrId('exercises'));
		for (const f of ['rule', 'theme', 'grade_level', 'num_blanks', 'text', 'llm_model']) ex.set(f, src.get(f));
		ex.set('blanks', jsonField(src, 'blanks') || []);
		const extra = jsonField(src, 'extra');
		if (extra) ex.set('extra', extra);
		ex.set('owner', auth.id);
		ex.set('owner_username', auth.getString('username'));
		ex.set('evaluation', rec.id);
		ex.set('verified', false);
		app.save(ex);
		parts.push(Object.assign({}, p, { exercise: ex.id }));
	}
	rec.set('parts', parts);
	app.save(rec);
	return rec;
}

module.exports = {
	MAX_PARTS,
	answeredCount,
	durationSeconds,
	recompute,
	applyOverride,
	loadPartInfos,
	answeredStats,
	markBack,
	duplicate,
	GRACE_MS,
	seededRng,
	shuffled,
	publicPart,
	partCount,
	evalState,
	deadlineOf,
	correctionVisible,
	earnedPoints,
	noteOn20,
	validateSettings,
	questionStats,
	ms,
	stringList,
	evalData,
	countSubmissions,
	classIdsOf,
	isTarget,
	targetIds,
	allowedStudentIds,
	validateTargets,
	partInfo,
	publicRule,
	cleanAllResponses,
	finalize,
	finalizeIfOverdue,
	correctedCopy,
	loadForAuthor,
	loadForStudent,
	findSubmission,
	iso,
	partSummaries,
	studentView
};
