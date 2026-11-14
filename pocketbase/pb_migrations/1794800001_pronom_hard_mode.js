/// <reference path="../pb_data/types.d.ts" />

// Mode difficile pour « Remplacer le GNS par un pronom » : le groupe nominal
// sujet n'est plus surligné, l'élève doit d'abord le retrouver.
// config.hard_mode = 'hide_highlight' (QCM avec passage [[ ]]) ;
// config.hard_consigne = consigne affichée dans ce mode.

migrate(
	(app) => {
		let r;
		try {
			r = app.findRecordById('rules', 'pronom-gns');
		} catch (_) {
			return;
		}
		let cfg = {};
		try {
			cfg = JSON.parse(toString(r.get('config'))) || {};
		} catch (_) {}
		cfg.hard_mode = 'hide_highlight';
		cfg.hard_consigne =
			"Retrouve d'abord le groupe nominal sujet de chaque phrase, puis choisis le pronom qui peut le remplacer.";
		r.set('config', cfg);
		app.save(r);
	},
	(app) => {
		let r;
		try {
			r = app.findRecordById('rules', 'pronom-gns');
		} catch (_) {
			return;
		}
		let cfg = {};
		try {
			cfg = JSON.parse(toString(r.get('config'))) || {};
		} catch (_) {}
		delete cfg.hard_mode;
		delete cfg.hard_consigne;
		r.set('config', cfg);
		app.save(r);
	}
);
