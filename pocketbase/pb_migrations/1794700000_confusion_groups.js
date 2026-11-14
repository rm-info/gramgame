/// <reference path="../pb_data/types.d.ts" />

// Groupes de confusion sur les règles + mode difficile sur les tentatives.
//
// rules.groups : liste de groupes d'homophones, ex.
//   [["on","ont"], ["son","sont"], ["et","es","est"]]
// Chaque trou d'un exercice ne propose (en mode normal) que les mots du groupe
// de sa bonne réponse ; en mode difficile, tous les candidats de la règle.
// Vide = un seul groupe (tous les candidats), comportement historique.
//
// Seed : les 4 lignes « Orthographe » du programme CM2 période 1.

migrate(
	(app) => {
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.add(new JSONField({ name: 'groups', maxSize: 0 }));
		app.save(rules);

		const attempts = app.findCollectionByNameOrId('attempts');
		attempts.fields.add(new BoolField({ name: 'hard_mode' }));
		app.save(attempts);

		const seed = [
			{
				id: 'a-a-ou-ou',
				display_name: 'a / à – ou / où',
				short_description:
					'Révision mélangée : le verbe « a » (avoir) et la préposition « à » ; la conjonction « ou » (choix) et l\'adverbe « où » (lieu, temps).',
				rule_type: 'multiple_choice',
				candidates: ['a', 'à', 'ou', 'où'],
				groups: [
					['a', 'à'],
					['ou', 'où']
				],
				difficulty_hint: 'CM1',
				examples: [
					{ sentence: 'Il {{?}} perdu son ballon.', answer: 'a', rationale: 'verbe avoir : on peut dire « il avait perdu »' },
					{ sentence: 'Nous partons {{?}} la plage.', answer: 'à', rationale: 'préposition : on ne peut pas dire « avait la plage »' },
					{ sentence: 'Tu préfères le chocolat {{?}} la vanille ?', answer: 'ou', rationale: 'choix : on peut dire « ou bien »' },
					{ sentence: 'Voici la maison {{?}} j\'ai grandi.', answer: 'où', rationale: 'lieu' }
				]
			},
			{
				id: 'on-son-et',
				display_name: 'on / ont – son / sont – et / es / est',
				short_description:
					'« on » (pronom) et « ont » (avoir) ; « son » (possessif) et « sont » (être) ; « et » (addition), « es » et « est » (être).',
				rule_type: 'multiple_choice',
				candidates: ['on', 'ont', 'son', 'sont', 'et', 'es', 'est'],
				groups: [
					['on', 'ont'],
					['son', 'sont'],
					['et', 'es', 'est']
				],
				difficulty_hint: 'CM1',
				examples: [
					{ sentence: 'Ce soir, {{?}} mange des crêpes.', answer: 'on', rationale: 'pronom : on peut dire « il mange »' },
					{ sentence: 'Mes cousins {{?}} gagné le match.', answer: 'ont', rationale: 'verbe avoir : on peut dire « avaient gagné »' },
					{ sentence: 'Léo cherche {{?}} cahier.', answer: 'son', rationale: 'possessif : on peut dire « mon cahier »' },
					{ sentence: 'Les fleurs {{?}} fanées.', answer: 'sont', rationale: 'verbe être : on peut dire « étaient fanées »' },
					{ sentence: 'J\'ai acheté du pain {{?}} du fromage.', answer: 'et', rationale: 'addition : on peut dire « et puis »' },
					{ sentence: 'Tu {{?}} en retard.', answer: 'es', rationale: 'être, 2e personne : « tu étais »' },
					{ sentence: 'Le chat {{?}} sur le toit.', answer: 'est', rationale: 'être, 3e personne : « il était »' }
				]
			},
			{
				id: 'se-ce-ses-ces',
				display_name: "se / ce – ses / ces / s'est / c'est",
				short_description:
					"« se » (pronom devant un verbe) et « ce » (déterminant ou pronom démonstratif) ; « ses » (possessif), « ces » (démonstratif), « s'est » (verbe pronominal au passé composé) et « c'est » (cela est).",
				rule_type: 'multiple_choice',
				candidates: ['se', 'ce', 'ses', 'ces', "s'est", "c'est"],
				groups: [
					['se', 'ce'],
					['ses', 'ces', "s'est", "c'est"]
				],
				difficulty_hint: 'CM2',
				examples: [
					{ sentence: 'Le chien {{?}} gratte l\'oreille.', answer: 'se', rationale: 'devant un verbe : « il se gratte »' },
					{ sentence: 'J\'adore {{?}} dessin animé.', answer: 'ce', rationale: 'démonstratif : « ce dessin-là »' },
					{ sentence: 'Marie range {{?}} affaires.', answer: 'ses', rationale: 'possessif : « les siennes »' },
					{ sentence: 'Regarde {{?}} oiseaux dans le ciel !', answer: 'ces', rationale: 'démonstratif : « ces oiseaux-là »' },
					{ sentence: 'Elle {{?}} levée très tôt.', answer: "s'est", rationale: 'verbe pronominal : « elle se lève »' },
					{ sentence: 'Je crois que {{?}} l\'heure de partir.', answer: "c'est", rationale: 'on peut dire « cela est »' }
				]
			},
			{
				id: 'ni-ny-si-sy',
				display_name: "ni / n'y – si / s'y",
				short_description:
					"« ni » (négation qui relie) et « n'y » (ne + y) ; « si » (condition ou intensité) et « s'y » (se + y).",
				rule_type: 'multiple_choice',
				candidates: ['ni', "n'y", 'si', "s'y"],
				groups: [
					['ni', "n'y"],
					['si', "s'y"]
				],
				difficulty_hint: 'CM2',
				examples: [
					{ sentence: 'Il n\'aime ni les épinards {{?}} les brocolis.', answer: 'ni', rationale: 'négation qui relie deux éléments' },
					{ sentence: 'Ce parc est fermé, on {{?}} entre plus.', answer: "n'y", rationale: 'ne + y : « on n\'entre pas là-bas »' },
					{ sentence: 'Viens jouer {{?}} tu veux.', answer: 'si', rationale: 'condition' },
					{ sentence: 'Il fait {{?}} froid ce matin !', answer: 'si', rationale: 'intensité : « tellement »' },
					{ sentence: 'Ce coin est calme, Paul {{?}} repose souvent.', answer: "s'y", rationale: 'se + y : « il se repose là »' }
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
			r.load(data);
			app.save(r);
		}
	},
	(app) => {
		for (const id of ['a-a-ou-ou', 'on-son-et', 'se-ce-ses-ces', 'ni-ny-si-sy']) {
			try {
				app.delete(app.findRecordById('rules', id));
			} catch (_) {}
		}
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.removeByName('groups');
		app.save(rules);
		const attempts = app.findCollectionByNameOrId('attempts');
		attempts.fields.removeByName('hard_mode');
		app.save(attempts);
	}
);
