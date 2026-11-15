const ex = require('./load.cjs')('exercises.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } };
// classifyProche
const P = { 'vient de manger': 'passé proche', "vient d'arriver": 'passé proche', 'va partir': 'futur proche', 'va au marché': 'présent',
  'vient de Lyon': 'présent', 'vont le dire': 'futur proche', 'ne va pas partir': 'futur proche', 'va': 'présent', 'mange': 'présent',
  'allons y aller': 'futur proche', 'viennent de finir': 'passé proche', 'vas leur parler': 'futur proche', 'vient du marché': 'présent', 'va bien': 'présent' };
for (const [s, e] of Object.entries(P)) ok(ex.classifyProche(s) === e, `proche "${s}" → ${ex.classifyProche(s)} (attendu ${e})`);
// checkPronoun
const N = [['La maîtresse','elle',null],['La maîtresse','il','err'],['Les chiens du voisin','ils',null],['Les chiens du voisin','il','err'],
  ['Ma sœur et moi','nous',null],['Ma sœur et moi','elles','err'],['Toi et Paul','vous',null],['Le facteur','elle','err'],
  ['Mes sœurs et mon cousin','ils',null],['Léa','elle',null],['Léa et Tom','il','err'],['Le chat des voisins','il',null],['Les filles','vous','err'],['Il','il','err']];
for (const [gns, a, e] of N) ok((ex.checkPronoun(gns, a) === null) === (e === null), `pronom "${gns}" + ${a} → ${ex.checkPronoun(gns, a)}`);
// personFromContext
const C = [['Ce matin, nous ', '', '1p'], ["Puis j'", '', '1s'], ['Les enfants ', '', null], ['Il les ', '', '3s'], ['Les oiseaux les ', '', null],
  ['Nous nous ', '', '1p'], ['Il nous ', '', '3s'], ['Le chien nous ', '', null], ['Pourquoi ', '-tu', '2s'], ['Où ', '-t-il', '3s'],
  ['Elle ne ', '', '3s'], ['Paul et moi, nous ', '', '1p'], ['Vous ', '', '2p'], ['qu\'elles ', '', '3p']];
for (const [b, a, e] of C) ok(ex.personFromContext(b, a) === e, `contexte "${b}…${a}" → ${ex.personFromContext(b, a)} (attendu ${e})`);
// Virgule avant « nous » / « vous » : ambigu, on suit le sujet déclaré.
ok(ex.personFromContext('Le forgeron, ravi, nous ', ' donne du pain.', 'Le forgeron') === null, 'incise + nous complément');
ok(ex.personFromContext('Soudain, nous ', ' partons.', 'nous') === '1p', 'virgule + nous sujet');
ok(ex.personFromContext('Le soir, ils ', ' partent.', 'ils') === '3p', 'virgule + ils');
// Élision oubliée : « le {{1}} » devant appellent → refus ; « l'{{1}} » → OK.
{
  const a1 = [{ verb: 'appeler', person: '3p', category: 'x' }];
  const rep = ex.validateConj({ text: 'Les habitants le {{1}} Gros Marteau.', blanks: [{ position: 1, verb: 'appeler', person: '3p', subject: 'Les habitants' }] }, a1);
  ok(!rep.error && rep.text === "Les habitants l'{{1}} Gros Marteau.", 'élision oubliée réparée : ' + (rep.error || rep.text));
  const a2 = [{ verb: 'appeler', person: '3s', category: 'x' }, { verb: 'aimer', person: '1s', category: 'x' }];
  const rep2 = ex.validateConj({ text: 'Elle me {{1}} souvent. Je {{2}} ça.', blanks: [{ position: 1, verb: 'appeler', person: '3s', subject: 'Elle' }, { position: 2, verb: 'aimer', person: '1s', subject: 'je' }] }, a2);
  ok(!rep2.error && rep2.text === "Elle m'{{1}} souvent. J'{{2}} ça.", 'élisions me / je : ' + (rep2.error || rep2.text));
  ok(!ex.validateConj({ text: "Les habitants l'{{1}} Gros Marteau.", blanks: [{ position: 1, verb: 'appeler', person: '3p', subject: 'Les habitants' }] }, a1).error, 'élision OK');
}
// validateConj rejects wrong person in text
const assign = [{ verb: 'jeter', person: '3p', category: 'x' }, { verb: 'acheter', person: '1s', category: 'y' }];
ok(!ex.validateConj({ text: "Ils {{1}} les papiers. J'{{2}} du pain.", blanks: [{ position: 1, verb: 'jeter', person: '3p', subject: 'ils' }, { position: 2, verb: 'acheter', person: '1s', subject: 'je' }] }, assign).error, 'validateConj OK');
ok(ex.validateConj({ text: "Il {{1}} les papiers. J'{{2}} du pain.", blanks: [{ position: 1, verb: 'jeter', person: '3p', subject: 'il' }, { position: 2, verb: 'acheter', person: '1s', subject: 'je' }] }, assign).error, 'validateConj doit refuser « Il » pour 3p');
ok(ex.validateConj({ text: "Ils {{1}} (jeter) les papiers. J'{{2}} du pain.", blanks: [{ position: 1, verb: 'jeter', person: '3p' }, { position: 2, verb: 'acheter', person: '1s' }] }, assign).error, 'validateConj doit refuser l\'indice entre parenthèses');
ok(ex.validateConj({ text: "Ils {{1}} les papiers. J'{{2}} du pain.", blanks: [{ position: 1, verb: 'lancer', person: '3p' }, { position: 2, verb: 'acheter', person: '1s' }] }, assign).error, 'validateConj doit refuser un autre verbe');
const r = ex.validateConj({ text: "Les enfants {{1}} les papiers. J'{{2}} du pain.", blanks: [{ position: 1, verb: 'se jeter', person: '3p', subject: 'Les enfants' }, { position: 2, verb: 'acheter', person: '1s', subject: 'je' }] }, assign);
ok(!r.error && r.blanks[0].correct === 'jettent' && r.blanks[1].correct === 'achète', 'réponses calculées ' + JSON.stringify(r));
// validateQcm rejects LLM mistakes
const ruleP = { candidates: ['passé proche', 'futur proche', 'présent'], config: { check: 'proche', highlight: true, balance: true } };
ok(validateQ(ruleP, [['Il [[va au]] marché.', 'futur proche']]), 'QCM proche faux doit être refusé');
const ruleN = { candidates: ['il', 'elle', 'ils', 'elles', 'nous', 'vous'], config: { check: 'pronom', highlight: true } };
ok(validateQ(ruleN, [['[[Les chats]] dorment.', 'il']]), 'QCM pronom faux doit être refusé');
ok(validateQ(ruleN, [['Les chats dorment.', 'ils']]), 'QCM sans [[ ]] doit être refusé');
// Questions mélangées : le LLM les rend souvent groupées par réponse.
{
  const grouped = [];
  for (const v of ['vient de partir', 'vient de manger', 'vient de lire', 'vient de finir']) grouped.push(['Il [[' + v + ']] tôt.', 'passé proche']);
  for (const v of ['va partir', 'va manger', 'va lire', 'va finir']) grouped.push(['Elle [[' + v + ']] tard.', 'futur proche']);
  for (const v of ['mange', 'lit', 'part', 'finit']) grouped.push(['Tom [[' + v + ']] vite.', 'présent']);
  const items = grouped.map(([prompt, correct]) => ({ prompt, correct, explanation: '' }));
  let shuffled = 0;
  for (let k = 0; k < 20; k++) {
    const v = ex.validateQcm({ items }, ruleP, items.length);
    ok(!v.error, 'QCM groupé valide : ' + v.error);
    ok(v.blanks.map((b) => b.position).join() === items.map((_, i) => i + 1).join(), 'positions 1..n');
    ok(v.blanks.map((b) => b.prompt).sort().join() === items.map((x) => x.prompt).sort().join(), 'mêmes questions');
    ok(v.blanks.every((b) => b.correct === items.find((x) => x.prompt === b.prompt).correct), 'réponse suit sa question');
    if (v.blanks.map((b) => b.prompt).join() !== items.map((x) => x.prompt).join()) shuffled++;
  }
  ok(shuffled >= 18, 'questions mélangées (' + shuffled + '/20)');
}
function validateQ(rule, items) { return ex.validateQcm({ items: items.map(([prompt, correct]) => ({ prompt, correct, explanation: '' })) }, rule, items.length).error; }
// verb groups: explanation for -oir
const vg = ex.generateVerbGroups(30); ok(vg.blanks.length === 30, '30 verbes');
for (const b of vg.blanks) if ((b.verb || b.prompt).endsWith('oir')) ok(!/se termine par -ir/.test(b.explanation), 'explication -oir : ' + b.explanation);
ok(!vg.blanks.some(b => ['être', 'avoir'].includes(b.prompt)), 'pas d\'être/avoir');
// Phrases « verbe conjugué » : toutes les combinaisons verbe × personne autorisée
const conj = require('./load.cjs')('conjugaison.js');
for (const g of Object.values(conj.POOLS.groups)) for (const list of Object.values(g)) for (const v of list) {
  const e = conj.GROUP_SENTENCES[v];
  ok(!!e, 'complément manquant pour ' + v);
  const ps = (e && typeof e === 'object' && e.p) || conj.PERSONS;
  for (const p of ps) {
    const r = ex.buildGroupSentence(v, p);
    ok(r && r.sentence.includes(`[[${conj.conjugatePerson(v, p)[0]}]]`) && /^[A-ZÉ]/.test(r.sentence) && r.sentence.endsWith('.'), `phrase ${v} ${p} : ${r && r.sentence}`);
    if (r && /^(s'|se )/.test(v)) ok(/(m'|t'|s'|nous nous |vous vous |me |te |se )\[\[/i.test(r.sentence), 'pronom réfléchi : ' + r.sentence);
    if (r && e.p) ok(!/^On /.test(r.sentence), 'pas de « on » pour un sujet inanimé : ' + r.sentence);
  }
}
// Niveaux
const easy = new Set(); for (const g of Object.values(conj.POOLS.groups)) for (const v of g[1]) easy.add(v);
for (let k = 0; k < 20; k++) {
  const ce1 = ex.generateVerbGroups(15, 'CE1');
  ok(ce1.blanks.every(b => !b.prompt.includes('[[')), 'CE1 : pas de phrases');
  ok(ce1.blanks.every(b => easy.has(b.prompt) || b.prompt === 'aller'), 'CE1 : verbes faciles seulement ' + ce1.blanks.map(b => b.prompt));
  const cm2 = ex.generateVerbGroups(10, 'CM2');
  ok(cm2.blanks.filter(b => b.prompt.includes('[[')).length === 4, 'CM2 : 40 % de phrases');
  ok(cm2.blanks.every(b => b.correct === b.category && /groupe/.test(b.correct)), 'CM2 : réponses');
}
const a5 = ex.pickConjAssignments({ config: { pool: 'accord' } }, 12, 'CE2');
ok(a5.every(a => a.person === '3s' || a.person === '3p'), 'accord CE2 : 3e personne seulement');
// Toutes les personnes dans les exercices de conjugaison
for (const [pool, n] of [['present', 6], ['present', 12], ['present', 4], ['eter_eler', 6], ['eter_eler', 20], ['eter_eler', 3]]) {
  for (let k = 0; k < 50; k++) {
    const set = new Set(ex.pickConjAssignments({ config: { pool } }, n, 'CM2').map((a) => a.person));
    ok(set.size === Math.min(6, n), `${pool} ${n} trous : ${set.size} personnes différentes`);
  }
}
// Explications des erreurs au clavier
const e1 = ex.explainTypedError({ verb: 'aboyer', person: '3p', subject: 'Les chiens', correct: 'aboient' }, 'aboyent');
ok(/-oyer/.test(e1), 'explication -oyer : ' + e1);
const e2 = ex.explainTypedError({ verb: 'aboyer', person: '3p', subject: 'Les chiens', correct: 'aboient' }, 'aboie');
ok(/bonne forme pour/.test(e2) && /Les chiens/.test(e2), 'erreur d\'accord détectée : ' + e2);
const e3 = ex.explainTypedError({ verb: 'venir', person: '3p', subject: 'ils', correct: 'viennent' }, 'vienent');
ok(/irrégulier/.test(e3) && /ils viennent/.test(e3), 'tableau du verbe irrégulier : ' + e3);
const cj = require('./load.cjs')('conjugaison.js');
for (const g of Object.values(cj.POOLS)) for (const byDiff of Object.values(g)) for (const list of Object.values(byDiff)) for (const v of list)
  for (const p of cj.PERSONS) ok(cj.explainForm(v, p).length > 10, `explication vide pour ${v} ${p}`);
// Anti-répétition : on tire d'abord ce que l'élève n'a pas vu récemment
{
  const recent = ex.recencyMap([['a', 'b'], ['c']]);
  ok(recent.get('a') === 0 && recent.get('c') === 1, 'recencyMap');
  for (let k = 0; k < 20; k++) {
    const d = ex.drawN(['a', 'b', 'c', 'd', 'e'], 3, recent);
    ok(d.slice(0, 2).sort().join() === 'd,e' && d[2] === 'c', 'frais d\'abord, puis le plus ancien : ' + d);
  }
  // Élève de CE2 qui enchaîne 3 exercices de 15 verbes (groupes) : aucun verbe
  // ne revient d'un exercice à l'autre (hors « aller », remis exprès parfois).
  const history = [];
  let repeats = 0;
  for (let k = 0; k < 3; k++) {
    const verbs = ex.generateVerbGroups(15, 'CE2', ex.recencyMap(history)).blanks.map((b) => b.verb || b.prompt);
    const seen = new Set(history.flat());
    repeats += verbs.filter((v) => seen.has(v) && v !== 'aller').length;
    history.unshift(verbs);
  }
  ok(repeats === 0, `groupes CE2 : ${repeats} verbe(s) répété(s) sur 3 exercices`);
  // Présent, CM2, 3 exercices de 20 trous : pas de verbe répété.
  const hist2 = [];
  let rep2 = 0;
  for (let k = 0; k < 3; k++) {
    const verbs = ex.pickConjAssignments({ config: { pool: 'present' } }, 20, 'CM2', ex.recencyMap(hist2)).map((a) => a.verb);
    const seen = new Set(hist2.flat());
    rep2 += verbs.filter((v) => seen.has(v)).length;
    hist2.unshift(verbs);
  }
  ok(rep2 === 0, `présent CM2 : ${rep2} verbe(s) répété(s) sur 3 exercices`);
}
// Homophones : élision oubliée devant un trou qui commence par une voyelle.
{
  const gram = require('./load.cjs')('gram.js');
  const rule = { candidates: ['a', 'à'], groups: null };
  const v = gram.validateExercise({ text: "Personne ne {{1}} vu. Il pense {{2}} elle. Que {{3}} -t-il dit ? Il le {{4}} vu jusque {{5}} midi. Donne-le {{6}} Paul. Le {{7}} rien.",
    blanks: [1, 2, 3, 4, 5, 6, 7].map((p) => ({ position: p, correct: [2, 5, 6].includes(p) ? 'à' : 'a' })) }, rule, 7);
  ok(!v.error && v.text === "Personne n'{{1}} vu. Il pense {{2}} elle. Qu'{{3}} -t-il dit ? Il l'{{4}} vu jusqu'{{5}} midi. Donne-le {{6}} Paul. L'{{7}} rien.", 'élisions homophones : ' + (v.error || v.text));
  const s = gram.validateExercise({ text: 'Ils ne {{1}} pas là.', blanks: [{ position: 1, correct: 'sont' }] }, { candidates: ['son', 'sont'], groups: null }, 1);
  ok(s.text === 'Ils ne {{1}} pas là.', 'pas d’élision devant une consonne : ' + s.text);
}
console.log(fail ? `${fail} échec(s)` : 'tout OK'); if (fail) process.exit(1);
