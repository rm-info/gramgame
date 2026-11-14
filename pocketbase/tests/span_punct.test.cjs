const sp = require('./load.cjs')('span_punct.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } };

// ── GNS : découpage et réponse attendue
const t1 = sp.spanTokens('[[Le petit chien de mes voisins]] aboie toute la nuit.');
ok(t1.tokens.join('|') === 'Le|petit|chien|de|mes|voisins|aboie|toute|la|nuit.' && t1.answer.join(',') === '0,1,2,3,4,5', 'découpage simple ' + JSON.stringify(t1));
const t2 = sp.spanTokens('Ce matin, [[le facteur]] passe.');
ok(t2.answer.join(',') === '2,3', 'sujet après complément ' + JSON.stringify(t2));
const t3 = sp.spanTokens('Dans la cour jouent [[les élèves de CM2]].');
ok(t3.answer.join(',') === '4,5,6,7' && t3.tokens[7] === 'CM2.', 'sujet inversé, point collé ' + JSON.stringify(t3));
const t4 = sp.spanTokens('[[Le chat]], inquiet, se cache.');
ok(t4.answer.join(',') === '0,1' && t4.tokens[1] === 'chat,', 'virgule collée au dernier mot ' + JSON.stringify(t4));
ok(sp.spanTokens('Le ch[[at dort]].').error, '[[ au milieu d\'un mot refusé');
ok(sp.spanTokens('[[Le chat ]]dort.').error, 'espace au bord refusé');
ok(sp.spanTokens('[[Le chat]] voit [[la souris]].').error, 'deux passages refusés');
ok(sp.buildSpanItem('[[Il]] dort.', 'simple', '', 1).error, 'pronom refusé');
ok(sp.buildSpanItem("[[C'est]] beau.", 'simple', '', 1).error, "c' refusé");
ok(sp.buildSpanItem('[[Le chat dort.]]', 'simple', '', 1).error, 'toute la phrase refusée');
ok(sp.buildSpanItem('[[Dans le jardin]] le chat dort.', 'simple', '', 1).error, 'préposition refusée');
const item = sp.buildSpanItem('Ce matin, [[le facteur de Léa]] passe.', 'eloigne', 'Qui est-ce qui passe ?', 3);
ok(!item.error && item.answer === '2,3,4,5' && item.correct === 'le facteur de Léa' && item.category && item.position === 3, 'item ' + JSON.stringify(item));

// ── GNS : correction
const ex = { rule: 'retrouver-gns', blanks: [item, sp.buildSpanItem('[[Les oiseaux]] chantent.', 'simple', '', 4)] };
const gr = sp.gradeSpan(ex, { 3: '5,2,3,4', 4: '0' });
ok(gr.score === 1 && gr.score_total === 2 && gr.per_blank[0].ok && !gr.per_blank[1].ok && gr.per_blank[1].given === 'Les', 'correction GNS ' + JSON.stringify(gr.per_blank));
ok(sp.normalizeIndices('3, 1,1,x,2') === '1,2,3', 'normalisation des indices');

// ── Ponctuation
const P = sp.parsePunctuation('Le matin, Léa part à Paris. Elle prend le train ! Quelle aventure ! Où va-t-elle ? Elle visite le musée, le parc et la tour.', ['Léa', 'Paris']);
ok(!P.error, 'parse ' + P.error);
ok(P.words.join(' ') === 'le matin Léa part à Paris elle prend le train quelle aventure où va-t-elle elle visite le musée le parc et la tour', 'mots affichés : ' + P.words.join(' '));
const at = (pos) => P.blanks.find((b) => b.position === pos);
ok(at(2).correct === ',' && at(6).correct === '.' && at(10).correct === '!' && at(12).correct === '!' && at(14).correct === '?', 'positions ' + JSON.stringify(P.blanks));
ok(at(6).accepted.includes('!'), 'point : ! accepté');
ok(at(10).accepted.includes('.'), '« Elle prend le train ! » : . accepté');
ok(!at(12).accepted.includes('.'), '« Quelle aventure ! » : . refusé (exclamative)');
ok(P.sentences === 5, 'phrases ' + P.sentences);
const P2 = sp.parsePunctuation('Tom rit. Léa voit Tom.', []);
ok(P2.words[0] === 'Tom', 'nom propre en début de phrase gardé (vu en majuscule ailleurs) ' + P2.words);
const P2b = sp.parsePunctuation('Tom rit.', ['Tom']);
ok(P2b.words[0] === 'Tom', 'nom propre déclaré gardé ' + P2b.words);
const P3 = sp.parsePunctuation("Il pleut. L'orage gronde.", []);
ok(P3.words[2] === "l'orage", "majuscule retirée après élision : " + P3.words);
for (const bad of ['Il dit : bonjour.', 'Il part… vite.', 'Il part', '« Viens ! »', 'Il rit !?', 'Il part - vite.'])
  ok(sp.parsePunctuation(bad, []).error, 'refusé : ' + bad);

// ── Ponctuation : correction
const exP = { rule: 'ponctuation', blanks: P.blanks, extra: { words: P.words } };
const all = Object.fromEntries(P.blanks.map((b) => [String(b.position), b.correct]));
let r = sp.gradePunctuation(exP, all, exP.extra);
ok(r.score === r.score_total && r.score_total === P.blanks.length, 'tout juste ' + r.score + '/' + r.score_total);
r = sp.gradePunctuation(exP, { ...all, 6: '!', 3: ',', 4: '.' }, exP.extra);
ok(r.score === P.blanks.length && r.score_total === P.blanks.length + 1, '! accepté pour . ; virgule en trop tolérée ; point en trop compté ' + r.score + '/' + r.score_total);
ok(r.per_blank.some((b) => b.extra && b.position === 4), 'point en trop signalé');
r = sp.gradePunctuation(exP, {}, exP.extra);
ok(r.score === 0 && r.per_blank.every((b) => b.given === null), 'rien rempli');
ok(Object.keys(r.per_group_breakdown).includes('virgule'), 'détail par signe');

// ── Validation de la sortie LLM
ok(sp.validatePunctuation({ text: 'Il pleut. Le chat dort.', proper_nouns: [] }, 6).error, 'nombre de phrases contrôlé');
ok(sp.validatePunctuation({ text: 'Il pleut. Le chat dort. Tom rit. Léa lit. Il fait nuit.', proper_nouns: [] }, 5).error, 'question + exclamation exigées dès 5 phrases');
ok(!sp.validatePunctuation({ text: 'Il pleut. Le chat dort ! Tom rit. Où est Léa ? Il fait nuit.', proper_nouns: ['Léa'] }, 5).error, 'texte valide');
const vs = sp.validateSpan({ items: [{ prompt: '[[Le chat]] dort.', kind: 'simple', explanation: 'x' }, { prompt: '[[Le chat]] dort.', kind: 'simple', explanation: 'x' }] }, 2);
ok(vs.error, 'doublon refusé');

console.log(fail ? `${fail} échec(s)` : 'tout OK');
if (fail) process.exit(1);
