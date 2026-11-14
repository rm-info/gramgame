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
	haïr: 'hais,hais,hait,haïssons,haïssez,haïssent',
	vêtir: 'vêts,vêts,vêt,vêtons,vêtez,vêtent',
	maudire: 'maudis,maudis,maudit,maudissons,maudissez,maudissent',
	moudre: 'mouds,mouds,moud,moulons,moulez,moulent'
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
const SECOND_GROUP = ['finir', 'choisir', 'grandir', 'réussir', 'rougir', 'obéir', 'désobéir', 'punir', 'remplir', 'salir', 'bâtir', 'agir', 'applaudir', 'avertir', 'blanchir', 'guérir', 'nourrir', 'ralentir', 'réfléchir', 'saisir', 'vieillir', 'maigrir', 'grossir', 'jaunir', 'noircir', 'rajeunir', 'atterrir', 'fleurir', 'unir', 'réunir', 'définir', 'envahir', 'établir', 'trahir', 'accomplir', 'avertir', 'bondir', 'durcir', 'éblouir', 'élargir', 'embellir', 'enrichir', 'faiblir', 'franchir', 'garantir', 'gémir', 'jaillir', 'mûrir', 'pâlir', 'périr', 'rafraîchir', 'ravir', 'refroidir', 'rétablir', 'rôtir', 'surgir', 'vernir', 'aboutir', 'adoucir', 'affaiblir', 'agrandir', 'alourdir', 'amortir', 'appauvrir', 'arrondir', 'assouplir', 'assombrir', 'blêmir', 'brandir', 'chérir', 'convertir', 'démolir', 'divertir', 'engloutir', 'épanouir', 'frémir', 'fournir', 'investir', 'munir', 'obscurcir', 'polir', 'raccourcir', 'raidir', 'ralentir', 'resplendir', 'ternir', 'vomir', 'évanouir', 'haïr'];

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
// Niveau scolaire → palier de difficulté
// ────────────────────────────────────────────────────────────────────────────
// Palier 1 (CP–CE2) : verbes très courants, réguliers, peu de pièges.
// Palier 2 (CM1–6e) : + les pièges classiques (aller, -ir du 3e groupe, -oir…).
// Palier 3 (5e et +) : + verbes rares ou difficiles (vêtir, bouillir, maudire…).
const LEVEL_TIER = {
	CP: 1, CE1: 1, CE2: 1,
	CM1: 2, CM2: 2, '6e': 2,
	'5e': 3, '4e': 3, '3e': 3, '2nde': 3, '1re': 3, Terminale: 3, Adulte: 3
};

function levelTier(grade) {
	return LEVEL_TIER[grade] || 2;
}

// Mélange des difficultés tirées selon le palier (poids relatifs).
const TIER_MIX = {
	1: { 1: 1 },
	2: { 1: 2, 2: 3 },
	3: { 1: 1, 2: 2, 3: 2 }
};

// Exercice des groupes : part de verbes présentés conjugués dans une phrase
// (« Ils [[partent]] demain. ») plutôt qu'à l'infinitif.
const CONJUGATED_SHARE = {
	CP: 0, CE1: 0, CE2: 0, CM1: 0,
	CM2: 0.4, '6e': 0.4,
	'5e': 0.6, '4e': 0.6, '3e': 0.6, '2nde': 0.6, '1re': 0.6, Terminale: 0.6, Adulte: 0.6
};

function conjugatedShare(grade) {
	return CONJUGATED_SHARE[grade] ?? 0.4;
}

// ────────────────────────────────────────────────────────────────────────────
// Réservoirs de verbes : { groupe ou famille : { difficulté : [verbes] } }
// ────────────────────────────────────────────────────────────────────────────
const POOLS = {
	// Présent de l'indicatif.
	present: {
		1: {
			1: ['chanter', 'jouer', 'regarder', 'aimer', 'parler', 'marcher', 'danser', 'écouter', 'porter', 'trouver', 'arriver', 'rester', 'tomber', 'penser', 'travailler', 'crier', 'oublier'],
			2: ['manger', 'ranger', 'nager', 'voyager', 'commencer', 'lancer', 'avancer', 'envoyer', 'nettoyer', 'essayer', 'payer', 'appeler', 'jeter', 'acheter', 'lever', 'mener', 'préférer', 'espérer', 'répéter'],
			3: ['protéger', 'étiqueter', 'harceler', 'renouveler', 'feuilleter', 'céder', 'célébrer', 'employer', 'créer']
		},
		2: {
			1: ['finir', 'choisir', 'grandir', 'remplir', 'rougir'],
			2: ['réussir', 'obéir', 'réfléchir', 'applaudir', 'bâtir', 'ralentir', 'guérir'],
			3: ['haïr', 'éblouir', 'frémir', 'resplendir', 'assouplir']
		},
		3: {
			1: ['être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'voir', 'pouvoir', 'vouloir', 'partir', 'dormir', 'lire', 'écrire', 'mettre'],
			2: ['savoir', 'devoir', 'sortir', 'courir', 'boire', 'croire', 'ouvrir', 'offrir', 'recevoir', 'vivre', 'suivre', 'rire', 'rendre', 'vendre', 'attendre', 'entendre', 'répondre', 'descendre', 'perdre', 'tenir', 'devenir', 'comprendre', 'apprendre', 'sentir', 'servir', 'cueillir', 'battre', 'connaître'],
			3: ['peindre', 'éteindre', 'craindre', 'conduire', 'construire', 'acquérir', 's\'asseoir', 'résoudre', 'vaincre', 'coudre', 'moudre', 'bouillir', 'fuir', 'mourir', 'valoir', 'rompre', 'vêtir', 'maudire']
		}
	},
	// -eler / -eter : consonne doublée ou accent grave.
	eter_eler: {
		double: {
			1: ['appeler', 'jeter'],
			2: ['rappeler', 'rejeter', 'projeter', 'épeler'],
			3: ['étiqueter', 'feuilleter', 'ficeler', 'renouveler', 'atteler']
		},
		grave: {
			1: ['acheter', 'geler'],
			2: ['racheter', 'congeler', 'peler', 'modeler'],
			3: ['harceler', 'marteler', 'haleter', 'ciseler', 'dégeler']
		}
	},
	// Accord sujet-verbe (la difficulté vient surtout des sujets : voir le prompt).
	accord: {
		1: {
			1: ['chanter', 'jouer', 'regarder', 'parler', 'marcher', 'arriver', 'crier', 'tomber', 'rentrer', 'habiter', 'danser'],
			2: ['manger', 'traverser', 'briller', 'travailler', 'aboyer', 'nager', 'voyager', 'commencer'],
			3: ['appeler', 'jeter', 'acheter', 'préférer', 'envoyer', 'essayer']
		},
		2: {
			1: ['finir', 'grandir', 'choisir'],
			2: ['réussir', 'applaudir', 'obéir', 'réfléchir'],
			3: ['éblouir', 'resplendir', 'frémir']
		},
		3: {
			1: ['être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'voir'],
			2: ['pouvoir', 'vouloir', 'partir', 'dormir', 'courir', 'lire', 'écrire', 'boire', 'attendre', 'entendre', 'répondre', 'mettre'],
			3: ['peindre', 'craindre', 'conduire', 'recevoir', 'connaître', 'apercevoir', 'résoudre', 'vaincre']
		}
	},
	// Groupes des verbes.
	groups: {
		1: {
			1: ['chanter', 'jouer', 'danser', 'parler', 'regarder', 'marcher', 'aimer', 'écouter', 'trouver', 'tomber', 'crier', 'oublier'],
			2: ['manger', 'lancer', 'nager', 'envoyer', 'appeler', 'acheter', 'payer', 'préférer', 'nettoyer', 'rêver', 'essayer'],
			3: ['créer', 'épier', 'harceler', 'louvoyer', 'chatoyer', 'ployer', 'ressasser']
		},
		2: {
			1: ['finir', 'choisir', 'grandir', 'remplir', 'rougir'],
			2: ['réussir', 'obéir', 'réfléchir', 'applaudir', 'bâtir', 'nourrir', 'ralentir', 'guérir', 'atterrir', 'fleurir', 'vieillir', 'maigrir', 'salir', 'punir'],
			3: ['haïr', 'assouplir', 'éblouir', 'frémir', 'resplendir', 'jaillir', 'rajeunir', 's\'évanouir', 'mûrir', 'ternir']
		},
		3: {
			1: ['faire', 'dire', 'prendre', 'mettre', 'lire', 'écrire', 'boire', 'voir', 'pouvoir', 'vouloir', 'savoir', 'rire', 'vendre', 'attendre', 'rendre'],
			2: ['aller', 'partir', 'sortir', 'dormir', 'courir', 'venir', 'tenir', 'ouvrir', 'offrir', 'cueillir', 'mourir', 'servir', 'sentir', 'mentir', 'devoir', 'recevoir', 'croire', 'vivre', 'peindre', 'connaître', 'conduire', 'fuir'],
			3: ['vêtir', 'bouillir', 'acquérir', 'conquérir', 'maudire', 's\'asseoir', 'valoir', 'vaincre', 'coudre', 'résoudre', 'rompre', 'moudre', 'plaindre', 'joindre', 'convaincre', 'interrompre']
		}
	}
};

// Exercice des groupes, mode « verbe conjugué » : un complément par verbe,
// écrit à la main pour que la phrase soit correcte à toutes les personnes
// proposées. `p` restreint les personnes quand le sens l'impose.
const GROUP_SENTENCES = {
	chanter: 'une chanson', jouer: 'au ballon', danser: 'dans le salon', parler: 'très fort',
	regarder: 'la télévision', marcher: 'dans la forêt', aimer: 'les fraises', écouter: 'de la musique',
	trouver: 'un trésor', tomber: 'dans la neige', crier: 'de joie', oublier: 'la réponse',
	manger: 'une pomme', lancer: 'le ballon', nager: 'dans la piscine', envoyer: 'une lettre',
	appeler: 'le médecin', acheter: 'du pain', payer: 'les courses', préférer: 'le chocolat',
	nettoyer: 'la cuisine', rêver: 'de vacances', essayer: 'un chapeau',
	créer: 'un jeu vidéo', épier: 'les voisins', harceler: 'le guide de questions',
	louvoyer: 'entre les rochers', chatoyer: { c: 'au soleil', p: ['3s', '3p'] },
	ployer: 'sous le poids', ressasser: 'les mêmes souvenirs',
	finir: 'le repas', choisir: 'un livre', grandir: 'très vite', remplir: 'le seau', rougir: 'de honte',
	réussir: "l'examen", obéir: 'au maître', réfléchir: 'à la question', applaudir: 'les acteurs',
	bâtir: 'une cabane', nourrir: 'les poules', ralentir: 'au virage', guérir: 'rapidement',
	atterrir: 'à Paris', fleurir: { c: 'au printemps', p: ['3s', '3p'] }, vieillir: 'doucement',
	maigrir: 'un peu', salir: 'le tapis', punir: 'le tricheur',
	haïr: 'le mensonge', assouplir: 'les règles', éblouir: 'le public', frémir: 'de peur',
	resplendir: 'de joie', jaillir: { c: 'de la roche', p: ['3s', '3p'] }, rajeunir: 'de dix ans',
	"s'évanouir": 'de fatigue', mûrir: { c: 'au soleil', p: ['3s', '3p'] },
	ternir: { c: 'avec le temps', p: ['3s', '3p'] },
	faire: 'un gâteau', dire: 'la vérité', prendre: 'le bus', mettre: 'la table', lire: 'un roman',
	écrire: 'une lettre', boire: 'du lait', voir: 'la mer', pouvoir: 'venir', vouloir: 'un gâteau',
	savoir: 'la leçon', rire: 'aux éclats', vendre: 'des fleurs', attendre: 'le train', rendre: 'les livres',
	aller: "à l'école", partir: 'en vacances', sortir: 'le soir', dormir: 'profondément',
	courir: 'dans le parc', venir: 'demain', tenir: 'la corde', ouvrir: 'la fenêtre', offrir: 'un cadeau',
	cueillir: 'des fleurs', mourir: 'de rire', servir: 'le dessert', sentir: 'le parfum', mentir: 'souvent',
	devoir: 'partir', recevoir: 'une lettre', croire: 'cette histoire', vivre: 'à la campagne',
	peindre: 'un tableau', connaître: 'la réponse', conduire: 'la voiture', fuir: 'le danger',
	vêtir: 'les enfants', bouillir: "d'impatience", acquérir: "de l'expérience", conquérir: 'le château',
	maudire: 'la pluie', "s'asseoir": 'sur le banc', valoir: { c: 'une fortune', p: ['3s', '3p'] },
	vaincre: 'la peur', coudre: 'un bouton', résoudre: "l'énigme", rompre: 'le silence', moudre: 'le café',
	plaindre: 'les victimes', joindre: 'les deux bouts', convaincre: 'le jury', interrompre: 'la réunion'
};

module.exports = {
	PERSONS,
	PERSON_LABELS,
	POOLS,
	GROUP_SENTENCES,
	TIER_MIX,
	DOUBLE_ONLY,
	GRAVE_ONLY,
	conjugate,
	conjugatePerson,
	verbGroup,
	levelTier,
	conjugatedShare
};
