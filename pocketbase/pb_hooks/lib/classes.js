// Classes d'un prof : codes d'accès et limites.

// Sans caractères ambigus (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const MAX_CLASSES_PER_TEACHER = 30;
const MAX_MEMBERS_PER_CLASS = 60;
const MAX_CLASSES_PER_STUDENT = 10;

/** Code saisi par l'élève → forme canonique (majuscules, sans espaces ni tirets). */
function normalizeCode(raw) {
	return String(raw || '')
		.toUpperCase()
		.replace(/[\s\-_.]/g, '');
}

/** Un code bien formé (après normalisation) : seulement l'alphabet autorisé. */
function isValidCode(code) {
	if (code.length !== CODE_LENGTH) return false;
	for (const ch of code) if (CODE_ALPHABET.indexOf(ch) < 0) return false;
	return true;
}

/** Nouveau code unique parmi les classes existantes. */
function generateCode(app) {
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = $security.randomStringWithAlphabet(CODE_LENGTH, CODE_ALPHABET);
		let taken = false;
		try {
			app.findFirstRecordByFilter('classes', 'code = {:c}', { c: code });
			taken = true;
		} catch (_) {}
		if (!taken) return code;
	}
	throw new Error('Impossible de générer un code de classe unique.');
}

function cleanName(raw) {
	return String(raw || '')
		.replace(/\s+/g, ' ')
		.trim();
}

module.exports = {
	CODE_ALPHABET,
	CODE_LENGTH,
	MAX_CLASSES_PER_TEACHER,
	MAX_MEMBERS_PER_CLASS,
	MAX_CLASSES_PER_STUDENT,
	normalizeCode,
	isValidCode,
	generateCode,
	cleanName
};
