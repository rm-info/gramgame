/// <reference path="../pb_data/types.d.ts" />

// Règles « ni / n'y » et « si / s'y » seules, pour travailler une confusion à
// la fois (comme a-a et ou-ou). La révision mélangée ni-ny-si-sy reste.

migrate(
	(app) => {
		const rules = app.findCollectionByNameOrId('rules');
		const seed = [
			{
				id: 'ni-ny',
				display_name: "ni / n'y",
				short_description:
					"« ni » (négation qui relie deux éléments : ni… ni…) et « n'y » (ne + y, « là » ou « à cela »).",
				rule_type: 'multiple_choice',
				candidates: ['ni', "n'y"],
				groups: null,
				difficulty_hint: 'CM2',
				examples: [
					{ sentence: "Il n'aime ni les épinards {{?}} les brocolis.", answer: 'ni', rationale: 'négation qui relie deux éléments' },
					{ sentence: "Je n'ai ni faim {{?}} soif.", answer: 'ni', rationale: 'ni… ni… : aucun des deux' },
					{ sentence: "Ce parc est fermé, on {{?}} entre plus.", answer: "n'y", rationale: "ne + y : « on n'entre pas là-bas »" },
					{ sentence: "Ne touche pas à ce gâteau, tu {{?}} as pas droit.", answer: "n'y", rationale: "ne + y : on peut dire « tu n'as pas droit à cela »" }
				]
			},
			{
				id: 'si-sy',
				display_name: "si / s'y",
				short_description:
					"« si » (condition, intensité ou oui après une négation) et « s'y » (se + y, devant un verbe pronominal).",
				rule_type: 'multiple_choice',
				candidates: ['si', "s'y"],
				groups: null,
				difficulty_hint: 'CM2',
				examples: [
					{ sentence: 'Viens jouer {{?}} tu veux.', answer: 'si', rationale: 'condition' },
					{ sentence: 'Il fait {{?}} froid ce matin !', answer: 'si', rationale: 'intensité : « tellement »' },
					{ sentence: 'Ce coin est calme, Paul {{?}} repose souvent.', answer: "s'y", rationale: "se + y : « il se repose là »" },
					{ sentence: 'Le jeu est difficile, mais Lina {{?}} habitue vite.', answer: "s'y", rationale: "se + y : « elle s'habitue à cela »" }
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
		for (const id of ['ni-ny', 'si-sy']) {
			try {
				app.delete(app.findRecordById('rules', id));
			} catch (_) {}
		}
	}
);
