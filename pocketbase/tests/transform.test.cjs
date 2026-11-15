const tf = require('./load.cjs')('transform.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } };
const bad = (t, s, src) => tf.checkTarget(t, s, src);

// ── Contrôles sans IA
ok(!bad('negative', "Il n'aime pas les épinards.", 'Il aime les épinards.'), 'négative correcte');
ok(!bad('negative', 'Elle ne mange jamais de pain.', 'Elle mange du pain.'), 'ne … jamais accepté');
ok(/premier morceau/.test(bad('negative', 'Il mange pas.', 'Il mange.')), 'ne oublié');
ok(/deuxième morceau/.test(bad('negative', 'Il ne mange.', 'Il mange.')), 'pas oublié');
ok(/forme négative/.test(bad('negative', 'Il mange du pain.', 'Il mange.')), 'pas de négation');
ok(!bad('negative', 'Une personne ne vient pas.', 'Une personne vient.'), '« personne » nom ne gêne pas');
ok(!bad('interrogative', 'Viens-tu ?', 'Tu viens.'), 'interrogative inversion');
ok(!bad('interrogative', 'Est-ce que tu viens?', 'Tu viens.'), 'interrogative sans espace avant ?');
ok(/point d'interrogation/.test(bad('interrogative', 'Est-ce que tu viens.', 'Tu viens.')), '? oublié');
ok(/point d'exclamation/.test(bad('exclamative', 'Comme il fait beau.', 'Il fait beau.')), '! oublié');
ok(!bad('exclamative', 'Comme il fait beau !', 'Il fait beau.'), 'exclamative correcte');
ok(/pas de sujet/.test(bad('imperative', 'Tu ranges ta chambre !', 'Tu ranges ta chambre.')), 'sujet gardé à l\'impératif');
ok(!bad('imperative', 'Range ta chambre.', 'Tu ranges ta chambre.'), 'impératif correct');
ok(!bad('imperative', 'Ne cours pas !', 'Tu cours.'), 'impératif négatif');
ok(!bad('imperative', 'Lève-toi !', 'Tu te lèves.'), 'impératif pronominal');
ok(/pas été transformée/.test(bad('negative', 'il aime  les épinards.', 'Il aime les épinards.')), 'phrase recopiée');
ok(/ponctuation/.test(bad('negative', "Il n'aime pas", 'Il aime.')), 'ponctuation finale');

// ── Construction / validation des questions
const good = { source: 'Tu ranges ta chambre.', target: 'imperative', references: ['Range ta chambre.', 'Range ta chambre !'], wrong_options: ['Ranges ta chambre.', 'Tu range ta chambre !'], explanation: 'Pas de sujet, pas de s.' };
const it = tf.buildItem(good, 1, ['imperative']);
ok(!it.error && it.correct === 'Range ta chambre.' && it.options.length === 3 && it.options[0] === it.correct && it.category === 'phrase impérative', 'item ' + JSON.stringify(it));
ok(tf.buildItem({ ...good, wrong_options: ['Range ta chambre !', 'Ranges ta chambre.'] }, 1, null).error, 'mauvaise proposition correcte refusée');
ok(tf.buildItem({ ...good, source: 'Il range sa chambre.', references: ['Range ta chambre.'] }, 1, null).error, 'impératif sans tu/nous/vous refusé');
ok(tf.buildItem({ ...good, references: ['Tu ranges ta chambre ?'] }, 1, null).error, 'référence fausse refusée');
ok(tf.buildItem({ ...good, wrong_options: ['Ranges ta chambre.'] }, 1, null).error, '2 mauvaises propositions exigées');
ok(tf.buildItem({ ...good, target: 'negative' }, 1, ['imperative']).error, 'transformation hors règle refusée');
const items = [good, { source: 'Il fait beau.', target: 'exclamative', references: ['Comme il fait beau !', "Qu'il fait beau !"], wrong_options: ['Comme il fait beau ?', 'Quel il fait beau !'], explanation: 'x' }];
let v = tf.validateTransform({ items }, 2, ['imperative', 'exclamative']);
ok(!v.error && v.blanks.length === 2 && v.blanks.map((b) => b.position).join() === '1,2', 'validation ' + v.error);
ok(tf.validateTransform({ items: [items[1], items[1]] }, 2, ['exclamative']).error, 'doublon refusé');
ok(tf.validateTransform({ items: [items[1], { ...items[1], source: 'Il pleut.', references: ['Comme il pleut !'] }, items[1]].slice(0, 2).concat([{ ...items[1], source: 'Il neige.', references: ['Comme il neige !'] }, { ...items[1], source: 'Il vente.', references: ['Comme il vente !'] }]) }, 4, ['imperative', 'exclamative']).error, 'chaque transformation présente (révision)');

// ── Correction
const ex = { rule: 'transformations', grade_level: 'CM2', blanks: v.blanks };
const pImp = v.blanks.find((b) => b.target === 'imperative').position;
const pExc = v.blanks.find((b) => b.target === 'exclamative').position;
let r = tf.gradeTransform(ex, { [pImp]: 'Range ta chambre.', [pExc]: 'Quel il fait beau !' }, false, null, null);
ok(r.score === 1 && r.score_total === 2, 'QCM ' + r.score + '/' + r.score_total);
r = tf.gradeTransform(ex, { [pImp]: 'range ta chambre !', [pExc]: 'Comme il fait beau.' }, true, null, null);
const eImp = r.per_blank.find((b) => b.position === pImp), eExc = r.per_blank.find((b) => b.position === pExc);
ok(eImp.ok && eImp.judged_by === 'rules', 'écrit = une référence → juste sans IA ' + JSON.stringify(eImp));
ok(!eExc.ok && /point d'exclamation/.test(eExc.feedback) && eExc.judged_by === 'rules', 'contrôle sans IA ' + JSON.stringify(eExc));
r = tf.gradeTransform(ex, { [pExc]: 'Que il fait beau !' }, true, null, null);
const eU = r.per_blank[0];
ok(!eU.ok && eU.uncertain && eU.judged_by === 'none', 'IA indisponible → non validé, signalé ' + JSON.stringify(eU));
ok(Object.keys(tf.gradeTransform(ex, { [pImp]: 'x', [pExc]: 'y' }, false, null, null).per_group_breakdown).length === 2, 'détail par transformation');

console.log(fail ? `${fail} échec(s)` : 'tout OK');
if (fail) process.exit(1);
