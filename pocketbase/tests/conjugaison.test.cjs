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
for (const [pool, byKey] of Object.entries(c.POOLS)) for (const [k, verbs] of Object.entries(byKey)) for (const v of verbs) {
  if (!c.conjugate(v)) { fail++; console.log('✗ pool verb not conjugable', pool, v); }
  if (pool === 'groups' && c.verbGroup(v) !== Number(k)) { fail++; console.log('✗ pool group mismatch', v, k, c.verbGroup(v)); }
  if (pool === 'present' && k !== '3' && c.verbGroup(v) !== Number(k)) { fail++; console.log('✗ present group mismatch', v); }
}
console.log(fail ? `${fail} échec(s)` : 'tout OK', '·', Object.keys(expect).length, 'verbes vérifiés'); if (fail) process.exit(1);
