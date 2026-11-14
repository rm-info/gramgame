/// <reference path="../pb_data/types.d.ts" />

// Nouveaux types d'exercices (programme CM2 période 1, conjugaison + grammaire).
//
// rules.rule_type :
//   multiple_choice  texte à trous + menu (homophones)            — existant
//   free_text        texte à trous à remplir au clavier            — conjugaison, accord
//   qcm              liste de questions, un choix par question     — groupes, passé/futur proche, pronoms
// rules.config (JSON) : comment générer l'exercice
//   { generator: 'verb_groups' }                       liste de verbes tirée au sort, sans LLM
//   { generator: 'llm_qcm', check, highlight, balance } questions écrites par le LLM, vérifiées
//   { generator: 'conj_present', pool, focus }          verbes/personnes choisis par le serveur,
//                                                       réponses calculées (lib/conjugaison.js)
// rules.category : orthographe / grammaire / conjugaison (regroupement dans /new)

migrate(
	(app) => {
		const rules = app.findCollectionByNameOrId('rules');

		const ruleType = rules.fields.getByName('rule_type');
		ruleType.values = ['multiple_choice', 'free_text', 'qcm'];

		// Les exercices de saisie n'ont pas de liste de candidats.
		rules.fields.getByName('candidates').required = false;

		rules.fields.add(new JSONField({ name: 'config', maxSize: 0 }));
		rules.fields.add(
			new SelectField({
				name: 'category',
				maxSelect: 1,
				values: ['orthographe', 'grammaire', 'conjugaison']
			})
		);
		app.save(rules);

		// Toutes les règles existantes sont des homophones.
		for (const r of app.findAllRecords('rules')) {
			if (!r.getString('category')) {
				r.set('category', 'orthographe');
				app.save(r);
			}
		}

		const seed = [
			// ── Conjugaison ──────────────────────────────────────────────
			{
				id: 'groupe-verbe',
				category: 'conjugaison',
				display_name: "Groupe d'un verbe",
				short_description:
					"Classer des verbes dans le 1er, 2e ou 3e groupe : -er → 1er groupe (sauf « aller ») ; -ir avec « nous …issons » → 2e groupe ; tous les autres → 3e groupe. (« être » et « avoir » sont des auxiliaires : ils ne sont pas proposés.)",
				rule_type: 'qcm',
				candidates: ['1er groupe', '2e groupe', '3e groupe'],
				config: { generator: 'verb_groups' },
				difficulty_hint: 'CM1'
			},
			{
				id: 'passe-futur-proche',
				category: 'conjugaison',
				display_name: 'Passé proche ou futur proche',
				short_description:
					"Passé proche = « venir de » + infinitif (il vient de partir) ; futur proche = « aller » + infinitif (il va partir). Pièges au présent : « il va à l'école », « elle vient de Lyon » (pas d'infinitif).",
				rule_type: 'qcm',
				candidates: ['passé proche', 'futur proche', 'présent'],
				config: { generator: 'llm_qcm', check: 'proche', highlight: true, balance: true },
				difficulty_hint: 'CM1',
				examples: [
					{ sentence: 'Nous [[venons de terminer]] le gâteau.', answer: 'passé proche', rationale: 'venir de + infinitif' },
					{ sentence: 'Le train [[va partir]] dans cinq minutes.', answer: 'futur proche', rationale: 'aller + infinitif' },
					{ sentence: "Chaque matin, Léa [[va]] à l'école à pied.", answer: 'présent', rationale: "aller suivi d'un lieu, pas d'un infinitif" },
					{ sentence: 'Mon oncle [[vient]] de Marseille.', answer: 'présent', rationale: "venir de suivi d'un lieu, pas d'un infinitif" }
				]
			},
			{
				id: 'present-indicatif',
				category: 'conjugaison',
				display_name: "Présent de l'indicatif",
				short_description:
					'Conjuguer au présent des verbes des trois groupes (et être, avoir), à toutes les personnes.',
				rule_type: 'free_text',
				candidates: null,
				config: { generator: 'conj_present', pool: 'present' },
				difficulty_hint: 'CE2'
			},
			{
				id: 'present-eter-eler',
				category: 'conjugaison',
				display_name: 'Verbes en -eter et -eler au présent',
				short_description:
					"« appeler » et « jeter » (et leurs dérivés) doublent la consonne devant un e muet : j'appelle, il jette. « acheter », « geler », « peler », « modeler »… prennent un accent grave : j'achète, il gèle. Avec nous et vous, rien ne change : nous appelons, vous achetez.",
				rule_type: 'free_text',
				candidates: null,
				config: { generator: 'conj_present', pool: 'eter_eler' },
				difficulty_hint: 'CM2'
			},
			// ── Grammaire ────────────────────────────────────────────────
			{
				id: 'accord-sujet-verbe',
				category: 'grammaire',
				display_name: 'Accorder le verbe avec son sujet',
				short_description:
					'Trouver le sujet du verbe (même éloigné, inversé, ou formé de plusieurs noms) et accorder le verbe au présent.',
				rule_type: 'free_text',
				candidates: null,
				config: { generator: 'conj_present', pool: 'accord', focus: 'accord' },
				difficulty_hint: 'CM2'
			},
			{
				id: 'pronom-gns',
				category: 'grammaire',
				display_name: 'Remplacer le GNS par un pronom',
				short_description:
					"Remplacer le groupe nominal sujet par le pronom personnel qui convient : il, elle, ils, elles — ou nous / vous quand le sujet contient « moi » / « toi ». Masculin + féminin → ils.",
				rule_type: 'qcm',
				candidates: ['il', 'elle', 'ils', 'elles', 'nous', 'vous'],
				config: { generator: 'llm_qcm', check: 'pronom', highlight: true },
				difficulty_hint: 'CM1',
				examples: [
					{ sentence: '[[La maîtresse]] corrige les cahiers.', answer: 'elle' },
					{ sentence: '[[Les chiens du voisin]] aboient toute la nuit.', answer: 'ils' },
					{ sentence: '[[Mes sœurs et mon cousin]] jouent dehors.', answer: 'ils', rationale: 'masculin + féminin → ils' },
					{ sentence: '[[Ma sœur et moi]] rangeons la chambre.', answer: 'nous', rationale: 'le sujet contient « moi »' },
					{ sentence: '[[Toi et Paul]] partez demain.', answer: 'vous', rationale: 'le sujet contient « toi »' }
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
			r.load(Object.assign({ groups: null, examples: null }, data));
			app.save(r);
		}
	},
	(app) => {
		for (const id of ['groupe-verbe', 'passe-futur-proche', 'present-indicatif', 'present-eter-eler', 'accord-sujet-verbe', 'pronom-gns']) {
			try {
				app.delete(app.findRecordById('rules', id));
			} catch (_) {}
		}
		const rules = app.findCollectionByNameOrId('rules');
		rules.fields.removeByName('config');
		rules.fields.removeByName('category');
		rules.fields.getByName('candidates').required = true;
		rules.fields.getByName('rule_type').values = ['multiple_choice', 'free_text'];
		app.save(rules);
	}
);
