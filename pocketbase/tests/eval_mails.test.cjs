// Tests des mails d'évaluation (fonctions pures) : node pocketbase/tests/eval_mails.test.cjs
const assert = require('assert');
const em = require('./load.cjs')('eval_mails.js');
const T = (s) => Date.parse(s);

// ── Heure de Paris (indépendante du fuseau de la machine)
assert.strictEqual(em.parisDay(T('2026-11-15T22:59:00Z')), '2026-11-15', 'hiver : 23 h 59 à Paris');
assert.strictEqual(em.parisDay(T('2026-11-15T23:00:00Z')), '2026-11-16', 'hiver : minuit à Paris');
assert.strictEqual(em.parisHour(T('2026-11-15T23:00:00Z')), 0);
assert.strictEqual(em.parisDay(T('2026-07-01T21:59:00Z')), '2026-07-01', 'été : 23 h 59 à Paris');
assert.strictEqual(em.parisHour(T('2026-07-01T22:00:00Z')), 0, 'été : minuit à Paris = 22 h UTC');
// Changements d'heure 2026 : 29 mars et 25 octobre, à 01:00 UTC.
assert.strictEqual(em.parisHour(T('2026-03-29T00:59:00Z')), 1, 'avant le passage à l’heure d’été');
assert.strictEqual(em.parisHour(T('2026-03-29T01:00:00Z')), 3, 'après le passage à l’heure d’été');
assert.strictEqual(em.parisHour(T('2026-10-25T00:59:00Z')), 2, 'avant le retour à l’heure d’hiver');
assert.strictEqual(em.parisHour(T('2026-10-25T01:00:00Z')), 2, 'après le retour à l’heure d’hiver');
assert.strictEqual(em.formatParis(T('2026-11-16T17:30:00Z')), 'lundi 16 novembre à 18 h 30');
assert.strictEqual(em.formatParis(T('2026-06-01T08:00:00Z')), 'lundi 1 juin à 10 h');

// ── Quand envoyer
const now = T('2026-11-16T09:00:00Z'); // lundi 16, 10 h à Paris
const ev = (o) => Object.assign({ id: 'ev1', title: 'Contrôle', author_username: 'mme_x', status: 'published', opens_at: '', closes_at: '', time_limit_min: 0 }, o);
assert.ok(em.mailDue(ev({}), now), 'sans date : tout de suite');
assert.ok(!em.mailDue(ev({ status: 'draft' }), now), 'brouillon : jamais');
assert.ok(em.mailDue(ev({ opens_at: '2026-11-16 16:00:00.000Z' }), now), 'ouvre aujourd’hui à 17 h : tout de suite');
assert.ok(!em.mailDue(ev({ opens_at: '2026-11-17 07:00:00.000Z' }), now), 'ouvre demain : attendre');
assert.ok(em.mailDue(ev({ opens_at: '2026-11-17 07:00:00.000Z' }), T('2026-11-16T23:00:00Z')), 'minuit du jour J');
assert.ok(em.mailDue(ev({ opens_at: '2026-11-16 23:30:00.000Z' }), T('2026-11-16T23:00:00Z')), 'ouvre le 17 à 0 h 30 : mail à minuit');
assert.ok(!em.mailDue(ev({ opens_at: '2026-11-16 23:30:00.000Z' }), T('2026-11-16T22:00:00Z')), '… mais pas la veille à 23 h');
assert.ok(em.mailDue(ev({ opens_at: '2026-11-10 07:00:00.000Z' }), now), 'déjà ouverte : rattrapage');
assert.ok(!em.mailDue(ev({ closes_at: '2026-11-16 08:00:00.000Z' }), now), 'fermée : plus de mail');

// ── Qui
const mails = { a: { sent_at: 'x' }, b: { fails: 1 }, c: { fails: em.MAX_FAILS } };
assert.deepStrictEqual(em.pendingStudents(['a', 'b', 'c', 'd'], mails), ['b', 'd'], 'déjà prévenu ou abandonné : non');
assert.deepStrictEqual(em.pendingStudents(['a', 'b'], null), ['a', 'b']);
const sum = em.mailSummary(ev({ opens_at: '2026-11-20 07:00:00.000Z' }), ['a', 'b', 'c', 'd'], mails, now);
assert.deepStrictEqual(sum, { targets: 4, sent: 1, failed: 2, gave_up: 1, scheduled_day: '2026-11-20' });
assert.strictEqual(em.mailSummary(ev({}), [], {}, now).scheduled_day, null);

// ── Contenu
const m = em.buildMail(ev({ title: 'Les <homophones>', opens_at: '2026-11-16 16:00:00.000Z', closes_at: '2026-11-20 17:00:00.000Z', time_limit_min: 30 }), 'léo', 'https://g.example.org/', now);
assert.strictEqual(m.subject, 'Nouvelle évaluation : Les <homophones>');
assert.ok(m.text.includes('Bonjour léo,'));
assert.ok(m.text.includes('mme_x t\'a donné une évaluation'));
assert.ok(m.text.includes('Elle ouvre le lundi 16 novembre à 17 h.'), m.text);
assert.ok(m.text.includes("jusqu'au vendredi 20 novembre à 18 h"), m.text);
assert.ok(m.text.includes('30 minutes'));
assert.ok(m.text.includes('https://g.example.org/evaluations/ev1/passer'));
assert.ok(m.html.includes('Les &lt;homophones&gt;') && !m.html.includes('<homophones>'), 'HTML échappé');
const m2 = em.buildMail(ev({}), 'léo', 'https://g.example.org', now);
assert.ok(!m2.text.includes('ouvre') && m2.text.includes('une seule tentative'));

console.log('mails d’évaluation : OK');
