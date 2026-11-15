// Générateurs et correction des types d'exercices « qcm » et « free_text ».
// (Le type historique « multiple_choice » reste dans lib/gram.js.)
//
// Principe : dès que c'est possible, la bonne réponse est calculée par le
// serveur (conjugueur, liste de verbes, contrôles) et pas laissée au LLM.

const g = require(`${__hooks}/lib/gram.js`);
const conj = require(`${__hooks}/lib/conjugaison.js`);

// ────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ────────────────────────────────────────────────────────────────────────────

function shuffle(arr) {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const t = a[i];
		a[i] = a[j];
		a[j] = t;
	}
	return a;
}

/** Tire n éléments : sans répétition tant que possible, puis on recommence. */
function drawN(pool, n) {
	const out = [];
	let bag = [];
	while (out.length < n) {
		if (bag.length === 0) bag = shuffle(pool);
		out.push(bag.pop());
	}
	return out;
}

/** Répartit n tirages selon des poids { clé: poids } (arrondi, total exact). */
function spread(n, weights) {
	const keys = Object.keys(weights);
	const total = keys.reduce((s, k) => s + weights[k], 0);
	const counts = {};
	let used = 0;
	for (const k of keys) {
		counts[k] = Math.floor((n * weights[k]) / total);
		used += counts[k];
	}
	const order = shuffle(keys);
	for (let i = 0; used < n; i++, used++) counts[order[i % order.length]]++;
	return counts;
}

/**
 * Tire n verbes d'un réservoir { difficulté: [verbes] } selon le palier du
 * niveau scolaire (mélange de difficultés défini dans conj.TIER_MIX).
 */
function drawLeveled(poolByDiff, n, tier) {
	const mix = conj.TIER_MIX[tier] || conj.TIER_MIX[2];
	const weights = {};
	for (const d of Object.keys(mix)) if (poolByDiff[d] && poolByDiff[d].length) weights[d] = mix[d];
	if (!Object.keys(weights).length) weights[Object.keys(poolByDiff)[0]] = 1;
	const counts = spread(n, weights);
	let out = [];
	for (const d of Object.keys(counts)) out = out.concat(drawN(poolByDiff[d], counts[d]));
	return out;
}

function config(rule) {
	return rule.config && typeof rule.config === 'object' ? rule.config : {};
}

/** Contenu entre [[ ]] (une seule fois), ou null. */
function highlighted(prompt) {
	const m = String(prompt).match(/\[\[([^\]]+)\]\]/g);
	if (!m || m.length !== 1) return null;
	return m[0].slice(2, -2).trim();
}

function stripMarkers(s) {
	return String(s).replace(/\[\[|\]\]/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// QCM « Groupe d'un verbe » — sans LLM
// ────────────────────────────────────────────────────────────────────────────

const GROUP_LABELS = { 1: '1er groupe', 2: '2e groupe', 3: '3e groupe' };

function groupExplanation(verb, group) {
	if (group === 1) return `« ${verb} » se termine par -er : 1er groupe.`;
	const refl = /^(s'|se )/.test(verb) ? 'nous ' : '';
	const nous = conj.conjugatePerson(verb, '1p');
	if (group === 2) return `« ${verb} » se termine par -ir et fait « nous ${refl}${nous[0]} » : 2e groupe.`;
	if (verb === 'aller') return '« aller » se termine par -er, mais c\'est l\'exception : 3e groupe.';
	if (verb.endsWith('ir') && !verb.endsWith('oir')) {
		return `« ${verb} » se termine par -ir mais fait « nous ${refl}${nous[0]} » (pas de -issons) : 3e groupe.`;
	}
	const ending = verb.endsWith('oir') ? '-oir' : verb.endsWith('re') ? '-re' : `-${verb.slice(-2)}`;
	return `« ${verb} » se termine par ${ending} : 3e groupe.`;
}

const SUBJECTS = { '1s': ['je'], '2s': ['tu'], '3s': ['il', 'elle', 'on'], '1p': ['nous'], '2p': ['vous'], '3p': ['ils', 'elles'] };
const REFLEXIVE = { '1s': 'me', '2s': 'te', '3s': 'se', '1p': 'nous', '2p': 'vous', '3p': 'se' };
const startsWithVowel = (w) => /^[aeiouyéèêëàâîïôûœ]/i.test(w);

function pickOne(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

/** « je » + « me/te/se » élidés devant une voyelle (pas devant h : haïr, h aspiré). */
function joinElided(word, next) {
	return (word === 'je' || word === 'me' || word === 'te' || word === 'se') && startsWithVowel(next)
		? `${word.slice(0, -1)}'`
		: `${word} `;
}

/**
 * Phrase sans IA : sujet + [[forme conjuguée]] + complément écrit à la main
 * (conj.GROUP_SENTENCES). Retourne { sentence, form } ou null.
 */
function buildGroupSentence(verb, person) {
	const entry = conj.GROUP_SENTENCES[verb];
	if (!entry) return null;
	const comp = typeof entry === 'string' ? entry : entry.c;
	const forms = conj.conjugatePerson(verb, person);
	if (!forms) return null;
	const form = forms[0];
	// Verbes à sujet inanimé (mûrir, fleurir…) : « il / elle », pas « on ».
	const restricted = typeof entry === 'object' && Array.isArray(entry.p);
	const subject = pickOne(SUBJECTS[person].filter((x) => !(restricted && x === 'on')));
	let s = '';
	if (/^(s'|se )/.test(verb)) {
		// « je m'assieds », « il s'évanouit », « nous nous asseyons »
		const refl = REFLEXIVE[person];
		s = joinElided(subject, refl) + joinElided(refl, form);
	} else {
		s = joinElided(subject, form);
	}
	const sentence = `${s}[[${form}]] ${comp}.`;
	return { sentence: sentence.charAt(0).toUpperCase() + sentence.slice(1), form };
}

function allowedPersons(verb) {
	const entry = conj.GROUP_SENTENCES[verb];
	return entry && typeof entry === 'object' && Array.isArray(entry.p) ? entry.p : conj.PERSONS;
}

function generateVerbGroups(numItems, grade) {
	const pools = conj.POOLS.groups;
	const tier = conj.levelTier(grade);
	// À peu près un tiers par groupe ; difficulté des verbes selon le niveau.
	const counts = spread(numItems, { 1: 1, 2: 1, 3: 1 });
	let verbs = [];
	for (const k of Object.keys(counts)) {
		verbs = verbs.concat(drawLeveled(pools[k], counts[k], tier).map((v) => ({ verb: v, group: Number(k) })));
	}
	// « aller » est LE piège (dès le CE2) : on le met souvent s'il y a de la place.
	if (numItems >= 6 && !verbs.some((v) => v.verb === 'aller') && Math.random() < 0.6) {
		const i = verbs.findIndex((v) => v.group === 3);
		if (i >= 0) verbs[i] = { verb: 'aller', group: 3 };
	}
	verbs = shuffle(verbs);

	// À partir du CM2 : une partie des verbes est conjuguée dans une phrase,
	// l'élève doit d'abord retrouver l'infinitif.
	const nConj = Math.round(numItems * conj.conjugatedShare(grade));
	const conjIdx = new Set(shuffle(verbs.map((_, i) => i)).slice(0, nConj));

	const blanks = verbs.map((v, i) => {
		const base = {
			position: i + 1,
			prompt: v.verb,
			correct: GROUP_LABELS[v.group],
			explanation: groupExplanation(v.verb, v.group),
			category: GROUP_LABELS[v.group]
		};
		if (!conjIdx.has(i)) return base;
		const built = buildGroupSentence(v.verb, pickOne(allowedPersons(v.verb)));
		if (!built) return base;
		return {
			...base,
			prompt: built.sentence,
			verb: v.verb,
			explanation: `« ${built.form} » vient du verbe « ${v.verb} ». ${base.explanation}`
		};
	});

	return {
		text:
			nConj > 0
				? "Pour chaque verbe, indique son groupe. Quand le verbe est conjugué dans une phrase, retrouve d'abord son infinitif."
				: 'Pour chaque verbe, indique son groupe.',
		theme: 'Liste de verbes',
		llm_model: 'aucun (liste de verbes)',
		blanks
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Contrôles déterministes des réponses du LLM
// ────────────────────────────────────────────────────────────────────────────

const VENIR_FORMS = new Set(['viens', 'vient', 'venons', 'venez', 'viennent']);
const ALLER_FORMS = new Set(['vais', 'vas', 'va', 'allons', 'allez', 'vont']);
const CLITICS = new Set(['me', 'm', 'te', 't', 'se', 's', 'le', 'la', 'l', 'les', 'lui', 'leur', 'y', 'en', 'nous', 'vous']);
const NEGATIONS = new Set(['ne', 'n', 'pas', 'plus', 'jamais', 'rien', 'point']);

function isInfinitive(w) {
	return !!w && w.length > 2 && /(er|ir|re|oir)$/.test(w);
}

/** Classe le groupe verbal surligné : 'passé proche' | 'futur proche' | 'présent'. */
function classifyProche(segment) {
	const toks = String(segment)
		.toLowerCase()
		.replace(/[’']/g, "' ")
		.replace(/[.,;:!?«»"]/g, ' ')
		.split(/\s+/)
		.map((t) => t.replace(/'$/, ''))
		.filter(Boolean);
	const i = toks.findIndex((t) => VENIR_FORMS.has(t) || ALLER_FORMS.has(t));
	if (i < 0) return 'présent';
	let j = i + 1;
	while (j < toks.length && NEGATIONS.has(toks[j])) j++;
	if (VENIR_FORMS.has(toks[i])) {
		if (toks[j] !== 'de' && toks[j] !== 'd') return 'présent';
		j++;
	}
	while (j < toks.length && CLITICS.has(toks[j])) j++;
	if (!isInfinitive(toks[j])) return 'présent';
	return VENIR_FORMS.has(toks[i]) ? 'passé proche' : 'futur proche';
}

/** Vérifie la cohérence pronom ↔ GNS surligné ; retourne un message ou null. */
function checkPronoun(gns, answer) {
	const raw = String(gns).trim();
	const s = raw.toLowerCase().replace(/[’]/g, "'");
	if (/\bmoi\b/.test(s)) return answer === 'nous' ? null : `« ${raw} » contient « moi » : il faut « nous ».`;
	if (/\btoi\b/.test(s)) return answer === 'vous' ? null : `« ${raw} » contient « toi » : il faut « vous ».`;
	if (answer === 'nous' || answer === 'vous') return `« ${answer} » sans « moi » / « toi » dans le sujet « ${raw} ».`;
	if (/^(je|tu|il|elle|on|nous|vous|ils|elles)\b/.test(s)) return `Le sujet « ${raw} » est déjà un pronom.`;

	const plural =
		/\set\s/.test(s) ||
		/^(les|des|mes|tes|ses|nos|vos|leurs|ces|plusieurs|quelques|certains|certaines|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|cent|mille|beaucoup|tous|toutes)\b/.test(s);
	const singular = /^(le|la|l'|un|une|mon|ma|ton|ta|son|sa|notre|votre|leur|ce|cet|cette|chaque)\b/.test(s);
	if (plural && (answer === 'il' || answer === 'elle')) return `« ${raw} » est au pluriel.`;
	if (singular && !plural && (answer === 'ils' || answer === 'elles')) return `« ${raw} » est au singulier.`;
	if (!plural) {
		if (/^(la|une|ma|ta|sa|cette)\s/.test(s) && answer !== 'elle') return `« ${raw} » est féminin singulier.`;
		if (/^(le|un|ce|cet)\s/.test(s) && answer !== 'il') return `« ${raw} » est masculin singulier.`;
	}
	return null;
}

// ────────────────────────────────────────────────────────────────────────────
// QCM écrit par le LLM (passé/futur proche, pronoms…)
// ────────────────────────────────────────────────────────────────────────────

function formatQcmExamples(rule) {
	const ex = Array.isArray(rule.examples) ? rule.examples : [];
	if (!ex.length) return '';
	return (
		'\nEXEMPLES (format attendu) :\n' +
		ex
			.map((e) => `- "${e.sentence}" → ${e.answer}${e.rationale ? ` (${e.rationale})` : ''}`)
			.join('\n')
	);
}

function callQcm(cfg, rule, req, attemptIdx) {
	const c = config(rule);
	const highlightRule = c.highlight
		? c.check === 'proche'
			? "- Dans chaque phrase, mets entre [[ ]] le verbe conjugué ET, s'il y en a un, l'infinitif qui le suit : « Il [[va partir]] », « Elle [[vient d'arriver]] », « Je [[vais]] à la piscine ». Un seul [[ ]] par phrase, et un seul verbe conjugué dans la phrase."
			: '- Dans chaque phrase, mets entre [[ ]] le groupe nominal sujet COMPLET (déterminant, nom, adjectifs, compléments du nom) : « [[Le chien de mes voisins]] aboie ». Un seul [[ ]] par phrase. Le sujet ne doit jamais être déjà un pronom.'
		: '';
	const specific =
		c.check === 'proche'
			? `- Environ un tiers de phrases par réponse. Les phrases au « présent » doivent être des PIÈGES : « aller » ou « venir de » suivis d'un lieu ou d'un nom (« Il va au marché », « Elle vient de Lyon »), ou un verbe au présent simple.
- La réponse « passé proche » ou « futur proche » doit correspondre exactement à « venir de + infinitif » ou « aller + infinitif ».`
			: c.check === 'pronom'
				? `- Varie les sujets : masculin / féminin, singulier / pluriel, sujets composés (« Léa et Tom », « mes cousins et ma tante » → ils), quelques sujets avec « moi » (→ nous) ou « toi » (→ vous), noms propres, compléments du nom (« le chat des voisins » → il).
- Accorde bien le verbe de la phrase avec le sujet.`
				: '';
	const retryHint =
		attemptIdx > 0
			? "\n\n⚠️ Ta tentative précédente était invalide (mauvais nombre de phrases, réponse hors liste, [[ ]] manquant ou réponse incohérente avec la phrase). Vérifie chaque phrase avant de répondre."
			: '';

	const userPrompt = `NOTION : ${rule.display_name}
EXPLICATION : ${rule.short_description}
RÉPONSES POSSIBLES : ${JSON.stringify(rule.candidates)}
${formatQcmExamples(rule)}

Écris exactement ${req.num_blanks} phrases courtes et variées, adaptées à un élève de niveau ${req.grade_level}, en lien avec le thème « ${req.theme} ». Pour chacune, donne la bonne réponse (exactement une des réponses possibles) et une explication très courte (une phrase, ton bienveillant, qui donne le « truc » pour trouver).

CONTRAINTES :
${highlightRule}
${specific}
- Pas deux fois la même phrase. Pas de phrase ambiguë : une seule bonne réponse possible.${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_items.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_items',
				description: 'Soumet les questions du QCM.',
				parameters: {
					type: 'object',
					required: ['items'],
					properties: {
						items: {
							type: 'array',
							items: {
								type: 'object',
								required: ['prompt', 'correct', 'explanation'],
								properties: {
									prompt: { type: 'string', description: 'La phrase, avec [[ ]] si demandé' },
									correct: { type: 'string', enum: rule.candidates },
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
					content: `Tu es un professeur des écoles expérimenté qui prépare des exercices de grammaire et de conjugaison pour des élèves de niveau ${req.grade_level}. Tes phrases sont naturelles, correctes, et chaque question n'a qu'une seule bonne réponse.`
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

function validateQcm(out, rule, numItems) {
	const fail = (error) => ({ error });
	const c = config(rule);
	if (!out || !Array.isArray(out.items)) return fail('Liste de questions manquante.');
	if (out.items.length !== numItems) return fail(`Nombre de questions : attendu ${numItems}, reçu ${out.items.length}.`);
	const byNorm = new Map(rule.candidates.map((x) => [g.normalizeWord(x), x]));
	const seen = new Set();
	const counts = {};
	const blanks = [];
	for (let i = 0; i < out.items.length; i++) {
		const it = out.items[i] || {};
		const prompt = String(it.prompt || '').trim();
		if (prompt.length < 3 || prompt.length > 300) return fail(`Question ${i + 1} vide ou trop longue.`);
		const key = g.normalizeWord(stripMarkers(prompt));
		if (seen.has(key)) return fail(`Question en double : « ${prompt} ».`);
		seen.add(key);
		const correct = byNorm.get(g.normalizeWord(it.correct));
		if (!correct) return fail(`Réponse hors liste : « ${it.correct} ».`);
		let seg = null;
		if (c.highlight) {
			seg = highlighted(prompt);
			if (!seg) return fail(`Question ${i + 1} : il faut exactement un passage entre [[ ]].`);
		}
		if (c.check === 'proche') {
			const expected = classifyProche(seg || prompt);
			if (expected !== correct) {
				return fail(`« ${stripMarkers(prompt)} » : réponse « ${correct} » alors que la phrase est au ${expected}.`);
			}
		}
		if (c.check === 'pronom') {
			const err = checkPronoun(seg || '', correct);
			if (err) return fail(`« ${stripMarkers(prompt)} » : ${err}`);
		}
		counts[correct] = (counts[correct] || 0) + 1;
		blanks.push({
			position: i + 1,
			prompt,
			correct,
			explanation: String(it.explanation || '').trim().slice(0, 300),
			category: correct
		});
	}
	if (c.balance && numItems >= rule.candidates.length * 2) {
		const absent = rule.candidates.filter((x) => !counts[x]);
		if (absent.length) return fail(`Aucune question pour : ${absent.join(', ')}.`);
	}
	// Le LLM rend souvent les questions groupées par réponse (toutes les
	// « passé proche », puis toutes les « futur proche »…) : on mélange.
	return { blanks: shuffle(blanks).map((b, i) => Object.assign(b, { position: i + 1 })) };
}

function qcmConsigne(rule) {
	const c = config(rule);
	if (c.check === 'proche') {
		return 'Pour chaque phrase, indique si le verbe en surbrillance est au passé proche, au futur proche ou simplement au présent.';
	}
	if (c.check === 'pronom') return 'Par quel pronom peut-on remplacer le groupe nominal sujet en surbrillance ?';
	return 'Choisis la bonne réponse pour chaque phrase.';
}

// ────────────────────────────────────────────────────────────────────────────
// Texte à trous « au clavier » : conjugaison au présent
// ────────────────────────────────────────────────────────────────────────────

const SUBJECT_PRONOUNS = { je: '1s', j: '1s', tu: '2s', il: '3s', elle: '3s', on: '3s', nous: '1p', vous: '2p', ils: '3p', elles: '3p' };
const OBJECT_CLITICS = new Set(['ne', 'n', 'me', 'm', 'te', 't', 'se', 's', 'le', 'la', 'l', 'les', 'lui', 'leur', 'y', 'en']);

/**
 * Personne déduite du pronom sujet collé au trou (« nous {{3}} », « j'{{2}} »,
 * « {{4}}-tu »), ou null si le sujet est un groupe nominal / indéterminé.
 */
function personFromContext(before, after, declaredSubject) {
	const inv = String(after).match(/^-(?:t-)?(je|tu|il|elle|on|nous|vous|ils|elles)\b/i);
	if (inv) return SUBJECT_PRONOUNS[inv[1].toLowerCase()];
	const toks = String(before)
		.toLowerCase()
		.replace(/[’]/g, "'")
		.replace(/([.;:!?«»"—()\n])/g, ' . ')
		.replace(/,/g, ' , ')
		.split(/[\s']+/)
		.filter(Boolean);
	let i = toks.length - 1;
	while (i >= 0 && OBJECT_CLITICS.has(toks[i])) i--;
	if (i < 0) return null;
	const t = toks[i];
	if (t === 'nous' || t === 'vous') {
		let j = i - 1;
		while (j >= 0 && OBJECT_CLITICS.has(toks[j])) j--;
		const prev = toks[j];
		if (prev === t) return SUBJECT_PRONOUNS[t]; // « nous nous levons »
		if (prev && SUBJECT_PRONOUNS[prev] && prev !== 'nous' && prev !== 'vous') return SUBJECT_PRONOUNS[prev]; // « il nous voit »
		if (prev === undefined || prev === '.') return SUBJECT_PRONOUNS[t]; // début de phrase
		if (prev === ',') {
			// Ambigu : « Soudain, nous partons » (sujet, cas le plus courant) ou
			// « Le forgeron, ravi, nous donne… » (complément). Si le sujet déclaré
			// pour ce trou est clairement autre chose, on ne conclut pas.
			const d = String(declaredSubject || '').trim().toLowerCase();
			const self = t === 'nous' ? /\b(nous|moi)\b/ : /\b(vous|toi)\b/;
			return d && !self.test(d) ? null : SUBJECT_PRONOUNS[t];
		}
		return null; // « Les enfants nous regardent » : indéterminé
	}
	return SUBJECT_PRONOUNS[t] || null;
}

function eterElerCategory(verb, person) {
	if (person === '1p' || person === '2p') return 'nous / vous : pas de changement';
	return conj.GRAVE_ONLY.includes(verb) ? 'accent grave (acheter, geler…)' : 'consonne doublée (appeler, jeter…)';
}

function presentCategory(verb) {
	const grp = conj.verbGroup(verb);
	return grp === 0 ? 'être / avoir' : GROUP_LABELS[grp];
}

/** Verbes + personnes imposés par le serveur pour chaque trou (selon le niveau). */
function pickConjAssignments(rule, n, grade) {
	const c = config(rule);
	const tier = conj.levelTier(grade);
	const persons = (weights) => {
		const counts = spread(n, weights);
		let list = [];
		for (const p of Object.keys(counts)) for (let k = 0; k < counts[p]; k++) list.push(p);
		return shuffle(list);
	};
	// Conjugaison : chaque personne au moins une fois (dès 6 trous), le reste
	// réparti selon les poids. En dessous de 6 trous : personnes toutes différentes.
	const coveringPersons = (weights) => {
		if (n >= conj.PERSONS.length) {
			const rest = spread(n - conj.PERSONS.length, weights);
			let list = conj.PERSONS.slice();
			for (const p of Object.keys(rest)) for (let k = 0; k < rest[p]; k++) list.push(p);
			return shuffle(list);
		}
		// Tirage pondéré sans remise.
		const pool = Object.keys(weights).flatMap((p) => Array(weights[p]).fill(p));
		const out = [];
		for (const p of shuffle(pool)) if (!out.includes(p) && out.length < n) out.push(p);
		return shuffle(out);
	};

	if (c.pool === 'eter_eler') {
		const pool = conj.POOLS.eter_eler;
		const half = Math.ceil(n / 2);
		const verbs = shuffle(drawLeveled(pool.double, half, tier).concat(drawLeveled(pool.grave, n - half, tier)));
		// Surtout des personnes où le verbe change (e muet), quelques nous/vous en piège.
		const ps = coveringPersons({ '1s': 2, '2s': 2, '3s': 3, '3p': 3, '1p': 1, '2p': 1 });
		return verbs.map((verb, i) => ({ verb, person: ps[i], category: eterElerCategory(verb, ps[i]) }));
	}

	const poolName = c.pool === 'accord' ? 'accord' : 'present';
	const pool = conj.POOLS[poolName];
	const counts = spread(n, { 1: 4, 2: 2, 3: 4 });
	let verbs = [];
	for (const k of Object.keys(counts)) verbs = verbs.concat(drawLeveled(pool[k], counts[k], tier));
	verbs = shuffle(verbs);

	if (poolName === 'accord') {
		// Petits niveaux : seulement singulier / pluriel à la 3e personne.
		const ps = persons(tier === 1 ? { '3s': 1, '3p': 1 } : { '3s': 9, '3p': 9, '1p': 1, '2p': 1 });
		return verbs.map((verb, i) => ({
			verb,
			person: ps[i],
			category: ps[i] === '3s' ? 'sujet au singulier' : 'sujet au pluriel'
		}));
	}
	const ps = coveringPersons({ '1s': 1, '2s': 1, '3s': 1, '1p': 1, '2p': 1, '3p': 1 });
	return verbs.map((verb, i) => ({ verb, person: ps[i], category: presentCategory(verb) }));
}

// Pièges d'accord demandés au LLM, selon le palier du niveau.
const ACCORD_FOCUS = {
	1: `\nOBJECTIF : travailler l'ACCORD SUJET-VERBE, niveau débutant. Sujets SIMPLES : un groupe nominal court (« le chat », « les enfants », « ma sœur ») ou deux prénoms (« Léa et Tom »), placé JUSTE AVANT le verbe. Pas de sujet inversé, pas de pronom complément entre le sujet et le verbe.`,
	2: `\nOBJECTIF : travailler l'ACCORD SUJET-VERBE. Pour les sujets au singulier ou au pluriel, utilise surtout des GROUPES NOMINAUX (pas des pronoms) et varie les pièges :
- sujet éloigné du verbe (« Les enfants de la classe de CM2 {{1}} … ») ;
- nom complément au nombre différent du sujet (« Le chien des voisins {{2}} … ») ;
- sujet composé (« Léa et Tom {{3}} … ») ;
- pronom complément entre le sujet et le verbe (« Les oiseaux les {{4}} … »).`,
	3: `\nOBJECTIF : travailler l'ACCORD SUJET-VERBE, niveau avancé. Utilise surtout des GROUPES NOMINAUX et multiplie les pièges :
- sujet éloigné du verbe, avec une proposition intercalée (« Les élèves, que la directrice félicite chaque année, {{1}} … ») ;
- nom complément au nombre différent du sujet (« Le bruit des vagues {{2}} … ») ;
- sujet inversé (« Dans la cour {{3}} les élèves. ») ;
- sujet composé, y compris de personnes différentes (« Toi et moi {{4}} … » → nous) ;
- pronom relatif sujet (« les fleurs qui {{5}} … ») ;
- pronom complément entre le sujet et le verbe (« Les oiseaux les {{6}} … »).`
};

const PERSON_HINT = {
	'1s': '1re personne du singulier (je / j\')',
	'2s': '2e personne du singulier (tu)',
	'3s': '3e personne du singulier (il, elle, on, ou un nom au singulier)',
	'1p': '1re personne du pluriel (nous, ou un sujet comme « Léa et moi »)',
	'2p': '2e personne du pluriel (vous, ou un sujet comme « toi et ton frère »)',
	'3p': '3e personne du pluriel (ils, elles, ou un nom au pluriel)'
};

function callConj(cfg, rule, req, assignments, attemptIdx) {
	const c = config(rule);
	const n = assignments.length;
	// Assez de place pour une vraie histoire : environ un trou pour 20 mots.
	const textLength = Math.min(80 + n * 18, 520);
	// Lot imposé, mais l'ordre est libre : le LLM place chaque verbe là où il
	// sert le récit (un ordre imposé donnait une suite de phrases sans lien).
	const list = assignments.map((a) => `- « ${a.verb} », ${PERSON_HINT[a.person]}`).join('\n');
	const focus = c.focus === 'accord' ? ACCORD_FOCUS[conj.levelTier(req.grade_level)] || ACCORD_FOCUS[2] : '';
	// Conjugaison (pas l'accord, qui travaille justement les groupes nominaux) :
	// on veut voir tous les pronoms personnels, sans sacrifier la cohérence.
	const pronounRule =
		c.focus === 'accord'
			? ''
			: "\n- PRONOMS : pour chaque personne présente dans la liste, essaie d'utiliser AU MOINS UNE FOIS le pronom sujet lui-même (je / j', tu, il ou elle ou on, nous, vous, ils ou elles) plutôt qu'un groupe nominal ; un dialogue entre les personnages aide pour « tu » et « vous ». Si ça rend l'histoire bancale, tu peux mettre un groupe nominal à la place (« les chiens » pour ils) : la cohérence du récit passe avant.";
	const retryHint =
		attemptIdx > 0
			? "\n\n⚠️ Ta tentative précédente était invalide : vérifie que chaque marqueur est présent une seule fois, que chaque couple verbe + personne imposé est utilisé exactement une fois, que le sujet est bien à la bonne personne, et qu'il n'y a pas d'infinitif entre parenthèses."
			: '';

	const userPrompt = `NOTION : ${rule.display_name}
EXPLICATION : ${rule.short_description}

Écris un texte narratif d'environ ${textLength} mots, AU PRÉSENT, sur le thème « ${req.theme} », pour un élève de niveau ${req.grade_level}.
Il contient exactement ${n} trous. Chaque trou remplace un verbe conjugué au présent de l'indicatif. Voici les ${n} couples verbe + personne IMPOSÉS, chacun à utiliser exactement une fois, DANS L'ORDRE QUE TU VEUX :
${list}
${focus}

MÉTHODE (le plus important) :
1. Imagine d'abord une VRAIE HISTOIRE : quelques personnages qui reviennent, un fil (début, péripétie, fin), un seul narrateur, des lieux cohérents entre eux. Chaque phrase doit découler de la précédente.
2. Place ensuite chaque verbe imposé à l'endroit où il sert ce récit. Tu peux réordonner librement la liste.
3. Au plus UN trou par phrase, et garde des phrases sans trou pour que le récit respire : ce n'est pas une liste de phrases d'exemple.
4. Tout pronom complément (le, la, l', les, lui, leur, en, y) doit renvoyer à quelqu'un ou quelque chose de clairement nommé juste avant.
5. Relis-toi : si une phrase n'a de sens que pour placer un piège, ou contredit le reste de l'histoire, réécris-la.

RÈGLES DE FORME (très important) :
- Le marqueur \`{{N}}\` remplace UNIQUEMENT la forme conjuguée du verbe (un seul mot) : le sujet, « ne », le pronom réfléchi (« nous nous {{2}} ») et les pronoms compléments restent écrits dans le texte.
- N'écris jamais l'infinitif ni d'indice à côté du marqueur (pas de « {{1}} (jeter) ») : l'affichage l'ajoute.
- Si le sujet est « je » et que le verbe commence par une voyelle ou un h muet, écris « j'{{N}} » (apostrophe collée au marqueur).
- Le sujet de chaque trou doit être clairement à la personne demandée.${pronounRule}
- Numérote les marqueurs {{1}}, {{2}}, … dans l'ordre d'apparition dans le texte.
- Pour chaque trou, indique le verbe (à l'infinitif, sans « se »), la personne (1s, 2s, 3s, 1p, 2p, 3p) et le sujet tel qu'il est écrit dans le texte.${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_text.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_text',
				description: 'Soumet le texte à trous.',
				parameters: {
					type: 'object',
					required: ['text', 'blanks'],
					properties: {
						text: { type: 'string', description: `Texte avec marqueurs {{1}} … {{${n}}}` },
						blanks: {
							type: 'array',
							items: {
								type: 'object',
								required: ['position', 'verb', 'person', 'subject'],
								properties: {
									position: { type: 'integer', minimum: 1, maximum: n },
									verb: { type: 'string' },
									person: { type: 'string', enum: conj.PERSONS },
									subject: { type: 'string' }
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
					content: `Tu es un professeur des écoles expérimenté qui écrit des textes à trous de conjugaison pour des élèves de niveau ${req.grade_level}. Tu respectes scrupuleusement les verbes et personnes imposés.`
				},
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_text' } },
			temperature: 0.7,
			max_tokens: 2500
		},
		cfg.timeoutGenerate
	);
	return g.parseToolCall(json);
}

function validateConj(out, assignments) {
	const fail = (error) => ({ error });
	const n = assignments.length;
	if (!out || typeof out.text !== 'string' || !out.text.trim()) return fail('Texte manquant.');
	if (!Array.isArray(out.blanks) || out.blanks.length !== n) {
		return fail(`Nombre de trous : attendu ${n}, reçu ${Array.isArray(out.blanks) ? out.blanks.length : 0}.`);
	}
	let text = out.text;
	if (/\{\{\d+\}\}\s*\(/.test(text)) return fail("Indice entre parenthèses collé à un marqueur.");
	const blanks = [];
	const remaining = assignments.slice();
	for (let pos = 1; pos <= n; pos++) {
		const marker = `{{${pos}}}`;
		const idx = text.indexOf(marker);
		if (idx < 0 || text.indexOf(marker, idx + 1) >= 0) return fail(`Le marqueur ${marker} doit apparaître une seule fois.`);
		const b = out.blanks.find((x) => x && x.position === pos);
		if (!b) return fail(`Trou ${pos} non décrit.`);
		const verb = g.normalizeWord(b.verb).replace(/^(se |s')/, '');
		// Ordre libre : chaque trou consomme un couple verbe + personne du lot imposé.
		const k = remaining.findIndex((x) => x.verb === verb && x.person === b.person);
		if (k < 0) return fail(`Trou ${pos} : « ${b.verb} » (${b.person}) ne fait pas partie des verbes imposés restants.`);
		const a = remaining.splice(k, 1)[0];
		const ctx = personFromContext(text.slice(0, idx), text.slice(idx + marker.length), b.subject);
		if (ctx && ctx !== a.person) {
			return fail(`Trou ${pos} : le pronom sujet du texte correspond à ${ctx}, pas à ${a.person}.`);
		}
		const accepted = conj.conjugatePerson(a.verb, a.person);
		if (!accepted) return fail(`Verbe inconnu du conjugueur : ${a.verb}.`);
		// Élision oubliée devant une forme qui commence par une voyelle (« le {{3}} »
		// pour « appellent ») : on répare (« l'{{3}} ») plutôt que de tout regénérer.
		const unelided = text.slice(0, idx).match(/(^|[\s«"(])(je|me|te|se|le|la|ne)(\s+)$/i);
		if (unelided && /^[aeiouyàâéèêëîïôû]/i.test(accepted[0])) {
			const start = idx - unelided[2].length - unelided[3].length;
			text = text.slice(0, start) + unelided[2].slice(0, -1) + "'" + text.slice(idx);
		}
		blanks.push({
			position: pos,
			verb: a.verb,
			person: a.person,
			subject: String(b.subject || '').trim().slice(0, 80),
			accepted,
			correct: accepted[0],
			category: a.category
		});
	}
	// Pas de marqueur en trop.
	const extra = (text.match(/\{\{(\d+)\}\}/g) || []).map((m) => Number(m.slice(2, -2))).filter((p) => p < 1 || p > n);
	if (extra.length) return fail(`Marqueurs en trop : ${extra.join(', ')}.`);
	return { blanks, text };
}

// ────────────────────────────────────────────────────────────────────────────
// Point d'entrée : génération selon le type de règle
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retourne { text, blanks, theme?, llm_model? } ou lève une erreur
 * (err.providerStatus si le provider LLM a répondu en erreur, err.invalid
 * si le LLM n'a pas produit d'exercice valide après les retries).
 */
function generate(cfg, rule, req, logger) {
	const c = config(rule);
	if (c.generator === 'verb_groups') return generateVerbGroups(req.num_blanks, req.grade_level);

	const MAX_ATTEMPTS = 3;
	let lastError = '';
	const assignments = c.generator === 'conj_present' ? pickConjAssignments(rule, req.num_blanks, req.grade_level) : null;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		try {
			if (c.generator === 'conj_present') {
				const out = callConj(cfg, rule, req, assignments, attempt);
				const v = validateConj(out, assignments);
				if (!v.error) return { text: v.text, blanks: v.blanks };
				lastError = v.error;
			} else {
				const out = callQcm(cfg, rule, req, attempt);
				const v = validateQcm(out, rule, req.num_blanks);
				if (!v.error) return { text: qcmConsigne(rule), blanks: v.blanks };
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

// ────────────────────────────────────────────────────────────────────────────
// Correction
// ────────────────────────────────────────────────────────────────────────────

/**
 * Explication d'une erreur au clavier, calculée par le conjugueur :
 * - forme correcte mais d'une autre personne → erreur d'accord avec le sujet ;
 * - sinon → la règle d'orthographe qui s'applique (ou le tableau du verbe).
 */
function explainTypedError(b, given) {
	const persons = given ? conj.personsOfForm(b.verb, given, normalizeTyped) : [];
	if (persons.length && !persons.includes(b.person)) {
		const as = persons.map((p) => `« ${conj.PERSON_SHORT[p]} »`).join(' ou ');
		const subject = b.subject && !/^(je|j'|tu|il|elle|on|nous|vous|ils|elles)$/i.test(b.subject.trim())
			? `le sujet « ${b.subject} »`
			: 'le sujet';
		return `« ${given.trim()} » est la bonne forme pour ${as}. Ici, ${subject} est à la ${conj.PERSON_NAMES[b.person]} (${conj.PERSON_SHORT[b.person]}) : ${b.correct}.`;
	}
	return conj.explainForm(b.verb, b.person);
}

/** Normalisation d'une réponse tapée : casse, apostrophes, ponctuation finale. */
function normalizeTyped(s) {
	return g.normalizeWord(s).replace(/[.,;:!?]+$/, '').trim();
}

function grade(ruleType, exercise, responses) {
	const attempted = exercise.blanks.filter((b) =>
		Object.prototype.hasOwnProperty.call(responses, String(b.position))
	);
	const per_blank = [];
	const per_cat = {};
	let score = 0;
	for (const b of attempted) {
		const given = responses[String(b.position)] ?? null;
		let ok = false;
		let variant = false;
		let context = '';
		if (ruleType === 'free_text') {
			const accepted = Array.isArray(b.accepted) && b.accepted.length ? b.accepted : [b.correct];
			const k = given === null ? -1 : accepted.findIndex((a) => normalizeTyped(a) === normalizeTyped(given));
			ok = k >= 0;
			variant = k > 0;
			context = `« ${b.verb} » avec le sujet « ${b.subject || b.person} »`;
		} else {
			ok = given !== null && g.normalizeWord(given) === g.normalizeWord(b.correct);
			context = `« ${stripMarkers(b.prompt)} »`;
		}
		if (ok) score++;
		const entry = { position: b.position, given, correct: b.correct, ok, context };
		if (variant) entry.variant = true;
		if (b.explanation) entry.explanation = b.explanation;
		if (ruleType === 'free_text' && !ok && b.verb && b.person) {
			entry.explanation = explainTypedError(b, given);
		}
		per_blank.push(entry);
		if (b.category) {
			per_cat[b.category] = per_cat[b.category] || { ok: 0, total: 0 };
			per_cat[b.category].total++;
			if (ok) per_cat[b.category].ok++;
		}
	}
	const total = attempted.length;
	const ratio = total > 0 ? score / total : 0;
	return {
		score,
		score_total: total,
		per_blank,
		per_rule_breakdown: { [exercise.rule]: { ok: score, total } },
		// Détail par catégorie seulement s'il y en a plusieurs (sinon redondant).
		per_group_breakdown: Object.keys(per_cat).length > 1 ? per_cat : {},
		suggested_next_rule_id: ratio < 0.8 ? exercise.rule : null
	};
}

module.exports = {
	generate,
	grade,
	shuffle,
	// exportés pour les tests
	classifyProche,
	checkPronoun,
	personFromContext,
	pickConjAssignments,
	validateConj,
	validateQcm,
	generateVerbGroups,
	buildGroupSentence,
	explainTypedError
};
