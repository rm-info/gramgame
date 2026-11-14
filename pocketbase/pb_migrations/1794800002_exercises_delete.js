/// <reference path="../pb_data/types.d.ts" />

// Les profs et les admins peuvent supprimer un exercice (texte raté, doublon…).
// Les tentatives liées partent avec (relation attempts.exercise en cascade).

migrate(
	(app) => {
		const exercises = app.findCollectionByNameOrId('exercises');
		exercises.deleteRule = "@request.auth.id != '' && (@request.auth.role = 'prof' || @request.auth.role = 'admin')";
		app.save(exercises);
	},
	(app) => {
		const exercises = app.findCollectionByNameOrId('exercises');
		exercises.deleteRule = null;
		app.save(exercises);
	}
);
