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
function validateQ(rule, items) { return ex.validateQcm({ items: items.map(([prompt, correct]) => ({ prompt, correct, explanation: '' })) }, rule, items.length).error; }
// verb groups: explanation for -oir
const vg = ex.generateVerbGroups(30); ok(vg.blanks.length === 30, '30 verbes');
for (const b of vg.blanks) if (/oir/.test(b.prompt)) ok(!/se termine par -ir/.test(b.explanation), 'explication -oir : ' + b.explanation);
ok(!vg.blanks.some(b => ['être', 'avoir'].includes(b.prompt)), 'pas d\'être/avoir');
console.log(fail ? `${fail} échec(s)` : 'tout OK'); if (fail) process.exit(1);
