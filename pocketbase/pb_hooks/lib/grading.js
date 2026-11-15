// Correction d'un exercice (route /api/gram/correct et copies d'évaluation).

/** Règle d'un exercice, sous la forme attendue par les correcteurs. */
function loadRule(app, ruleId) {
	const g = require(`${__hooks}/lib/gram.js`);
	const r = app.findRecordById('rules', ruleId);
	return {
		id: r.id,
		display_name: r.getString('display_name'),
		short_description: r.getString('short_description'),
		rule_type: r.getString('rule_type'),
		candidates: g.jsonField(r, 'candidates') || [],
		groups: g.jsonField(r, 'groups'),
		config: g.jsonField(r, 'config') || {}
	};
}

/** Le mode difficile existe-t-il pour cette règle ? */
function hardModeAllowed(rule) {
	return (
		rule.rule_type === 'multiple_choice' ||
		rule.rule_type === 'transform' ||
		(rule.config && rule.config.hard_mode === 'hide_highlight')
	);
}

/** Ne garde que des réponses texte courtes, indexées par position. */
function cleanResponses(ruleType, raw) {
	const out = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	// Transformations : une phrase entière ; ailleurs, un mot ou des indices.
	const maxLen = ruleType === 'transform' ? 300 : 100;
	for (const k of Object.keys(raw)) {
		const v = raw[k];
		if (typeof v === 'string' && v.length <= maxLen && /^\d{1,3}$/.test(k)) out[k] = v;
	}
	return out;
}

/**
 * Note un exercice.
 *   exercise  : { id, rule, grade_level, blanks, extra }
 *   rule      : loadRule(...)
 *   responses : cleanResponses(...)
 *   hardMode  : déjà validé (hardModeAllowed)
 */
function gradeExercise(exercise, rule, responses, hardMode, logger) {
	const g = require(`${__hooks}/lib/gram.js`);
	const t = rule.rule_type;
	if (t === 'qcm' || t === 'free_text') {
		return require(`${__hooks}/lib/exercises.js`).grade(t, exercise, responses);
	}
	if (t === 'span') return require(`${__hooks}/lib/span_punct.js`).gradeSpan(exercise, responses);
	if (t === 'transform') {
		// Mode difficile = réponses écrites, corrigées par l'IA après des contrôles sans IA.
		return require(`${__hooks}/lib/transform.js`).gradeTransform(exercise, responses, hardMode, g.llmConfig(), logger);
	}
	if (t === 'punctuation') {
		return require(`${__hooks}/lib/span_punct.js`).gradePunctuation(exercise, responses, exercise.extra);
	}
	return g.grade(exercise, responses, rule);
}

/** Record exercises → objet attendu par les correcteurs. */
function exerciseData(record) {
	const g = require(`${__hooks}/lib/gram.js`);
	return {
		id: record.id,
		rule: record.getString('rule'),
		grade_level: record.getString('grade_level'),
		text: record.getString('text'),
		blanks: g.jsonField(record, 'blanks') || [],
		extra: g.jsonField(record, 'extra')
	};
}

module.exports = { loadRule, hardModeAllowed, cleanResponses, gradeExercise, exerciseData };
