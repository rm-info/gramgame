// Conjugaison au présent de l'indicatif, déterministe (sans LLM).
//
// Sert à calculer les bonnes réponses des exercices de conjugaison et
// d'accord : le LLM écrit l'histoire, mais la forme attendue est calculée ici.
// Couvre le 1er groupe (y compris -cer, -ger, -yer, e→è, é→è, -eler/-eter),
// le 2e groupe (liste fermée) et les verbes du 3e groupe usuels à l'école.
// Les orthographes rectifiées (1990) sont acceptées en variante
// (ex. « il étiquète » à côté de « il étiquette », « il connait »).
//
// Personnes : 0 je · 1 tu · 2 il/elle/on · 3 nous · 4 vous · 5 ils/elles.
// conjugate(verb) → [[formes acceptées pour je], …] (1re forme = forme usuelle)
// ou null si le verbe n'est pas connu.

const PERSONS = ['1s', '2s', '3s', '1p', '2p', '3p'];
const PERSON_LABELS = {
	'1s': '1re personne du singulier (je)',
	'2s': '2e personne du singulier (tu)',
	'3s': '3e personne du singulier (il, elle, on)',
	'1p': '1re personne du pluriel (nous)',
	'2p': '2e personne du pluriel (vous)',
	'3p': '3e personne du pluriel (ils, elles)'
};

// ────────────────────────────────────────────────────────────────────────────
// 3e groupe et irréguliers : 6 formes, variantes séparées par « | »
// ────────────────────────────────────────────────────────────────────────────
const IRREGULAR = {
	être: 'suis,es,est,sommes,êtes,sont',
	avoir: 'ai,as,a,avons,avez,ont',
	aller: 'vais,vas,va,allons,allez,vont',
	faire: 'fais,fais,fait,faisons,faites,font',
	dire: 'dis,dis,dit,disons,dites,disent',
	venir: 'viens,viens,vient,venons,venez,viennent',
	tenir: 'tiens,tiens,tient,tenons,tenez,tiennent',
	prendre: 'prends,prends,prend,prenons,prenez,prennent',
	mettre: 'mets,mets,met,mettons,mettez,mettent',
	pouvoir: 'peux,peux,peut,pouvons,pouvez,peuvent',
	vouloir: 'veux,veux,veut,voulons,voulez,veulent',
	savoir: 'sais,sais,sait,savons,savez,savent',
	voir: 'vois,vois,voit,voyons,voyez,voient',
	devoir: 'dois,dois,doit,devons,devez,doivent',
	recevoir: 'reçois,reçois,reçoit,recevons,recevez,reçoivent',
	partir: 'pars,pars,part,partons,partez,partent',
	sortir: 'sors,sors,sort,sortons,sortez,sortent',
	dormir: 'dors,dors,dort,dormons,dormez,dorment',
	sentir: 'sens,sens,sent,sentons,sentez,sentent',
	mentir: 'mens,mens,ment,mentons,mentez,mentent',
	servir: 'sers,sers,sert,servons,servez,servent',
	courir: 'cours,cours,court,courons,courez,courent',
	mourir: 'meurs,meurs,meurt,mourons,mourez,meurent',
	lire: 'lis,lis,lit,lisons,lisez,lisent',
	écrire: 'écris,écris,écrit,écrivons,écrivez,écrivent',
	boire: 'bois,bois,boit,buvons,buvez,boivent',
	croire: 'crois,crois,croit,croyons,croyez,croient',
	rire: 'ris,ris,rit,rions,riez,rient',
	vivre: 'vis,vis,vit,vivons,vivez,vivent',
	suivre: 'suis,suis,suit,suivons,suivez,suivent',
	battre: 'bats,bats,bat,battons,battez,battent',
	plaire: 'plais,plais,plaît|plait,plaisons,plaisez,plaisent',
	taire: 'tais,tais,tait,taisons,taisez,taisent',
	fuir: 'fuis,fuis,fuit,fuyons,fuyez,fuient',
	bouillir: 'bous,bous,bout,bouillons,bouillez,bouillent',
	acquérir: 'acquiers,acquiers,acquiert,acquérons,acquérez,acquièrent',
	conquérir: 'conquiers,conquiers,conquiert,conquérons,conquérez,conquièrent',
	asseoir: 'assieds|assois,assieds|assois,assied|assoit,asseyons|assoyons,asseyez|assoyez,asseyent|assoient',
	valoir: 'vaux,vaux,vaut,valons,valez,valent',
	rompre: 'romps,romps,rompt,rompons,rompez,rompent',
	vaincre: 'vaincs,vaincs,vainc,vainquons,vainquez,vainquent',
	convaincre: 'convaincs,convaincs,convainc,convainquons,convainquez,convainquent',
	coudre: 'couds,couds,coud,cousons,cousez,cousent',
	résoudre: 'résous,résous,résout,résolvons,résolvez,résolvent',
	haïr: 'hais,hais,hait,haïssons,haïssez,haïssent'
};

// Dérivés conjugués comme leur base (préfixe + formes de la base).
const DERIVED = {
	venir: ['devenir', 'revenir', 'prévenir', 'parvenir', 'intervenir', 'convenir', 'souvenir', 'survenir'],
	tenir: ['obtenir', 'retenir', 'appartenir', 'contenir', 'maintenir', 'soutenir', 'entretenir', 'détenir'],
	prendre: ['apprendre', 'comprendre', 'surprendre', 'reprendre', 'entreprendre'],
	mettre: ['permettre', 'promettre', 'remettre', 'admettre', 'soumettre', 'commettre', 'transmettre'],
	voir: ['revoir', 'entrevoir', 'prévoir'],
	recevoir: ['apercevoir', 'décevoir', 'concevoir'],
	partir: ['repartir'],
	sortir: ['ressortir'],
	dormir: ['endormir', 'rendormir'],
	sentir: ['ressentir', 'consentir'],
	mentir: ['démentir'],
	servir: ['desservir', 'resservir'],
	courir: ['parcourir', 'secourir', 'accourir', 'recourir'],
	lire: ['relire', 'élire'],
	écrire: ['décrire', 'inscrire', 'réécrire', 'prescrire'],
	rire: ['sourire'],
	vivre: ['survivre', 'revivre'],
	suivre: ['poursuivre'],
	battre: ['combattre', 'abattre', 'débattre'],
	plaire: ['déplaire'],
	faire: ['refaire', 'défaire'],
	dire: ['redire'],
	rompre: ['interrompre', 'corrompre'],
	fuir: ['enfuir']
};

// Verbes en -ir / -re conjugués comme un verbe en -er (j'ouvre, tu ouvres…).
const LIKE_ER = ['ouvrir', 'rouvrir', 'couvrir', 'découvrir', 'recouvrir', 'offrir', 'souffrir', 'cueillir', 'accueillir', 'recueillir'];

// Familles régulières du 3e groupe.
const DRE = ['rendre', 'vendre', 'attendre', 'entendre', 'descendre', 'répondre', 'perdre', 'mordre', 'tordre', 'défendre', 'fondre', 'pendre', 'tendre', 'étendre', 'confondre', 'correspondre', 'suspendre', 'dépendre', 'prétendre', 'tondre', 'pondre', 'fendre', 'répandre', 'détendre', 'revendre', 'redescendre', 'mordre'];
const INDRE = ['peindre', 'éteindre', 'craindre', 'plaindre', 'joindre', 'atteindre', 'teindre', 'rejoindre', 'contraindre', 'feindre', 'repeindre'];
const UIRE = ['conduire', 'construire', 'détruire', 'produire', 'traduire', 'cuire', 'réduire', 'séduire', 'introduire', 'instruire', 'reconstruire'];
const AITRE = ['connaître', 'reconnaître', 'paraître', 'apparaître', 'disparaître', 'naître', 'méconnaître'];

// 2e groupe : verbes en -ir qui font « nous …issons » (liste fermée).
const SECOND_GROUP = ['finir', 'choisir', 'grandir', 'réussir', 'rougir', 'obéir', 'désobéir', 'punir', 'remplir', 'salir', 'bâtir', 'agir', 'applaudir', 'avertir', 'blanchir', 'guérir', 'nourrir', 'ralentir', 'réfléchir', 'saisir', 'vieillir', 'maigrir', 'grossir', 'jaunir', 'noircir', 'rajeunir', 'atterrir', 'fleurir', 'unir', 'réunir', 'définir', 'envahir', 'établir', 'trahir', 'accomplir', 'avertir', 'bondir', 'durcir', 'éblouir', 'élargir', 'embellir', 'enrichir', 'faiblir', 'franchir', 'garantir', 'gémir', 'jaillir', 'mûrir', 'pâlir', 'périr', 'rafraîchir', 'ravir', 'refroidir', 'rétablir', 'rôtir', 'surgir', 'vernir', 'aboutir', 'adoucir', 'affaiblir', 'agrandir', 'alourdir', 'amortir', 'appauvrir', 'arrondir', 'assouplir', 'assombrir', 'blêmir', 'brandir', 'chérir', 'convertir', 'démolir', 'divertir', 'engloutir', 'épanouir', 'frémir', 'fournir', 'investir', 'munir', 'obscurcir', 'polir', 'raccourcir', 'raidir', 'ralentir', 'resplendir', 'ternir', 'vomir', 'haïr'];

// -eler / -eter : doublent la consonne (seuls appeler, jeter et leurs dérivés
// restent obligatoirement doublés après la réforme de 1990).
const DOUBLE_ONLY = ['appeler', 'rappeler', 'jeter', 'rejeter', 'projeter', 'interjeter', 'déjeter'];
// -eler / -eter : prennent un accent grave (è), y compris en orthographe traditionnelle.
const GRAVE_ONLY = ['acheter', 'racheter', 'geler', 'dégeler', 'congeler', 'surgeler', 'peler', 'modeler', 'remodeler', 'ciseler', 'démanteler', 'écarteler', 'harceler', 'marteler', 'crocheter', 'fureter', 'haleter', 'corseter'];

const VOWELS = 'aeiouyéèêëàâîïôûùœ';
const isVowel = (c) => !!c && VOWELS.includes(c);

function split(forms) {
	return forms.split(',').map((f) => f.split('|'));
}

function fromBase(prefix, base) {
	return split(IRREGULAR[base]).map((variants) => variants.map((f) => prefix + f));
}

/** Variante réforme 1990 : î → i (connaît → connait, plaît → plait). */
function withCircumflexVariant(form) {
	return form.includes('î') ? [form, form.replace(/î/g, 'i')] : [form];
}

function conjugateFirstGroup(verb) {
	const stem = verb.slice(0, -2);
	const endings = ['e', 'es', 'e', 'ons', 'ez', 'ent'];
	const out = [];

	for (let p = 0; p < 6; p++) {
		const mute = p !== 3 && p !== 4; // terminaison muette : e, es, e, ent
		let stems = [stem];

		if (!mute) {
			if (p === 3 && stem.endsWith('c')) stems = [stem.slice(0, -1) + 'ç'];
			else if (p === 3 && stem.endsWith('g')) stems = [stem + 'e'];
		} else if (stem.endsWith('y')) {
			const before = stem.slice(0, -1);
			if (before.endsWith('a')) stems = [before + 'i', stem]; // paie / paye
			else if (before.endsWith('o') || before.endsWith('u')) stems = [before + 'i']; // nettoie, essuie
			// -eyer : inchangé
		} else if (DOUBLE_ONLY.includes(verb)) {
			stems = [stem + stem.slice(-1)];
		} else if (GRAVE_ONLY.includes(verb)) {
			stems = [graveOnLastE(stem)];
		} else if (/[^aeiouyéèêëàâîïôûù]e[lt]$/.test(stem) || /que[lt]$/.test(stem)) {
			// Autres -eler / -eter : consonne doublée (usage), è accepté (réforme 1990).
			stems = [stem + stem.slice(-1), graveOnLastE(stem)];
		} else if (stem.length >= 3 && stem[stem.length - 2] === 'e' && !isVowel(stem[stem.length - 1]) && !isVowel(stem[stem.length - 3])) {
			// e muet + une consonne : mener → je mène, lever → je lève.
			stems = [graveOnLastE(stem)];
		} else if (/é((?:gu|qu|[^aeiouyéèêëàâîïôûù])+)$/.test(stem)) {
			// é + consonne(s) : préférer → je préfère.
			stems = [stem.replace(/é((?:gu|qu|[^aeiouyéèêëàâîïôûù])+)$/, 'è$1')];
		}

		out.push(stems.map((s) => s + endings[p]));
	}
	return out;
}

function graveOnLastE(stem) {
	const i = stem.lastIndexOf('e');
	return stem.slice(0, i) + 'è' + stem.slice(i + 1);
}

function conjugate(rawVerb) {
	let verb = String(rawVerb || '').trim().toLowerCase();
	verb = verb.replace(/^(se |s')/, ''); // verbes pronominaux : on conjugue le verbe seul

	if (IRREGULAR[verb]) return split(IRREGULAR[verb]);
	for (const base of Object.keys(DERIVED)) {
		if (DERIVED[base].includes(verb)) return fromBase(verb.slice(0, verb.length - base.length), base);
	}
	if (LIKE_ER.includes(verb)) {
		const stem = verb.slice(0, -2);
		return ['e', 'es', 'e', 'ons', 'ez', 'ent'].map((e) => [stem + e]);
	}
	if (DRE.includes(verb)) {
		const stem = verb.slice(0, -2);
		return ['s', 's', '', 'ons', 'ez', 'ent'].map((e) => [stem + e]);
	}
	if (INDRE.includes(verb)) {
		const stem = verb.slice(0, -4); // pei(ndre)
		return ['ns', 'ns', 'nt', 'gnons', 'gnez', 'gnent'].map((e) => [stem + e]);
	}
	if (UIRE.includes(verb)) {
		const stem = verb.slice(0, -2); // condui(re)
		return ['s', 's', 't', 'sons', 'sez', 'sent'].map((e) => [stem + e]);
	}
	if (AITRE.includes(verb)) {
		const stem = verb.slice(0, -5); // conn(aître)
		return ['ais', 'ais', 'aît', 'aissons', 'aissez', 'aissent'].map((e) => withCircumflexVariant(stem + e));
	}
	if (SECOND_GROUP.includes(verb)) {
		const stem = verb.slice(0, -2);
		return ['is', 'is', 'it', 'issons', 'issez', 'issent'].map((e) => [stem + e]);
	}
	if (verb.endsWith('er') && verb.length > 2) return conjugateFirstGroup(verb);
	return null;
}

/** Formes acceptées pour une personne ('1s'…'3p'), ou null. */
function conjugatePerson(verb, person) {
	const forms = conjugate(verb);
	const i = PERSONS.indexOf(person);
	if (!forms || i < 0) return null;
	return forms[i];
}

/** 0 = auxiliaire (être, avoir : hors groupes), 1, 2, 3 ; null si inconnu. */
function verbGroup(rawVerb) {
	const verb = String(rawVerb || '').trim().toLowerCase().replace(/^(se |s')/, '');
	if (verb === 'être' || verb === 'avoir') return 0;
	if (verb === 'aller') return 3;
	if (SECOND_GROUP.includes(verb)) return 2;
	if (verb.endsWith('er')) return 1;
	if (conjugate(verb)) return 3;
	return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Réservoirs de verbes par exercice
// ────────────────────────────────────────────────────────────────────────────
const POOLS = {
	// Présent de l'indicatif : les 3 groupes, verbes très courants.
	present: {
		1: ['chanter', 'jouer', 'regarder', 'aimer', 'parler', 'marcher', 'danser', 'écouter', 'porter', 'ranger', 'manger', 'commencer', 'lancer', 'avancer', 'nager', 'voyager', 'envoyer', 'nettoyer', 'essayer', 'payer', 'appeler', 'jeter', 'acheter', 'lever', 'mener', 'préférer', 'espérer', 'répéter', 'crier', 'oublier', 'trouver', 'arriver', 'rester', 'tomber', 'penser', 'travailler'],
		2: ['finir', 'choisir', 'grandir', 'réussir', 'obéir', 'remplir', 'réfléchir', 'applaudir', 'rougir', 'bâtir', 'ralentir', 'guérir'],
		3: ['être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'mettre', 'pouvoir', 'vouloir', 'savoir', 'voir', 'devoir', 'partir', 'sortir', 'dormir', 'courir', 'lire', 'écrire', 'boire', 'croire', 'ouvrir', 'offrir', 'recevoir', 'connaître', 'vivre', 'suivre', 'rire', 'rendre', 'vendre', 'attendre', 'entendre', 'répondre', 'descendre', 'perdre', 'peindre', 'éteindre', 'craindre', 'conduire', 'construire', 'tenir', 'devenir', 'comprendre', 'apprendre', 'sentir', 'servir', 'cueillir', 'battre']
	},
	// -eler / -eter : les deux familles + pièges.
	eter_eler: {
		double: ['appeler', 'rappeler', 'jeter', 'rejeter', 'projeter', 'épeler', 'étiqueter', 'feuilleter', 'ficeler', 'renouveler', 'atteler'],
		grave: ['acheter', 'racheter', 'geler', 'congeler', 'peler', 'modeler', 'harceler', 'marteler', 'haleter']
	},
	// Accord sujet-verbe : verbes fréquents dont la 3e personne du singulier et
	// du pluriel diffèrent à l'écrit ET à l'oral ou à l'écrit seulement.
	accord: {
		1: ['chanter', 'jouer', 'regarder', 'parler', 'marcher', 'arriver', 'manger', 'crier', 'travailler', 'traverser', 'aboyer', 'briller', 'tomber', 'rentrer', 'habiter'],
		2: ['finir', 'grandir', 'choisir', 'réussir', 'applaudir', 'obéir'],
		3: ['être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'pouvoir', 'vouloir', 'voir', 'partir', 'dormir', 'courir', 'lire', 'écrire', 'boire', 'attendre', 'entendre', 'répondre', 'mettre']
	},
	// Groupes des verbes : pièges inclus (aller, -ir du 3e groupe, -oir, -re).
	groups: {
		1: ['chanter', 'jouer', 'manger', 'lancer', 'envoyer', 'appeler', 'acheter', 'crier', 'nager', 'oublier', 'préférer', 'payer', 'tomber', 'trouver', 'rêver', 'nettoyer'],
		2: ['finir', 'choisir', 'grandir', 'réussir', 'obéir', 'remplir', 'réfléchir', 'applaudir', 'rougir', 'bâtir', 'nourrir', 'ralentir', 'guérir', 'atterrir', 'fleurir', 'vieillir'],
		3: ['aller', 'partir', 'sortir', 'dormir', 'courir', 'venir', 'tenir', 'ouvrir', 'offrir', 'cueillir', 'mourir', 'servir', 'sentir', 'mentir', 'fuir', 'voir', 'pouvoir', 'vouloir', 'savoir', 'devoir', 'recevoir', 'prendre', 'mettre', 'faire', 'dire', 'lire', 'écrire', 'boire', 'croire', 'rire', 'vivre', 'rendre', 'vendre', 'attendre', 'peindre', 'connaître', 'conduire']
	}
};

module.exports = {
	PERSONS,
	PERSON_LABELS,
	POOLS,
	DOUBLE_ONLY,
	GRAVE_ONLY,
	conjugate,
	conjugatePerson,
	verbGroup
};
