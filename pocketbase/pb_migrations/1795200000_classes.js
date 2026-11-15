/// <reference path="../pb_data/types.d.ts" />

// Classes d'un prof : un code par classe ; un élève qui le saisit rejoint la
// classe directement (le prof voit alors ses résultats dans le suivi).
//   classes       : nom, prof, code (généré par le serveur, régénérable)
//   class_members : appartenance d'un élève à une classe

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const teacherOrAdmin = "(@request.auth.role = 'prof' || @request.auth.role = 'admin')";

		const classes = new Collection({
			type: 'base',
			name: 'classes',
			listRule: "@request.auth.id != '' && (teacher = @request.auth.id || @request.auth.role = 'admin')",
			viewRule: "@request.auth.id != '' && (teacher = @request.auth.id || @request.auth.role = 'admin')",
			// Le prof et le code sont posés par le serveur (pb_hooks), pas par le client.
			createRule: `@request.auth.id != '' && ${teacherOrAdmin}`,
			updateRule:
				"@request.auth.id != '' && teacher = @request.auth.id && @request.body.teacher:isset = false && @request.body.code:isset = false",
			deleteRule: "@request.auth.id != '' && (teacher = @request.auth.id || @request.auth.role = 'admin')",
			fields: [
				{ name: 'name', type: 'text', required: true, min: 1, max: 60 },
				{ name: 'teacher', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'teacher_username', type: 'text', required: true, max: 20 },
				{ name: 'code', type: 'text', required: true, min: 6, max: 6, pattern: '^[A-Z0-9]{6}$' },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_classes_code ON classes (code)',
				'CREATE INDEX idx_classes_teacher ON classes (teacher)'
			]
		});
		app.save(classes);

		const members = new Collection({
			type: 'base',
			name: 'class_members',
			listRule:
				"@request.auth.id != '' && (student = @request.auth.id || class.teacher = @request.auth.id || @request.auth.role = 'admin')",
			viewRule:
				"@request.auth.id != '' && (student = @request.auth.id || class.teacher = @request.auth.id || @request.auth.role = 'admin')",
			createRule: null, // via /api/gram/classes/join
			updateRule: null,
			// L'élève quitte la classe, ou le prof l'en retire.
			deleteRule:
				"@request.auth.id != '' && (student = @request.auth.id || class.teacher = @request.auth.id || @request.auth.role = 'admin')",
			fields: [
				{ name: 'class', type: 'relation', required: true, maxSelect: 1, collectionId: classes.id, cascadeDelete: true },
				{ name: 'student', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'student_username', type: 'text', required: true, max: 20 },
				// Recopiés pour l'affichage côté élève (qui ne peut pas lire classes).
				{ name: 'class_name', type: 'text', required: true, max: 60 },
				{ name: 'teacher_username', type: 'text', required: true, max: 20 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_class_members_pair ON class_members (class, student)',
				'CREATE INDEX idx_class_members_student ON class_members (student)'
			]
		});
		app.save(members);

		// Limite de débit sur la saisie des codes (anti-essais en rafale).
		const settings = app.settings();
		const rules = [{ label: '/api/gram/classes/join', maxRequests: 10, duration: 60 }];
		const current = settings.rateLimits.rules || [];
		for (let i = 0; i < current.length; i++) {
			const r = current[i];
			if (r.label !== '/api/gram/classes/join') {
				rules.push({ label: r.label, maxRequests: r.maxRequests, duration: r.duration, audience: r.audience });
			}
		}
		settings.rateLimits.rules = rules;
		app.save(settings);
	},
	(app) => {
		for (const name of ['class_members', 'classes']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
	}
);
