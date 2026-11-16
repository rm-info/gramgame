/// <reference path="../pb_data/types.d.ts" />

// Évaluations V2 : sorties de page pendant l'épreuve.
//   eval_submissions.leaves       : nombre de fois où l'élève a quitté la page
//   eval_submissions.away_seconds : temps passé hors de la page
//   eval_submissions.left_at      : sortie en cours (vide sinon)
// Les corrections manuelles du prof sont rangées dans results (per_blank[].overridden).

migrate(
	(app) => {
		const subs = app.findCollectionByNameOrId('eval_submissions');
		subs.fields.add(new NumberField({ name: 'leaves', onlyInt: true, min: 0 }));
		subs.fields.add(new NumberField({ name: 'away_seconds', onlyInt: true, min: 0 }));
		subs.fields.add(new DateField({ name: 'left_at' }));
		app.save(subs);
	},
	(app) => {
		const subs = app.findCollectionByNameOrId('eval_submissions');
		for (const f of ['leaves', 'away_seconds', 'left_at']) subs.fields.removeByName(f);
		app.save(subs);
	}
);
