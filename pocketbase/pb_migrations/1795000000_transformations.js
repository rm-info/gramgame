/// <reference path="../pb_data/types.d.ts" />

// Étape 4 du programme CM2 période 1 (grammaire) : transformer une phrase
// (exclamative, impérative, interrogative, forme négative).
//
// rule_type « transform » : chaque question = une phrase de départ + une
// transformation demandée. Deux façons de répondre, au choix de l'élève :
//   - mode normal : QCM (1 bonne proposition + 2 erreurs typiques) ;
//   - mode difficile : il écrit la phrase transformée, corrigée par l'IA
//     (après des contrôles sans IA).
// config.targets : transformations possibles pour la règle.

migrate(
	(app) => {
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.getByName('rule_type').values = ['multiple_choice', 'free_text', 'qcm', 'span', 'punctuation', 'transform'];
		app.save(rules);

		const common = { category: 'grammaire', rule_type: 'transform', candidates: null, groups: null, examples: null };
		const seed = [
			{
				id: 'transfo-negative',
				display_name: 'Mettre une phrase à la forme négative',
				short_description:
					"La négation a deux morceaux qui entourent le verbe conjugué : ne … pas (ou ne … plus, ne … jamais, ne … rien…). Devant une voyelle, ne devient n'. Au temps composé, ils entourent l'auxiliaire : il n'a pas mangé.",
				difficulty_hint: 'CE2',
				config: { generator: 'llm_transform', targets: ['negative'] }
			},
			{
				id: 'transfo-interrogative',
				display_name: 'Transformer en phrase interrogative',
				short_description:
					"Trois façons de poser une question : l'intonation (Tu viens ?), « est-ce que » (Est-ce que tu viens ?) ou l'inversion du sujet (Viens-tu ?, avec un trait d'union, et -t- quand il le faut : Vient-il ? Mange-t-il ?). Une phrase interrogative se termine par un point d'interrogation.",
				difficulty_hint: 'CE2',
				config: { generator: 'llm_transform', targets: ['interrogative'] }
			},
			{
				id: 'transfo-exclamative',
				display_name: 'Transformer en phrase exclamative',
				short_description:
					"Une phrase exclamative exprime un sentiment (joie, surprise, colère…) et se termine par un point d'exclamation. On peut ajouter « Quel(le)(s) … ! », « Comme … ! » ou « Que … ! » : Il fait beau. → Comme il fait beau !",
				difficulty_hint: 'CE2',
				config: { generator: 'llm_transform', targets: ['exclamative'] }
			},
			{
				id: 'transfo-imperative',
				display_name: 'Transformer en phrase impérative',
				short_description:
					"La phrase impérative donne un ordre ou un conseil. Le verbe est à l'impératif, sans sujet, et seulement à 3 personnes : tu, nous, vous (Tu ranges ta chambre. → Range ta chambre.). Attention : pas de s à la 2e personne pour les verbes en -er (et pour aller : va).",
				difficulty_hint: 'CM1',
				config: { generator: 'llm_transform', targets: ['imperative'] }
			},
			{
				id: 'transformations',
				display_name: 'Transformations de phrases (révision)',
				short_description:
					'Révision mélangée : forme négative, phrase interrogative, phrase exclamative, phrase impérative.',
				difficulty_hint: 'CM2',
				config: { generator: 'llm_transform', targets: ['negative', 'interrogative', 'exclamative', 'imperative'] }
			}
		];
		for (const data of seed) {
			let r;
			try {
				r = app.findRecordById('rules', data.id);
			} catch (_) {
				r = new Record(rules);
			}
			r.load(Object.assign({}, common, data));
			app.save(r);
		}
	},
	(app) => {
		for (const id of ['transfo-negative', 'transfo-interrogative', 'transfo-exclamative', 'transfo-imperative', 'transformations']) {
			try {
				app.delete(app.findRecordById('rules', id));
			} catch (_) {}
		}
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.getByName('rule_type').values = ['multiple_choice', 'free_text', 'qcm', 'span', 'punctuation'];
		app.save(rules);
	}
);
