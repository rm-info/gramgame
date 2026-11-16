/// <reference path="../pb_data/types.d.ts" />

// Rappels quotidiens par notification (PWA) : l'auteur peut les couper pour
// une évaluation. Faux par défaut = rappels actifs.

migrate(
	(app) => {
		const evaluations = app.findCollectionByNameOrId('evaluations');
		evaluations.fields.add(new BoolField({ name: 'no_reminders' }));
		app.save(evaluations);
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('evaluations');
		evaluations.fields.removeByName('no_reminders');
		app.save(evaluations);
	}
);
