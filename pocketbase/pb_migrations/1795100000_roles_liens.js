/// <reference path="../pb_data/types.d.ts" />

// Rôles : user → eleve, ajout de parent.  eleve | parent | prof | admin
// Liens élève ↔ parent / prof (collection links) :
//   - demandés par l'une ou l'autre partie (route /api/gram/links), acceptés
//     par l'autre ; parent et enfant à la même adresse mail : lien direct ;
//   - supprimables par l'une ou l'autre partie (ou un admin).
// Les usernames sont recopiés dans le lien pour l'affichage, sans ouvrir la
// lecture de la collection users.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		role.values = ['user', 'eleve', 'parent', 'prof', 'admin'];
		app.save(users);
		app.db().newQuery("UPDATE users SET role = 'eleve' WHERE role = 'user' OR role = ''").execute();
		role.values = ['eleve', 'parent', 'prof', 'admin'];
		app.save(users);

		const party = "@request.auth.id != '' && (student = @request.auth.id || supervisor = @request.auth.id || @request.auth.role = 'admin')";
		const links = new Collection({
			type: 'base',
			name: 'links',
			listRule: party,
			viewRule: party,
			createRule: null, // via /api/gram/links
			updateRule: null, // acceptation via /api/gram/links/{id}/accept
			deleteRule: party,
			fields: [
				{ name: 'student', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'supervisor', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['parent', 'prof'] },
				{ name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'accepted'] },
				{ name: 'initiated_by', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'student_username', type: 'text', required: true, max: 20 },
				{ name: 'supervisor_username', type: 'text', required: true, max: 20 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_links_pair ON links (student, supervisor)',
				'CREATE INDEX idx_links_supervisor ON links (supervisor, status)'
			]
		});
		app.save(links);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('links'));
		} catch (_) {}
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		role.values = ['user', 'eleve', 'parent', 'prof', 'admin'];
		app.save(users);
		app.db().newQuery("UPDATE users SET role = 'user' WHERE role IN ('eleve', 'parent')").execute();
		role.values = ['user', 'prof', 'admin'];
		app.save(users);
	}
);
