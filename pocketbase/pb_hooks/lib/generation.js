// Génération d'un exercice (route /api/gram/generate et parties d'évaluation).

/**
 * Génère et enregistre un exercice.
 *   body  : { rule_id, theme, grade_level, num_blanks, ... }
 *   opts  : { evaluation } — rattache l'exercice à une évaluation
 * Renvoie { record, rule } ou { status, error, debug } en cas d'échec.
 */
function generateExercise(app, auth, body, opts) {
	const g = require(`${__hooks}/lib/gram.js`);
	opts = opts || {};
	const logger = app.logger();

	let ruleRecord;
	try {
		ruleRecord = app.findRecordById('rules', String((body && body.rule_id) || ''));
	} catch (_) {
		return { status: 404, error: `Règle introuvable : ${body && body.rule_id}` };
	}
	const rule = {
		id: ruleRecord.id,
		display_name: ruleRecord.getString('display_name'),
		short_description: ruleRecord.getString('short_description'),
		rule_type: ruleRecord.getString('rule_type'),
		candidates: g.jsonField(ruleRecord, 'candidates') || [],
		groups: g.jsonField(ruleRecord, 'groups'),
		examples: g.jsonField(ruleRecord, 'examples'),
		config: g.jsonField(ruleRecord, 'config') || {}
	};
	// Liste de verbes tirée au sort : ni thème ni LLM.
	const noLlm = rule.config.generator === 'verb_groups';

	const reqError = g.validateGenerateRequest(body, { needTheme: !noLlm });
	if (reqError) return { status: 400, error: reqError };

	const cfg = g.llmConfig();
	if (!cfg.apiKey && !noLlm) {
		logger.error('LLM_API_KEY non configurée.');
		return { status: 500, error: 'Configuration serveur incomplète (clé LLM manquante).' };
	}

	const MAX_ATTEMPTS = 3; // 1 essai + 2 retries
	let blanks = null;
	let exerciseText = '';
	let lastError = '';
	let providerStatus = null;

	let theme = String(body.theme || '').trim();
	let llmModel = cfg.model;
	let extra = null;

	const onError = (err) => {
		lastError = String((err && err.message) || err);
		if (err && err.providerStatus !== undefined) providerStatus = err.providerStatus;
		else if (!err || !err.invalid) logger.error('Génération : erreur inattendue', 'error', lastError);
	};

	if (rule.rule_type === 'transform') {
		// Transformations de phrases : lib/transform.js (retries inclus).
		const tf = require(`${__hooks}/lib/transform.js`);
		try {
			const out = tf.generate(cfg, rule, body, logger);
			blanks = out.blanks;
			exerciseText = out.text;
		} catch (err) {
			onError(err);
		}
	}

	if (rule.rule_type === 'span' || rule.rule_type === 'punctuation') {
		// GNS à cliquer, ponctuation : lib/span_punct.js (retries inclus).
		const sp = require(`${__hooks}/lib/span_punct.js`);
		try {
			const out = sp.generate(cfg, rule, body, logger);
			blanks = out.blanks;
			exerciseText = out.text;
			extra = out.extra || null;
		} catch (err) {
			onError(err);
		}
	}

	if (rule.rule_type === 'qcm' || rule.rule_type === 'free_text') {
		// Générateurs de lib/exercises.js (retries inclus).
		const ex = require(`${__hooks}/lib/exercises.js`);
		try {
			// Verbes des derniers exercices de l'auteur : tirés en dernier pour varier.
			let recentVerbs = [];
			try {
				const recs = app.findRecordsByFilter('exercises', 'owner = {:u}', '-created', 8, 0, { u: auth.id });
				recentVerbs = recs.map((r) =>
					(g.jsonField(r, 'blanks') || [])
						.map((b) => (b && (b.verb || (typeof b.prompt === 'string' && !/\s/.test(b.prompt) ? b.prompt : ''))) || '')
						.filter(Boolean)
				);
			} catch (err) {
				logger.warn('Verbes récents introuvables', 'error', String(err));
			}
			const out = ex.generate(cfg, rule, body, logger, { recentVerbs });
			blanks = out.blanks;
			exerciseText = out.text;
			if (out.theme) theme = out.theme;
			if (out.llm_model) llmModel = out.llm_model;
		} catch (err) {
			onError(err);
		}
	}

	for (let attempt = 0; attempt < MAX_ATTEMPTS && rule.rule_type === 'multiple_choice'; attempt++) {
		try {
			const candidate = g.callGenerate(cfg, rule, body, attempt);
			const v = g.validateExercise(candidate, rule, body.num_blanks);
			if (!v.error) {
				blanks = v.blanks;
				exerciseText = candidate.text;
				break;
			}
			lastError = v.error;
			logger.warn(`Génération : tentative ${attempt + 1} invalide`, 'error', v.error);
		} catch (err) {
			lastError = String((err && err.message) || err);
			logger.warn(`Génération : tentative ${attempt + 1} échouée`, 'error', lastError);
			if (err && err.providerStatus !== undefined) {
				// Erreur provider (429, 401, 5xx…) : inutile de retenter.
				providerStatus = err.providerStatus;
				break;
			}
		}
	}

	if (!blanks) {
		if (providerStatus === 429) {
			return {
				status: 429,
				error:
					'Quota du provider LLM dépassé pour le moment. Patiente quelques minutes (rate limit par minute) ou vérifie ton quota journalier.',
				debug: lastError
			};
		}
		if (providerStatus === 401 || providerStatus === 403) {
			return { status: providerStatus, error: 'Clé API LLM invalide ou non autorisée côté serveur.', debug: lastError };
		}
		if (providerStatus !== null) {
			return {
				status: 502,
				error: `Le provider LLM a renvoyé une erreur (HTTP ${providerStatus}). Réessaie dans un instant.`,
				debug: lastError
			};
		}
		return {
			status: 422,
			error: "L'IA n'a pas réussi à générer un exercice valide. Réessaie dans un instant ou modifie le thème.",
			debug: lastError
		};
	}

	const record = new Record(app.findCollectionByNameOrId('exercises'));
	record.set('owner', auth.id);
	record.set('owner_username', auth.getString('username'));
	record.set('rule', rule.id);
	record.set('theme', theme);
	record.set('grade_level', body.grade_level);
	// Ponctuation : nombre de signes attendus (≠ nombre de phrases demandé).
	record.set('num_blanks', blanks.length);
	record.set('text', exerciseText);
	record.set('blanks', blanks);
	record.set('llm_model', llmModel);
	if (extra) record.set('extra', extra);
	if (opts.evaluation) record.set('evaluation', opts.evaluation);
	record.set('verified', false);

	try {
		app.save(record);
	} catch (err) {
		logger.error('Sauvegarde exercice échouée', 'error', String(err));
		return { status: 500, error: 'Sauvegarde échouée.' };
	}
	return { record, rule };
}

module.exports = { generateExercise };
