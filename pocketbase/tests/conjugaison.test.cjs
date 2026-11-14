const c = require('./load.cjs')('conjugaison.js');
let fail = 0;
const expect = {
  chanter: 'chante,chantes,chante,chantons,chantez,chantent',
  manger: 'mange,manges,mange,mangeons,mangez,mangent',
  commencer: 'commence,commences,commence,commençons,commencez,commencent',
  nettoyer: 'nettoie,nettoies,nettoie,nettoyons,nettoyez,nettoient',
  payer: 'paie|paye,paies|payes,paie|paye,payons,payez,paient|payent',
  appeler: 'appelle,appelles,appelle,appelons,appelez,appellent',
  jeter: 'jette,jettes,jette,jetons,jetez,jettent',
  acheter: 'achète,achètes,achète,achetons,achetez,achètent',
  geler: 'gèle,gèles,gèle,gelons,gelez,gèlent',
  étiqueter: 'étiquette|étiquète,étiquettes|étiquètes,étiquette|étiquète,étiquetons,étiquetez,étiquettent|étiquètent',
  épeler: 'épelle|épèle,épelles|épèles,épelle|épèle,épelons,épelez,épellent|épèlent',
  feuilleter: 'feuillette|feuillète,feuillettes|feuillètes,feuillette|feuillète,feuilletons,feuilletez,feuillettent|feuillètent',
  lever: 'lève,lèves,lève,levons,levez,lèvent',
  mener: 'mène,mènes,mène,menons,menez,mènent',
  préférer: 'préfère,préfères,préfère,préférons,préférez,préfèrent',
  répéter: 'répète,répètes,répète,répétons,répétez,répètent',
  protéger: 'protège,protèges,protège,protégeons,protégez,protègent',
  envoyer: 'envoie,envoies,envoie,envoyons,envoyez,envoient',
  crier: 'crie,cries,crie,crions,criez,crient',
  entrer: 'entre,entres,entre,entrons,entrez,entrent',
  finir: 'finis,finis,finit,finissons,finissez,finissent',
  haïr: 'hais,hais,hait,haïssons,haïssez,haïssent',
  comprendre: 'comprends,comprends,comprend,comprenons,comprenez,comprennent',
  devenir: 'deviens,deviens,devient,devenons,devenez,deviennent',
  ouvrir: 'ouvre,ouvres,ouvre,ouvrons,ouvrez,ouvrent',
  cueillir: 'cueille,cueilles,cueille,cueillons,cueillez,cueillent',
  peindre: 'peins,peins,peint,peignons,peignez,peignent',
  craindre: 'crains,crains,craint,craignons,craignez,craignent',
  conduire: 'conduis,conduis,conduit,conduisons,conduisez,conduisent',
  connaître: 'connais,connais,connaît|connait,connaissons,connaissez,connaissent',
  répondre: 'réponds,réponds,répond,répondons,répondez,répondent',
  devoir: 'dois,dois,doit,devons,devez,doivent',
  prévoir: 'prévois,prévois,prévoit,prévoyons,prévoyez,prévoient',
  'se lever': 'lève,lèves,lève,levons,levez,lèvent',
  aboyer: 'aboie,aboies,aboie,aboyons,aboyez,aboient',
  rester: 'reste,restes,reste,restons,restez,restent',
  peser: 'pèse,pèses,pèse,pesons,pesez,pèsent',
  inquiéter: 'inquiète,inquiètes,inquiète,inquiétons,inquiétez,inquiètent',
  léguer: 'lègue,lègues,lègue,léguons,léguez,lèguent',
  régner: 'règne,règnes,règne,régnons,régnez,règnent',
  créer: 'crée,crées,crée,créons,créez,créent',
  atteler: 'attelle|attèle,attelles|attèles,attelle|attèle,attelons,attelez,attellent|attèlent',
};
for (const [v, exp] of Object.entries(expect)) {
  const got = (c.conjugate(v) || []).map(f => f.join('|')).join(',');
  if (got !== exp) { fail++; console.log('✗', v, '\n   got', got, '\n   exp', exp); }
}
const groups = { aller: 3, chanter: 1, finir: 2, partir: 3, voir: 3, être: 0, avoir: 0, prendre: 3, nourrir: 2, cueillir: 3 };
for (const [v, g] of Object.entries(groups)) if (c.verbGroup(v) !== g) { fail++; console.log('✗ group', v, c.verbGroup(v)); }
// Réservoirs : { groupe ou famille : { difficulté : [verbes] } }
for (const [pool, byKey] of Object.entries(c.POOLS)) for (const [k, byDiff] of Object.entries(byKey)) for (const [d, verbs] of Object.entries(byDiff)) {
  if (!['1', '2', '3'].includes(d)) { fail++; console.log('✗ difficulté inconnue', pool, k, d); }
  for (const v of verbs) {
    if (!c.conjugate(v)) { fail++; console.log('✗ verbe non conjugable', pool, v); }
    if (pool === 'groups' && c.verbGroup(v) !== Number(k)) { fail++; console.log('✗ groupe faux', v, k, c.verbGroup(v)); }
    if ((pool === 'present' || pool === 'accord') && k !== '3' && c.verbGroup(v) !== Number(k)) { fail++; console.log('✗ groupe faux', pool, v); }
    if (pool === 'eter_eler' && !/e[lt]er$/.test(v)) { fail++; console.log('✗ pas en -eler/-eter', v); }
  }
}
// Niveaux
const tiers = { CP: 1, CE2: 1, CM1: 2, CM2: 2, '6e': 2, '5e': 3, Adulte: 3 };
for (const [g, t] of Object.entries(tiers)) if (c.levelTier(g) !== t) { fail++; console.log('✗ palier', g, c.levelTier(g)); }
if (c.conjugatedShare('CM1') !== 0 || !(c.conjugatedShare('CM2') > 0)) { fail++; console.log('✗ part de verbes conjugués'); }
// Conjugaisons ajoutées
for (const [v, exp] of Object.entries({ vêtir: 'vêts,vêts,vêt,vêtons,vêtez,vêtent', maudire: 'maudis,maudis,maudit,maudissons,maudissez,maudissent', moudre: 'mouds,mouds,moud,moulons,moulez,moulent', "s'évanouir": 'évanouis,évanouis,évanouit,évanouissons,évanouissez,évanouissent' })) {
  const got = (c.conjugate(v) || []).map(f => f.join('|')).join(',');
  if (got !== exp) { fail++; console.log('✗', v, got); }
}
if (c.verbGroup('maudire') !== 3 || c.verbGroup("s'évanouir") !== 2) { fail++; console.log('✗ groupes maudire / s\'évanouir'); }
console.log(fail ? `${fail} échec(s)` : 'tout OK', '·', Object.keys(expect).length, 'verbes vérifiés'); if (fail) process.exit(1);
