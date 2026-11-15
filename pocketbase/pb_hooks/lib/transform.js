// Type d'exercice « transform » : transformer une phrase (négative,
// interrogative, exclamative, impérative).
//
// Une question = { source, target, references[], options[], correct, … }.
//  - Mode normal : QCM. options[0] est la bonne réponse (= references[0]),
//    les deux autres sont des erreurs typiques ; l'affichage les mélange.
//  - Mode difficile : l'élève écrit la phrase. Contrôles sans IA d'abord
//    (ponctuation finale, deux morceaux de la négation, pas de sujet à
//    l'impératif…), puis jugement du LLM, guidé par les réponses de référence.

const g = require(`${__hooks}/lib/gram.js`);
const conj = require(`${__hooks}/lib/conjugaison.js`);
const { shuffle } = require(`${__hooks}/lib/exercises.js`);

const TARGETS = {
	negative: { label: 'forme négative', instruction: 'Mets cette phrase à la forme négative.' },
	interrogative: { label: 'phrase interrogative', instruction: 'Transforme cette phrase en phrase interrogative.' },
	exclamative: { label: 'phrase exclamative', instruction: 'Transforme cette phrase en phrase exclamative.' },
	imperative: { label: 'phrase impérative', instruction: 'Transforme cette phrase en phrase impérative (un ordre ou un conseil).' }
};

const SUBJECT_PRONOUNS = new Set(['je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);
const NEG_SECOND = new Set(['pas', 'plus', 'jamais', 'rien', 'personne', 'aucun', 'aucune', 'guère', 'point', 'nullement', 'ni', 'nulle']);

/** Forme de comparaison d'une phrase : casse, apostrophes, espaces (y compris avant ? ! ; :). */
function normSentence(s) {
	return g
		.normalizeWord(s)
		.replace(/\s+([?!.,;:])/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function words(s) {
	return String(s || '')
		.toLowerCase()
		.replace(/[’]/g, "'")
		.replace(/[.,;:!?«»"()]/g, ' ')
		.split(/[\s']+|-(?=\w)/)
		.filter(Boolean);
}

function hasNe(s) {
	return /(^|[\s«"(-])(ne\s|n['’])/i.test(` ${String(s)}`);
}

/**
 * Contrôle sans IA : la phrase peut-elle être une bonne transformation ?
 * Retourne un message d'erreur pour l'élève, ou null.
 */
function checkTarget(target, sentence, source) {
	const s = String(sentence || '').trim();
	if (!s) return 'Tu n\'as rien écrit.';
	if (source && normSentence(s) === normSentence(source)) return "La phrase n'a pas été transformée.";
	const last = s.replace(/\s+$/, '').slice(-1);
	if (!['.', '?', '!'].includes(last)) return "N'oublie pas la ponctuation à la fin de la phrase.";
	if (target === 'interrogative' && last !== '?') {
		return "Une phrase interrogative se termine par un point d'interrogation (?).";
	}
	if (target === 'exclamative' && last !== '!') {
		return "Une phrase exclamative se termine par un point d'exclamation (!).";
	}
	if (target === 'negative') {
		const ws = words(s);
		const ne = hasNe(s);
		const second = ws.some((w) => NEG_SECOND.has(w));
		if (!ne && !second) return 'La phrase n\'est pas à la forme négative : il faut « ne … pas » (ou ne … plus, ne … jamais…).';
		if (!ne) return 'Il manque le premier morceau de la négation : « ne » (ou « n\' » devant une voyelle).';
		if (!second) return 'Il manque le deuxième morceau de la négation : pas, plus, jamais, rien…';
	}
	if (target === 'imperative') {
		const first = words(s)[0];
		if (SUBJECT_PRONOUNS.has(first)) return "À l'impératif, il n'y a pas de sujet : on commence directement par le verbe (ou par « ne » à la forme négative).";
		if (last === '?') return "Une phrase impérative donne un ordre : elle se termine par un point ou un point d'exclamation.";
	}
	return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Génération
// ────────────────────────────────────────────────────────────────────────────

const LEVEL_HINTS = {
	negative: {
		1: 'ne … pas uniquement, au présent, phrases courtes ; pensez à « n\' » devant une voyelle.',
		2: 'ne … pas, ne … plus, ne … jamais, ne … rien ; quelques « du / de la / des » qui deviennent « de » (Il mange du pain → Il ne mange pas de pain) ; quelques passés composés (il n\'a pas mangé).',
		3: 'ne … pas / plus / jamais / rien / personne / aucun ; temps composés, verbes pronominaux (il ne se lève pas), pronoms compléments (je ne le vois pas), infinitif (ne pas courir).'
	},
	interrogative: {
		1: 'questions simples : réponses de référence avec « est-ce que » et avec l\'intonation ; sujets pronoms.',
		2: 'propose les trois formes en références (intonation, est-ce que, inversion « Viens-tu ? ») ; quelques « -t- » (Mange-t-il ?).',
		3: 'inversion complexe avec un nom sujet (Paul vient-il ?), mots interrogatifs (Où, Quand, Pourquoi…) quand la phrase s\'y prête, temps composés (A-t-il fini ?).'
	},
	exclamative: {
		1: 'avec « Comme … ! » ou « Quel(le) … ! » sur des phrases simples (Il fait beau. → Comme il fait beau !).',
		2: '« Quel / Quelle / Quels / Quelles » bien accordés, « Comme … ! », « Que … ! ».',
		3: 'formes variées, accord de « quel », interjections possibles (Oh, Ah) en plus de la transformation.'
	},
	imperative: {
		1: 'phrases avec « tu » ou « vous » et des verbes courants du 1er groupe (Tu ranges ta chambre. → Range ta chambre.).',
		2: '« tu », « nous » et « vous » ; verbes en -er sans s à la 2e personne (mange, va), être et avoir (sois, ayez), quelques phrases négatives (Ne cours pas !).',
		3: 'verbes pronominaux (Lève-toi. Ne te lève pas.), pronoms compléments (Donne-le-moi.), verbes irréguliers (savoir → sache), forme négative.'
	}
};

const MISTAKES = {
	negative: 'oubli de « ne » (Il mange pas.), oubli de « pas » (Il ne mange.), mauvaise place (Il ne pas mange. / Il n\'a mangé pas.), « n\' » oublié devant une voyelle (Il ne aime pas.)',
	interrogative: 'point d\'interrogation oublié, trait d\'union oublié (Viens tu ?), -t- oublié (Mange il ?), inversion fautive (Est-ce que vient-il ?)',
	exclamative: 'point d\'exclamation oublié, « quel » mal accordé (Quel belle journée !), phrase devenue interrogative',
	imperative:
		'sujet gardé (Tu range ta chambre !), s gardé sur un verbe en -er (Ranges ta chambre.), verbe mal conjugué (Es prudent. / Vas chercher), pronom mal placé (Te lave les mains.). JAMAIS un impératif correct à une autre personne (Allez à la plage ! pour « Nous allons à la plage. ») : c\'est aussi une phrase impérative juste'
};

function callTransform(cfg, rule, req, targets, attemptIdx) {
	const tier = conj.levelTier(req.grade_level);
	const perTarget = targets
		.map((t) => `- ${TARGETS[t].label} (target = ${t}) : ${LEVEL_HINTS[t][tier] || LEVEL_HINTS[t][2]}\n  Erreurs typiques pour les 2 mauvaises propositions : ${MISTAKES[t]}.`)
		.join('\n');
	const spread =
		targets.length > 1
			? `\n- Répartis les phrases entre les transformations (${targets.join(', ')}) de façon à peu près égale.`
			: '';
	const retryHint =
		attemptIdx > 0
			? "\n\n⚠️ Ta tentative précédente était invalide (nombre de phrases, transformation mal faite dans une référence, ponctuation finale, mauvaise proposition identique à une référence, ou phrase de départ impossible à mettre à l'impératif). Vérifie chaque phrase."
			: '';

	const userPrompt = `NOTION : ${rule.display_name}
EXPLICATION : ${rule.short_description}

Prépare exactement ${req.num_blanks} phrases de départ courtes et naturelles, adaptées à un élève de niveau ${req.grade_level}, en lien avec le thème « ${req.theme} ». Chaque phrase de départ est DÉCLARATIVE et AFFIRMATIVE (sauf pour l'exclamative, où elle est simplement déclarative).

Transformations et niveau attendu :
${perTarget}

Pour chaque phrase, donne :
- source : la phrase de départ ;
- target : la transformation demandée ;
- references : 1 à 4 transformations CORRECTES (toutes les bonnes formulations courantes, la plus simple en premier), avec la bonne ponctuation finale ;
- wrong_options : exactement 2 transformations FAUSSES mais plausibles, qui reprennent les erreurs typiques ci-dessus (jamais une réponse correcte) ;
- explanation : une phrase très courte qui explique la transformation à l'élève (tutoiement).

RÈGLES :
- Pour l'impérative, la phrase de départ a pour sujet « tu », « nous » ou « vous » (l'impératif n'existe qu'à ces personnes).
- Garde le même sens et le même temps que la phrase de départ (sauf l'impératif).
- Forme négative : après la négation, « du / de la / de l' / des / un / une » devant le complément deviennent « de / d' » (Les poules pondent des œufs. → Les poules ne pondent pas d'œufs.) ; « ne pondent pas des œufs » ou « ne mange pas de l'herbe » ne sont PAS des références correctes.
- Pas deux fois la même phrase.${spread}${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_items.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_items',
				description: 'Soumet les phrases à transformer.',
				parameters: {
					type: 'object',
					required: ['items'],
					properties: {
						items: {
							type: 'array',
							items: {
								type: 'object',
								required: ['source', 'target', 'references', 'wrong_options', 'explanation'],
								properties: {
									source: { type: 'string' },
									target: { type: 'string', enum: targets },
									references: { type: 'array', items: { type: 'string' } },
									wrong_options: { type: 'array', items: { type: 'string' } },
									explanation: { type: 'string' }
								}
							}
						}
					}
				}
			}
		}
	];
	const json = g.chatCompletion(
		cfg,
		{
			messages: [
				{
					role: 'system',
					content: `Tu es un professeur des écoles expérimenté qui prépare des exercices de transformation de phrases pour des élèves de niveau ${req.grade_level}. Tes transformations correctes sont irréprochables, tes erreurs sont celles que font vraiment les élèves.`
				},
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_items' } },
			temperature: 0.7,
			max_tokens: 4000
		},
		cfg.timeoutGenerate
	);
	return g.parseToolCall(json);
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Construit une question stockée ; { error } si elle n'est pas exploitable. */
function buildItem(it, position, targets) {
	const source = clean(it.source);
	const target = it.target;
	if (!TARGETS[target] || (targets && !targets.includes(target))) return { error: `transformation inconnue « ${target} »` };
	if (source.length < 3 || source.length > 200) return { error: 'phrase de départ vide ou trop longue' };
	const references = (Array.isArray(it.references) ? it.references : []).map(clean).filter(Boolean).slice(0, 4);
	if (!references.length) return { error: 'aucune réponse de référence' };
	for (const r of references) {
		const err = checkTarget(target, r, source);
		if (err) return { error: `référence « ${r} » : ${err}` };
	}
	const refNorm = new Set(references.map(normSentence));
	const wrong = (Array.isArray(it.wrong_options) ? it.wrong_options : []).map(clean).filter(Boolean);
	if (wrong.length !== 2) return { error: 'il faut exactement 2 mauvaises propositions' };
	if (wrong.some((w) => refNorm.has(normSentence(w)))) return { error: 'une mauvaise proposition est en fait correcte' };
	if (normSentence(wrong[0]) === normSentence(wrong[1])) return { error: 'mauvaises propositions identiques' };
	if (target === 'imperative' && !words(source).some((w) => w === 'tu' || w === 'nous' || w === 'vous')) {
		return { error: "phrase de départ sans « tu », « nous » ni « vous » : impossible à l'impératif" };
	}
	return {
		position,
		source,
		target,
		instruction: TARGETS[target].instruction,
		references,
		options: [references[0], wrong[0], wrong[1]],
		correct: references[0],
		explanation: clean(it.explanation).slice(0, 300),
		category: TARGETS[target].label
	};
}

function validateTransform(out, n, targets) {
	if (!out || !Array.isArray(out.items)) return { error: 'Liste de phrases manquante.' };
	if (out.items.length !== n) return { error: `Nombre de phrases : attendu ${n}, reçu ${out.items.length}.` };
	const seen = new Set();
	const counts = {};
	const blanks = [];
	for (let i = 0; i < n; i++) {
		const item = buildItem(out.items[i] || {}, i + 1, targets);
		if (item.error) return { error: `Phrase ${i + 1} : ${item.error}.` };
		const key = normSentence(item.source) + '|' + item.target;
		if (seen.has(key)) return { error: `Phrase en double : « ${item.source} ».` };
		seen.add(key);
		counts[item.target] = (counts[item.target] || 0) + 1;
		blanks.push(item);
	}
	if (targets.length > 1 && n >= targets.length * 2) {
		const absent = targets.filter((t) => !counts[t]);
		if (absent.length) return { error: `Aucune phrase pour : ${absent.join(', ')}.` };
	}
	return { blanks: shuffle(blanks).map((b, i) => Object.assign(b, { position: i + 1 })) };
}

function generate(cfg, rule, req, logger) {
	const c = rule.config && typeof rule.config === 'object' ? rule.config : {};
	const targets = (Array.isArray(c.targets) ? c.targets : Object.keys(TARGETS)).filter((t) => TARGETS[t]);
	let lastError = '';
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const v = validateTransform(callTransform(cfg, rule, req, targets, attempt), req.num_blanks, targets);
			if (!v.error) {
				return {
					text: 'Transforme chaque phrase comme demandé.',
					blanks: v.blanks
				};
			}
			lastError = v.error;
			logger.warn(`Génération : tentative ${attempt + 1} invalide`, 'error', lastError);
		} catch (err) {
			if (err && err.providerStatus !== undefined) throw err;
			lastError = String((err && err.message) || err);
			logger.warn(`Génération : tentative ${attempt + 1} échouée`, 'error', lastError);
		}
	}
	const e = new Error(lastError);
	e.invalid = true;
	throw e;
}

// ────────────────────────────────────────────────────────────────────────────
// Correction
// ────────────────────────────────────────────────────────────────────────────

/** Jugement du LLM pour les réponses écrites ; { position: { ok, feedback } }. */
function llmJudge(cfg, pending, gradeLevel) {
	const list = pending
		.map(
			(p) =>
				`#${p.position}
- phrase de départ : ${p.source}
- transformation demandée : ${TARGETS[p.target].label}
- réponses de référence (exemples corrects, pas forcément toutes les bonnes réponses) : ${p.references.join(' | ')}
- réponse de l'élève : ${p.given}`
		)
		.join('\n\n');
	const userPrompt = `Tu corriges des transformations de phrases écrites par un élève de niveau ${gradeLevel}.

${list}

Pour chaque réponse, décide si c'est une transformation CORRECTE :
- la transformation demandée est faite (une autre formulation que les références peut être juste : interrogative par inversion, « est-ce que » ou intonation ; négation ne … pas, ne … plus, ne … jamais si la consigne ne précise rien) ;
- le sens de la phrase est conservé ;
- la phrase est grammaticalement correcte, verbe bien conjugué (à l'impératif : pas de s à la 2e personne des verbes en -er), bonne ponctuation finale.
Une petite faute d'orthographe SANS rapport avec la transformation (un accent oublié sur un nom, par exemple) n'empêche pas ok = true, mais signale-la dans le retour.

Pour chaque réponse, écris aussi un retour très court (1 à 2 phrases), bienveillant, qui tutoie l'élève et explique l'erreur s'il y en a une. Texte brut, sans Markdown.

Réponds UNIQUEMENT en appelant le tool submit_grades.`;
	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_grades',
				description: 'Soumet la correction de chaque réponse.',
				parameters: {
					type: 'object',
					required: ['grades'],
					properties: {
						grades: {
							type: 'array',
							items: {
								type: 'object',
								required: ['position', 'ok', 'feedback'],
								properties: {
									position: { type: 'integer' },
									ok: { type: 'boolean' },
									feedback: { type: 'string' }
								}
							}
						}
					}
				}
			}
		}
	];
	const json = g.chatCompletion(
		cfg,
		{
			messages: [
				{ role: 'system', content: 'Tu es un professeur des écoles juste et précis : tu ne valides que les phrases réellement correctes.' },
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_grades' } },
			temperature: 0,
			max_tokens: 2000
		},
		cfg.timeoutGenerate
	);
	const out = g.parseToolCall(json);
	const res = {};
	for (const gr of (out && out.grades) || []) {
		if (gr && Number.isInteger(gr.position) && typeof gr.ok === 'boolean') {
			res[gr.position] = { ok: gr.ok, feedback: clean(gr.feedback).replace(/\*\*|__/g, '').slice(0, 400) };
		}
	}
	return res;
}

/**
 * writing = true : réponses écrites (mode difficile), sinon QCM.
 * cfg : config LLM (null pour désactiver le jugement par l'IA).
 */
function gradeTransform(exercise, responses, writing, cfg, logger) {
	const per_blank = [];
	const per_cat = {};
	const pending = [];
	for (const b of exercise.blanks) {
		if (!Object.prototype.hasOwnProperty.call(responses, String(b.position))) continue;
		const given = clean(responses[String(b.position)]);
		const refs = Array.isArray(b.references) && b.references.length ? b.references : [b.correct];
		const entry = {
			position: b.position,
			given: given || null,
			correct: b.correct,
			ok: false,
			context: `« ${b.source} » → ${TARGETS[b.target] ? TARGETS[b.target].label : b.target}`,
			explanation: b.explanation || ''
		};
		const exact = given && refs.some((r) => normSentence(r) === normSentence(given));
		if (!writing) {
			entry.ok = !!exact;
		} else if (exact) {
			entry.ok = true;
			entry.judged_by = 'rules';
		} else {
			const err = checkTarget(b.target, given, b.source);
			if (err) {
				entry.feedback = err;
				entry.judged_by = 'rules';
			} else {
				pending.push({ entry, source: b.source, target: b.target, references: refs, given, position: b.position });
			}
		}
		per_blank.push(entry);
		const cat = b.category || (TARGETS[b.target] && TARGETS[b.target].label) || 'transformation';
		per_cat[cat] = per_cat[cat] || { ok: 0, total: 0, _entries: [] };
		per_cat[cat]._entries.push(entry);
	}

	if (pending.length) {
		let judged = {};
		let failure = '';
		if (cfg && cfg.apiKey) {
			try {
				judged = llmJudge(cfg, pending, exercise.grade_level || '');
			} catch (err) {
				failure = String((err && err.message) || err);
			}
		} else {
			failure = 'LLM non configuré';
		}
		if (failure && logger) logger.warn('Correction IA des transformations échouée', 'error', failure);
		for (const p of pending) {
			const j = judged[p.position];
			if (j) {
				p.entry.ok = j.ok;
				p.entry.feedback = j.feedback;
				p.entry.judged_by = 'ia';
			} else {
				p.entry.ok = false;
				p.entry.uncertain = true;
				p.entry.judged_by = 'none';
				p.entry.feedback =
					"La correction automatique n'a pas pu vérifier ta phrase : compare-la avec les réponses possibles.";
			}
		}
	}

	let score = 0;
	for (const e of per_blank) if (e.ok) score++;
	for (const cat of Object.keys(per_cat)) {
		const es = per_cat[cat]._entries;
		per_cat[cat] = { ok: es.filter((e) => e.ok).length, total: es.length };
	}
	const total = per_blank.length;
	const ratio = total ? score / total : 0;
	return {
		score,
		score_total: total,
		per_blank,
		per_rule_breakdown: { [exercise.rule]: { ok: score, total } },
		per_group_breakdown: Object.keys(per_cat).length > 1 ? per_cat : {},
		suggested_next_rule_id: ratio < 0.8 ? exercise.rule : null
	};
}

module.exports = {
	TARGETS,
	normSentence,
	checkTarget,
	buildItem,
	validateTransform,
	gradeTransform,
	generate
};
