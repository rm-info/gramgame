/// <reference path="../pb_data/types.d.ts" />

// Logique serveur GramGame (remplace les Edge Functions + triggers Supabase).
//
// Routes custom (préfixe /api/gram/) :
//   POST /api/gram/register  { username, email }       → { otpId, email_hint }
//   POST /api/gram/login     { username }              → { otpId, email_hint }
//   POST /api/gram/generate  { rule_id, theme, grade_level, num_blanks }  (auth)
//   POST /api/gram/correct   { exercise_id, responses }                   (auth)
//   POST /api/gram/links, /links/{id}/accept     liens élève ↔ parent/prof  (auth)
//   POST /api/gram/classes/join { code }         l'élève rejoint une classe (auth)
//   POST /api/gram/classes/{id}/code             nouveau code de classe     (auth)
//   GET  /api/gram/suivi                         tableau de suivi           (auth)
//
// Le login final se fait côté client avec le SDK :
//   pb.collection('users').authWithOTP(otpId, code)
//
// Rappel : chaque handler doit `require` ses helpers (VMs isolées).

// ────────────────────────────────────────────────────────────────────────────
// Configuration depuis l'environnement (SMTP, URL publique, proxy)
// ────────────────────────────────────────────────────────────────────────────
onBootstrap((e) => {
	e.next();

	const get = (k) => $os.getenv(k);
	const settings = e.app.settings();
	let changed = false;

	if (get('APP_URL')) {
		settings.meta.appURL = get('APP_URL');
		changed = true;
	}
	if (get('MAIL_SENDER_ADDRESS')) {
		settings.meta.senderAddress = get('MAIL_SENDER_ADDRESS');
		changed = true;
	}
	if (get('MAIL_SENDER_NAME')) {
		settings.meta.senderName = get('MAIL_SENDER_NAME');
		changed = true;
	}
	if (get('SMTP_HOST')) {
		settings.smtp.enabled = true;
		settings.smtp.host = get('SMTP_HOST');
		settings.smtp.port = parseInt(get('SMTP_PORT') || '587', 10);
		settings.smtp.username = get('SMTP_USERNAME');
		settings.smtp.password = get('SMTP_PASSWORD');
		// true = TLS implicite (port 465). false = STARTTLS si dispo (port 587).
		settings.smtp.tls = get('SMTP_TLS') === 'true';
		if (get('SMTP_AUTH_METHOD')) settings.smtp.authMethod = get('SMTP_AUTH_METHOD');
		changed = true;
	}
	if (get('TRUSTED_PROXY_HEADERS')) {
		settings.trustedProxy.headers = get('TRUSTED_PROXY_HEADERS')
			.split(',')
			.map((h) => h.trim())
			.filter(Boolean);
		changed = true;
	}

	if (changed) e.app.save(settings);
});

// ────────────────────────────────────────────────────────────────────────────
// Mails OTP : l'adresse système `email` est synthétique, on redirige vers
// l'adresse réelle de l'utilisateur.
// ────────────────────────────────────────────────────────────────────────────
onMailerRecordOTPSend((e) => {
	const real = e.record.getString('real_email');
	if (real) {
		e.message.to = [{ address: real, name: e.record.getString('username') }];
	}
	e.next();
}, 'users');

// ────────────────────────────────────────────────────────────────────────────
// Anti brute-force des codes : plafond d'échecs par compte (cf. lib/gram.js).
// ────────────────────────────────────────────────────────────────────────────
routerUse((e) => {
	if (
		e.request.method !== 'POST' ||
		// Toute collection (nom, id, casse…) : le compte est identifié par l'OTP.
		!/^\/api\/collections\/[^/]+\/auth-with-otp\/?$/i.test(e.request.url.path)
	) {
		return e.next();
	}

	const g = require(`${__hooks}/lib/gram.js`);
	let userId = '';
	try {
		userId = e.app.findOTPById(String(g.readJsonBody(e).otpId || '')).getString('recordRef');
	} catch (_) {}

	if (userId && g.isAccountLocked(e.app, userId)) {
		throw new TooManyRequestsError('Trop de codes erronés sur ce compte. Réessaie dans une heure.');
	}

	try {
		e.next();
	} catch (err) {
		if (userId) g.recordOtpFailure(e.app, userId);
		throw err;
	}
});

// ────────────────────────────────────────────────────────────────────────────
// Inscription
// ────────────────────────────────────────────────────────────────────────────
routerAdd('POST', '/api/gram/register', (e) => {
	const g = require(`${__hooks}/lib/gram.js`);
	const body = g.readJsonBody(e);

	const username = String(body.username || '').trim().toLowerCase();
	const email = String(body.email || '').trim().toLowerCase();
	if (!g.USERNAME_RE.test(username)) {
		return e.json(400, { error: "Nom d'utilisateur invalide : 3 à 20 caractères, lettres/chiffres/-/_." });
	}
	if (!g.EMAIL_RE.test(email) || email.length > 254) {
		return e.json(400, { error: 'Adresse email invalide.' });
	}

	let user = g.findUserByUsername(e.app, username);

	if (user) {
		// Compte jamais activé avec la même adresse : on renvoie simplement un
		// code (cas « je n'ai pas reçu / j'ai fermé l'onglet »).
		if (!user.verified() && user.getString('real_email') === email) {
			const sent = g.sendOtp(e.app, user);
			if (sent.error) return e.json(sent.status, { error: sent.error });
			return e.json(200, { otpId: sent.otpId, email_hint: g.maskEmail(email) });
		}
		return e.json(409, { error: "Ce nom d'utilisateur est déjà pris." });
	}

	const collection = e.app.findCollectionByNameOrId('users');
	// Le tout premier compte devient admin (bootstrap).
	const isFirst = e.app.countRecords(collection) === 0;

	user = new Record(collection);
	user.set('username', username);
	user.set('real_email', email);
	user.set('email', g.syntheticEmail(username));
	user.set('emailVisibility', false);
	user.set('verified', false);
	// Rôle choisi à l'inscription : élève (défaut) ou parent. Le rôle prof
	// est attribué par un admin (un prof peut modifier tous les exercices).
	const wanted = body.role === 'parent' ? 'parent' : 'eleve';
	user.set('role', isFirst ? 'admin' : wanted);
	user.setRandomPassword();

	try {
		e.app.save(user);
	} catch (err) {
		// Course possible sur l'index unique username.
		if (g.findUserByUsername(e.app, username)) {
			return e.json(409, { error: "Ce nom d'utilisateur est déjà pris." });
		}
		e.app.logger().error('Inscription échouée', 'error', String(err));
		return e.json(500, { error: 'Inscription échouée.' });
	}

	const sent = g.sendOtp(e.app, user);
	if (sent.error) return e.json(sent.status, { error: sent.error });
	return e.json(200, { otpId: sent.otpId, email_hint: g.maskEmail(email) });
});

// ────────────────────────────────────────────────────────────────────────────
// Connexion (demande de code)
// ────────────────────────────────────────────────────────────────────────────
routerAdd('POST', '/api/gram/login', (e) => {
	const g = require(`${__hooks}/lib/gram.js`);
	const body = g.readJsonBody(e);

	const username = String(body.username || '').trim().toLowerCase();
	if (!g.USERNAME_RE.test(username)) {
		return e.json(400, { error: "Nom d'utilisateur invalide." });
	}

	const user = g.findUserByUsername(e.app, username);
	if (!user) {
		return e.json(404, { error: "Aucun compte avec ce nom d'utilisateur." });
	}

	const sent = g.sendOtp(e.app, user);
	if (sent.error) return e.json(sent.status, { error: sent.error });
	return e.json(200, { otpId: sent.otpId, email_hint: g.maskEmail(user.getString('real_email')) });
});

// ────────────────────────────────────────────────────────────────────────────
// Génération d'exercice
// ────────────────────────────────────────────────────────────────────────────
routerAdd(
	'POST',
	'/api/gram/generate',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const body = g.readJsonBody(e);
		const out = require(`${__hooks}/lib/generation.js`).generateExercise(e.app, e.auth, body || {});
		if (!out.record) return e.json(out.status, { error: out.error, debug: out.debug });
		return e.json(200, {
			id: out.record.id,
			text: out.record.getString('text'),
			blanks: (g.jsonField(out.record, 'blanks') || []).map((b) => ({ position: b.position })),
			rule: { id: out.rule.id, display_name: out.rule.display_name, candidates: out.rule.candidates }
		});
	},
	$apis.requireAuth('users')
);

// ────────────────────────────────────────────────────────────────────────────
// Correction d'une tentative
// ────────────────────────────────────────────────────────────────────────────
routerAdd(
	'POST',
	'/api/gram/correct',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const body = g.readJsonBody(e);

		if (
			!body ||
			typeof body.exercise_id !== 'string' ||
			!body.exercise_id ||
			!body.responses ||
			typeof body.responses !== 'object' ||
			Array.isArray(body.responses)
		) {
			return e.json(400, { error: 'Corps de requête invalide.' });
		}

		let exRecord;
		try {
			exRecord = e.app.findRecordById('exercises', body.exercise_id);
		} catch (_) {
			return e.json(404, { error: 'Exercice introuvable.' });
		}
		// Même visibilité que l'API rule : propriétaire ou prof/admin.
		if (exRecord.getString('owner') !== e.auth.id && !g.isEditor(e.auth)) {
			return e.json(404, { error: 'Exercice introuvable.' });
		}

		const gr = require(`${__hooks}/lib/grading.js`);
		const exercise = gr.exerciseData(exRecord);
		let rule;
		try {
			rule = gr.loadRule(e.app, exercise.rule);
		} catch (_) {
			return e.json(500, { error: 'Règle introuvable.' });
		}
		// Mode difficile : homophones (tous les candidats), transformations écrites,
		// ou QCM dont le passage surligné est masqué (config.hard_mode = 'hide_highlight').
		const hardMode = body.hard_mode === true && gr.hardModeAllowed(rule);
		const responses = gr.cleanResponses(rule.rule_type, body.responses);
		const grading = gr.gradeExercise(exercise, rule, responses, hardMode, e.app.logger());
		if (grading.score_total === 0) {
			return e.json(400, { error: 'Aucune réponse fournie.' });
		}

		// Appréciation LLM best-effort : fallback déterministe en cas d'échec.
		let appreciation;
		try {
			const cfg = g.llmConfig();
			if (!cfg.apiKey) throw new Error('LLM_API_KEY manquante');
			appreciation = g.generateAppreciation(cfg, exercise, rule, grading);
		} catch (err) {
			e.app.logger().warn('Appréciation LLM échouée, fallback', 'error', String((err && err.message) || err));
			appreciation = g.fallbackAppreciation(grading);
		}

		const attempt = new Record(e.app.findCollectionByNameOrId('attempts'));
		attempt.set('exercise', exercise.id);
		attempt.set('user', e.auth.id);
		attempt.set('responses', responses);
		attempt.set('score', grading.score);
		attempt.set('score_total', grading.score_total);
		// Détail par confusion rangé sous la règle (pour les stats de maîtrise).
		const breakdown = grading.per_rule_breakdown;
		if (Object.keys(grading.per_group_breakdown).length) {
			breakdown[exercise.rule].groups = grading.per_group_breakdown;
		}
		attempt.set('per_rule_breakdown', breakdown);
		attempt.set('hard_mode', hardMode);
		attempt.set('appreciation', appreciation);

		try {
			e.app.save(attempt);
		} catch (err) {
			e.app.logger().error('Sauvegarde tentative échouée', 'error', String(err));
			return e.json(500, { error: 'Sauvegarde échouée.' });
		}

		return e.json(200, {
			score: grading.score,
			score_total: grading.score_total,
			per_blank: grading.per_blank,
			per_rule_breakdown: grading.per_rule_breakdown,
			per_group_breakdown: grading.per_group_breakdown,
			hard_mode: hardMode,
			appreciation,
			suggested_next_rule_id: grading.suggested_next_rule_id
		});
	},
	$apis.requireAuth('users')
);

// ────────────────────────────────────────────────────────────────────────────
// Garde-fous sur les rôles (ex-triggers 0008, 0009, 0011)
// ────────────────────────────────────────────────────────────────────────────
onRecordUpdateRequest((e) => {
	const oldRole = e.record.original().getString('role');
	const newRole = e.record.getString('role');

	if (oldRole !== newRole) {
		if (e.auth && e.auth.collection().name === 'users' && e.auth.id === e.record.id) {
			throw new BadRequestError('Tu ne peux pas modifier ton propre rôle. Un autre administrateur doit le faire.');
		}
		if (oldRole === 'admin') {
			const others = e.app.countRecords(
				'users',
				$dbx.hashExp({ role: 'admin' }),
				$dbx.not($dbx.hashExp({ id: e.record.id }))
			);
			if (others === 0) {
				throw new BadRequestError(
					"Impossible : il doit toujours rester au moins un administrateur. Promeus quelqu'un d'autre admin avant de te démettre."
				);
			}
		}
	}
	e.next();
}, 'users');

onRecordDeleteRequest((e) => {
	if (e.record.getString('role') === 'admin') {
		const others = e.app.countRecords(
			'users',
			$dbx.hashExp({ role: 'admin' }),
			$dbx.not($dbx.hashExp({ id: e.record.id }))
		);
		if (others === 0) {
			throw new BadRequestError(
				"Impossible : il doit toujours rester au moins un administrateur. Promeus quelqu'un d'autre admin avant de supprimer ce compte."
			);
		}
	}
	e.next();
}, 'users');

// ────────────────────────────────────────────────────────────────────────────
// Vérification d'exercice : méta posées côté serveur (non falsifiables)
// ────────────────────────────────────────────────────────────────────────────
onRecordUpdateRequest((e) => {
	const original = e.record.original();
	const wasVerified = original.getBool('verified');
	const isVerified = e.record.getBool('verified');

	if (wasVerified !== isVerified) {
		if (isVerified) {
			e.record.set('verified_at', new DateTime());
			e.record.set('verified_by_username', e.auth ? e.auth.getString('username') : '');
		} else {
			e.record.set('verified_at', '');
			e.record.set('verified_by_username', '');
		}
	} else {
		e.record.set('verified_at', original.get('verified_at'));
		e.record.set('verified_by_username', original.getString('verified_by_username'));
	}
	e.next();
}, 'exercises');

// ────────────────────────────────────────────────────────────────────────────
// Ménage : comptes jamais activés (code jamais saisi) au bout de 7 jours,
// pour libérer le nom d'utilisateur.
// ────────────────────────────────────────────────────────────────────────────
cronAdd('gram_purge_unverified', '17 4 * * *', () => {
	const limit = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ');
	const stale = $app.findRecordsByFilter(
		'users',
		"verified = false && role != 'admin' && role != 'prof' && created < {:limit}",
		'',
		0,
		0,
		{ limit }
	);
	for (const r of stale) {
		try {
			$app.delete(r);
		} catch (err) {
			$app.logger().error('Purge compte non activé échouée', 'error', String(err), 'id', r.id);
		}
	}
	if (stale.length) $app.logger().info('Comptes non activés purgés', 'count', stale.length);
});

// ────────────────────────────────────────────────────────────────────────────
// Règles : cohérence des groupes de confusion avec les candidats
// ────────────────────────────────────────────────────────────────────────────
onRecordCreateRequest((e) => {
	const g = require(`${__hooks}/lib/gram.js`);
	const candidates = g.jsonField(e.record, 'candidates');
	const groups = g.jsonField(e.record, 'groups');
	const err = g.validateRuleGroups(candidates, groups);
	if (err) throw new BadRequestError(err);
	e.record.set('groups', g.canonicalGroups(candidates, groups));
	e.next();
}, 'rules');
onRecordUpdateRequest((e) => {
	const g = require(`${__hooks}/lib/gram.js`);
	const candidates = g.jsonField(e.record, 'candidates');
	const groups = g.jsonField(e.record, 'groups');
	const err = g.validateRuleGroups(candidates, groups);
	if (err) throw new BadRequestError(err);
	e.record.set('groups', g.canonicalGroups(candidates, groups));
	e.next();
}, 'rules');

// ────────────────────────────────────────────────────────────────────────────
// Édition prof des exercices « GNS » et « ponctuation » : les mots cliquables,
// les bonnes réponses et la liste des mots affichés sont recalculés côté
// serveur à partir de ce que le prof a écrit (phrases marquées [[ ]], texte
// ponctué).
// ────────────────────────────────────────────────────────────────────────────
onRecordUpdateRequest((e) => {
	const g = require(`${__hooks}/lib/gram.js`);
	let ruleType = '';
	try {
		ruleType = e.app.findRecordById('rules', e.record.getString('rule')).getString('rule_type');
	} catch (_) {}

	if (ruleType === 'span') {
		const sp = require(`${__hooks}/lib/span_punct.js`);
		const items = g.jsonField(e.record, 'blanks') || [];
		const blanks = [];
		for (let i = 0; i < items.length; i++) {
			const it = items[i] || {};
			const item = sp.buildSpanItem(it.prompt, it.kind, it.explanation, i + 1);
			if (item.error) throw new BadRequestError(`Phrase ${i + 1} : ${item.error}.`);
			blanks.push(item);
		}
		if (!blanks.length) throw new BadRequestError('Il faut au moins une phrase.');
		e.record.set('blanks', blanks);
		e.record.set('num_blanks', blanks.length);
	} else if (ruleType === 'transform') {
		// Édition prof : chaque question est revalidée (références correctes,
		// 3 propositions dont la bonne en premier).
		const tf = require(`${__hooks}/lib/transform.js`);
		const items = g.jsonField(e.record, 'blanks') || [];
		const blanks = [];
		for (let i = 0; i < items.length; i++) {
			const it = items[i] || {};
			const options = Array.isArray(it.options) ? it.options : [];
			const item = tf.buildItem(
				{
					source: it.source,
					target: it.target,
					references: it.references,
					wrong_options: options.slice(1),
					explanation: it.explanation
				},
				i + 1,
				null
			);
			if (item.error) throw new BadRequestError(`Phrase ${i + 1} : ${item.error}.`);
			// La bonne proposition du QCM est la 1re : on la garde telle que saisie.
			if (options[0] && String(options[0]).trim()) {
				const first = String(options[0]).replace(/\s+/g, ' ').trim();
				if (!item.references.some((r) => tf.normSentence(r) === tf.normSentence(first))) {
					throw new BadRequestError(`Phrase ${i + 1} : la 1re proposition doit faire partie des réponses acceptées.`);
				}
				item.options[0] = first;
				item.correct = first;
			}
			blanks.push(item);
		}
		if (!blanks.length) throw new BadRequestError('Il faut au moins une phrase.');
		e.record.set('blanks', blanks);
		e.record.set('num_blanks', blanks.length);
	} else if (ruleType === 'punctuation') {
		const sp = require(`${__hooks}/lib/span_punct.js`);
		const extra = g.jsonField(e.record, 'extra') || {};
		const properNouns = Array.isArray(extra.proper_nouns) ? extra.proper_nouns.map(String) : [];
		const p = sp.parsePunctuation(e.record.getString('text'), properNouns);
		if (p.error) throw new BadRequestError(`Texte : ${p.error}.`);
		e.record.set('text', e.record.getString('text').replace(/\s+/g, ' ').trim());
		e.record.set('blanks', p.blanks);
		e.record.set('num_blanks', p.blanks.length);
		e.record.set('extra', { words: p.words, proper_nouns: properNouns });
	}
	e.next();
}, 'exercises');

// ────────────────────────────────────────────────────────────────────────────
// Liens élève ↔ parent / prof
// ────────────────────────────────────────────────────────────────────────────

// Demande de lien par nom d'utilisateur, depuis l'un ou l'autre côté.
routerAdd(
	'POST',
	'/api/gram/links',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const body = g.readJsonBody(e);
		const me = e.auth;
		const myRole = me.getString('role');
		const username = String(body.username || '').trim().toLowerCase();
		if (!g.USERNAME_RE.test(username)) return e.json(400, { error: "Nom d'utilisateur invalide." });
		const other = g.findUserByUsername(e.app, username);
		if (!other) return e.json(404, { error: "Aucun compte avec ce nom d'utilisateur." });
		if (other.id === me.id) return e.json(400, { error: 'Tu ne peux pas te lier à toi-même.' });
		const otherRole = other.getString('role');

		let student;
		let supervisor;
		if (myRole === 'parent' || myRole === 'prof') {
			if (otherRole !== 'eleve') return e.json(400, { error: `« ${username} » n'est pas un compte élève.` });
			student = other;
			supervisor = me;
		} else if (myRole === 'eleve') {
			if (otherRole !== 'parent' && otherRole !== 'prof') {
				return e.json(400, { error: `« ${username} » n'est pas un compte parent ou professeur.` });
			}
			student = me;
			supervisor = other;
		} else {
			return e.json(400, { error: 'Un administrateur voit déjà tous les élèves : pas besoin de lien.' });
		}
		const kind = supervisor.getString('role');

		let existing = null;
		try {
			existing = e.app.findFirstRecordByFilter('links', 'student = {:s} && supervisor = {:v}', { s: student.id, v: supervisor.id });
		} catch (_) {}
		if (existing) {
			// Les deux côtés ont demandé : on accepte.
			if (existing.getString('status') === 'pending' && existing.getString('initiated_by') !== me.id) {
				existing.set('status', 'accepted');
				e.app.save(existing);
				return e.json(200, { id: existing.id, status: 'accepted' });
			}
			return e.json(409, {
				error: existing.getString('status') === 'accepted' ? 'Vous êtes déjà liés.' : 'Une demande est déjà en attente.'
			});
		}

		// Parent et enfant avec la même adresse mail : même famille, lien direct.
		const sameFamily =
			kind === 'parent' &&
			student.getString('real_email').toLowerCase() === supervisor.getString('real_email').toLowerCase();

		const link = new Record(e.app.findCollectionByNameOrId('links'));
		link.set('student', student.id);
		link.set('supervisor', supervisor.id);
		link.set('kind', kind);
		link.set('status', sameFamily ? 'accepted' : 'pending');
		link.set('initiated_by', me.id);
		link.set('student_username', student.getString('username'));
		link.set('supervisor_username', supervisor.getString('username'));
		e.app.save(link);
		return e.json(200, { id: link.id, status: link.getString('status') });
	},
	$apis.requireAuth('users')
);

// Acceptation d'une demande par la partie qui ne l'a pas faite.
routerAdd(
	'POST',
	'/api/gram/links/{id}/accept',
	(e) => {
		let link;
		try {
			link = e.app.findRecordById('links', e.request.pathValue('id'));
		} catch (_) {
			return e.json(404, { error: 'Demande introuvable.' });
		}
		const me = e.auth.id;
		const party = link.getString('student') === me || link.getString('supervisor') === me;
		if (!party || link.getString('initiated_by') === me) return e.json(403, { error: 'Tu ne peux pas accepter cette demande.' });
		link.set('status', 'accepted');
		e.app.save(link);
		return e.json(200, { id: link.id, status: 'accepted' });
	},
	$apis.requireAuth('users')
);

// ────────────────────────────────────────────────────────────────────────────
// Classes (prof) : un code par classe, l'élève qui le saisit rejoint la classe
// ────────────────────────────────────────────────────────────────────────────

// Création : le prof et le code sont posés par le serveur.
onRecordCreateRequest((e) => {
	const cl = require(`${__hooks}/lib/classes.js`);
	if (!e.auth || e.auth.collection().name !== 'users') throw new ForbiddenError('Connexion requise.');
	const name = cl.cleanName(e.record.getString('name'));
	if (!name) throw new BadRequestError('Donne un nom à la classe.');
	const count = e.app.countRecords('classes', $dbx.hashExp({ teacher: e.auth.id }));
	if (count >= cl.MAX_CLASSES_PER_TEACHER) {
		throw new BadRequestError(`Tu as déjà ${cl.MAX_CLASSES_PER_TEACHER} classes : supprimes-en une d'abord.`);
	}
	e.record.set('name', name);
	e.record.set('teacher', e.auth.id);
	e.record.set('teacher_username', e.auth.getString('username'));
	e.record.set('code', cl.generateCode(e.app));
	e.next();
}, 'classes');

// Renommage : on recopie le nouveau nom chez les élèves (affichage côté élève).
onRecordUpdateRequest((e) => {
	const cl = require(`${__hooks}/lib/classes.js`);
	const original = e.record.original();
	const name = cl.cleanName(e.record.getString('name'));
	if (!name) throw new BadRequestError('Donne un nom à la classe.');
	e.record.set('name', name);
	// Par sécurité (en plus de la règle d'API) : prof et code non modifiables ici.
	e.record.set('teacher', original.getString('teacher'));
	e.record.set('teacher_username', original.getString('teacher_username'));
	e.record.set('code', original.getString('code'));
	e.next();
	if (name !== original.getString('name')) {
		const members = e.app.findRecordsByFilter('class_members', 'class = {:c}', '', 0, 0, { c: e.record.id });
		for (const m of members) {
			m.set('class_name', name);
			e.app.save(m);
		}
	}
}, 'classes');

// Nouveau code : l'ancien ne marche plus (les élèves déjà inscrits restent).
routerAdd(
	'POST',
	'/api/gram/classes/{id}/code',
	(e) => {
		const cl = require(`${__hooks}/lib/classes.js`);
		let klass;
		try {
			klass = e.app.findRecordById('classes', e.request.pathValue('id'));
		} catch (_) {
			return e.json(404, { error: 'Classe introuvable.' });
		}
		if (klass.getString('teacher') !== e.auth.id && e.auth.getString('role') !== 'admin') {
			return e.json(403, { error: "Ce n'est pas ta classe." });
		}
		klass.set('code', cl.generateCode(e.app));
		e.app.save(klass);
		return e.json(200, { id: klass.id, code: klass.getString('code') });
	},
	$apis.requireAuth('users')
);

// Un élève saisit le code : il rejoint la classe tout de suite.
routerAdd(
	'POST',
	'/api/gram/classes/join',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const cl = require(`${__hooks}/lib/classes.js`);
		if (e.auth.getString('role') !== 'eleve') {
			return e.json(403, { error: 'Seul un compte élève peut rejoindre une classe avec un code.' });
		}
		const code = cl.normalizeCode(g.readJsonBody(e).code);
		if (!cl.isValidCode(code)) {
			return e.json(400, { error: `Le code d'une classe fait ${cl.CODE_LENGTH} caractères (lettres et chiffres).` });
		}
		let klass;
		try {
			klass = e.app.findFirstRecordByFilter('classes', 'code = {:c}', { c: code });
		} catch (_) {
			return e.json(404, { error: 'Aucune classe avec ce code. Vérifie-le auprès de ton professeur.' });
		}
		let already = false;
		try {
			e.app.findFirstRecordByFilter('class_members', 'class = {:c} && student = {:s}', { c: klass.id, s: e.auth.id });
			already = true;
		} catch (_) {}
		if (already) return e.json(409, { error: `Tu fais déjà partie de la classe « ${klass.getString('name')} ».` });

		if (e.app.countRecords('class_members', $dbx.hashExp({ student: e.auth.id })) >= cl.MAX_CLASSES_PER_STUDENT) {
			return e.json(400, { error: `Tu es déjà dans ${cl.MAX_CLASSES_PER_STUDENT} classes : quittes-en une d'abord.` });
		}
		if (e.app.countRecords('class_members', $dbx.hashExp({ class: klass.id })) >= cl.MAX_MEMBERS_PER_CLASS) {
			return e.json(400, { error: 'Cette classe est complète. Préviens ton professeur.' });
		}

		const m = new Record(e.app.findCollectionByNameOrId('class_members'));
		m.set('class', klass.id);
		m.set('student', e.auth.id);
		m.set('student_username', e.auth.getString('username'));
		m.set('class_name', klass.getString('name'));
		m.set('teacher_username', klass.getString('teacher_username'));
		e.app.save(m);
		return e.json(200, {
			id: m.id,
			class_name: klass.getString('name'),
			teacher_username: klass.getString('teacher_username')
		});
	},
	$apis.requireAuth('users')
);

// ────────────────────────────────────────────────────────────────────────────
// Tableau de suivi (parents, profs ; admin : tous les élèves)
// ────────────────────────────────────────────────────────────────────────────
routerAdd(
	'GET',
	'/api/gram/suivi',
	(e) => {
		const suivi = require(`${__hooks}/lib/suivi.js`);
		const role = e.auth.getString('role');
		if (role !== 'parent' && role !== 'prof' && role !== 'admin') {
			return e.json(403, { error: 'Réservé aux parents et aux professeurs.' });
		}

		// Classes du prof (ou de l'admin) et leurs élèves.
		const classes = [];
		const classesOf = {}; // id élève → [id classe]
		if (role === 'prof' || role === 'admin') {
			const own = e.app.findRecordsByFilter('classes', 'teacher = {:me}', 'name', 100, 0, { me: e.auth.id });
			for (const c of own) {
				const members = e.app.findRecordsByFilter('class_members', 'class = {:c}', 'student_username', 200, 0, {
					c: c.id
				});
				for (const m of members) {
					const sid = m.getString('student');
					(classesOf[sid] = classesOf[sid] || []).push(c.id);
				}
				classes.push({ id: c.id, name: c.getString('name'), code: c.getString('code'), count: members.length });
			}
		}

		const linked = {};
		let students = [];
		if (role === 'admin') {
			students = e.app.findRecordsByFilter('users', "role = 'eleve'", 'username', 300, 0);
		} else {
			const links = e.app.findRecordsByFilter(
				'links',
				"supervisor = {:me} && status = 'accepted'",
				'student_username',
				300,
				0,
				{ me: e.auth.id }
			);
			for (const l of links) linked[l.getString('student')] = true;
			const ids = Object.keys(linked).concat(Object.keys(classesOf).filter((id) => !linked[id]));
			students = ids.length ? e.app.findRecordsByIds('users', ids) : [];
			students.sort((a, b) => a.getString('username').localeCompare(b.getString('username')));
		}

		const rules = suivi.loadRules(e.app);
		// Évaluations rendues (celles que j'ai données ; l'admin : toutes).
		const evalsOf = (sid) =>
			e.app
				.findRecordsByFilter(
					'eval_submissions',
					role === 'admin'
						? "student = {:s} && submitted_at != ''"
						: "student = {:s} && submitted_at != '' && evaluation.author = {:me}",
					'-submitted_at',
					20,
					0,
					{ s: sid, me: e.auth.id }
				)
				.map((sub) => {
					let title = '';
					try {
						title = e.app.findRecordById('evaluations', sub.getString('evaluation')).getString('title');
					} catch (_) {}
					return {
						evaluation: sub.getString('evaluation'),
						title,
						submitted_at: sub.getString('submitted_at'),
						note20: sub.getFloat('note20')
					};
				});
		const out = students.map((st) => {
			const stats = suivi.studentStats(suivi.loadAttempts(e.app, st.id), rules);
			stats.evaluations = evalsOf(st.id);
			return Object.assign(
				{
					id: st.id,
					username: st.getString('username'),
					grade_level: st.getString('grade_level'),
					classes: classesOf[st.id] || [],
					linked: role === 'admin' || !!linked[st.id]
				},
				stats
			);
		});
		return e.json(200, { role, classes, students: out });
	},
	$apis.requireAuth('users')
);

// ────────────────────────────────────────────────────────────────────────────
// Évaluations (prof, parent) : préparation, passage par l'élève, résultats.
// Les élèves passent UNIQUEMENT par ces routes : sujets sans réponses.
// ────────────────────────────────────────────────────────────────────────────

// Création : auteur, statut, parties posés par le serveur.
onRecordCreateRequest((e) => {
	const ev = require(`${__hooks}/lib/evals.js`);
	if (!e.auth || e.auth.collection().name !== 'users') throw new ForbiddenError('Connexion requise.');
	e.record.set('title', String(e.record.getString('title')).replace(/\s+/g, ' ').trim());
	e.record.set('author', e.auth.id);
	e.record.set('author_username', e.auth.getString('username'));
	e.record.set('status', 'draft');
	e.record.set('parts', []);
	e.record.set('correction_released', false);
	if (!e.record.getString('correction_mode')) e.record.set('correction_mode', 'after_close');
	const data = ev.evalData(e.record);
	const err =
		ev.validateSettings(data, false) || ev.validateTargets(e.app, e.auth, data.classes, data.students);
	if (err) throw new BadRequestError(err);
	if (e.app.countRecords('evaluations', $dbx.hashExp({ author: e.auth.id, status: 'draft' })) >= 30) {
		throw new BadRequestError("Tu as déjà 30 évaluations en préparation : supprimes-en avant d'en créer d'autres.");
	}
	e.next();
}, 'evaluations');

// Modification : réglages, élèves visés, barème. Les exercices des parties ne
// changent que par les routes dédiées, et plus du tout une fois des copies commencées.
onRecordUpdateRequest((e) => {
	const ev = require(`${__hooks}/lib/evals.js`);
	const original = e.record.original();
	for (const f of ['author', 'author_username', 'status', 'correction_released', 'mails']) e.record.set(f, original.get(f));
	e.record.set('title', String(e.record.getString('title')).replace(/\s+/g, ' ').trim());

	const before = ev.evalData(original);
	const data = ev.evalData(e.record);
	const started = ev.countSubmissions(e.app, e.record.id) > 0;

	// Parties : mêmes exercices (ordre libre), barème et mode difficile modifiables.
	const oldIds = before.parts.map((p) => p.exercise).sort().join(',');
	const newIds = (Array.isArray(data.parts) ? data.parts : []).map((p) => p && p.exercise).sort().join(',');
	if (oldIds !== newIds) throw new BadRequestError('Les exercices se modifient avec les boutons de chaque partie.');
	const gr = require(`${__hooks}/lib/grading.js`);
	const parts = data.parts.map((p) => {
		const old = before.parts.find((o) => o.exercise === p.exercise);
		let hard = !!p.hard_mode;
		if (hard) {
			try {
				hard = gr.hardModeAllowed(gr.loadRule(e.app, e.app.findRecordById('exercises', p.exercise).getString('rule')));
			} catch (_) {
				hard = false;
			}
		}
		return Object.assign({}, old, { points: Number(p.points), hard_mode: hard });
	});
	if (started && JSON.stringify(parts) !== JSON.stringify(before.parts)) {
		throw new BadRequestError('Des élèves ont déjà commencé : les parties et le barème ne peuvent plus changer.');
	}
	e.record.set('parts', parts);
	data.parts = parts;

	const err =
		ev.validateSettings(data, data.status === 'published') ||
		ev.validateTargets(e.app, e.auth, data.classes, data.students);
	if (err) throw new BadRequestError(err);
	e.next();
}, 'evaluations');

// Exercices d'une évaluation : figés dès qu'une copie existe, jamais supprimés à la main.
onRecordUpdateRequest((e) => {
	const evalId = e.record.original().getString('evaluation');
	if (evalId) {
		const ev = require(`${__hooks}/lib/evals.js`);
		if (ev.countSubmissions(e.app, evalId) > 0) {
			throw new BadRequestError('Des élèves ont déjà commencé cette évaluation : son contenu ne peut plus changer.');
		}
	}
	e.next();
}, 'exercises');
onRecordDeleteRequest((e) => {
	if (e.record.getString('evaluation')) {
		throw new BadRequestError("Cet exercice fait partie d'une évaluation : retire-le depuis l'évaluation.");
	}
	e.next();
}, 'exercises');

// Liste des évaluations de l'auteur, avec l'avancement.
routerAdd(
	'GET',
	'/api/gram/evals',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const role = e.auth.getString('role');
		if (role !== 'prof' && role !== 'parent' && role !== 'admin') return e.json(403, { error: 'Réservé aux parents et aux professeurs.' });
		const now = Date.now();
		const recs = e.app.findRecordsByFilter('evaluations', 'author = {:me}', '-created', 200, 0, { me: e.auth.id });
		const out = recs.map((rec) => {
			const data = ev.evalData(rec);
			const subs = e.app.findRecordsByFilter('eval_submissions', 'evaluation = {:e}', '', 0, 0, { e: rec.id });
			const done = subs.filter((s) => s.getString('submitted_at'));
			return {
				id: data.id,
				title: data.title,
				status: data.status,
				state: ev.evalState(data, now),
				grade_level: data.grade_level,
				opens_at: data.opens_at || null,
				closes_at: data.closes_at || null,
				parts_count: data.parts.length,
				targets: ev.targetIds(e.app, data).length,
				started: subs.length,
				submitted: done.length,
				average20: done.length
					? Math.round((done.reduce((a, s) => a + s.getFloat('note20'), 0) / done.length) * 10) / 10
					: null,
				created: data.created
			};
		});
		return e.json(200, { evaluations: out });
	},
	$apis.requireAuth('users')
);

// Ajouter une partie : l'exercice est généré une fois pour toute la classe.
routerAdd(
	'POST',
	'/api/gram/evals/{id}/parts',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const gr = require(`${__hooks}/lib/grading.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		if (ev.countSubmissions(e.app, l.ev.id) > 0) return e.json(400, { error: 'Des élèves ont déjà commencé : impossible d\'ajouter une partie.' });
		if (l.ev.parts.length >= ev.MAX_PARTS) return e.json(400, { error: `${ev.MAX_PARTS} parties au maximum.` });
		const body = g.readJsonBody(e) || {};
		const request = {
			rule_id: String(body.rule_id || ''),
			theme: String(body.theme || '').trim(),
			grade_level: l.ev.grade_level || String(body.grade_level || ''),
			num_blanks: Number(body.num_blanks)
		};
		const out = require(`${__hooks}/lib/generation.js`).generateExercise(e.app, e.auth, request, { evaluation: l.ev.id });
		if (!out.record) return e.json(out.status, { error: out.error, debug: out.debug });
		const points = Math.min(100, Math.max(1, Math.round(Number(body.points) || 10)));
		const part = {
			exercise: out.record.id,
			points,
			hard_mode: body.hard_mode === true && gr.hardModeAllowed(out.rule),
			request: { rule_id: request.rule_id, theme: request.theme, num_blanks: request.num_blanks }
		};
		// Relu après la génération (qui peut durer) pour ne rien écraser.
		const rec = e.app.findRecordById('evaluations', l.ev.id);
		const parts = (g.jsonField(rec, 'parts') || []).concat([part]);
		rec.set('parts', parts);
		e.app.save(rec);
		return e.json(200, { part: ev.partInfo(e.app, part).summary });
	},
	$apis.requireAuth('users')
);

// Regénérer une partie (mêmes notion, thème et nombre de questions).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/parts/{ex}/regenerate',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		if (ev.countSubmissions(e.app, l.ev.id) > 0) return e.json(400, { error: 'Des élèves ont déjà commencé : le sujet est figé.' });
		const exId = e.request.pathValue('ex');
		const part = l.ev.parts.find((p) => p.exercise === exId);
		if (!part) return e.json(404, { error: 'Partie introuvable.' });
		let request = part.request;
		if (!request) {
			const old = e.app.findRecordById('exercises', exId);
			request = { rule_id: old.getString('rule'), theme: old.getString('theme'), num_blanks: old.getInt('num_blanks') };
		}
		const out = require(`${__hooks}/lib/generation.js`).generateExercise(
			e.app,
			e.auth,
			Object.assign({}, request, { grade_level: l.ev.grade_level }),
			{ evaluation: l.ev.id }
		);
		if (!out.record) return e.json(out.status, { error: out.error, debug: out.debug });
		const rec = e.app.findRecordById('evaluations', l.ev.id);
		const parts = (g.jsonField(rec, 'parts') || []).map((p) =>
			p.exercise === exId ? Object.assign({}, p, { exercise: out.record.id, request }) : p
		);
		rec.set('parts', parts);
		e.app.save(rec);
		try {
			e.app.delete(e.app.findRecordById('exercises', exId));
		} catch (_) {}
		return e.json(200, { part: ev.partInfo(e.app, parts.find((p) => p.exercise === out.record.id)).summary });
	},
	$apis.requireAuth('users')
);

// Retirer une partie.
routerAdd(
	'DELETE',
	'/api/gram/evals/{id}/parts/{ex}',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		if (ev.countSubmissions(e.app, l.ev.id) > 0) return e.json(400, { error: 'Des élèves ont déjà commencé : le sujet est figé.' });
		const exId = e.request.pathValue('ex');
		const parts = l.ev.parts.filter((p) => p.exercise !== exId);
		if (parts.length === l.ev.parts.length) return e.json(404, { error: 'Partie introuvable.' });
		if (!parts.length && l.ev.status === 'published') {
			return e.json(400, { error: "Une évaluation publiée doit garder au moins une partie." });
		}
		l.rec.set('parts', parts);
		e.app.save(l.rec);
		try {
			e.app.delete(e.app.findRecordById('exercises', exId));
		} catch (_) {}
		return e.json(200, { ok: true });
	},
	$apis.requireAuth('users')
);

// Publier (les élèves la voient) / repasser en préparation (si personne n'a commencé).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/publish',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		const publish = (g.readJsonBody(e) || {}).publish !== false;
		if (publish) {
			const err = ev.validateSettings(l.ev, true) || ev.validateTargets(e.app, e.auth, l.ev.classes, l.ev.students);
			if (err) return e.json(400, { error: err });
			l.rec.set('status', 'published');
		} else {
			if (ev.countSubmissions(e.app, l.ev.id) > 0) {
				return e.json(400, { error: 'Des élèves ont déjà commencé : impossible de la repasser en préparation.' });
			}
			l.rec.set('status', 'draft');
		}
		e.app.save(l.rec);
		return e.json(200, { status: l.rec.getString('status') });
	},
	$apis.requireAuth('users')
);

// Mails « nouvelle évaluation » : appelé par la page juste après la
// publication, pour que « Publier » réponde sans attendre le serveur de mail.
// Sans date d'ouverture ou ouverture aujourd'hui : les élèves sont prévenus
// tout de suite ; sinon, rien ici (tâche de minuit le jour de l'ouverture).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/mails',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		try {
			return e.json(200, require(`${__hooks}/lib/eval_mails.js`).sendEvalMails(e.app, l.ev.id, Date.now()));
		} catch (err) {
			e.app.logger().error('Évaluation : envoi des mails échoué', 'evaluation', l.ev.id, 'error', String(err));
			return e.json(200, { sent: 0, failed: -1 });
		}
	},
	$apis.requireAuth('users')
);

// Donner la correction aux élèves (mode « quand je la publie »).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/release',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		l.rec.set('correction_released', true);
		e.app.save(l.rec);
		return e.json(200, { correction_released: true });
	},
	$apis.requireAuth('users')
);

// Résultats de la classe.
routerAdd(
	'GET',
	'/api/gram/evals/{id}/results',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const g = require(`${__hooks}/lib/gram.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), false);
		if (l.error) return e.json(l.status, { error: l.error });
		const now = Date.now();
		const subs = e.app
			.findRecordsByFilter('eval_submissions', 'evaluation = {:e}', '', 0, 0, { e: l.ev.id })
			.map((s) => ev.finalizeIfOverdue(e.app, s, l.ev, now));
		const byStudent = {};
		for (const s of subs) byStudent[s.getString('student')] = s;

		// Classes visées : nom de la classe de chaque élève.
		const classNames = {};
		const classesOut = [];
		for (const c of l.ev.classes) {
			let rec;
			try {
				rec = e.app.findRecordById('classes', c);
			} catch (_) {
				continue;
			}
			classesOut.push({ id: rec.id, name: rec.getString('name') });
			for (const m of e.app.findRecordsByFilter('class_members', 'class = {:c}', '', 0, 0, { c })) {
				const sid = m.getString('student');
				(classNames[sid] = classNames[sid] || []).push(rec.getString('name'));
			}
		}
		const infos = ev.loadPartInfos(e.app, l.ev);
		const ids = ev.targetIds(e.app, l.ev);
		for (const sid of Object.keys(byStudent)) if (ids.indexOf(sid) < 0) ids.push(sid);
		const users = ids.length ? e.app.findRecordsByIds('users', ids) : [];
		const students = users
			.map((u) => {
				const s = byStudent[u.id];
				const row = {
					id: u.id,
					username: u.getString('username'),
					classes: classNames[u.id] || [],
					status: !s ? 'not_started' : s.getString('submitted_at') ? 'submitted' : 'in_progress',
					submission_id: s ? s.id : null
				};
				if (s) {
					row.started_at = s.getString('started_at');
					row.submitted_at = s.getString('submitted_at') || null;
					// Durée (copie rendue) et réponses données, justes ou fausses.
					row.duration_s = row.submitted_at ? ev.durationSeconds(row.started_at, row.submitted_at) : null;
					const a = ev.answeredStats(infos, g.jsonField(s, 'responses') || {});
					row.answered = a.answered;
					row.answered_total = a.total;
					row.answered_pct = a.pct;
					row.leaves = s.getInt('leaves');
					row.away_seconds = s.getInt('away_seconds');
					row.away_now = !row.submitted_at && !!s.getString('left_at');
					row.auto_submitted = s.getBool('auto_submitted');
					if (row.submitted_at) {
						row.note20 = s.getFloat('note20');
						row.score_points = s.getFloat('score_points');
						row.total_points = s.getFloat('total_points');
						row.overrides = (g.jsonField(s, 'results') || []).reduce(
							(n, r) => n + (r.per_blank || []).filter((b) => b.overridden).length,
							0
						);
						row.parts = (g.jsonField(s, 'results') || []).map((r) => ({
							exercise: r.exercise,
							earned: r.earned,
							points: r.points,
							score: r.score,
							score_total: r.score_total
						}));
					}
				}
				return row;
			})
			.sort((a, b) => a.username.localeCompare(b.username));

		const done = subs.filter((s) => s.getString('submitted_at'));
		const notes = done.map((s) => s.getFloat('note20'));
		return e.json(200, {
			evaluation: Object.assign({}, l.ev, {
				state: ev.evalState(l.ev, now),
				parts: ev.partSummaries(e.app, l.ev),
				classes: classesOut,
				correction_visible: ev.correctionVisible(l.ev, now),
				started: subs.length,
				mails: (() => {
					const em = require(`${__hooks}/lib/eval_mails.js`);
					return em.mailSummary(l.ev, ev.targetIds(e.app, l.ev), em.jsonField(l.rec, 'mails'), now);
				})()
			}),
			students,
			stats: {
				submitted: done.length,
				average20: notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null,
				min20: notes.length ? Math.min.apply(null, notes) : null,
				max20: notes.length ? Math.max.apply(null, notes) : null,
				questions: ev.questionStats(l.ev.parts, done.map((s) => g.jsonField(s, 'results') || []))
			}
		});
	},
	$apis.requireAuth('users')
);

// Copie corrigée d'un élève (vue de l'auteur).
routerAdd(
	'GET',
	'/api/gram/evals/{id}/copies/{sub}',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), false);
		if (l.error) return e.json(l.status, { error: l.error });
		let sub;
		try {
			sub = e.app.findRecordById('eval_submissions', e.request.pathValue('sub'));
		} catch (_) {
			return e.json(404, { error: 'Copie introuvable.' });
		}
		if (sub.getString('evaluation') !== l.ev.id) return e.json(404, { error: 'Copie introuvable.' });
		sub = ev.finalizeIfOverdue(e.app, sub, l.ev, Date.now());
		if (!sub.getString('submitted_at')) return e.json(400, { error: "L'élève n'a pas encore rendu sa copie." });
		return e.json(
			200,
			Object.assign(
				{
					id: sub.id,
					student_username: sub.getString('student_username'),
					title: l.ev.title,
					started_at: sub.getString('started_at'),
					leaves: sub.getInt('leaves'),
					away_seconds: sub.getInt('away_seconds')
				},
				ev.correctedCopy(e.app, l.ev, sub)
			)
		);
	},
	$apis.requireAuth('users')
);

// Élève : ses évaluations.
routerAdd(
	'GET',
	'/api/gram/evals/mine',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		if (e.auth.getString('role') !== 'eleve') return e.json(200, { evaluations: [] });
		const now = Date.now();
		const myClasses = ev.classIdsOf(e.app, e.auth.id);
		const params = { me: e.auth.id };
		let filter = "status = 'published' && (students.id ?= {:me}";
		myClasses.forEach((c, i) => {
			params[`c${i}`] = c;
			filter += ` || classes.id ?= {:c${i}}`;
		});
		filter += ')';
		const recs = e.app.findRecordsByFilter('evaluations', filter, '-created', 200, 0, params);
		const out = recs.map((rec) => {
			const data = ev.evalData(rec);
			const state = ev.evalState(data, now);
			let sub = ev.findSubmission(e.app, data.id, e.auth.id);
			if (sub) sub = ev.finalizeIfOverdue(e.app, sub, data, now);
			const submitted = sub && sub.getString('submitted_at');
			const visible = ev.correctionVisible(data, now);
			return {
				id: data.id,
				title: data.title,
				author_username: data.author_username,
				state,
				opens_at: data.opens_at || null,
				closes_at: data.closes_at || null,
				time_limit_min: data.time_limit_min,
				parts_count: data.parts.length,
				status: submitted ? 'submitted' : sub ? 'in_progress' : state === 'closed' ? 'missed' : 'todo',
				submitted_at: submitted || null,
				correction_visible: !!submitted && visible,
				note20: submitted && visible ? sub.getFloat('note20') : null
			};
		});
		return e.json(200, { evaluations: out });
	},
	$apis.requireAuth('users')
);

// Élève : présentation, sujet (sans réponses) ou copie corrigée.
routerAdd(
	'GET',
	'/api/gram/evals/{id}/paper',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForStudent(e.app, e.auth, e.request.pathValue('id'));
		if (l.error) return e.json(l.status, { error: l.error });
		const sub = ev.findSubmission(e.app, l.ev.id, e.auth.id);
		if (sub && !sub.getString('submitted_at')) ev.markBack(e.app, sub, Date.now());
		return e.json(200, ev.studentView(e.app, l.ev, sub, Date.now()));
	},
	$apis.requireAuth('users')
);

// Élève : commencer (une seule tentative ; le chrono part maintenant).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/start',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForStudent(e.app, e.auth, e.request.pathValue('id'));
		if (l.error) return e.json(l.status, { error: l.error });
		const now = Date.now();
		let sub = ev.findSubmission(e.app, l.ev.id, e.auth.id);
		if (!sub) {
			const state = ev.evalState(l.ev, now);
			if (state === 'upcoming') return e.json(400, { error: "Cette évaluation n'a pas encore commencé." });
			if (state === 'closed') return e.json(400, { error: 'Cette évaluation est terminée.' });
			sub = new Record(e.app.findCollectionByNameOrId('eval_submissions'));
			sub.set('evaluation', l.ev.id);
			sub.set('student', e.auth.id);
			sub.set('student_username', e.auth.getString('username'));
			sub.set('started_at', new DateTime());
			sub.set('responses', {});
			try {
				e.app.save(sub);
			} catch (_) {
				// Double clic : la copie existe déjà.
				sub = ev.findSubmission(e.app, l.ev.id, e.auth.id);
				if (!sub) return e.json(500, { error: 'Impossible de commencer.' });
			}
		}
		return e.json(200, ev.studentView(e.app, l.ev, sub, now));
	},
	$apis.requireAuth('users')
);

// Élève : sauvegarde des réponses en cours (toutes les quelques secondes).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/save',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForStudent(e.app, e.auth, e.request.pathValue('id'));
		if (l.error) return e.json(l.status, { error: l.error });
		const sub = ev.findSubmission(e.app, l.ev.id, e.auth.id);
		if (!sub) return e.json(400, { error: "Tu n'as pas commencé cette évaluation." });
		if (sub.getString('submitted_at')) return e.json(409, { error: 'Copie déjà rendue.' });
		const now = Date.now();
		const d = ev.deadlineOf(l.ev, ev.ms(sub.getString('started_at')));
		if (d !== null && now > d + ev.GRACE_MS) {
			ev.finalize(e.app, sub, l.ev, true);
			return e.json(409, { error: 'Le temps est écoulé : ta copie a été rendue.' });
		}
		sub.set('responses', ev.cleanAllResponses(e.app, l.ev, (g.readJsonBody(e) || {}).responses));
		e.app.save(sub);
		return e.json(200, { saved_at: ev.iso(now) });
	},
	$apis.requireAuth('users')
);

// Élève : rendre sa copie.
routerAdd(
	'POST',
	'/api/gram/evals/{id}/submit',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForStudent(e.app, e.auth, e.request.pathValue('id'));
		if (l.error) return e.json(l.status, { error: l.error });
		let sub = ev.findSubmission(e.app, l.ev.id, e.auth.id);
		if (!sub) return e.json(400, { error: "Tu n'as pas commencé cette évaluation." });
		const now = Date.now();
		if (!sub.getString('submitted_at')) {
			const d = ev.deadlineOf(l.ev, ev.ms(sub.getString('started_at')));
			const late = d !== null && now > d + ev.GRACE_MS;
			// En retard : on garde les dernières réponses enregistrées à temps.
			if (!late) sub.set('responses', ev.cleanAllResponses(e.app, l.ev, (g.readJsonBody(e) || {}).responses));
			sub = ev.finalize(e.app, sub, l.ev, late);
		}
		return e.json(200, ev.studentView(e.app, l.ev, sub, now));
	},
	$apis.requireAuth('users')
);

// Mails « nouvelle évaluation » : à minuit, heure de Paris, pour les évaluations
// qui ouvrent ce jour-là (et rattrapage : échecs, nouveaux élèves visés).
// Le cron de PocketBase est en UTC : on tourne chaque heure pile et on
// n'agit qu'à 0 h à Paris (juste en heure d'été comme d'hiver).
cronAdd('gram_eval_mails', '0 * * * *', () => {
	const em = require(`${__hooks}/lib/eval_mails.js`);
	const now = Date.now();
	if (em.parisHour(now) !== 0) return;
	const r = em.sendDueMails($app, now);
	if (r.sent || r.failed) $app.logger().info('Évaluations : mails de minuit', 'evaluations', r.evaluations, 'sent', r.sent, 'failed', r.failed);
});

// Élève : il quitte la page (autre onglet, autre appli) ou y revient.
// Visible par l'auteur dans les résultats ; l'élève en est prévenu avant de commencer.
routerAdd(
	'POST',
	'/api/gram/evals/{id}/leave',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForStudent(e.app, e.auth, e.request.pathValue('id'));
		if (l.error) return e.json(l.status, { error: l.error });
		const sub = ev.findSubmission(e.app, l.ev.id, e.auth.id);
		if (!sub || sub.getString('submitted_at')) return e.json(200, { ok: false });
		const now = Date.now();
		const d = ev.deadlineOf(l.ev, ev.ms(sub.getString('started_at')));
		if (d !== null && now > d) return e.json(200, { ok: false });
		const body = g.readJsonBody(e) || {};
		if (body.back === true) {
			const away = Number(body.away_ms);
			if (away >= 0 && away < 1e9) {
				// Temps d'absence mesuré par le navigateur (plafonné à 6 h).
				sub.set('away_seconds', sub.getInt('away_seconds') + Math.round(Math.min(away, 6 * 3600 * 1000) / 1000));
				sub.set('left_at', '');
				e.app.save(sub);
			} else {
				ev.markBack(e.app, sub, now);
			}
		} else {
			sub.set('leaves', sub.getInt('leaves') + 1);
			sub.set('left_at', new DateTime());
			e.app.save(sub);
		}
		return e.json(200, { ok: true });
	},
	$apis.requireAuth('users')
);

// Auteur : compter juste / faux une question d'une copie (null = correction automatique).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/copies/{sub}/override',
	(e) => {
		const g = require(`${__hooks}/lib/gram.js`);
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		let sub;
		try {
			sub = e.app.findRecordById('eval_submissions', e.request.pathValue('sub'));
		} catch (_) {
			return e.json(404, { error: 'Copie introuvable.' });
		}
		if (sub.getString('evaluation') !== l.ev.id) return e.json(404, { error: 'Copie introuvable.' });
		if (!sub.getString('submitted_at')) return e.json(400, { error: "L'élève n'a pas encore rendu sa copie." });
		const body = g.readJsonBody(e) || {};
		const ok = body.ok === true ? true : body.ok === false ? false : null;
		const r = ev.applyOverride(g.jsonField(sub, 'results') || [], String(body.exercise || ''), Number(body.position), ok);
		if (!r) return e.json(404, { error: 'Question introuvable.' });
		sub.set('results', r.results);
		sub.set('score_points', r.score_points);
		sub.set('total_points', r.total_points);
		sub.set('note20', r.note20);
		e.app.save(sub);
		return e.json(
			200,
			Object.assign(
				{
					id: sub.id,
					student_username: sub.getString('student_username'),
					title: l.ev.title,
					started_at: sub.getString('started_at'),
					leaves: sub.getInt('leaves'),
					away_seconds: sub.getInt('away_seconds')
				},
				ev.correctedCopy(e.app, l.ev, sub)
			)
		);
	},
	$apis.requireAuth('users')
);

// Auteur : dupliquer (pour une autre classe, une autre année…).
routerAdd(
	'POST',
	'/api/gram/evals/{id}/duplicate',
	(e) => {
		const ev = require(`${__hooks}/lib/evals.js`);
		const l = ev.loadForAuthor(e.app, e.auth, e.request.pathValue('id'), true);
		if (l.error) return e.json(l.status, { error: l.error });
		if (e.app.countRecords('evaluations', $dbx.hashExp({ author: e.auth.id, status: 'draft' })) >= 30) {
			return e.json(400, { error: "Tu as déjà 30 évaluations en préparation : supprimes-en avant d'en créer d'autres." });
		}
		const rec = ev.duplicate(e.app, e.auth, l.ev);
		return e.json(200, { id: rec.id });
	},
	$apis.requireAuth('users')
);

// Copies dont le temps est écoulé sans que l'élève les ait rendues.
cronAdd('gram_eval_finalize', '*/5 * * * *', () => {
	const ev = require(`${__hooks}/lib/evals.js`);
	const now = Date.now();
	const pending = $app.findRecordsByFilter('eval_submissions', "submitted_at = ''", '', 500, 0);
	const cache = {};
	for (const sub of pending) {
		try {
			const id = sub.getString('evaluation');
			cache[id] = cache[id] || ev.evalData($app.findRecordById('evaluations', id));
			ev.finalizeIfOverdue($app, sub, cache[id], now);
		} catch (err) {
			$app.logger().error('Évaluation : clôture automatique échouée', 'id', sub.id, 'error', String(err));
		}
	}
});
