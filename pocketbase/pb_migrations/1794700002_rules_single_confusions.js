/// <reference path="../pb_data/types.d.ts" />

// Une règle par confusion pour les révisions mélangées on-son-et et
// se-ce-ses-ces (comme a-a / ou-ou pour a-a-ou-ou, ni-ny / si-sy pour
// ni-ny-si-sy). Les règles mélangées restent.

migrate(
	(app) => {
		const rules = app.findCollectionByNameOrId('rules');
		const seed = [
			{
				id: 'on-ont',
				display_name: 'on / ont',
				short_description: '« on » (pronom, remplaçable par « il ») et « ont » (verbe avoir, remplaçable par « avaient »).',
				candidates: ['on', 'ont'],
				difficulty_hint: 'CE2',
				examples: [
					{ sentence: 'Ce soir, {{?}} mange des crêpes.', answer: 'on', rationale: 'pronom : on peut dire « il mange »' },
					{ sentence: 'Demain, {{?}} ira au cinéma.', answer: 'on', rationale: 'pronom : « il ira »' },
					{ sentence: 'Mes cousins {{?}} gagné le match.', answer: 'ont', rationale: 'verbe avoir : on peut dire « avaient gagné »' },
					{ sentence: 'Les enfants {{?}} un nouveau ballon.', answer: 'ont', rationale: 'verbe avoir : « avaient un ballon »' }
				]
			},
			{
				id: 'son-sont',
				display_name: 'son / sont',
				short_description: '« son » (déterminant possessif, remplaçable par « mon ») et « sont » (verbe être, remplaçable par « étaient »).',
				candidates: ['son', 'sont'],
				difficulty_hint: 'CE2',
				examples: [
					{ sentence: 'Léo cherche {{?}} cahier.', answer: 'son', rationale: 'possessif : on peut dire « mon cahier »' },
					{ sentence: 'Elle promène {{?}} chien au parc.', answer: 'son', rationale: 'possessif : « mon chien »' },
					{ sentence: 'Les fleurs {{?}} fanées.', answer: 'sont', rationale: 'verbe être : on peut dire « étaient fanées »' },
					{ sentence: 'Mes amis {{?}} en vacances.', answer: 'sont', rationale: 'verbe être : « étaient en vacances »' }
				]
			},
			{
				id: 'et-es-est',
				display_name: 'et / es / est',
				short_description: '« et » (addition, remplaçable par « et puis ») ; « es » (être, 2e personne : tu es) ; « est » (être, 3e personne : il est, remplaçable par « était »).',
				candidates: ['et', 'es', 'est'],
				difficulty_hint: 'CE2',
				examples: [
					{ sentence: "J'ai acheté du pain {{?}} du fromage.", answer: 'et', rationale: 'addition : on peut dire « et puis »' },
					{ sentence: 'Tu {{?}} en retard.', answer: 'es', rationale: 'être, 2e personne : « tu étais »' },
					{ sentence: 'Tu {{?}} vraiment gentille.', answer: 'es', rationale: 'être, 2e personne' },
					{ sentence: 'Le chat {{?}} sur le toit.', answer: 'est', rationale: 'être, 3e personne : « il était »' }
				]
			},
			{
				id: 'se-ce',
				display_name: 'se / ce',
				short_description: '« se » (pronom devant un verbe : il se lave) et « ce » (déterminant ou pronom démonstratif : ce chien, ce que).',
				candidates: ['se', 'ce'],
				difficulty_hint: 'CM1',
				examples: [
					{ sentence: "Le chien {{?}} gratte l'oreille.", answer: 'se', rationale: 'devant un verbe : « il se gratte »' },
					{ sentence: 'Les élèves {{?}} rangent en silence.', answer: 'se', rationale: 'devant un verbe : « ils se rangent »' },
					{ sentence: "J'adore {{?}} dessin animé.", answer: 'ce', rationale: 'démonstratif : « ce dessin-là »' },
					{ sentence: 'Dis-moi {{?}} que tu veux.', answer: 'ce', rationale: 'pronom démonstratif : « ce que »' }
				]
			},
			{
				id: 'ses-ces',
				display_name: "ses / ces / s'est / c'est",
				short_description: "« ses » (possessif : les siens) ; « ces » (démonstratif : ces … -là) ; « s'est » (verbe pronominal au passé composé : il se lave → il s'est lavé) ; « c'est » (cela est).",
				candidates: ['ses', 'ces', "s'est", "c'est"],
				difficulty_hint: 'CM2',
				examples: [
					{ sentence: 'Marie range {{?}} affaires.', answer: 'ses', rationale: 'possessif : « les siennes »' },
					{ sentence: 'Regarde {{?}} oiseaux dans le ciel !', answer: 'ces', rationale: 'démonstratif : « ces oiseaux-là »' },
					{ sentence: 'Elle {{?}} levée très tôt.', answer: "s'est", rationale: 'verbe pronominal : « elle se lève »' },
					{ sentence: "Je crois que {{?}} l'heure de partir.", answer: "c'est", rationale: 'on peut dire « cela est »' }
				]
			}
		];
		for (const data of seed) {
			let r;
			try {
				r = app.findRecordById('rules', data.id);
			} catch (_) {
				r = new Record(rules);
			}
			r.load(Object.assign({ rule_type: 'multiple_choice', groups: null }, data));
			app.save(r);
		}
	},
	(app) => {
		for (const id of ['on-ont', 'son-sont', 'et-es-est', 'se-ce', 'ses-ces']) {
			try {
				app.delete(app.findRecordById('rules', id));
			} catch (_) {}
		}
	}
);
