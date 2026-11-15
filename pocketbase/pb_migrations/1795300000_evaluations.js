/// <reference path="../pb_data/types.d.ts" />

// Évaluations préparées par un prof ou un parent et données à des élèves.
//   evaluations      : titre, auteur, parties (exercices + barème), élèves visés,
//                      dates, durée, mode de correction
//   eval_submissions : une copie par élève (une seule tentative)
//   exercises.evaluation : les exercices d'une évaluation (supprimés avec elle)
//
// Les élèves ne lisent jamais ces collections directement : ils passent par
// /api/gram/evals/... qui envoie les sujets SANS les réponses.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const classes = app.findCollectionByNameOrId('classes');
		const isAuthor = "@request.auth.id != '' && (author = @request.auth.id || @request.auth.role = 'admin')";

		const evaluations = new Collection({
			type: 'base',
			name: 'evaluations',
			listRule: isAuthor,
			viewRule: isAuthor,
			// Auteur, statut, parties : posés par le serveur (pb_hooks).
			createRule:
				"@request.auth.id != '' && (@request.auth.role = 'prof' || @request.auth.role = 'parent' || @request.auth.role = 'admin')",
			updateRule:
				"@request.auth.id != '' && author = @request.auth.id" +
				' && @request.body.author:isset = false' +
				' && @request.body.status:isset = false' +
				' && @request.body.correction_released:isset = false',
			deleteRule: isAuthor,
			fields: [
				{ name: 'title', type: 'text', required: true, min: 1, max: 100 },
				{ name: 'author', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'author_username', type: 'text', required: true, max: 20 },
				{ name: 'grade_level', type: 'text', max: 20 },
				{ name: 'status', type: 'select', required: true, maxSelect: 1, values: ['draft', 'published'] },
				// [{ exercise, points, hard_mode }]
				{ name: 'parts', type: 'json', maxSize: 0 },
				{ name: 'classes', type: 'relation', maxSelect: 50, collectionId: classes.id, cascadeDelete: false },
				{ name: 'students', type: 'relation', maxSelect: 300, collectionId: users.id, cascadeDelete: false },
				{ name: 'opens_at', type: 'date' },
				{ name: 'closes_at', type: 'date' },
				{ name: 'time_limit_min', type: 'number', onlyInt: true, min: 0, max: 240 },
				{
					name: 'correction_mode',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['immediate', 'after_close', 'manual']
				},
				{ name: 'correction_released', type: 'bool' },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_evaluations_author ON evaluations (author)']
		});
		app.save(evaluations);

		const submissions = new Collection({
			type: 'base',
			name: 'eval_submissions',
			listRule: "@request.auth.id != '' && (evaluation.author = @request.auth.id || @request.auth.role = 'admin')",
			viewRule: "@request.auth.id != '' && (evaluation.author = @request.auth.id || @request.auth.role = 'admin')",
			createRule: null, // via /api/gram/evals/{id}/start
			updateRule: null,
			// L'auteur peut effacer une copie pour laisser l'élève recommencer.
			deleteRule: "@request.auth.id != '' && evaluation.author = @request.auth.id",
			fields: [
				{
					name: 'evaluation',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: evaluations.id,
					cascadeDelete: true
				},
				{ name: 'student', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'student_username', type: 'text', required: true, max: 20 },
				{ name: 'started_at', type: 'date', required: true },
				{ name: 'submitted_at', type: 'date' },
				// Rendue automatiquement à la fin du temps (ou à la fermeture).
				{ name: 'auto_submitted', type: 'bool' },
				// { exerciseId: { position: réponse } }
				{ name: 'responses', type: 'json', maxSize: 0 },
				// [{ exercise, points, earned, score, score_total, per_blank, ... }]
				{ name: 'results', type: 'json', maxSize: 0 },
				{ name: 'score_points', type: 'number' },
				{ name: 'total_points', type: 'number' },
				{ name: 'note20', type: 'number' },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_eval_submissions_pair ON eval_submissions (evaluation, student)',
				'CREATE INDEX idx_eval_submissions_student ON eval_submissions (student)'
			]
		});
		app.save(submissions);

		const exercises = app.findCollectionByNameOrId('exercises');
		exercises.fields.add(
			new RelationField({ name: 'evaluation', maxSelect: 1, collectionId: evaluations.id, cascadeDelete: true })
		);
		const editor = "(@request.auth.role = 'prof' || @request.auth.role = 'admin')";
		// Exercices d'évaluation : visibles par leur auteur (et l'admin), pas par
		// les autres profs ; modifiables par leur auteur, même parent.
		const visible =
			"@request.auth.id != '' && (owner = @request.auth.id || @request.auth.role = 'admin' ||" +
			" (@request.auth.role = 'prof' && evaluation = ''))";
		exercises.listRule = visible;
		exercises.viewRule = visible;
		exercises.updateRule =
			`((${editor} && (evaluation = '' || owner = @request.auth.id || @request.auth.role = 'admin'))` +
			" || (owner = @request.auth.id && evaluation != '' && @request.body.verified:isset = false))" +
			' && @request.body.owner:isset = false' +
			' && @request.body.owner_username:isset = false' +
			' && @request.body.rule:isset = false' +
			' && @request.body.evaluation:isset = false';
		app.save(exercises);
	},
	(app) => {
		const exercises = app.findCollectionByNameOrId('exercises');
		const editor = "(@request.auth.role = 'prof' || @request.auth.role = 'admin')";
		exercises.fields.removeByName('evaluation');
		exercises.listRule = `@request.auth.id != '' && (owner = @request.auth.id || ${editor})`;
		exercises.viewRule = `@request.auth.id != '' && (owner = @request.auth.id || ${editor})`;
		exercises.updateRule =
			`${editor}` +
			' && @request.body.owner:isset = false' +
			' && @request.body.owner_username:isset = false' +
			' && @request.body.rule:isset = false';
		app.save(exercises);
		for (const name of ['eval_submissions', 'evaluations']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
	}
);
