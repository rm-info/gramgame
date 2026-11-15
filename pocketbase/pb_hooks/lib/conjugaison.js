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

// Mots en h muet (élision : j'habite, je m'habille). Les autres h sont
// aspirés : je hais, je harcèle, je hurle.
const H_MUET = /^(habit|habill|hésit|héberg|hérit|honor|humili|hum[ae]|hydrat)/i;

/** « je », « me », « te », « se » s'élident-ils devant ce mot ? */
function elidesBefore(word) {
	const w = String(word || '');
	return isVowel(w[0] && w[0].toLowerCase()) || H_MUET.test(w);
}

function split(forms) {
	return forms.split(',').map((f) => f.split('|'));
}

/**
 * Formes d'un dérivé à partir de sa base. Le dérivé ne se termine pas
 * toujours par la base : « apercevoir » ne partage que « -cevoir » avec
 * « recevoir ». On remplace donc ce qui précède la partie commune
 * (« re » → « aper ») : reçois → aperçois, recevons → apercevons.
 */
function fromBase(verb, base) {
	let common = 0;
	while (common < base.length && verb[verb.length - 1 - common] === base[base.length - 1 - common]) common++;
	const cut = base.length - common;
	const prefix = verb.slice(0, verb.length - common);
	return split(IRREGULAR[base]).map((variants) => variants.map((f) => prefix + f.slice(cut)));
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
		if (DERIVED[base].includes(verb)) return fromBase(verb, base);
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
// Explications (affichées après une erreur, sans LLM)
// ────────────────────────────────────────────────────────────────────────────
const SUBJECT_OF = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];
const PERSON_SHORT = { '1s': 'je', '2s': 'tu', '3s': 'il / elle / on', '1p': 'nous', '2p': 'vous', '3p': 'ils / elles' };
const PERSON_NAMES = {
	'1s': '1re personne du singulier',
	'2s': '2e personne du singulier',
	'3s': '3e personne du singulier',
	'1p': '1re personne du pluriel',
	'2p': '2e personne du pluriel',
	'3p': '3e personne du pluriel'
};

function bare(verb) {
	return String(verb || '').trim().toLowerCase().replace(/^(se |s')/, '');
}

/** Particularité orthographique d'un verbe du 1er groupe (même logique que conjugateFirstGroup). */
function firstGroupRule(verb) {
	const stem = verb.slice(0, -2);
	if (stem.endsWith('y')) {
		const before = stem.slice(0, -1);
		if (before.endsWith('a')) return 'ayer';
		if (before.endsWith('o') || before.endsWith('u')) return 'oyer';
		return 'eyer';
	}
	if (DOUBLE_ONLY.includes(verb)) return 'double';
	if (GRAVE_ONLY.includes(verb)) return 'grave';
	if (/[^aeiouyéèêëàâîïôûù]e[lt]$/.test(stem) || /que[lt]$/.test(stem)) return 'double_reform';
	if (stem.length >= 3 && stem[stem.length - 2] === 'e' && !isVowel(stem[stem.length - 1]) && !isVowel(stem[stem.length - 3])) return 'e_grave';
	if (/é((?:gu|qu|[^aeiouyéèêëàâîïôûù])+)$/.test(stem)) return 'e_acute';
	return 'regular';
}

const REFLEXIVE_OF = ['me', 'te', 'se', 'nous', 'vous', 'se'];

/** « je viens, tu viens, il vient, … » (élision de je / me / te / se). */
function paradigm(rawVerb) {
	const pronominal = /^(se |s')/.test(String(rawVerb).trim());
	const forms = conjugate(bare(rawVerb));
	if (!forms) return '';
	const elide = (w, next) => (/^(je|me|te|se)$/.test(w) && elidesBefore(next) ? `${w.slice(0, -1)}'` : `${w} `);
	return forms
		.map((f, i) => {
			const v = f[0];
			if (pronominal) return elide(SUBJECT_OF[i], REFLEXIVE_OF[i]) + elide(REFLEXIVE_OF[i], v) + v;
			return elide(SUBJECT_OF[i], v) + v;
		})
		.join(', ');
}

/**
 * Explication de la forme attendue pour (verbe, personne) : la règle qui
 * s'applique, ou le tableau complet pour un verbe irrégulier.
 */
function explainForm(rawVerb, person) {
	const verb = bare(rawVerb);
	const shown = String(rawVerb || '').trim().toLowerCase(); // « s'asseoir »
	const forms = conjugatePerson(verb, person);
	if (!forms) return '';
	const form = forms[0];
	const group = verbGroup(verb);
	const mute = person !== '1p' && person !== '2p';
	const nous = (conjugatePerson(verb, '1p') || [''])[0];

	if (group === 1) {
		const rule = firstGroupRule(verb);
		if (person === '1p' && verb.endsWith('cer')) {
			return `Devant -ons, le c prend une cédille pour qu'on entende « s » et pas « k » : nous ${form}.`;
		}
		if (person === '1p' && verb.endsWith('ger')) {
			return `Devant -ons, on garde un e après le g pour qu'on entende « j » et pas « g » : nous ${form}.`;
		}
		if (mute) {
			switch (rule) {
				case 'oyer':
					return `Les verbes en -oyer et -uyer changent le y en i devant un e muet : ${form} (mais nous ${nous}).`;
				case 'ayer':
					return `Les verbes en -ayer acceptent les deux formes : ${forms.join(' ou ')} (et nous ${nous}).`;
				case 'double':
					return `« appeler », « jeter » et leurs dérivés doublent le l ou le t devant un e muet : ${form} (mais nous ${nous}).`;
				case 'grave':
					return `« ${verb} » prend un accent grave devant un e muet : ${form} (mais nous ${nous}).`;
				case 'double_reform':
					return `« ${verb} » double la consonne devant un e muet : ${forms[0]}${forms[1] ? ` (l'orthographe rectifiée accepte aussi ${forms[1]})` : ''} ; mais nous ${nous}.`;
				case 'e_grave':
					return `Le e de « ${verb} » devient è devant un e muet : ${form} (mais nous ${nous}).`;
				case 'e_acute':
					return `Le é de « ${verb} » devient è devant un e muet : ${form} (mais nous ${nous}).`;
				default:
					break;
			}
		} else if (['double', 'grave', 'double_reform', 'e_grave', 'e_acute'].includes(rule)) {
			return `Avec nous et vous, la terminaison n'est pas muette : rien ne change dans le radical (nous ${nous}, vous ${(conjugatePerson(verb, '2p') || [''])[0]}).`;
		} else if (rule === 'oyer' || rule === 'ayer') {
			return `Avec nous et vous, on garde le y : nous ${nous}, vous ${(conjugatePerson(verb, '2p') || [''])[0]}.`;
		}
		return `Au présent, les verbes du 1er groupe se terminent par -e, -es, -e, -ons, -ez, -ent : ${paradigm(shown)}.`;
	}
	if (group === 2) {
		return `Au présent, les verbes du 2e groupe se terminent par -is, -is, -it, -issons, -issez, -issent : ${paradigm(shown)}.`;
	}
	if (LIKE_ER.includes(verb)) {
		return `« ${shown} » est du 3e groupe mais se conjugue au présent comme un verbe en -er : ${paradigm(shown)}.`;
	}
	if (DRE.includes(verb)) {
		return `« ${shown} » (3e groupe) : -s, -s, (rien), -ons, -ez, -ent, le d reste à la 3e personne : ${paradigm(shown)}.`;
	}
	return `« ${shown} » est irrégulier au présent : ${paradigm(shown)}.`;
}

/** Personnes pour lesquelles `given` est une forme correcte du verbe. */
function personsOfForm(rawVerb, given, normalize) {
	const forms = conjugate(bare(rawVerb));
	if (!forms) return [];
	const n = normalize(given);
	return PERSONS.filter((p, i) => forms[i].some((f) => normalize(f) === n));
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
//   1 = très courant, régulier · 2 = particularité ou piège classique ·
//   3 = rare ou difficile. Un même verbe peut avoir une difficulté différente
//   selon l'exercice (« aller » : facile à conjuguer, piège pour le groupe).
// ────────────────────────────────────────────────────────────────────────────

// 1er groupe
const G1_EASY = ['chanter', 'jouer', 'danser', 'parler', 'regarder', 'marcher', 'aimer', 'écouter', 'trouver', 'tomber', 'crier', 'oublier', 'aider', 'ajouter', 'allumer', 'apporter', 'attraper', 'cacher', 'casser', 'chercher', 'colorier', 'compter', 'couper', 'décorer', 'demander', 'dessiner', 'deviner', 'donner', 'entrer', 'fermer', 'gagner', 'garder', 'goûter', 'habiter', 'inviter', 'laver', 'monter', 'montrer', 'passer', 'pleurer', 'porter', 'poser', 'pousser', 'préparer', 'raconter', 'réparer', 'rester', 'rouler', 'sauter', 'siffler', 'souffler', 'toucher', 'tourner', 'travailler', 'visiter', 'voler', 'arriver', 'briller', 'frapper', 'coller'];
const G1_MEDIUM = ['manger', 'lancer', 'nager', 'envoyer', 'appeler', 'acheter', 'payer', 'préférer', 'nettoyer', 'rêver', 'essayer', 'avancer', 'bouger', 'changer', 'commencer', 'corriger', 'déménager', 'encourager', 'effacer', 'essuyer', 'appuyer', 'balayer', 'jeter', 'geler', 'lever', 'mener', 'promener', 'peser', 'semer', 'compléter', 'répéter', 'espérer', 'protéger', 'ranger', 'partager', 'plonger', 'voyager', 'placer', 'prononcer', 'remplacer', 'tracer', 'employer', "s'envoler", "s'habiller"];
const G1_HARD = ['créer', 'épier', 'harceler', 'louvoyer', 'chatoyer', 'ployer', 'ressasser', 'distinguer', 'naviguer', 'conjuguer', 'fatiguer', 'remercier', 'apprécier', 'éternuer', 'tutoyer', 'vouvoyer', 'assiéger', 'accélérer', 'révéler', "s'agenouiller", "s'écrier", "s'extasier", 'gaspiller', 'chuchoter', 'grelotter'];

// 2e groupe
const G2_EASY = ['finir', 'choisir', 'grandir', 'remplir', 'rougir', 'salir', 'punir', 'bâtir', 'nourrir', 'maigrir', 'grossir', 'obéir', 'réussir', 'réfléchir', 'applaudir', 'ralentir', 'guérir', 'vieillir', 'bondir', 'jaunir'];
const G2_MEDIUM = ['atterrir', 'fleurir', 'agir', 'avertir', 'blanchir', 'noircir', 'pâlir', 'saisir', 'franchir', 'gémir', 'réunir', 'établir', 'enrichir', 'embellir', 'élargir', 'rafraîchir', 'refroidir', 'rôtir', 'surgir', 'désobéir', 'définir', 'trahir', 'envahir', 'durcir', 'garantir', 'faiblir', 'ravir'];
const G2_HARD = ['haïr', 'assouplir', 'éblouir', 'frémir', 'resplendir', 'jaillir', 'rajeunir', "s'évanouir", 'mûrir', 'ternir', 'affaiblir', 'alourdir', 'amortir', 'appauvrir', 'arrondir', 'assombrir', 'blêmir', 'brandir', 'chérir', 'démolir', 'engloutir', "s'épanouir", 'fournir', 'polir', 'raccourcir', 'vernir', 'aboutir', 'adoucir', 'accomplir', 'divertir'];

// 3e groupe (difficulté pour l'exercice des groupes : les -ir et « aller » sont les pièges)
const G3_EASY = ['faire', 'dire', 'prendre', 'mettre', 'lire', 'écrire', 'boire', 'voir', 'pouvoir', 'vouloir', 'savoir', 'rire', 'vendre', 'attendre', 'rendre', 'entendre', 'répondre', 'descendre', 'perdre', 'apprendre', 'comprendre', 'sourire', 'relire', 'revoir'];
const G3_MEDIUM = ['aller', 'partir', 'sortir', 'dormir', 'courir', 'venir', 'tenir', 'ouvrir', 'offrir', 'cueillir', 'mourir', 'servir', 'sentir', 'mentir', 'devoir', 'recevoir', 'croire', 'vivre', 'peindre', 'connaître', 'conduire', 'fuir', 'revenir', 'obtenir', 'retenir', 'appartenir', 'découvrir', 'couvrir', 'souffrir', 'accueillir', "s'endormir", 'repartir', 'ressentir', 'parcourir', 'apercevoir', 'éteindre', 'craindre', 'construire', 'détruire', 'produire', 'traduire', 'disparaître', 'apparaître', 'suivre', 'battre', 'promettre', 'permettre', 'surprendre', 'reprendre', 'décrire', 'prévoir', 'défendre', 'mordre', 'tordre', 'fondre', 'pondre', 'tondre'];
const G3_HARD = ['vêtir', 'bouillir', 'acquérir', 'conquérir', 'maudire', "s'asseoir", 'valoir', 'vaincre', 'coudre', 'résoudre', 'rompre', 'moudre', 'plaindre', 'joindre', 'convaincre', 'interrompre', 'naître', 'plaire', 'déplaire', 'se taire', 'feindre', 'contraindre', 'atteindre', 'teindre', 'séduire', 'cuire', 'instruire', 'recueillir', 'consentir', 'démentir', 'secourir', 'accourir', 'survivre', 'poursuivre', 'combattre', 'abattre', 'concevoir', 'décevoir', 'soumettre', 'admettre', 'entrevoir', 'rejoindre', "s'enfuir"];

const POOLS = {
	// Présent de l'indicatif (difficulté = difficulté de conjugaison).
	present: {
		1: {
			1: G1_EASY,
			2: G1_MEDIUM,
			3: ['étiqueter', 'harceler', 'renouveler', 'feuilleter', 'céder', 'célébrer', 'créer', 'assiéger', 'accélérer', 'révéler', 'tutoyer', 'vouvoyer', "s'ennuyer", 'distinguer', 'conjuguer', 'remercier', "s'agenouiller", 'épousseter', 'ressasser']
		},
		2: {
			1: G2_EASY,
			2: ['atterrir', 'agir', 'avertir', 'saisir', 'franchir', 'réunir', 'établir', 'élargir', 'refroidir', 'surgir', 'désobéir', 'trahir', 'envahir', 'noircir', 'pâlir', 'blanchir', 'embellir', 'enrichir'],
			3: ['haïr', 'éblouir', 'frémir', 'resplendir', 'assouplir', "s'évanouir", "s'épanouir", 'accomplir', 'engloutir']
		},
		3: {
			1: ['être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'voir', 'pouvoir', 'vouloir', 'partir', 'dormir', 'lire', 'écrire', 'mettre'],
			2: ['savoir', 'devoir', 'sortir', 'courir', 'boire', 'croire', 'ouvrir', 'offrir', 'recevoir', 'vivre', 'suivre', 'rire', 'rendre', 'vendre', 'attendre', 'entendre', 'répondre', 'descendre', 'perdre', 'tenir', 'devenir', 'comprendre', 'apprendre', 'sentir', 'servir', 'cueillir', 'battre', 'connaître', 'revenir', 'obtenir', 'découvrir', 'souffrir', 'accueillir', 'apercevoir', 'éteindre', 'construire', 'détruire', 'paraître', 'disparaître', 'promettre', 'permettre', 'surprendre', 'reprendre', 'décrire', 'prévoir', 'défendre', 'sourire'],
			3: ['peindre', 'craindre', 'conduire', 'acquérir', "s'asseoir", 'résoudre', 'vaincre', 'coudre', 'moudre', 'bouillir', 'fuir', 'mourir', 'valoir', 'rompre', 'vêtir', 'maudire', 'naître', 'plaire', 'se taire', 'atteindre', 'cuire', 'séduire', 'convaincre', 'interrompre', 'joindre', 'rejoindre', 'secourir', 'concevoir', 'décevoir', "s'enfuir", 'contraindre']
		}
	},
	// -eler / -eter : consonne doublée ou accent grave.
	eter_eler: {
		double: {
			1: ['appeler', 'jeter'],
			2: ['rappeler', 'rejeter', 'projeter', 'épeler', 'feuilleter', 'empaqueter'],
			3: ['étiqueter', 'ficeler', 'renouveler', 'atteler', 'dételer', 'chanceler', 'niveler', 'épousseter', 'cacheter', 'déchiqueter', 'ensorceler']
		},
		grave: {
			1: ['acheter', 'geler'],
			2: ['racheter', 'congeler', 'surgeler', 'peler', 'modeler'],
			3: ['harceler', 'marteler', 'haleter', 'ciseler', 'dégeler', 'crocheter', 'fureter', 'démanteler', 'écarteler']
		}
	},
	// Accord sujet-verbe (la difficulté vient surtout des sujets : voir le prompt).
	accord: {
		1: {
			1: G1_EASY,
			2: ['manger', 'traverser', 'aboyer', 'nager', 'voyager', 'commencer', 'avancer', 'bouger', 'changer', 'ranger', 'partager', 'plonger', 'lancer', 'effacer', 'nettoyer', 'essuyer', 'promener', 'lever', 'répéter'],
			3: ['appeler', 'jeter', 'acheter', 'préférer', 'envoyer', 'essayer', 'employer', 'espérer', 'protéger', 'payer']
		},
		2: {
			1: G2_EASY,
			2: ['atterrir', 'franchir', 'réunir', 'saisir', 'agir', 'avertir', 'désobéir', 'envahir'],
			3: ['éblouir', 'resplendir', 'frémir', 'haïr', 'accomplir']
		},
		3: {
			1: ['être', 'avoir', 'aller', 'faire', 'dire', 'venir', 'prendre', 'voir'],
			2: ['pouvoir', 'vouloir', 'partir', 'dormir', 'courir', 'lire', 'écrire', 'boire', 'attendre', 'entendre', 'répondre', 'mettre', 'sortir', 'savoir', 'devoir', 'croire', 'ouvrir', 'offrir', 'vivre', 'suivre', 'rire', 'rendre', 'vendre', 'descendre', 'perdre', 'tenir', 'comprendre', 'apprendre', 'servir', 'revenir'],
			3: ['peindre', 'craindre', 'conduire', 'recevoir', 'connaître', 'apercevoir', 'résoudre', 'vaincre', 'éteindre', 'construire', 'disparaître', 'mourir', 'fuir', 'cueillir']
		}
	},
	// Groupes des verbes.
	groups: {
		1: { 1: G1_EASY, 2: G1_MEDIUM, 3: G1_HARD },
		2: { 1: G2_EASY, 2: G2_MEDIUM, 3: G2_HARD },
		3: { 1: G3_EASY, 2: G3_MEDIUM, 3: G3_HARD }
	}
};

// Exercice des groupes, mode « verbe conjugué » : un complément par verbe,
// écrit à la main pour que la phrase soit correcte à toutes les personnes
// proposées. `p` restreint les personnes quand le sens l'impose (sujet
// inanimé : « il / elle », jamais « je » ni « on »).
const INANIMATE = ['3s', '3p'];
const GROUP_SENTENCES = {
	// 1er groupe
	chanter: 'une chanson', jouer: 'au ballon', danser: 'dans le salon', parler: 'très fort',
	regarder: 'la télévision', marcher: 'dans la forêt', aimer: 'les fraises', écouter: 'de la musique',
	trouver: 'un trésor', tomber: 'dans la neige', crier: 'de joie', oublier: 'la réponse',
	aider: 'les voisins', ajouter: 'du sel', allumer: 'la lampe', apporter: 'le goûter',
	attraper: 'un papillon', cacher: 'le trésor', casser: 'un verre', chercher: 'les clés',
	colorier: 'un dessin', compter: 'les moutons', couper: 'le pain', décorer: 'le sapin',
	demander: 'le chemin', dessiner: 'un château', deviner: 'la fin du film', donner: 'un conseil',
	entrer: 'dans la classe', fermer: 'la porte', gagner: 'la course', garder: 'le secret',
	goûter: 'la soupe', habiter: 'près de la mer', inviter: 'les cousins', laver: 'la voiture',
	monter: 'sur la colline', montrer: 'les photos', passer: 'devant la boulangerie', pleurer: 'pendant le film',
	porter: 'un sac', poser: 'une question', pousser: 'la brouette', préparer: 'le dîner',
	raconter: 'une histoire', réparer: 'le vélo', rester: 'à la maison', rouler: 'à vélo',
	sauter: 'dans les flaques', siffler: 'en marchant', souffler: 'les bougies', toucher: 'la cible',
	tourner: 'à gauche', travailler: 'au jardin', visiter: 'le musée', voler: { c: 'dans le ciel', p: INANIMATE },
	arriver: 'en avance', briller: { c: 'dans le ciel', p: INANIMATE }, frapper: 'à la porte', coller: 'les images',
	manger: 'une pomme', lancer: 'le ballon', nager: 'dans la piscine', envoyer: 'une lettre',
	appeler: 'le médecin', acheter: 'du pain', payer: 'les courses', préférer: 'le chocolat',
	nettoyer: 'la cuisine', rêver: 'de vacances', essayer: 'un chapeau', avancer: 'lentement',
	bouger: 'sans arrêt', changer: "d'avis", commencer: 'le livre', corriger: 'la dictée',
	déménager: 'en été', encourager: "l'équipe", effacer: 'le tableau', essuyer: 'la table',
	appuyer: 'sur le bouton', balayer: 'la cour', jeter: 'les papiers', geler: 'dehors',
	lever: 'la main', mener: "l'enquête", promener: 'le chien', peser: 'les pommes',
	semer: 'des graines', compléter: 'la grille', répéter: 'la consigne', espérer: 'gagner',
	protéger: 'la planète', ranger: 'les jouets', partager: 'les bonbons', plonger: 'dans le lac',
	voyager: 'en train', placer: 'les verres', prononcer: 'un discours', remplacer: 'le maître',
	tracer: 'un cercle', employer: 'un mot difficile', "s'envoler": { c: 'vers le sud', p: INANIMATE },
	"s'habiller": 'chaudement',
	créer: 'un jeu vidéo', épier: 'les voisins', harceler: 'le guide de questions',
	louvoyer: 'entre les rochers', chatoyer: { c: 'au soleil', p: INANIMATE },
	ployer: 'sous le poids', ressasser: 'les mêmes souvenirs', distinguer: 'les deux jumeaux',
	naviguer: 'sur la rivière', conjuguer: 'le verbe', fatiguer: 'les joueurs', remercier: 'le pompier',
	apprécier: 'le calme', éternuer: 'à cause du pollen', tutoyer: 'le directeur', vouvoyer: 'la directrice',
	assiéger: 'la ville', accélérer: 'dans la descente', révéler: 'la surprise',
	"s'agenouiller": 'devant le feu', "s'écrier": 'de surprise', "s'extasier": 'devant le paysage',
	gaspiller: "l'eau", chuchoter: 'un secret', grelotter: 'de froid',
	// 2e groupe
	finir: 'le repas', choisir: 'un livre', grandir: 'très vite', remplir: 'le seau', rougir: 'de honte',
	salir: 'le tapis', punir: 'le tricheur', bâtir: 'une cabane', nourrir: 'les poules',
	maigrir: 'un peu', grossir: 'pendant les fêtes', obéir: 'au maître',
	réussir: "l'examen", réfléchir: 'à la question', applaudir: 'les acteurs', ralentir: 'au virage',
	guérir: 'rapidement', atterrir: 'à Paris', fleurir: { c: 'au printemps', p: INANIMATE },
	vieillir: 'doucement', agir: 'vite', avertir: 'le gardien', blanchir: 'de peur',
	jaunir: { c: 'en automne', p: INANIMATE }, noircir: 'la page', pâlir: 'en voyant le fantôme',
	saisir: 'la balle', bondir: 'de joie', franchir: "la ligne d'arrivée", gémir: 'de douleur',
	réunir: 'les amis', établir: 'un record', enrichir: 'la collection', embellir: 'le jardin',
	élargir: 'le chemin', rafraîchir: 'la boisson', refroidir: 'la soupe', rôtir: 'le poulet',
	surgir: 'derrière la porte', désobéir: 'aux parents', définir: 'le mot', trahir: 'le secret',
	envahir: 'le château', durcir: { c: 'au soleil', p: INANIMATE }, garantir: 'la sécurité',
	faiblir: { c: 'en fin de journée', p: INANIMATE }, ravir: 'les spectateurs',
	haïr: 'le mensonge', assouplir: 'les règles', éblouir: 'le public', frémir: 'de peur',
	resplendir: 'de joie', jaillir: { c: 'de la roche', p: INANIMATE }, rajeunir: 'de dix ans',
	"s'évanouir": 'de fatigue', mûrir: { c: 'au soleil', p: INANIMATE },
	ternir: { c: 'avec le temps', p: INANIMATE }, affaiblir: "l'ennemi", alourdir: 'le sac',
	amortir: 'le choc', appauvrir: { c: 'le sol', p: INANIMATE }, arrondir: 'le résultat',
	assombrir: { c: 'la pièce', p: INANIMATE }, blêmir: 'de colère', brandir: 'une épée',
	chérir: 'ce souvenir', démolir: 'le vieux hangar', engloutir: 'le gâteau',
	"s'épanouir": 'au soleil', fournir: 'les crayons', polir: 'le métal', raccourcir: 'la corde',
	vernir: 'la table', aboutir: 'à une solution', adoucir: 'la sauce', accomplir: 'une mission',
	divertir: 'les enfants',
	// 3e groupe
	faire: 'un gâteau', dire: 'la vérité', prendre: 'le bus', mettre: 'la table', lire: 'un roman',
	écrire: 'une lettre', boire: 'du lait', voir: 'la mer', pouvoir: 'venir', vouloir: 'un gâteau',
	savoir: 'la leçon', rire: 'aux éclats', vendre: 'des fleurs', attendre: 'le train', rendre: 'les livres',
	entendre: 'un bruit', répondre: 'à la question', descendre: "l'escalier", perdre: 'la partie',
	apprendre: 'une poésie', comprendre: "l'exercice", sourire: 'au photographe', relire: "l'histoire",
	revoir: 'le film',
	aller: "à l'école", partir: 'en vacances', sortir: 'le soir', dormir: 'profondément',
	courir: 'dans le parc', venir: 'demain', tenir: 'la corde', ouvrir: 'la fenêtre', offrir: 'un cadeau',
	cueillir: 'des fleurs', mourir: 'de rire', servir: 'le dessert', sentir: 'le parfum', mentir: 'souvent',
	devoir: 'partir', recevoir: 'une lettre', croire: 'cette histoire', vivre: 'à la campagne',
	peindre: 'un tableau', connaître: 'la réponse', conduire: 'la voiture', fuir: 'le danger',
	revenir: 'demain', obtenir: 'une bonne note', retenir: 'la leçon', appartenir: 'au club de foot',
	découvrir: 'un secret', couvrir: 'le gâteau', souffrir: 'du froid', accueillir: 'les invités',
	"s'endormir": 'très tard', repartir: 'demain matin', ressentir: 'de la joie', parcourir: 'la forêt',
	apercevoir: 'un bateau', éteindre: 'la lumière', craindre: "l'orage", construire: 'une maison',
	détruire: 'le vieux mur', produire: 'des légumes', traduire: 'le texte', disparaître: 'dans la nuit',
	apparaître: 'à la fenêtre', suivre: 'le guide', battre: 'le record', promettre: 'de venir',
	permettre: 'cette sortie', surprendre: 'les invités', reprendre: 'du gâteau', décrire: 'le paysage',
	prévoir: 'un pique-nique', défendre: 'le château', mordre: 'dans la pomme', tordre: 'le fil de fer',
	fondre: 'en larmes', pondre: { c: 'un œuf', p: INANIMATE }, tondre: 'la pelouse',
	vêtir: 'les enfants', bouillir: "d'impatience", acquérir: "de l'expérience", conquérir: 'le château',
	maudire: 'la pluie', "s'asseoir": 'sur le banc', valoir: { c: 'une fortune', p: INANIMATE },
	vaincre: 'la peur', coudre: 'un bouton', résoudre: "l'énigme", rompre: 'le silence', moudre: 'le café',
	plaindre: 'les victimes', joindre: 'les deux bouts', convaincre: 'le jury', interrompre: 'la réunion',
	naître: { c: 'en hiver', p: INANIMATE }, plaire: 'à tout le monde', déplaire: 'aux voisins',
	'se taire': 'en classe', feindre: 'la surprise', contraindre: 'le voleur à avouer',
	atteindre: 'le sommet', teindre: 'les tissus', séduire: 'le public', cuire: 'les pâtes',
	instruire: 'les élèves', recueillir: 'un chaton', consentir: 'à partir', démentir: 'la rumeur',
	secourir: 'les blessés', accourir: 'vers la plage', survivre: 'à la tempête', poursuivre: 'le voleur',
	combattre: 'le dragon', abattre: 'le vieil arbre', concevoir: 'un plan', décevoir: 'les supporters',
	soumettre: 'une idée', admettre: "l'erreur", entrevoir: 'une lueur', rejoindre: 'le groupe',
	"s'enfuir": 'dans les bois'
};

module.exports = {
	PERSONS,
	DERIVED,
	PERSON_LABELS,
	POOLS,
	GROUP_SENTENCES,
	TIER_MIX,
	DOUBLE_ONLY,
	GRAVE_ONLY,
	conjugate,
	conjugatePerson,
	verbGroup,
	elidesBefore,
	explainForm,
	personsOfForm,
	PERSON_SHORT,
	PERSON_NAMES,
	levelTier,
	conjugatedShare
};
