// Mails « nouvelle évaluation » envoyés aux élèves visés.
//
// Quand :
//   - à la publication, si l'évaluation n'a pas de date d'ouverture ou ouvre
//     aujourd'hui (date de Paris) ;
//   - sinon (et pour rattraper échecs, nouveaux membres de classe, élèves
//     ajoutés après coup) : tâche planifiée à minuit, heure de Paris, pour les
//     évaluations qui ouvrent ce jour-là ou avant et ne sont pas fermées.
// Chaque élève n'est prévenu qu'une fois (evaluations.mails), même si
// l'évaluation est dépubliée puis republiée.
//
// Fonctions pures en haut (testées dans pocketbase/tests/eval_mails.test.cjs).

/** Au-delà de ce nombre d'échecs pour un élève, on n'essaie plus. */
const MAX_FAILS = 3;

/** Un envoi « en cours » plus vieux que ça est considéré comme interrompu. */
const SENDING_TTL_MS = 10 * 60000;

// ────────────────────────────────────────────────────────────────────────────
// Heure de Paris, sans dépendre du fuseau de la machine
// ────────────────────────────────────────────────────────────────────────────

/** Dernier dimanche du mois (0 = janvier), à 01:00 UTC : changement d'heure européen. */
function lastSundayUtc(year, month) {
	const d = new Date(Date.UTC(year, month + 1, 0, 1));
	d.setUTCDate(d.getUTCDate() - d.getUTCDay());
	return d.getTime();
}

/** Décalage de Paris (ms) : +2 h en heure d'été, +1 h sinon. */
function parisOffsetMs(t) {
	const y = new Date(t).getUTCFullYear();
	return t >= lastSundayUtc(y, 2) && t < lastSundayUtc(y, 9) ? 2 * 3600000 : 3600000;
}

/** Date et heure « murales » de Paris, lues avec les getters UTC. */
const parisWall = (t) => new Date(t + parisOffsetMs(t));

/** 'AAAA-MM-JJ' à Paris. */
const parisDay = (t) => parisWall(t).toISOString().slice(0, 10);

/** Heure (0-23) à Paris. */
const parisHour = (t) => parisWall(t).getUTCHours();

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « lundi 16 novembre à 18 h 30 » (heure de Paris). */
function formatParis(t) {
	const d = parisWall(t);
	const h = d.getUTCHours();
	const m = d.getUTCMinutes();
	return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} à ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}

const ms = (iso) => {
	if (!iso) return null;
	const t = Date.parse(String(iso).replace(' ', 'T'));
	return isNaN(t) ? null : t;
};

// ────────────────────────────────────────────────────────────────────────────
// Règles d'envoi
// ────────────────────────────────────────────────────────────────────────────

/**
 * Les mails de cette évaluation peuvent-ils partir maintenant ? Publiée, pas
 * fermée, et ouverte aujourd'hui (date de Paris) ou avant.
 */
function mailDue(ev, now) {
	if (ev.status !== 'published') return false;
	const closes = ms(ev.closes_at);
	if (closes !== null && now >= closes) return false;
	const opens = ms(ev.opens_at);
	return opens === null || parisDay(opens) <= parisDay(now);
}

/** Envoi en cours pour cet élève (réservé par un autre envoi il y a peu) ? */
const isSending = (m, now) => !!(m && !m.sent_at && m.sending_at && now - (ms(m.sending_at) || 0) < SENDING_TTL_MS);

/** Élèves à prévenir : visés, pas encore prévenus, pas en cours d'envoi, pas trop d'échecs. */
function pendingStudents(targetIds, mails, now = Date.now()) {
	const log = mails && typeof mails === 'object' ? mails : {};
	return targetIds.filter((id) => {
		const m = log[id];
		return !m || (!m.sent_at && !isSending(m, now) && (Number(m.fails) || 0) < MAX_FAILS);
	});
}

/** Bilan pour la page de l'évaluation (élèves visés actuellement). */
function mailSummary(ev, targetIds, mails, now) {
	const log = mails && typeof mails === 'object' ? mails : {};
	let sent = 0;
	let failed = 0;
	let sending = 0;
	for (const id of targetIds) {
		const m = log[id];
		if (m && m.sent_at) sent++;
		else if (isSending(m, now)) sending++;
		else if (m && m.fails) failed++;
	}
	const opens = ms(ev.opens_at);
	return {
		targets: targetIds.length,
		sent,
		failed,
		sending,
		gave_up: targetIds.filter((id) => log[id] && !log[id].sent_at && (Number(log[id].fails) || 0) >= MAX_FAILS).length,
		// Envoi prévu à minuit le jour de l'ouverture (null : déjà dû).
		scheduled_day: ev.status === 'published' && opens !== null && parisDay(opens) > parisDay(now) ? parisDay(opens) : null
	};
}

const escapeHtml = (s) =>
	String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Contenu du mail (rien sur le sujet lui-même). */
function buildMail(ev, username, appURL, now) {
	const link = `${String(appURL || '').replace(/\/+$/, '')}/evaluations/${ev.id}/passer`;
	const opens = ms(ev.opens_at);
	const closes = ms(ev.closes_at);
	const limit = Number(ev.time_limit_min) || 0;
	const lines = [];
	if (opens !== null && opens > now) lines.push(`Elle ouvre le ${formatParis(opens)}.`);
	if (closes !== null) lines.push(`Tu as jusqu'au ${formatParis(closes)} pour la faire.`);
	lines.push(
		limit
			? `Tu auras ${limit} minutes à partir du moment où tu cliques sur « Commencer », et une seule tentative.`
			: 'Tu auras une seule tentative.'
	);
	const subject = `Nouvelle évaluation : ${ev.title}`;
	const intro = `${ev.author_username} t'a donné une évaluation : « ${ev.title} ».`;
	const text = [`Bonjour ${username},`, '', intro, '', ...lines, '', `Pour la faire : ${link}`, '', 'Bon courage !', '— GramGame'].join('\n');
	const html =
		`<p>Bonjour ${escapeHtml(username)},</p>` +
		`<p>${escapeHtml(intro)}</p>` +
		`<p>${lines.map(escapeHtml).join('<br>')}</p>` +
		`<p><a href="${escapeHtml(link)}">Faire l'évaluation</a></p>` +
		'<p>Bon courage !<br>— GramGame</p>';
	return { subject, text, html };
}

// ────────────────────────────────────────────────────────────────────────────
// Envoi (PocketBase)
// ────────────────────────────────────────────────────────────────────────────

function jsonField(rec, name) {
	return require(`${__hooks}/lib/gram.js`).jsonField(rec, name);
}

/**
 * Envoie les mails dus pour une évaluation. Renvoie { sent, failed }.
 * Ne fait rien si l'évaluation n'est pas (encore) concernée.
 *
 * Les élèves sont d'abord réservés (sending_at) dans une transaction : deux
 * envois simultanés (double publication, tâche de minuit) ne prennent jamais
 * le même élève, donc pas de doublon. Les mails partent hors transaction.
 */
function sendEvalMails(app, evalId, now) {
	const evs = require(`${__hooks}/lib/evals.js`);
	const iso = new Date(now).toISOString();
	const out = { sent: 0, failed: 0 };
	const claimed = {};
	let ev = null;
	app.runInTransaction((tx) => {
		const rec = tx.findRecordById('evaluations', evalId);
		ev = evs.evalData(rec);
		if (!mailDue(ev, now)) return;
		const log = jsonField(rec, 'mails') || {};
		for (const sid of pendingStudents(evs.targetIds(tx, ev), log, now)) {
			let user;
			try {
				user = tx.findRecordById('users', sid);
			} catch (_) {
				continue;
			}
			const address = user.getString('real_email');
			if (user.getString('role') !== 'eleve' || !address) continue;
			claimed[sid] = { address, username: user.getString('username') };
			log[sid] = Object.assign({}, log[sid], { sending_at: iso });
		}
		if (Object.keys(claimed).length) {
			rec.set('mails', log);
			tx.save(rec);
		}
	});
	if (!Object.keys(claimed).length) return out;

	const meta = app.settings().meta;
	const results = {};
	for (const sid of Object.keys(claimed)) {
		const { address, username } = claimed[sid];
		const mail = buildMail(ev, username, meta.appURL, now);
		try {
			app.newMailClient().send(
				new MailerMessage({
					from: { address: meta.senderAddress, name: meta.senderName },
					to: [{ address, name: username }],
					subject: mail.subject,
					html: mail.html,
					text: mail.text
				})
			);
			results[sid] = true;
			out.sent++;
		} catch (err) {
			results[sid] = false;
			out.failed++;
			app.logger().error('Évaluation : mail non envoyé', 'evaluation', evalId, 'student', sid, 'error', String(err));
		}
	}

	app.runInTransaction((tx) => {
		const rec = tx.findRecordById('evaluations', evalId);
		const log = jsonField(rec, 'mails') || {};
		for (const sid of Object.keys(results)) {
			if (results[sid]) log[sid] = { sent_at: iso };
			else {
				const prev = log[sid] && !log[sid].sent_at ? Number(log[sid].fails) || 0 : 0;
				log[sid] = { fails: prev + 1, last_error_at: iso };
			}
		}
		rec.set('mails', log);
		tx.save(rec);
	});
	return out;
}

/** Tâche de minuit : toutes les évaluations publiées dont les mails sont dus. */
function sendDueMails(app, now) {
	const recs = app.findRecordsByFilter('evaluations', "status = 'published'", '', 0, 0);
	const total = { evaluations: 0, sent: 0, failed: 0 };
	for (const rec of recs) {
		try {
			const r = sendEvalMails(app, rec.id, now);
			if (r.sent || r.failed) total.evaluations++;
			total.sent += r.sent;
			total.failed += r.failed;
		} catch (err) {
			app.logger().error('Évaluation : envoi des mails échoué', 'evaluation', rec.id, 'error', String(err));
		}
	}
	return total;
}

module.exports = {
	MAX_FAILS,
	parisOffsetMs,
	parisDay,
	parisHour,
	formatParis,
	mailDue,
	pendingStudents,
	mailSummary,
	buildMail,
	jsonField,
	sendEvalMails,
	sendDueMails
};
