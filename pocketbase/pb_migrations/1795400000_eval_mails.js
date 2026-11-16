/// <reference path="../pb_data/types.d.ts" />

// Mails « nouvelle évaluation » : suivi des envois élève par élève.
//   evaluations.mails : { idÉlève: { sent_at } | { fails, last_error_at } }
// Posé uniquement par le serveur (pb_hooks/lib/eval_mails.js).

const BASE_UPDATE_RULE =
	"@request.auth.id != '' && author = @request.auth.id" +
	' && @request.body.author:isset = false' +
	' && @request.body.status:isset = false' +
	' && @request.body.correction_released:isset = false';

migrate(
	(app) => {
		const evaluations = app.findCollectionByNameOrId('evaluations');
		evaluations.fields.add(new JSONField({ name: 'mails', maxSize: 0 }));
		evaluations.updateRule = BASE_UPDATE_RULE + ' && @request.body.mails:isset = false';
		app.save(evaluations);
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('evaluations');
		evaluations.fields.removeByName('mails');
		evaluations.updateRule = BASE_UPDATE_RULE;
		app.save(evaluations);
	}
);
