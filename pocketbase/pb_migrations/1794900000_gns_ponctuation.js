/// <reference path="../pb_data/types.d.ts" />

// Étape 3 du programme CM2 période 1 (grammaire) :
//   span         l'élève clique sur les mots qui forment un groupe (le GNS)
//   punctuation  l'élève rétablit la ponctuation d'un texte (. , ? !)
// exercises.extra (JSON) : données propres à un type d'exercice
//   punctuation → { words: [...mots affichés...], proper_nouns: [...] }

migrate(
	(app) => {
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.getByName('rule_type').values = ['multiple_choice', 'free_text', 'qcm', 'span', 'punctuation'];
		app.save(rules);

		const exercises = app.findCollectionByNameOrId('exercises');
		exercises.fields.add(new JSONField({ name: 'extra', maxSize: 0 }));
		app.save(exercises);

		const seed = [
			{
				id: 'retrouver-gns',
				category: 'grammaire',
				display_name: 'Retrouver le GNS',
				short_description:
					"Cliquer sur tous les mots du groupe nominal sujet (déterminant, nom et tout ce qui les complète). Pour le trouver : « Qui est-ce qui + verbe ? ». Attention au sujet placé après un complément ou après le verbe.",
				rule_type: 'span',
				candidates: null,
				config: { generator: 'llm_span' },
				difficulty_hint: 'CM1'
			},
			{
				id: 'ponctuation',
				category: 'grammaire',
				display_name: 'Rétablir la ponctuation',
				short_description:
					"Remettre les points, virgules, points d'interrogation et points d'exclamation dans un texte qui n'en a plus. Après un point, un point d'interrogation ou d'exclamation, la phrase suivante commence par une majuscule.",
				rule_type: 'punctuation',
				candidates: null,
				config: { generator: 'llm_punctuation' },
				difficulty_hint: 'CM1'
			}
		];
		for (const data of seed) {
			let r;
			try {
				r = app.findRecordById('rules', data.id);
			} catch (_) {
				r = new Record(rules);
			}
			r.load(Object.assign({ groups: null, examples: null }, data));
			app.save(r);
		}
	},
	(app) => {
		for (const id of ['retrouver-gns', 'ponctuation']) {
			try {
				app.delete(app.findRecordById('rules', id));
			} catch (_) {}
		}
		const exercises = app.findCollectionByNameOrId('exercises');
		exercises.fields.removeByName('extra');
		app.save(exercises);
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.getByName('rule_type').values = ['multiple_choice', 'free_text', 'qcm'];
		app.save(rules);
	}
);
