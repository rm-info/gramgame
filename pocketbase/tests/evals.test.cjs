// Tests des évaluations (fonctions pures) : node pocketbase/tests/evals.test.cjs
const assert = require('assert');
const ev = require('./load.cjs')('evals.js');

// ── Sujet sans réponses
const rng = () => ev.seededRng('copie-1');
const FORBIDDEN = ['correct', 'answer', 'references', 'explanation', 'accepted', 'person', 'subject', 'category', 'context'];
const noLeak = (items) => items.every((it) => FORBIDDEN.every((k) => !(k in it)));

const mcRule = { rule_type: 'multiple_choice', candidates: ['a', 'à', 'ou', 'où'], groups: [['a', 'à'], ['ou', 'où']], config: {} };
const mcEx = { text: 'Il {{1}} faim. {{2}} vas-tu ?', blanks: [{ position: 1, correct: 'a' }, { position: 2, correct: 'Où' }] };
let p = ev.publicPart(mcRule, mcEx, false, rng());
assert.deepStrictEqual(p.items, [{ position: 1, options: ['a', 'à'] }, { position: 2, options: ['ou', 'où'] }]);
assert.ok(noLeak(p.items));
p = ev.publicPart(mcRule, mcEx, true, rng());
assert.deepStrictEqual(p.items[0].options, ['a', 'à', 'ou', 'où'], 'mode difficile : tous les mots');

const qcmRule = { rule_type: 'qcm', candidates: ['il', 'elle'], config: { hard_mode: 'hide_highlight' } };
const qcmEx = {
	text: 'Choisis le pronom.',
	blanks: [1, 2, 3, 4, 5, 6].map((i) => ({ position: i, prompt: `[[Le chat ${i}]] dort.`, correct: 'il', explanation: 'x' }))
};
p = ev.publicPart(qcmRule, qcmEx, false, rng());
assert.ok(noLeak(p.items) && p.items[0].prompt.includes('[['), 'normal : passage surligné gardé');
p = ev.publicPart(qcmRule, qcmEx, true, rng());
assert.ok(p.items.every((i) => !i.prompt.includes('[[')), 'difficile : marqueurs retirés');
assert.notDeepStrictEqual(p.items.map((i) => i.position), [1, 2, 3, 4, 5, 6], 'questions mélangées');
const again = ev.publicPart(qcmRule, qcmEx, true, rng());
assert.deepStrictEqual(again.items.map((i) => i.position), p.items.map((i) => i.position), 'même graine → même ordre');

const spanEx = { text: 'Clique le GNS.', blanks: [{ position: 1, prompt: '[[Le chien]] aboie.', tokens: ['Le', 'chien', 'aboie.'], answer: '0,1', correct: 'Le chien', kind: 'simple' }] };
p = ev.publicPart({ rule_type: 'span', candidates: [], config: {} }, spanEx, false, rng());
assert.deepStrictEqual(p.items, [{ position: 1, tokens: ['Le', 'chien', 'aboie.'] }]);

const ftEx = { text: 'Je {{1}}.', blanks: [{ position: 1, verb: 'chanter', person: '1s', subject: 'je', correct: 'chante', accepted: ['chante'] }] };
p = ev.publicPart({ rule_type: 'free_text', candidates: [], config: {} }, ftEx, false, rng());
assert.deepStrictEqual(p.items, [{ position: 1, verb: 'chanter' }]);

const pEx = { text: 'Le chat dort. Il rêve.', blanks: [{ position: 3, correct: '.' }], extra: { words: ['Le', 'chat', 'dort', 'Il', 'rêve'], proper_nouns: [] } };
p = ev.publicPart({ rule_type: 'punctuation', candidates: [], config: {} }, pEx, false, rng());
assert.deepStrictEqual(p, { text: '', items: [], extra: { words: ['Le', 'chat', 'dort', 'Il', 'rêve'] } }, 'ponctuation : ni texte ponctué ni signes');

const tfEx = {
	text: 'Transforme.',
	blanks: [{ position: 1, source: 'Il mange.', target: 'negative', correct: 'Il ne mange pas.', references: ['Il ne mange pas.'], options: ['Il ne mange pas.', 'Il mange pas.', 'Il ne mange.'], explanation: 'x' }]
};
p = ev.publicPart({ rule_type: 'transform', candidates: [], config: {} }, tfEx, false, rng());
assert.ok(noLeak(p.items) && p.items[0].options.length === 3);
let first = new Set();
for (let i = 0; i < 20; i++) first.add(ev.publicPart({ rule_type: 'transform', candidates: [], config: {} }, tfEx, false, ev.seededRng(`s${i}`)).items[0].options[0]);
assert.ok(first.size > 1, 'la bonne proposition n’est pas toujours la première');
p = ev.publicPart({ rule_type: 'transform', candidates: [], config: {} }, tfEx, true, rng());
assert.ok(!('options' in p.items[0]), 'écriture : pas de propositions');

// ── Dates, délais
const T0 = Date.parse('2026-11-15T10:00:00Z');
const base = { status: 'published', opens_at: '', closes_at: '', time_limit_min: 0, correction_mode: 'immediate' };
assert.strictEqual(ev.evalState({ ...base, status: 'draft' }, T0), 'draft');
assert.strictEqual(ev.evalState({ ...base, opens_at: '2026-11-16 08:00:00.000Z' }, T0), 'upcoming');
assert.strictEqual(ev.evalState({ ...base, closes_at: '2026-11-15 09:00:00.000Z' }, T0), 'closed');
assert.strictEqual(ev.evalState(base, T0), 'open');
assert.strictEqual(ev.deadlineOf(base, T0), null, 'ni durée ni fin');
assert.strictEqual(ev.deadlineOf({ ...base, time_limit_min: 30 }, T0), T0 + 30 * 60000);
assert.strictEqual(ev.deadlineOf({ ...base, time_limit_min: 30, closes_at: '2026-11-15 10:10:00.000Z' }, T0), T0 + 10 * 60000, 'la fermeture coupe le chrono');

assert.strictEqual(ev.correctionVisible(base, T0), true);
assert.strictEqual(ev.correctionVisible({ ...base, correction_mode: 'manual' }, T0), false);
assert.strictEqual(ev.correctionVisible({ ...base, correction_mode: 'manual', correction_released: true }, T0), true);
assert.strictEqual(ev.correctionVisible({ ...base, correction_mode: 'after_close', closes_at: '2026-11-15 11:00:00.000Z' }, T0), false);
assert.strictEqual(ev.correctionVisible({ ...base, correction_mode: 'after_close', closes_at: '2026-11-15 09:00:00.000Z' }, T0), true);

// ── Réglages
const ok = { title: 'Éval', correction_mode: 'immediate', time_limit_min: 20, parts: [{ exercise: 'x', points: 10 }], classes: ['c'], students: [] };
assert.strictEqual(ev.validateSettings(ok, true), null);
assert.match(ev.validateSettings({ ...ok, title: ' ' }, false), /titre/);
assert.match(ev.validateSettings({ ...ok, time_limit_min: 300 }, false), /240/);
assert.match(ev.validateSettings({ ...ok, correction_mode: 'after_close' }, false), /date de fin/);
assert.match(ev.validateSettings({ ...ok, opens_at: '2026-11-16 08:00:00Z', closes_at: '2026-11-15 08:00:00Z' }, false), /après/);
assert.match(ev.validateSettings({ ...ok, parts: [{ exercise: 'x', points: 0 }] }, false), /points/);
assert.match(ev.validateSettings({ ...ok, parts: [] }, true), /exercice/);
assert.match(ev.validateSettings({ ...ok, classes: [] }, true), /classe ou un élève/);
assert.strictEqual(ev.validateSettings({ ...ok, parts: [], classes: [] }, false), null, 'brouillon incomplet accepté');

// ── Notes
assert.strictEqual(ev.earnedPoints(3, 4, 8), 6);
assert.strictEqual(ev.earnedPoints(0, 0, 8), 0);
assert.strictEqual(ev.noteOn20(13.5, 18), 15);
assert.strictEqual(ev.noteOn20(1, 3), 6.7);

// ── Stats par question
const qs = ev.questionStats(
	[{ exercise: 'B' }, { exercise: 'A' }],
	[
		[{ exercise: 'A', per_blank: [{ position: 1, ok: true, correct: 'a' }] }, { exercise: 'B', per_blank: [{ position: 2, ok: false, correct: 'où' }, { position: 9, ok: false, extra: true }] }],
		[{ exercise: 'A', per_blank: [{ position: 1, ok: false, correct: 'a' }] }]
	]
);
assert.deepStrictEqual(qs.map((q) => [q.exercise, q.position, q.ok, q.total]), [['B', 2, 0, 1], ['A', 1, 1, 2]]);

// ── V2 : réponses données, durée, correction manuelle
assert.deepStrictEqual(ev.answeredCount('qcm', [{ position: 1 }, { position: 2 }, { position: 3 }], { 1: 'il', 2: ' ', 3: '' }), { answered: 1, total: 3 });
assert.deepStrictEqual(ev.answeredCount('punctuation', [{ position: 3 }, { position: 7 }], { 3: ',', 5: '.', 7: '' }), { answered: 1, total: 2 }, 'ponctuation : signe mis là où un signe était attendu');
assert.deepStrictEqual(ev.answeredCount('span', [{ position: 1 }], undefined), { answered: 0, total: 1 });
assert.strictEqual(ev.durationSeconds('2026-11-15 10:00:00.000Z', '2026-11-15 10:12:30.000Z'), 750);
assert.strictEqual(ev.durationSeconds('2026-11-15 10:00:00.000Z', ''), null);

const results = [
	{ exercise: 'A', points: 10, earned: 5, score: 1, score_total: 2, per_blank: [{ position: 1, ok: true }, { position: 2, ok: false, judged_by: 'ia', uncertain: true }] },
	{ exercise: 'B', points: 10, earned: 10, score: 1, score_total: 1, per_blank: [{ position: 4, ok: true }] }
];
let o = ev.applyOverride(results, 'A', 2, true);
assert.strictEqual(o.results[0].score, 2);
assert.strictEqual(o.results[0].earned, 10);
assert.strictEqual(o.note20, 20);
const b2 = o.results[0].per_blank[1];
assert.ok(b2.ok && b2.overridden && b2.ok_auto === false && b2.judged_by === 'prof' && b2.judged_by_auto === 'ia');
o = ev.applyOverride(o.results, 'A', 2, false);
assert.strictEqual(o.results[0].per_blank[1].ok_auto, false, 'la correction automatique est gardée d’un changement à l’autre');
assert.strictEqual(o.note20, 15);
o = ev.applyOverride(o.results, 'A', 2, null);
const back = o.results[0].per_blank[1];
assert.ok(!back.ok && !back.overridden && !('ok_auto' in back) && back.judged_by === 'ia', 'retour à la correction automatique');
o = ev.applyOverride(o.results, 'B', 4, false);
assert.strictEqual(o.results[1].earned, 0);
assert.strictEqual(o.score_points, 5);
assert.strictEqual(ev.applyOverride(results, 'A', 99, true), null, 'question inconnue');
assert.strictEqual(results[0].per_blank[1].ok, false, 'les résultats d’origine ne sont pas modifiés');

console.log('évaluations : OK');
