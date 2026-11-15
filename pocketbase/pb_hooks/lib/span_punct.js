// Types d'exercices « span » (retrouver le GNS en cliquant sur les mots) et
// « punctuation » (rétablir la ponctuation d'un texte).
//
// Le LLM écrit les phrases ; le serveur en déduit tout le reste (mots
// cliquables, bonnes réponses, tolérances) de façon déterministe, et rejette
// ce qui n'est pas exploitable.

const g = require(`${__hooks}/lib/gram.js`);
const conj = require(`${__hooks}/lib/conjugaison.js`);
const { shuffle } = require(`${__hooks}/lib/exercises.js`);

// ────────────────────────────────────────────────────────────────────────────
// GNS : phrase marquée « [[Le chien des voisins]] aboie. » → mots + réponse
// ────────────────────────────────────────────────────────────────────────────

const SUBJECT_PRONOUNS = new Set(['je', "j'", 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', "c'", 'cela', 'ça', 'qui', 'celui', 'celle', 'ceux', 'celles', 'chacun', 'chacune', 'personne', 'rien', 'tout']);
const PREPOSITIONS = new Set(['dans', 'sur', 'sous', 'à', 'au', 'aux', 'en', 'pour', 'avec', 'chez', 'vers', 'par', 'pendant', 'depuis', 'après', 'avant', 'derrière', 'devant', 'contre', 'entre', 'sans']);

const SPAN_KINDS = {
	simple: 'sujet court en début de phrase',
	long: 'sujet long (adjectifs, compléments)',
	eloigne: 'sujet après un complément en tête',
	compose: 'sujet composé (… et …)',
	inverse: 'sujet placé après le verbe'
};

/**
 * Découpe une phrase marquée en mots (séparés par les espaces, ponctuation
 * collée) et calcule les indices des mots du passage [[ ]].
 * Retourne { tokens, answer, inner } ou { error }.
 */
function spanTokens(marked) {
	const s = String(marked || '').replace(/\s+/g, ' ').trim();
	const start = s.indexOf('[[');
	const end = s.indexOf(']]');
	if (start < 0 || end < 0 || end < start) return { error: 'passage [[ ]] manquant' };
	if (s.indexOf('[[', start + 2) >= 0 || s.indexOf(']]', end + 2) >= 0) return { error: 'plusieurs passages [[ ]]' };
	const inner = s.slice(start + 2, end);
	if (!inner.trim() || inner !== inner.trim()) return { error: 'passage [[ ]] vide ou avec des espaces au bord' };
	// Les crochets doivent tomber entre deux mots, pas au milieu d'un mot.
	if (start > 0 && !/[\s«"(—-]/.test(s[start - 1])) return { error: '[[ collé au milieu d\'un mot' };
	if (end + 2 < s.length && !/[\s.,;:!?»")]/.test(s[end + 2])) return { error: ']] collé au milieu d\'un mot' };

	const stripped = s.slice(0, start) + inner + s.slice(end + 2);
	const gStart = start;
	const gEnd = start + inner.length;
	const tokens = [];
	const answer = [];
	const re = /\S+/g;
	let m;
	while ((m = re.exec(stripped)) !== null) {
		if (m.index >= gStart && m.index < gEnd) answer.push(tokens.length);
		tokens.push(m[0]);
	}
	return { tokens, answer, inner };
}

/** Normalise une réponse « 2,0,1 » → « 0,1,2 ». */
function normalizeIndices(s) {
	const nums = String(s ?? '')
		.split(',')
		.map((x) => Number(x.trim()))
		.filter((x) => Number.isInteger(x) && x >= 0);
	return [...new Set(nums)].sort((a, b) => a - b).join(',');
}

/** Construit un item de GNS stocké à partir d'une phrase marquée ; { error } sinon. */
function buildSpanItem(prompt, kind, explanation, position) {
	const t = spanTokens(prompt);
	if (t.error) return t;
	if (t.answer.length === 0) return { error: 'passage [[ ]] vide' };
	if (t.answer.length >= t.tokens.length) return { error: 'le passage [[ ]] couvre toute la phrase' };
	if (t.answer.length > 15) return { error: 'GNS trop long' };
	const first = t.inner.toLowerCase().split(/\s+/)[0].replace(/[’]/g, "'");
	if (SUBJECT_PRONOUNS.has(first) || /^(j|c|qu)'/.test(first)) return { error: `« ${t.inner} » commence par un pronom` };
	if (PREPOSITIONS.has(first)) return { error: `« ${t.inner} » commence par une préposition` };
	const k = SPAN_KINDS[kind] ? kind : 'simple';
	return {
		position,
		prompt: String(prompt).replace(/\s+/g, ' ').trim(),
		tokens: t.tokens,
		answer: t.answer.join(','),
		correct: t.inner.replace(/[.,;:!?]+$/, ''),
		explanation: String(explanation || '').trim().slice(0, 300),
		kind: k,
		category: SPAN_KINDS[k]
	};
}

const SPAN_LEVEL = {
	1: '- Surtout des sujets COURTS en début de phrase (« [[Le chat]] dort. », « [[Ma petite sœur]] chante. ») et quelques sujets un peu plus longs (kind = simple ou long).',
	2: `- Varie : sujets courts (simple), sujets longs avec adjectifs ou complément du nom (« [[Le vieux chien de mes voisins]] aboie. » → long), sujet après un complément en tête de phrase (« Ce matin, [[le facteur]] passe. » → eloigne), sujet composé (« [[Léa et son frère]] jouent. » → compose).`,
	3: `- Varie et corse : sujets longs avec une proposition relative (« [[Le garçon qui porte un chapeau rouge]] sourit. » → long), sujet après un complément (eloigne), sujet composé (compose), et quelques sujets INVERSÉS placés après le verbe (« Dans la cour jouent [[les élèves de CM2]]. » → inverse).`
};

function callSpan(cfg, rule, req, attemptIdx) {
	const tier = conj.levelTier(req.grade_level);
	const retryHint =
		attemptIdx > 0
			? '\n\n⚠️ Ta tentative précédente était invalide (nombre de phrases, [[ ]] manquant ou mal placé, sujet qui est un pronom, ou [[ ]] autour de toute la phrase). Vérifie chaque phrase.'
			: '';
	const userPrompt = `NOTION : ${rule.display_name}
EXPLICATION : ${rule.short_description}

Écris exactement ${req.num_blanks} phrases courtes, naturelles et variées, adaptées à un élève de niveau ${req.grade_level}, en lien avec le thème « ${req.theme} ».

RÈGLES :
- Chaque phrase a UN verbe conjugué principal, et son sujet est un GROUPE NOMINAL (jamais un pronom comme il, elle, on, ils, qui, ce).
- Mets le groupe nominal sujet COMPLET entre [[ ]] : déterminant, nom, adjectifs, compléments du nom, proposition relative éventuelle. Rien d'autre : pas le verbe, pas les compléments de phrase.
- Les crochets entourent des mots entiers : « [[Le chien de Léa]] aboie. » et pas « [[Le chien de Léa ]]aboie ».
${SPAN_LEVEL[tier] || SPAN_LEVEL[2]}
- Pour chaque phrase, donne kind (simple, long, eloigne, compose ou inverse) et une explication très courte qui donne le truc : « Qui est-ce qui aboie ? Le chien de Léa. »
- Pas de dialogue, pas deux fois la même phrase.${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_items.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_items',
				description: 'Soumet les phrases avec le GNS entre [[ ]].',
				parameters: {
					type: 'object',
					required: ['items'],
					properties: {
						items: {
							type: 'array',
							items: {
								type: 'object',
								required: ['prompt', 'kind', 'explanation'],
								properties: {
									prompt: { type: 'string' },
									kind: { type: 'string', enum: Object.keys(SPAN_KINDS) },
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
					content: `Tu es un professeur des écoles expérimenté qui prépare des exercices de grammaire pour des élèves de niveau ${req.grade_level}. Tes phrases sont correctes et le groupe nominal sujet est toujours sans ambiguïté.`
				},
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_items' } },
			temperature: 0.7,
			max_tokens: 3000
		},
		cfg.timeoutGenerate
	);
	return g.parseToolCall(json);
}

function validateSpan(out, n) {
	if (!out || !Array.isArray(out.items)) return { error: 'Liste de phrases manquante.' };
	if (out.items.length !== n) return { error: `Nombre de phrases : attendu ${n}, reçu ${out.items.length}.` };
	const seen = new Set();
	const blanks = [];
	for (let i = 0; i < n; i++) {
		const it = out.items[i] || {};
		const item = buildSpanItem(it.prompt, it.kind, it.explanation, i + 1);
		if (item.error) return { error: `Phrase ${i + 1} (« ${it.prompt} ») : ${item.error}.` };
		const key = g.normalizeWord(item.tokens.join(' '));
		if (seen.has(key)) return { error: `Phrase en double : « ${item.tokens.join(' ')} ».` };
		seen.add(key);
		blanks.push(item);
	}
	// Le LLM enchaîne souvent les types de sujets dans l'ordre de la consigne
	// (simple, long, éloigné…) : on mélange les phrases.
	return { blanks: shuffle(blanks).map((b, i) => Object.assign(b, { position: i + 1 })) };
}

function gradeSpan(exercise, responses) {
	const per_blank = [];
	const per_cat = {};
	let score = 0;
	for (const b of exercise.blanks) {
		if (!Object.prototype.hasOwnProperty.call(responses, String(b.position))) continue;
		const given = normalizeIndices(responses[String(b.position)]);
		const ok = given !== '' && given === normalizeIndices(b.answer);
		if (ok) score++;
		const tokens = Array.isArray(b.tokens) ? b.tokens : [];
		const givenText = given ? given.split(',').map((i) => tokens[Number(i)] ?? '').join(' ') : null;
		per_blank.push({
			position: b.position,
			given: givenText,
			given_indices: given,
			correct: b.correct,
			ok,
			context: `« ${tokens.join(' ')} »`,
			explanation: b.explanation || ''
		});
		if (b.category) {
			per_cat[b.category] = per_cat[b.category] || { ok: 0, total: 0 };
			per_cat[b.category].total++;
			if (ok) per_cat[b.category].ok++;
		}
	}
	return finishGrading(exercise, per_blank, score, per_cat);
}

// ────────────────────────────────────────────────────────────────────────────
// Ponctuation
// ────────────────────────────────────────────────────────────────────────────

const MARKS = ['.', ',', '?', '!'];
const SENTENCE_END = new Set(['.', '?', '!']);
const MARK_LABELS = { '.': 'point', ',': 'virgule', '?': "point d'interrogation", '!': "point d'exclamation" };
const EXCLAMATIVE_START = /^(quel|quelle|quels|quelles|que|qu'|comme|ah|oh|hélas|bravo|ouf|zut|chouette|aïe|ouille|hourra|attention|vive|youpi)\b/i;

/**
 * Analyse un texte ponctué. Retourne { words, blanks, sentences } :
 *  - words : mots affichés, sans ponctuation, majuscule de début de phrase
 *    retirée (sauf noms propres) ;
 *  - blanks : ponctuation attendue après le mot n° position (1-based),
 *    avec les réponses acceptées ;
 * ou { error }.
 */
function parsePunctuation(text, properNouns) {
	const t = String(text || '').replace(/\s+/g, ' ').trim();
	if (!t) return { error: 'texte vide' };
	const forbidden = t.match(/[;:«»"“”()…\[\]{}]|\.\.|—|–| - /);
	if (forbidden) return { error: `ponctuation non autorisée : « ${forbidden[0]} »` };

	const proper = new Set((Array.isArray(properNouns) ? properNouns : []).map((p) => String(p).toLowerCase().trim()).filter(Boolean));
	const tokens = t.match(/[.,?!]|[^\s.,?!]+/g) || [];
	const raw = [];
	const marks = {};
	for (const tok of tokens) {
		if (MARKS.includes(tok)) {
			if (!raw.length) return { error: 'ponctuation en début de texte' };
			const last = raw.length - 1;
			if (marks[last] !== undefined) return { error: `double ponctuation après « ${raw[last]} »` };
			marks[last] = tok;
		} else {
			raw.push(tok);
		}
	}
	if (!raw.length) return { error: 'aucun mot' };
	if (!SENTENCE_END.has(marks[raw.length - 1])) return { error: 'le texte doit finir par . ? ou !' };

	// Un mot est un nom propre s'il est déclaré comme tel, ou s'il garde sa
	// majuscule au milieu d'une phrase ailleurs dans le texte.
	const midCapitalized = new Set();
	raw.forEach((w, i) => {
		const startOfSentence = i === 0 || SENTENCE_END.has(marks[i - 1]);
		if (!startOfSentence && /^[A-ZÀ-Ý]/.test(w)) midCapitalized.add(w.toLowerCase());
	});
	const isProper = (w) => {
		const lw = w.toLowerCase().replace(/[’]/g, "'");
		const bare = lw.replace(/^(l|d)'/, '');
		return proper.has(lw) || proper.has(bare) || midCapitalized.has(lw);
	};

	const words = [];
	const blanks = [];
	let sentenceStart = 0;
	let sentences = 0;
	for (let i = 0; i < raw.length; i++) {
		const w = raw[i];
		const startOfSentence = i === 0 || SENTENCE_END.has(marks[i - 1]);
		if (startOfSentence) sentenceStart = i;
		words.push(startOfSentence && !isProper(w) ? w.charAt(0).toLocaleLowerCase('fr-FR') + w.slice(1) : w);
		const mark = marks[i];
		if (mark === undefined) continue;
		let accepted = [mark];
		if (mark === '.') accepted = ['.', '!'];
		if (mark === '!' && !EXCLAMATIVE_START.test(raw[sentenceStart])) accepted = ['!', '.'];
		if (SENTENCE_END.has(mark)) sentences++;
		blanks.push({ position: i + 1, correct: mark, accepted, category: MARK_LABELS[mark] });
	}
	return { words, blanks, sentences };
}

const PUNCT_LEVEL = {
	1: `- Surtout des phrases déclaratives (point), au moins une question (?) et une exclamation (!).
- Virgules UNIQUEMENT dans des énumérations (« des pommes, des poires et des prunes »).`,
	2: `- Mélange de phrases déclaratives, au moins une question (?) et une exclamation (« Quelle belle journée ! »).
- Virgules : énumérations, et après un complément placé en tête de phrase (« Le soir, … », « Dans la forêt, … »).`,
	3: `- Mélange de phrases déclaratives, interrogatives et exclamatives, de longueurs variées.
- Virgules : énumérations, complément en tête de phrase, incises (« Le chat, inquiet, … »), apostrophe (« Léa, viens ici ! »).`
};

function callPunctuation(cfg, rule, req, attemptIdx) {
	const tier = conj.levelTier(req.grade_level);
	const retryHint =
		attemptIdx > 0
			? "\n\n⚠️ Ta tentative précédente était invalide (nombre de phrases, ponctuation non autorisée comme « : » « ; » « … » ou des guillemets, ou pas de question / d'exclamation). Corrige-la."
			: '';
	const userPrompt = `NOTION : ${rule.display_name}

Écris un petit texte narratif d'exactement ${req.num_blanks} phrases, sur le thème « ${req.theme} », pour un élève de niveau ${req.grade_level}. Il servira d'exercice : on enlèvera toute la ponctuation et l'élève devra la remettre.

RÈGLES :
- Ponctuation autorisée UNIQUEMENT : point (.), virgule (,), point d'interrogation (?), point d'exclamation (!). Pas de dialogue, pas de guillemets, pas de deux-points, pas de point-virgule, pas de points de suspension, pas de tiret, pas de parenthèses.
${PUNCT_LEVEL[tier] || PUNCT_LEVEL[2]}
- Chaque virgule doit répondre à une règle claire : pas de virgule facultative.
- Chaque phrase doit se terminer sans ambiguïté : un élève qui lit le texte sans ponctuation doit pouvoir retrouver où s'arrête chaque phrase.
- Donne aussi la liste des noms propres utilisés (prénoms, noms de villes…), écrits comme dans le texte.${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_text.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_text',
				description: 'Soumet le texte ponctué.',
				parameters: {
					type: 'object',
					required: ['text', 'proper_nouns'],
					properties: {
						text: { type: 'string' },
						proper_nouns: { type: 'array', items: { type: 'string' } }
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
					content: `Tu es un professeur des écoles expérimenté qui écrit des textes courts et vivants pour des élèves de niveau ${req.grade_level}, avec une ponctuation impeccable.`
				},
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_text' } },
			temperature: 0.7,
			max_tokens: 2000
		},
		cfg.timeoutGenerate
	);
	return g.parseToolCall(json);
}

function validatePunctuation(out, n) {
	if (!out || typeof out.text !== 'string') return { error: 'Texte manquant.' };
	const properNouns = Array.isArray(out.proper_nouns) ? out.proper_nouns.map(String) : [];
	const p = parsePunctuation(out.text, properNouns);
	if (p.error) return { error: `Texte invalide : ${p.error}.` };
	if (p.sentences < Math.max(2, n - 1) || p.sentences > n + 2) {
		return { error: `Nombre de phrases : attendu ${n}, reçu ${p.sentences}.` };
	}
	if (p.words.length > 450) return { error: 'Texte trop long.' };
	if (n >= 5) {
		const kinds = new Set(p.blanks.map((b) => b.correct));
		if (!kinds.has('?') || !kinds.has('!')) return { error: "Il faut au moins une question et une exclamation." };
	}
	return {
		text: String(out.text).replace(/\s+/g, ' ').trim(),
		blanks: p.blanks,
		extra: { words: p.words, proper_nouns: properNouns }
	};
}

/**
 * Correction : chaque ponctuation attendue est une question (manquante ou
 * fausse = erreur) ; un . ? ou ! ajouté là où il n'en faut pas compte aussi
 * comme erreur (une virgule en trop est tolérée).
 */
function gradePunctuation(exercise, responses, extra) {
	const words = extra && Array.isArray(extra.words) ? extra.words : [];
	const given = {};
	for (const k of Object.keys(responses)) {
		const v = String(responses[k] ?? '').trim();
		if (MARKS.includes(v)) given[Number(k)] = v;
	}
	const per_blank = [];
	const per_cat = {};
	let score = 0;
	const count = (cat, ok) => {
		per_cat[cat] = per_cat[cat] || { ok: 0, total: 0 };
		per_cat[cat].total++;
		if (ok) per_cat[cat].ok++;
	};
	const expected = new Set();
	for (const b of exercise.blanks) {
		expected.add(b.position);
		const gv = given[b.position] ?? null;
		const accepted = Array.isArray(b.accepted) && b.accepted.length ? b.accepted : [b.correct];
		const ok = gv !== null && accepted.includes(gv);
		if (ok) score++;
		per_blank.push({
			position: b.position,
			given: gv,
			correct: b.correct,
			ok,
			variant: ok && gv !== b.correct ? true : undefined,
			context: `après « ${words[b.position - 1] ?? '?'} »`
		});
		count(b.category || MARK_LABELS[b.correct], ok);
	}
	for (const pos of Object.keys(given).map(Number).sort((a, b) => a - b)) {
		if (expected.has(pos) || given[pos] === ',') continue;
		per_blank.push({
			position: pos,
			given: given[pos],
			correct: '',
			ok: false,
			extra: true,
			context: `après « ${words[pos - 1] ?? '?'} »`
		});
		count('ponctuation en trop', false);
	}
	per_blank.sort((a, b) => a.position - b.position);
	return finishGrading(exercise, per_blank, score, per_cat);
}

function finishGrading(exercise, per_blank, score, per_cat) {
	const total = per_blank.length;
	const ratio = total > 0 ? score / total : 0;
	return {
		score,
		score_total: total,
		per_blank,
		per_rule_breakdown: { [exercise.rule]: { ok: score, total } },
		per_group_breakdown: Object.keys(per_cat).length > 1 ? per_cat : {},
		suggested_next_rule_id: ratio < 0.8 ? exercise.rule : null
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Génération (retries)
// ────────────────────────────────────────────────────────────────────────────

function generate(cfg, rule, req, logger) {
	const isSpan = rule.rule_type === 'span';
	if (!isSpan && req.num_blanks > 15) {
		const e = new Error('Pour la ponctuation, 15 phrases maximum.');
		e.invalid = true;
		e.userMessage = e.message;
		throw e;
	}
	let lastError = '';
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			if (isSpan) {
				const v = validateSpan(callSpan(cfg, rule, req, attempt), req.num_blanks);
				if (!v.error) {
					return {
						text: "Clique sur tous les mots qui forment le groupe nominal sujet de chaque phrase.",
						blanks: v.blanks
					};
				}
				lastError = v.error;
			} else {
				const v = validatePunctuation(callPunctuation(cfg, rule, req, attempt), req.num_blanks);
				if (!v.error) return { text: v.text, blanks: v.blanks, extra: v.extra };
				lastError = v.error;
			}
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

module.exports = {
	SPAN_KINDS,
	spanTokens,
	buildSpanItem,
	normalizeIndices,
	validateSpan,
	gradeSpan,
	parsePunctuation,
	validatePunctuation,
	gradePunctuation,
	generate
};
