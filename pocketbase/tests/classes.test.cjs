// Tests des codes de classe : node pocketbase/tests/classes.test.cjs
const assert = require('assert');
const load = require('./load.cjs');

// generateCode utilise $security / app : on les simule.
let n = 0;
global.$security = {
	randomStringWithAlphabet: (len, alphabet) => {
		n++;
		// 1er tirage : un code déjà pris, ensuite un code libre.
		return n === 1 ? 'TAKEN2' : Array.from({ length: len }, (_, i) => alphabet[(i * 7 + n) % alphabet.length]).join('');
	}
};
const cl = load('classes.js');

// Alphabet sans caractères ambigus.
for (const ch of '01OIL') assert.ok(!cl.CODE_ALPHABET.includes(ch), `${ch} ne doit pas être dans l'alphabet`);

// Saisie tolérante : minuscules, espaces, tirets.
assert.strictEqual(cl.normalizeCode(' k7x-q2m '), 'K7XQ2M');
assert.strictEqual(cl.normalizeCode('k7x q2m'), 'K7XQ2M');
assert.strictEqual(cl.normalizeCode(null), '');
assert.ok(cl.isValidCode('K7XQ2M'));
assert.ok(!cl.isValidCode('K7XQ2'), 'trop court');
assert.ok(!cl.isValidCode('K7XQ2MM'), 'trop long');
assert.ok(!cl.isValidCode('K7XQ0M'), '0 interdit');
assert.ok(!cl.isValidCode('K7XQ%M'), 'symbole interdit');

// Unicité : un code déjà pris est retiré.
const app = {
	findFirstRecordByFilter: (_c, _f, p) => {
		if (p.c === 'TAKEN2') return {};
		throw new Error('not found');
	}
};
const code = cl.generateCode(app);
assert.notStrictEqual(code, 'TAKEN2');
assert.ok(cl.isValidCode(code), code);

assert.strictEqual(cl.cleanName('  CM2   A  '), 'CM2 A');

console.log('classes : OK');
