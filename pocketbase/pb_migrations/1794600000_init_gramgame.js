/// <reference path="../pb_data/types.d.ts" />

// Schéma initial GramGame (portage depuis les migrations Supabase 0001 → 0013).
//
// Modèle d'auth : 1 nom d'utilisateur = 1 enregistrement `users` (collection auth).
// Plusieurs comptes peuvent partager la même adresse réelle (`real_email`) : le
// champ système `email` de PocketBase (qui doit être unique) reçoit une adresse
// synthétique non routable (`<username>@users.gramgame.invalid`) et le hook
// `onMailerRecordOTPSend` redirige les codes OTP vers `real_email`.
//
// Les policies RLS deviennent des API rules ; les triggers (dernier admin,
// changement de son propre rôle) deviennent des hooks dans pb_hooks/.

migrate(
	(app) => {
		// ──────────────────────────────────────────────────────────────────
		// users (collection auth livrée par défaut par PocketBase)
		// ──────────────────────────────────────────────────────────────────
		const users = app.findCollectionByNameOrId('users');

		for (const name of ['name', 'avatar']) {
			if (users.fields.getByName(name)) users.fields.removeByName(name);
		}

		users.fields.add(
			new TextField({
				name: 'username',
				required: true,
				presentable: true,
				min: 3,
				max: 20,
				pattern: '^[a-z0-9_-]{3,20}$'
			})
		);
		users.fields.add(new EmailField({ name: 'real_email', required: true }));
		users.fields.add(
			new SelectField({
				name: 'role',
				required: true,
				maxSelect: 1,
				values: ['user', 'prof', 'admin']
			})
		);
		users.fields.add(new TextField({ name: 'grade_level', max: 20 }));
		users.addIndex('idx_users_username', true, 'username', '');
		users.addIndex('idx_users_real_email', false, 'real_email', '');

		// Lecture : soi-même, ou admin (page /admin/users).
		users.listRule = "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')";
		users.viewRule = users.listRule;
		// Création uniquement via la route /api/gram/register.
		users.createRule = null;
		// Un utilisateur ne peut modifier que son niveau ; un admin peut tout
		// modifier (rôle notamment). Les garde-fous (dernier admin, son propre
		// rôle) sont dans pb_hooks/gramgame.pb.js.
		users.updateRule =
			"@request.auth.role = 'admin' || (id = @request.auth.id" +
			' && @request.body.role:isset = false' +
			' && @request.body.username:isset = false' +
			' && @request.body.real_email:isset = false' +
			' && @request.body.email:isset = false' +
			' && @request.body.verified:isset = false)';
		users.deleteRule = "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')";

		users.passwordAuth.enabled = false;
		users.oauth2.enabled = false;
		users.mfa.enabled = false;
		users.authAlert.enabled = false;
		users.otp.enabled = true;
		users.otp.duration = 900; // 15 min
		users.otp.length = 6;
		users.otp.emailTemplate.subject = 'Ton code GramGame : {OTP}';
		users.otp.emailTemplate.body =
			'<p>Bonjour <strong>{RECORD:username}</strong>,</p>\n' +
			'<p>Voici ton code de connexion à {APP_NAME} :</p>\n' +
			'<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">{OTP}</p>\n' +
			'<p>Il est valable 15 minutes. Si tu n\'as rien demandé, ignore simplement ce message.</p>\n' +
			'<p>— {APP_NAME}</p>';
		users.authToken.duration = 60 * 60 * 24 * 30; // 30 jours (rafraîchi à chaque visite)

		app.save(users);

		// ──────────────────────────────────────────────────────────────────
		// rules : catalogue de règles (lecture publique, CRUD admin)
		// ──────────────────────────────────────────────────────────────────
		const rules = new Collection({
			type: 'base',
			name: 'rules',
			listRule: '',
			viewRule: '',
			createRule: "@request.auth.role = 'admin'",
			updateRule: "@request.auth.role = 'admin'",
			deleteRule: "@request.auth.role = 'admin'",
			fields: [
				{
					name: 'id',
					type: 'text',
					system: true,
					primaryKey: true,
					required: true,
					min: 2,
					max: 50,
					pattern: '^[a-z0-9-]+$',
					autogeneratePattern: ''
				},
				{ name: 'display_name', type: 'text', required: true, max: 100 },
				{ name: 'short_description', type: 'text', required: true, max: 2000 },
				{
					name: 'rule_type',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['multiple_choice', 'free_text']
				},
				{ name: 'candidates', type: 'json', required: true, maxSize: 0 },
				{ name: 'difficulty_hint', type: 'text', max: 50 },
				{ name: 'examples', type: 'json', maxSize: 0 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			]
		});
		app.save(rules);

		// ──────────────────────────────────────────────────────────────────
		// exercises
		// ──────────────────────────────────────────────────────────────────
		const editor = "(@request.auth.role = 'prof' || @request.auth.role = 'admin')";
		const exercises = new Collection({
			type: 'base',
			name: 'exercises',
			listRule: `@request.auth.id != '' && (owner = @request.auth.id || ${editor})`,
			viewRule: `@request.auth.id != '' && (owner = @request.auth.id || ${editor})`,
			createRule: null, // via /api/gram/generate
			updateRule:
				`${editor}` +
				' && @request.body.owner:isset = false' +
				' && @request.body.owner_username:isset = false' +
				' && @request.body.rule:isset = false',
			deleteRule: null,
			fields: [
				{
					name: 'owner',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				// Dénormalisé (le username est immuable) pour l'affichage côté prof
				// sans ouvrir la lecture de la collection users.
				{ name: 'owner_username', type: 'text', required: true, max: 20 },
				{
					name: 'rule',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: rules.id,
					cascadeDelete: false
				},
				{ name: 'theme', type: 'text', required: true, max: 500 },
				{ name: 'grade_level', type: 'text', required: true, max: 20 },
				{ name: 'num_blanks', type: 'number', required: true, onlyInt: true, min: 1 },
				{ name: 'text', type: 'text', required: true, max: 50000 },
				{ name: 'blanks', type: 'json', required: true, maxSize: 0 },
				{ name: 'llm_model', type: 'text', max: 200 },
				{ name: 'verified', type: 'bool' },
				{ name: 'verified_at', type: 'date' },
				{ name: 'verified_by_username', type: 'text', max: 20 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_exercises_owner ON exercises (owner, created)',
				'CREATE INDEX idx_exercises_created ON exercises (created)'
			]
		});
		app.save(exercises);

		// ──────────────────────────────────────────────────────────────────
		// attempts
		// ──────────────────────────────────────────────────────────────────
		const attempts = new Collection({
			type: 'base',
			name: 'attempts',
			listRule: "@request.auth.id != '' && user = @request.auth.id",
			viewRule: "@request.auth.id != '' && user = @request.auth.id",
			createRule: null, // via /api/gram/correct
			updateRule: null,
			deleteRule: null,
			fields: [
				{
					name: 'exercise',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: exercises.id,
					cascadeDelete: true
				},
				{
					name: 'user',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true
				},
				{ name: 'responses', type: 'json', maxSize: 0 },
				{ name: 'score', type: 'number', onlyInt: true, min: 0 },
				{ name: 'score_total', type: 'number', required: true, onlyInt: true, min: 1 },
				{ name: 'per_rule_breakdown', type: 'json', maxSize: 0 },
				{ name: 'appreciation', type: 'text', max: 5000 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_attempts_user ON attempts (user, created)']
		});
		app.save(attempts);

		// ──────────────────────────────────────────────────────────────────
		// Seed des règles (0002 + 0006)
		// ──────────────────────────────────────────────────────────────────
		const seed = [
			{
				id: 'ou-ou',
				display_name: 'ou / où',
				short_description:
					'Distinction entre la conjonction « ou » (alternative) et l\'adverbe « où » (lieu/temps).',
				rule_type: 'multiple_choice',
				candidates: ['ou', 'où'],
				difficulty_hint: 'CE1',
				examples: [
					{ sentence: 'Le château {{?}} habite la sorcière est sombre.', answer: 'où', rationale: 'où introduit une relative de lieu' },
					{ sentence: 'Va dans la pièce {{?}} se trouve le coffre.', answer: 'où', rationale: 'où introduit une relative de lieu' },
					{ sentence: 'Tu veux du pain {{?}} de la brioche ?', answer: 'ou', rationale: 'ou marque une alternative entre deux choix' },
					{ sentence: 'Il faut choisir entre la mer {{?}} la montagne.', answer: 'ou', rationale: 'ou marque une alternative' }
				]
			},
			{
				id: 'a-a',
				display_name: 'a / à',
				short_description:
					'Distinction entre le verbe « a » (auxiliaire avoir, 3e personne du singulier) et la préposition « à ».',
				rule_type: 'multiple_choice',
				candidates: ['a', 'à'],
				difficulty_hint: 'CE1',
				examples: [
					{ sentence: 'Il {{?}} mangé toute la tarte.', answer: 'a', rationale: 'verbe avoir conjugué (3e personne du singulier)' },
					{ sentence: 'Elle {{?}} couru jusqu\'au bout du jardin.', answer: 'a', rationale: 'auxiliaire avoir' },
					{ sentence: 'Nous allons {{?}} la piscine cet après-midi.', answer: 'à', rationale: 'préposition de lieu' },
					{ sentence: 'Elle parle {{?}} sa sœur tous les soirs.', answer: 'à', rationale: 'préposition (parler à quelqu\'un)' }
				]
			}
		];
		for (const data of seed) {
			const r = new Record(rules);
			r.load(data);
			app.save(r);
		}

		// ──────────────────────────────────────────────────────────────────
		// Réglages
		// ──────────────────────────────────────────────────────────────────
		const settings = app.settings();
		settings.meta.appName = 'GramGame';
		settings.meta.senderName = 'GramGame';
		// Rate limiting (désactivé par défaut dans PocketBase)
		settings.rateLimits.enabled = true;
		settings.rateLimits.rules = [
			{ label: '/api/gram/login', maxRequests: 5, duration: 60 },
			{ label: '/api/gram/register', maxRequests: 5, duration: 60 },
			{ label: '/api/gram/generate', maxRequests: 10, duration: 60 },
			{ label: '/api/gram/correct', maxRequests: 20, duration: 60 },
			{ label: '*:auth', maxRequests: 5, duration: 10 },
			{ label: '*:create', maxRequests: 20, duration: 5 },
			{ label: '/api/batch', maxRequests: 3, duration: 1 },
			{ label: '/api/', maxRequests: 300, duration: 10 }
		];
		// Sauvegarde auto quotidienne (zip dans pb_data/backups, 7 conservées)
		settings.backups.cron = '30 3 * * *';
		settings.backups.cronMaxKeep = 7;
		app.save(settings);
	},
	(app) => {
		for (const name of ['attempts', 'exercises', 'rules']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
	}
);
