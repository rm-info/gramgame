/// <reference path="../pb_data/types.d.ts" />

// Logique serveur GramGame (remplace les Edge Functions + triggers Supabase).
//
// Routes custom (préfixe /api/gram/) :
//   POST /api/gram/register  { username, email }       → { otpId, email_hint }
//   POST /api/gram/login     { username }              → { otpId, email_hint }
//   POST /api/gram/generate  { rule_id, theme, grade_level, num_blanks }  (auth)
//   POST /api/gram/correct   { exercise_id, responses }                   (auth)
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
	user.set('role', isFirst ? 'admin' : 'user');
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

		const reqError = g.validateGenerateRequest(body);
		if (reqError) return e.json(400, { error: reqError });

		let ruleRecord;
		try {
			ruleRecord = e.app.findRecordById('rules', body.rule_id);
		} catch (_) {
			return e.json(404, { error: `Règle introuvable : ${body.rule_id}` });
		}
		const rule = {
			id: ruleRecord.id,
			display_name: ruleRecord.getString('display_name'),
			short_description: ruleRecord.getString('short_description'),
			candidates: g.jsonField(ruleRecord, 'candidates') || [],
			groups: g.jsonField(ruleRecord, 'groups'),
			examples: g.jsonField(ruleRecord, 'examples')
		};

		const cfg = g.llmConfig();
		if (!cfg.apiKey) {
			e.app.logger().error('LLM_API_KEY non configurée.');
			return e.json(500, { error: 'Configuration serveur incomplète (clé LLM manquante).' });
		}

		const MAX_ATTEMPTS = 3; // 1 essai + 2 retries
		let blanks = null;
		let exerciseText = '';
		let lastError = '';
		let providerStatus = null;

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			try {
				const candidate = g.callGenerate(cfg, rule, body, attempt);
				const v = g.validateExercise(candidate, rule, body.num_blanks);
				if (!v.error) {
					blanks = v.blanks;
					exerciseText = candidate.text;
					break;
				}
				lastError = v.error;
				e.app.logger().warn(`Génération : tentative ${attempt + 1} invalide`, 'error', v.error);
			} catch (err) {
				lastError = String((err && err.message) || err);
				e.app.logger().warn(`Génération : tentative ${attempt + 1} échouée`, 'error', lastError);
				if (err && err.providerStatus !== undefined) {
					// Erreur provider (429, 401, 5xx…) : inutile de retenter.
					providerStatus = err.providerStatus;
					break;
				}
			}
		}

		if (!blanks) {
			if (providerStatus === 429) {
				return e.json(429, {
					error:
						'Quota du provider LLM dépassé pour le moment. Patiente quelques minutes (rate limit par minute) ou vérifie ton quota journalier.',
					debug: lastError
				});
			}
			if (providerStatus === 401 || providerStatus === 403) {
				return e.json(providerStatus, {
					error: 'Clé API LLM invalide ou non autorisée côté serveur.',
					debug: lastError
				});
			}
			if (providerStatus !== null) {
				return e.json(502, {
					error: `Le provider LLM a renvoyé une erreur (HTTP ${providerStatus}). Réessaie dans un instant.`,
					debug: lastError
				});
			}
			return e.json(422, {
				error: "L'IA n'a pas réussi à générer un texte valide. Réessaie dans un instant ou modifie le thème.",
				debug: lastError
			});
		}

		const record = new Record(e.app.findCollectionByNameOrId('exercises'));
		record.set('owner', e.auth.id);
		record.set('owner_username', e.auth.getString('username'));
		record.set('rule', rule.id);
		record.set('theme', body.theme.trim());
		record.set('grade_level', body.grade_level);
		record.set('num_blanks', body.num_blanks);
		record.set('text', exerciseText);
		record.set('blanks', blanks);
		record.set('llm_model', cfg.model);
		record.set('verified', false);

		try {
			e.app.save(record);
		} catch (err) {
			e.app.logger().error('Sauvegarde exercice échouée', 'error', String(err));
			return e.json(500, { error: 'Sauvegarde échouée.' });
		}

		return e.json(200, {
			id: record.id,
			text: exerciseText,
			blanks: blanks.map((b) => ({ position: b.position })),
			rule: { id: rule.id, display_name: rule.display_name, candidates: rule.candidates }
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

		const exercise = {
			id: exRecord.id,
			rule: exRecord.getString('rule'),
			grade_level: exRecord.getString('grade_level'),
			blanks: g.jsonField(exRecord, 'blanks') || []
		};

		let ruleRecord;
		try {
			ruleRecord = e.app.findRecordById('rules', exercise.rule);
		} catch (_) {
			return e.json(500, { error: 'Règle introuvable.' });
		}
		const rule = {
			display_name: ruleRecord.getString('display_name'),
			short_description: ruleRecord.getString('short_description'),
			candidates: g.jsonField(ruleRecord, 'candidates') || [],
			groups: g.jsonField(ruleRecord, 'groups')
		};
		const hardMode = body.hard_mode === true;

		// Ne garde que des réponses texte courtes.
		const responses = {};
		for (const k of Object.keys(body.responses)) {
			const v = body.responses[k];
			if (typeof v === 'string' && v.length <= 100 && /^\d{1,3}$/.test(k)) responses[k] = v;
		}

		const grading = g.grade(exercise, responses, rule);
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
		"verified = false && role != 'admin' && created < {:limit}",
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
