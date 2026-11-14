// Helpers partagés par pb_hooks/gramgame.pb.js.
//
// ⚠️ Les handlers PocketBase tournent dans un pool de VMs JS isolées : ils ne
// voient PAS les variables de haut niveau du fichier .pb.js. Chaque handler
// doit donc faire `const g = require(`${__hooks}/lib/gram.js`)`.

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SYNTHETIC_EMAIL_DOMAIN = 'users.gramgame.invalid';
const OTP_MIN_INTERVAL_MS = 60 * 1000; // 1 code par minute et par compte

// ────────────────────────────────────────────────────────────────────────────
// Divers
// ────────────────────────────────────────────────────────────────────────────

function env(name, fallback) {
	const v = $os.getenv(name);
	return v === '' || v === undefined || v === null ? fallback : v;
}

function syntheticEmail(username) {
	return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

function maskEmail(email) {
	const at = email.lastIndexOf('@');
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
	return `${local[0]}${'*'.repeat(Math.min(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

// "2026-11-13 22:53:35.323Z" → ms epoch
function pbDateMs(str) {
	if (!str) return 0;
	return new Date(String(str).replace(' ', 'T')).getTime();
}

function isEditor(record) {
	if (!record) return false;
	const role = record.getString('role');
	return role === 'prof' || role === 'admin';
}

function findUserByUsername(app, username) {
	try {
		return app.findFirstRecordByData('users', 'username', username);
	} catch (_) {
		return null;
	}
}

function readJsonBody(e) {
	try {
		return e.requestInfo().body || {};
	} catch (_) {
		return {};
	}
}

// ────────────────────────────────────────────────────────────────────────────
// OTP
// ────────────────────────────────────────────────────────────────────────────

/**
 * Crée un OTP pour `user` et l'envoie par mail (le hook onMailerRecordOTPSend
 * redirige vers real_email). Retourne { otpId } ou { error, status }.
 *
 * `sentTo` = email synthétique du record : au 1er login réussi, PocketBase
 * passe alors automatiquement `verified` à true (compte "activé").
 */
function sendOtp(app, user) {
	const collection = user.collection();

	// Anti-spam : un code par minute et par compte.
	const existing = app.findAllOTPsByRecord(user) || [];
	for (const o of existing) {
		if (Date.now() - pbDateMs(o.getString('created')) < OTP_MIN_INTERVAL_MS) {
			return {
				status: 429,
				error: 'Un code vient déjà d\'être envoyé. Attends une minute avant d\'en redemander un.'
			};
		}
	}

	// Un seul code valide à la fois : les précédents sont invalidés.
	for (const o of existing) {
		try {
			app.delete(o);
		} catch (_) {}
	}

	const length = collection.otp.length || 6;
	const password = $security.randomStringWithAlphabet(length, '0123456789');

	const otp = new Record(app.findCollectionByNameOrId('_otps'));
	otp.set('collectionRef', collection.id);
	otp.set('recordRef', user.id);
	otp.set('sentTo', user.email());
	otp.set('password', password);
	app.save(otp);

	try {
		$mails.sendRecordOTP(app, user, otp.id, password);
	} catch (err) {
		try {
			app.delete(otp);
		} catch (_) {}
		app.logger().error('Envoi OTP échoué', 'error', String(err), 'user', user.getString('username'));
		return {
			status: 500,
			error: "L'envoi de l'e-mail a échoué. Réessaie dans un instant (ou préviens l'administrateur)."
		};
	}

	return { otpId: otp.id };
}

// ────────────────────────────────────────────────────────────────────────────
// Anti brute-force des codes (compteur en mémoire, remis à zéro au restart)
//
// PocketBase limite déjà nativement à 5 essais par compte et par 3 min
// (≈ 2400 essais/jour sur un compte ciblé). On ajoute un plafond de 10 échecs
// par compte et par heure glissante : au-delà, plus aucun code accepté pendant
// une heure (l'envoi reste possible). Compromis assumé : quelqu'un qui connaît
// un nom d'utilisateur peut bloquer ce compte 1 h (le natif : 3 min). PocketBase valide le code AVANT les hooks
// onRecordAuthWithOTPRequest : le comptage se fait dans un middleware sur la
// route auth-with-otp (pb_hooks/gramgame.pb.js).
// ────────────────────────────────────────────────────────────────────────────

const OTP_MAX_FAILS_PER_ACCOUNT = 10;
const OTP_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

function accountFails(app, userId) {
	const now = Date.now();
	return (app.store().get(`otpfail:${userId}`) || []).filter((t) => now - t < OTP_ACCOUNT_WINDOW_MS);
}

function isAccountLocked(app, userId) {
	return accountFails(app, userId).length >= OTP_MAX_FAILS_PER_ACCOUNT;
}

function recordOtpFailure(app, userId) {
	// setFunc : lecture-modification-écriture atomique (requêtes concurrentes).
	app.store().setFunc(`otpfail:${userId}`, (old) => {
		const now = Date.now();
		const list = (old || []).filter((t) => now - t < OTP_ACCOUNT_WINDOW_MS);
		list.push(now);
		return list;
	});
}

// ────────────────────────────────────────────────────────────────────────────
// LLM (API compatible OpenAI)
// ────────────────────────────────────────────────────────────────────────────

function llmConfig() {
	return {
		apiKey: env('LLM_API_KEY', ''),
		baseUrl: env('LLM_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, ''),
		model: env('LLM_MODEL', 'gemini-2.0-flash'),
		// Secondes. À relever pour un backend lent (ex. claude -p via claude-bridge).
		timeoutGenerate: parseInt(env('LLM_TIMEOUT_GENERATE', '90'), 10) || 90,
		timeoutAppreciation: parseInt(env('LLM_TIMEOUT_APPRECIATION', '45'), 10) || 45
	};
}

class ProviderError extends Error {
	constructor(message, status) {
		super(message);
		this.providerStatus = status;
	}
}

function chatCompletion(cfg, payload, timeoutSec) {
	const res = $http.send({
		url: `${cfg.baseUrl}/chat/completions`,
		method: 'POST',
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(Object.assign({ model: cfg.model }, payload)),
		timeout: timeoutSec
	});
	if (res.statusCode < 200 || res.statusCode >= 300) {
		const raw = toString(res.body).slice(0, 300);
		throw new ProviderError(`LLM HTTP ${res.statusCode} : ${raw}`, res.statusCode);
	}
	return res.json;
}

function validateGenerateRequest(b, opts) {
	const needTheme = !opts || opts.needTheme !== false;
	if (!b || typeof b !== 'object') return 'Corps de requête invalide.';
	if (typeof b.rule_id !== 'string' || !b.rule_id) return 'rule_id requis.';
	if (needTheme && (typeof b.theme !== 'string' || b.theme.trim().length < 2)) return 'theme invalide.';
	if (typeof b.theme === 'string' && b.theme.length > 500) return 'theme trop long.';
	if (typeof b.grade_level !== 'string' || !b.grade_level) return 'grade_level requis.';
	if (typeof b.num_blanks !== 'number' || b.num_blanks < 3 || b.num_blanks > 30) {
		return 'num_blanks doit être entre 3 et 30.';
	}
	return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Groupes de confusion
// ────────────────────────────────────────────────────────────────────────────

/** Forme de comparaison : minuscules, apostrophe droite, espaces normalisés. */
function normalizeWord(w) {
	return String(w ?? '')
		.replace(/[’ʼ‘`´]/g, "'")
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * Groupes d'une règle. Sans groupes valides : un seul groupe = tous les
 * candidats (comportement historique).
 */
function ruleGroups(rule) {
	const cands = Array.isArray(rule.candidates) ? rule.candidates : [];
	const groups = Array.isArray(rule.groups)
		? rule.groups.filter((g) => Array.isArray(g) && g.length >= 2)
		: [];
	return groups.length > 0 ? groups : [cands];
}

function groupIndexOf(groups, word) {
	const n = normalizeWord(word);
	return groups.findIndex((g) => g.some((w) => normalizeWord(w) === n));
}

/** Vérifie la cohérence groupes ↔ candidats (sauvegarde d'une règle). */
function validateRuleGroups(candidates, groups) {
	if (groups === null || groups === undefined || (Array.isArray(groups) && groups.length === 0)) {
		return null;
	}
	if (!Array.isArray(groups)) return 'Les groupes doivent être une liste de listes de mots.';
	const cands = (Array.isArray(candidates) ? candidates : []).map(normalizeWord);
	const seen = new Set();
	for (const g of groups) {
		if (!Array.isArray(g) || g.length < 2) return 'Chaque groupe doit contenir au moins 2 mots.';
		for (const w of g) {
			const n = normalizeWord(w);
			if (!cands.includes(n)) return `« ${w} » est dans un groupe mais pas dans les candidats.`;
			if (seen.has(n)) return `« ${w} » apparaît dans plusieurs groupes.`;
			seen.add(n);
		}
	}
	const missing = cands.filter((c) => !seen.has(c));
	if (missing.length) return `Candidats sans groupe : ${missing.join(', ')}.`;
	return null;
}

/** Groupes réécrits avec la forme exacte des candidats (null si aucun). */
function canonicalGroups(candidates, groups) {
	if (!Array.isArray(groups) || groups.length === 0) return null;
	const byNorm = new Map((candidates || []).map((c) => [normalizeWord(c), c]));
	return groups.map((g) => g.map((w) => byNorm.get(normalizeWord(w)) || w));
}

/**
 * Valide la sortie du LLM et la normalise : retourne { error } ou { blanks }
 * avec `correct` ramené à la forme exacte du candidat (casse, apostrophe).
 */
function validateExercise(ex, rule, numBlanks) {
	const fail = (error) => ({ error });
	if (!ex || !ex.text || typeof ex.text !== 'string') return fail('Texte manquant.');
	if (!Array.isArray(ex.blanks)) return fail('Liste de trous manquante.');
	if (ex.blanks.length !== numBlanks) {
		return fail(`Nombre de trous incorrect : attendu ${numBlanks}, reçu ${ex.blanks.length}.`);
	}
	const byNorm = new Map(rule.candidates.map((c) => [normalizeWord(c), c]));
	const groups = ruleGroups(rule);
	const perGroup = groups.map(() => 0);
	const positions = new Set();
	const blanks = [];
	for (const b of ex.blanks) {
		if (typeof b.position !== 'number' || b.position < 1 || b.position > numBlanks) {
			return fail(`Position invalide : ${b.position}.`);
		}
		if (positions.has(b.position)) return fail(`Position dupliquée : ${b.position}.`);
		positions.add(b.position);
		const correct = byNorm.get(normalizeWord(b.correct));
		if (!correct) {
			return fail(
				`Bonne réponse hors candidats autorisés : "${b.correct}" (autorisés : ${rule.candidates.join(', ')}).`
			);
		}
		const gi = groupIndexOf(groups, correct);
		if (gi >= 0) perGroup[gi]++;
		blanks.push({ position: b.position, correct });
	}
	for (let i = 1; i <= numBlanks; i++) {
		if (!ex.text.includes(`{{${i}}}`)) return fail(`Marqueur manquant dans le texte : {{${i}}}.`);
	}
	// Plusieurs confusions : chacune doit être travaillée (si assez de trous).
	if (groups.length > 1 && numBlanks >= groups.length * 2) {
		const absent = groups.filter((_, i) => perGroup[i] === 0).map((g) => g.join('/'));
		if (absent.length) return fail(`Confusion(s) sans aucun trou : ${absent.join(', ')}.`);
	}
	blanks.sort((x, y) => x.position - y.position);
	return { blanks };
}

function formatExamples(rule) {
	const ex = rule.examples;
	if (!ex || !Array.isArray(ex) || ex.length === 0) return '';
	const lines = ex
		.map((e) => {
			const rationale = e.rationale ? ` (${e.rationale})` : '';
			return `- "${e.sentence}" → bonne réponse : "${e.answer}"${rationale}`;
		})
		.join('\n');
	return `\nEXEMPLES DE TROUS BIEN PLACÉS (la règle s'applique vraiment) :\n${lines}`;
}

function callGenerate(cfg, rule, req, attemptIdx) {
	const textLength = Math.min(60 + req.num_blanks * 12, 350);
	const groups = ruleGroups(rule);
	const multi = groups.length > 1;
	const groupsBlock = groups.map((g) => `- ${g.map((w) => `« ${w} »`).join(' / ')}`).join('\n');
	const spreadHint = multi
		? `\n- Répartis les trous entre les ${groups.length} confusions de façon à peu près équilibrée${
				req.num_blanks >= groups.length * 2 ? ' (au moins un trou pour CHACUNE)' : ''
			}, et varie les bonnes réponses à l'intérieur de chaque confusion.`
		: "\n- Varie les bonnes réponses (pas toujours le même mot).";

	const systemPrompt = `Tu es un professeur de français expérimenté qui crée des exercices à trous pour des élèves de niveau ${req.grade_level}. Ton exigence absolue : chaque trou doit être placé à un endroit où la règle travaillée s'applique vraiment — pas n'importe où dans une phrase. Mieux vaut moins de trous que des trous mal placés.`;

	const retryHint =
		attemptIdx > 0
			? "\n\n⚠️ Ta tentative précédente était invalide. Cette fois, vérifie chaque trou : le mot attendu doit être dans la liste des candidats, chaque marqueur `{{N}}` doit être présent une fois, et les autres mots de la même confusion doivent être des erreurs d'orthographe plausibles (homophones) à cet endroit."
			: '';

	const userPrompt = `RÈGLE TRAVAILLÉE : ${rule.display_name}
DESCRIPTION : ${rule.short_description}
CANDIDATS AUTORISÉS pour les trous : ${JSON.stringify(rule.candidates)}
${multi ? 'CONFUSIONS' : 'CONFUSION'} TRAVAILLÉE${multi ? 'S' : ''} (pour chaque trou, l'élève choisira parmi les mots de la confusion concernée) :
${groupsBlock}
${formatExamples(rule)}

PROCESSUS À SUIVRE (très important) :

ÉTAPE 1 — Pense à un récit cohérent d'environ ${textLength} mots sur le thème : « ${req.theme} ». Écris-le mentalement avec tous ses mots en place (sans trous).

ÉTAPE 2 — Identifie les positions où l'un des candidats ${JSON.stringify(rule.candidates)} apparaît NATURELLEMENT dans ton récit. Tu dois trouver exactement ${req.num_blanks} positions. Si tu n'en trouves pas autant naturellement, RÉÉCRIS le récit pour en ajouter — n'invente PAS des positions artificielles.

ÉTAPE 3 — Remplace ces positions par \`{{1}}\`, \`{{2}}\`, …, \`{{${req.num_blanks}}}\` dans l'ordre. Pour chaque trou, fournis la bonne réponse (le candidat qui était là dans ton récit). Le marqueur remplace le mot ENTIER, apostrophe comprise (ex. « Elle {{3}} levée » pour « s'est »).

ÉTAPE 4 — Self-check OBLIGATOIRE : pour chaque trou, le mot attendu doit être le seul correct, et les autres mots de sa confusion doivent être des erreurs que l'élève pourrait réellement faire (ils se prononcent pareil). Si aucun mot de la confusion n'est la réponse naturelle à cet endroit, le trou est mal placé — supprime-le.

EXEMPLES DE TROUS MAL PLACÉS (à ÉVITER absolument) :
- "Il arrive {{?}} la gare." pour ou/où → MAUVAIS : on a besoin de "à la gare", ni "ou" ni "où" ne s'insère ici.
- Toute phrase où aucun des mots de la confusion ne forme une phrase correcte est INTERDITE.

CONTRAINTES DE FORME :
- Texte narratif d'environ ${textLength} mots, vocabulaire et longueur de phrases adaptés au niveau ${req.grade_level}.
- Marqueurs \`{{N}}\` numérotés dans l'ordre d'apparition (1-based, jusqu'à ${req.num_blanks}).
- \`correct\` est écrit exactement comme dans la liste des candidats, en minuscules même en début de phrase (l'affichage ajoute la majuscule).${spreadHint}${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_exercise.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_exercise',
				description: "Soumet l'exercice à trous généré.",
				parameters: {
					type: 'object',
					required: ['text', 'blanks'],
					properties: {
						text: {
							type: 'string',
							description: `Texte avec marqueurs {{1}}, {{2}}, …, {{${req.num_blanks}}}`
						},
						blanks: {
							type: 'array',
							items: {
								type: 'object',
								required: ['position', 'correct'],
								properties: {
									position: { type: 'integer', minimum: 1, maximum: req.num_blanks },
									correct: { type: 'string', enum: rule.candidates }
								}
							}
						}
					}
				}
			}
		}
	];

	const json = chatCompletion(
		cfg,
		{
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_exercise' } },
			temperature: 0.7,
			max_tokens: 2000
		},
		cfg.timeoutGenerate
	);

	return parseToolCall(json);
}

/** Arguments JSON du premier tool_call d'une réponse chat/completions. */
function parseToolCall(json) {
	const toolCall = json && json.choices && json.choices[0] && json.choices[0].message &&
		json.choices[0].message.tool_calls && json.choices[0].message.tool_calls[0];
	if (!toolCall) throw new Error('Pas de tool_call dans la réponse LLM.');
	try {
		return JSON.parse(toolCall.function.arguments);
	} catch (err) {
		throw new Error(`JSON invalide dans tool_call.arguments : ${err.message}`);
	}
}

/**
 * Note les trous répondus (permet la "version courte" d'un exercice).
 * `rule` (optionnel) : { candidates, groups } pour le détail par confusion.
 */
function grade(exercise, responses, rule) {
	const attempted = exercise.blanks.filter((b) =>
		Object.prototype.hasOwnProperty.call(responses, String(b.position))
	);
	const groups = rule ? ruleGroups(rule) : null;
	const per_blank = [];
	const per_group = {};
	let score = 0;
	for (const b of attempted) {
		const given = responses[String(b.position)] ?? null;
		const ok = given !== null && normalizeWord(given) === normalizeWord(b.correct);
		if (ok) score++;
		per_blank.push({ position: b.position, given, correct: b.correct, ok });
		if (groups && groups.length > 1) {
			const gi = groupIndexOf(groups, b.correct);
			const label = gi >= 0 ? groups[gi].join(' / ') : b.correct;
			per_group[label] = per_group[label] || { ok: 0, total: 0 };
			per_group[label].total++;
			if (ok) per_group[label].ok++;
		}
	}
	const total = attempted.length;
	const ratio = total > 0 ? score / total : 0;
	return {
		score,
		score_total: total,
		per_blank,
		per_rule_breakdown: { [exercise.rule]: { ok: score, total } },
		per_group_breakdown: per_group,
		suggested_next_rule_id: ratio < 0.8 ? exercise.rule : null
	};
}

function generateAppreciation(cfg, exercise, rule, grading) {
	const ratio = grading.score / grading.score_total;
	let toneHint;
	if (ratio === 1) toneHint = "Score parfait — félicite chaleureusement et propose d'augmenter la difficulté.";
	else if (ratio >= 0.8) toneHint = 'Très bon score — félicite et identifie les rares confusions.';
	else if (ratio >= 0.5) toneHint = 'Score moyen — encourage et donne une astuce courte sur la règle.';
	else toneHint = 'Score faible — rassure, propose une astuce simple et concrète sur la règle.';

	const exerciseKind = {
		qcm: 'un QCM',
		free_text: 'un exercice de conjugaison à compléter au clavier',
		span: 'un exercice où il faut retrouver le groupe nominal sujet de chaque phrase',
		punctuation: "un exercice où il faut rétablir la ponctuation d'un texte"
	}[rule.rule_type] || 'un exercice à trous';
	const weakGroups = Object.entries(grading.per_group_breakdown || {})
		.filter(([, v]) => v.ok < v.total)
		.map(([label, v]) => `${label} (${v.ok}/${v.total})`)
		.join(', ');

	const errorsList = grading.per_blank
		.filter((b) => !b.ok)
		.map((b) =>
			b.context
				? `${b.context} : a répondu "${b.given ?? '(rien)'}" au lieu de "${b.correct}"`
				: `position ${b.position} : a écrit "${b.given ?? '(rien)'}" au lieu de "${b.correct}"`
		)
		.slice(0, 6)
		.join(' ; ');

	const userPrompt = `Tu donnes un retour personnalisé à un élève de ${exercise.grade_level} qui vient de faire ${exerciseKind} sur la règle "${rule.display_name}" (${rule.short_description}).

Score : ${grading.score}/${grading.score_total}.
${errorsList ? `Erreurs : ${errorsList}.` : 'Aucune erreur.'}${weakGroups ? `\nPoints à retravailler : ${weakGroups}. Centre ton astuce sur la plus ratée.` : ''}
Ton attendu : ${toneHint}

Écris UNE SEULE appréciation courte (3-5 phrases maximum), en français, ton bienveillant et encourageant. Tutoie l'élève. Si pertinent, glisse une astuce mémo pour la règle (ex : « où prend un accent quand il indique un lieu ; ou ne sert qu'à donner le choix »). Pas de formule mécanique, sois naturel. Texte brut : pas de Markdown (ni astérisques, ni titres, ni listes). Réponds uniquement avec l'appréciation, sans préambule.`;

	const json = chatCompletion(
		cfg,
		{ messages: [{ role: 'user', content: userPrompt }], temperature: 0.7, max_tokens: 400 },
		cfg.timeoutAppreciation
	);
	const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
	if (typeof text !== 'string' || !text.trim()) throw new Error('Pas de contenu textuel dans la réponse.');
	// Affichée en texte brut : on retire le Markdown (gras/italique) si le modèle en met quand même.
	return text
		.replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
		.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1$2')
		.trim();
}

function fallbackAppreciation(g) {
	const ratio = g.score / g.score_total;
	if (ratio === 1)
		return `Bravo, ${g.score}/${g.score_total} ! Tu maîtrises cette règle. Tu peux maintenant essayer un exercice plus long ou changer de règle.`;
	if (ratio >= 0.8)
		return `Très bon score : ${g.score}/${g.score_total}. Quelques étourderies à corriger en relisant — tu y es presque.`;
	if (ratio >= 0.5)
		return `${g.score}/${g.score_total}. Tu progresses, mais cette règle mérite un peu plus de pratique. Refais un exercice ciblé pour ancrer.`;
	return `${g.score}/${g.score_total}. Pas de souci, cette règle est piégeuse — relis les bonnes réponses pour comprendre, puis refais un exercice. Tu vas y arriver.`;
}

// Convertit un champ JSON PocketBase (types.JSONRaw) en valeur JS.
function jsonField(record, name) {
	const raw = record.get(name);
	if (raw === null || raw === undefined) return null;
	try {
		return JSON.parse(toString(raw));
	} catch (_) {
		return null;
	}
}

module.exports = {
	USERNAME_RE,
	EMAIL_RE,
	env,
	syntheticEmail,
	maskEmail,
	isEditor,
	findUserByUsername,
	readJsonBody,
	sendOtp,
	isAccountLocked,
	recordOtpFailure,
	llmConfig,
	validateGenerateRequest,
	validateExercise,
	chatCompletion,
	parseToolCall,
	normalizeWord,
	ruleGroups,
	validateRuleGroups,
	canonicalGroups,
	callGenerate,
	grade,
	generateAppreciation,
	fallbackAppreciation,
	jsonField
};
