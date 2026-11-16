<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { activeUsername } from '$lib/active-username.svelte';
	import { hasSeveralGroups } from '$lib/confusion';
	import type { RuleType } from '$lib/data';
	import ExercisePart from '$lib/components/ExercisePart.svelte';
	import {
		evalsApi,
		formatDateTime,
		fmtNote,
		CORRECTION_LABELS,
		type CorrectionMode,
		type EvalResults,
		type CorrectedCopy,
		type PartSummary,
		type PublishMails,
		type AuthorCopy,
		type ResultsStudent,
		fmtDuration
	} from '$lib/api/evals';
	import type { PerBlank } from '$lib/api/correct';

	interface RuleOption {
		id: string;
		display_name: string;
		short_description: string;
		rule_type: RuleType;
		category: string;
		candidates: string[];
		groups: string[][] | null;
		config: { generator?: string; hard_mode?: string } | null;
	}
	interface PoolStudent {
		id: string;
		username: string;
		classes: string[];
		linked: boolean;
	}

	const CATEGORIES = [
		{ id: 'orthographe', label: 'Orthographe' },
		{ id: 'grammaire', label: 'Grammaire' },
		{ id: 'conjugaison', label: 'Conjugaison' },
		{ id: '', label: 'Autres' }
	];
	const STATE_LABEL: Record<string, string> = {
		draft: 'en préparation',
		upcoming: 'publiée, à venir',
		open: 'en cours',
		closed: 'terminée'
	};

	const id = $derived(page.params.id ?? '');
	let data = $state<EvalResults | null>(null);
	let rules = $state<RuleOption[]>([]);
	let poolStudents = $state<PoolStudent[]>([]);
	let poolClasses = $state<{ id: string; name: string; count: number }[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// Réglages en cours d'édition
	let editTitle = $state('');
	let editOpens = $state('');
	let editCloses = $state('');
	let editLimit = $state(0);
	let editMode = $state<CorrectionMode>('manual');
	let selClasses = $state<string[]>([]);
	let selStudents = $state<string[]>([]);
	let partEdits = $state<Record<string, { points: number; hard: boolean }>>({});

	let busy = $state(false);
	/** Publication en cours (spinner sur le bouton). */
	let publishing = $state(false);
	/** Mails en cours d'envoi, après la publication. */
	let mailing = $state(false);
	let msg = $state<string | null>(null);
	let error = $state<string | null>(null);

	// Ajout d'une partie
	let newRule = $state('');
	let newTheme = $state('');
	let newCount = $state(10);
	let newPoints = $state(10);
	let newHard = $state(false);
	let generating = $state(false);
	let partBusy = $state<string | null>(null);

	// Copie ouverte
	let copyOf = $state<string | null>(null);
	let copy = $state<AuthorCopy | null>(null);
	let overriding = $state<string | null>(null);
	let copyLoading = $state(false);

	const ev = $derived(data?.evaluation ?? null);
	const started = $derived((ev?.started ?? 0) > 0);
	const published = $derived(ev?.status === 'published');

	$effect(() => {
		if (!activeUsername.loaded || !id) return;
		if (!activeUsername.isSupervisor) {
			goto(`${base}/evaluations`, { replaceState: true });
			return;
		}
		loadAll();
	});

	async function loadAll() {
		loading = true;
		loadError = null;
		try {
			const [res, rl, pool] = await Promise.all([
				evalsApi.results(id),
				pb.collection('rules').getFullList({
					sort: 'display_name',
					fields: 'id,display_name,short_description,rule_type,category,candidates,groups,config'
				}),
				pb.send<{ students: PoolStudent[]; classes?: { id: string; name: string; count: number }[] }>(
					'/api/gram/suivi',
					{ method: 'GET' }
				)
			]);
			rules = rl as unknown as RuleOption[];
			poolStudents = pool.students;
			poolClasses = pool.classes ?? [];
			apply(res);
			if (!newRule && rules.length) newRule = rules[0].id;
		} catch (e) {
			loadError = errorMessage(e);
		}
		loading = false;
	}

	async function reload() {
		try {
			apply(await evalsApi.results(id));
		} catch (e) {
			error = errorMessage(e);
		}
	}

	function apply(res: EvalResults) {
		data = res;
		const e = res.evaluation;
		editTitle = e.title;
		editOpens = toLocalInput(e.opens_at);
		editCloses = toLocalInput(e.closes_at);
		editLimit = e.time_limit_min || 0;
		editMode = e.correction_mode;
		selClasses = e.classes.map((c) => c.id);
		selStudents = [...(e.students ?? [])];
		partEdits = Object.fromEntries(e.parts.map((p) => [p.exercise_id, { points: p.points, hard: p.hard_mode }]));
	}

	function toLocalInput(iso: string | null | undefined): string {
		if (!iso) return '';
		const d = new Date(iso.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	const fromLocalInput = (v: string) => (v ? new Date(v).toISOString().replace('T', ' ') : '');

	const ruleById = (rid: string) => rules.find((r) => r.id === rid);
	function hardLabel(r: RuleOption | undefined): string | null {
		if (!r) return null;
		if (r.rule_type === 'transform') return 'Écriture libre (corrigée par l’IA) au lieu du QCM';
		if (r.config?.hard_mode === 'hide_highlight') return 'Mode difficile : rien n’est surligné';
		if (r.rule_type === 'multiple_choice' && hasSeveralGroups(r)) return 'Mode difficile : tous les mots proposés dans chaque trou';
		return null;
	}
	const unitOf = (t: string | undefined) =>
		t === 'qcm' ? 'questions' : t === 'span' || t === 'punctuation' || t === 'transform' ? 'phrases' : 'trous';

	const newRuleOpt = $derived(ruleById(newRule));
	const newNeedsTheme = $derived(newRuleOpt?.config?.generator !== 'verb_groups');
	const newMax = $derived(newRuleOpt?.rule_type === 'punctuation' ? 15 : 30);
	$effect(() => {
		if (newCount > newMax) newCount = newMax;
	});
	const rulesByCategory = $derived(
		CATEGORIES.map((c) => ({
			...c,
			rules: rules.filter((r) => (c.id ? r.category === c.id : !CATEGORIES.some((k) => k.id && k.id === r.category)))
		})).filter((c) => c.rules.length > 0)
	);

	const totalPoints = $derived(Object.values(partEdits).reduce((a, p) => a + (Number(p.points) || 0), 0));

	// Élèves visés : sélection directe + membres des classes choisies.
	const viaClass = (s: PoolStudent) => s.classes.some((c) => selClasses.includes(c));
	const targetCount = $derived(poolStudents.filter((s) => selStudents.includes(s.id) || viaClass(s)).length);
	const className = (cid: string) => poolClasses.find((c) => c.id === cid)?.name ?? '';

	function toggle(list: string[], v: string): string[] {
		return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	}

	async function run(fn: () => Promise<unknown>, okMsg?: string) {
		busy = true;
		msg = null;
		error = null;
		try {
			await fn();
			if (okMsg) msg = okMsg;
		} catch (e) {
			error = errorMessage(e);
		}
		busy = false;
	}

	function settingsPayload() {
		const payload: Record<string, unknown> = {
			title: editTitle.trim(),
			opens_at: fromLocalInput(editOpens),
			closes_at: fromLocalInput(editCloses),
			time_limit_min: Math.max(0, Math.round(Number(editLimit) || 0)),
			correction_mode: editMode,
			classes: selClasses,
			// Les élèves déjà couverts par une classe choisie n'ont pas besoin d'être listés.
			students: selStudents.filter((sid) => {
				const s = poolStudents.find((p) => p.id === sid);
				return !!s && !viaClass(s);
			})
		};
		if (!started && ev) {
			payload.parts = ev.parts.map((p) => ({
				exercise: p.exercise_id,
				points: Number(partEdits[p.exercise_id]?.points) || 0,
				hard_mode: !!partEdits[p.exercise_id]?.hard
			}));
		}
		return payload;
	}

	const save = () =>
		run(async () => {
			await pb.collection('evaluations').update(id, settingsPayload());
			await reload();
		}, 'Enregistré.');

	const publish = (on: boolean) => {
		publishing = on;
		return run(
			async () => {
				try {
					if (on) await pb.collection('evaluations').update(id, settingsPayload());
					await evalsApi.publish(id, on);
				} finally {
					publishing = false;
				}
				await reload();
				if (on) {
					msg = publishedMessage(null);
					void sendMails();
				}
			},
			on ? undefined : 'Repassée en préparation.'
		);
	};

	/** Envoi des mails après la publication, sans bloquer la page. */
	async function sendMails() {
		mailing = true;
		let m: PublishMails;
		try {
			m = await evalsApi.sendMails(id);
		} catch {
			m = { sent: 0, failed: -1 };
		}
		mailing = false;
		await reload();
		if (msg?.startsWith('Publiée')) msg = publishedMessage(m);
	}

	/** Message après publication, avec le bilan des mails envoyés tout de suite. */
	function publishedMessage(m: PublishMails | null): string {
		let out = 'Publiée : les élèves la voient dans « Évaluations ».';
		const day = data?.evaluation.mails.scheduled_day;
		if (m && m.failed < 0) out += " Les mails n'ont pas pu partir : nouvel essai cette nuit à minuit.";
		else {
			if (m?.sent) out += ` Mail envoyé à ${plural(m.sent, 'élève')}.`;
			if (m?.failed) out += ` ${plural(m.failed, 'mail')} non envoyé${m.failed > 1 ? 's' : ''} : nouvel essai cette nuit à minuit.`;
			if (!m?.sent && !m?.failed && day) out += ` Les élèves seront prévenus par mail le ${fmtDay(day)}, à minuit.`;
		}
		return out;
	}

	const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

	/** '2026-11-20' → « vendredi 20 novembre ». */
	const fmtDay = (day: string) =>
		new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

	const release = () => {
		if (!confirm('Donner la correction et la note à tous les élèves qui ont rendu leur copie ?')) return;
		run(async () => {
			await evalsApi.release(id);
			await reload();
		}, 'Correction publiée.');
	};

	async function removeEval() {
		if (!confirm(`Supprimer « ${ev?.title} » ? Le sujet et toutes les copies seront effacés.`)) return;
		busy = true;
		try {
			await pb.collection('evaluations').delete(id);
			await goto(`${base}/evaluations`);
		} catch (e) {
			error = errorMessage(e);
			busy = false;
		}
	}

	async function addPart(event: SubmitEvent) {
		event.preventDefault();
		if (!newRule) return;
		generating = true;
		msg = null;
		error = null;
		try {
			// Les réglages en cours (barème…) sont gardés.
			if (ev?.parts.length && !started) await pb.collection('evaluations').update(id, settingsPayload());
			await evalsApi.addPart(id, {
				rule_id: newRule,
				theme: newTheme.trim(),
				num_blanks: newCount,
				points: newPoints,
				hard_mode: newHard && !!hardLabel(newRuleOpt)
			});
			newTheme = '';
			await reload();
			msg = 'Partie ajoutée. Relis-la avant de publier : l’IA peut se tromper.';
		} catch (e) {
			error = errorMessage(e);
		}
		generating = false;
	}

	async function partAction(p: PartSummary, action: 'regenerate' | 'remove') {
		if (action === 'remove' && !confirm(`Retirer la partie « ${p.rule_name} » ?`)) return;
		if (action === 'regenerate' && !confirm(`Regénérer « ${p.rule_name} » ? Le sujet actuel sera remplacé.`)) return;
		partBusy = p.exercise_id;
		error = null;
		try {
			if (action === 'remove') await evalsApi.removePart(id, p.exercise_id);
			else await evalsApi.regenerate(id, p.exercise_id);
			await reload();
		} catch (e) {
			error = errorMessage(e);
		}
		partBusy = null;
	}

	async function openCopy(subId: string) {
		if (copyOf === subId) {
			copyOf = null;
			copy = null;
			return;
		}
		copyOf = subId;
		copy = null;
		copyLoading = true;
		try {
			copy = await evalsApi.copy(id, subId);
		} catch (e) {
			error = errorMessage(e);
			copyOf = null;
		}
		copyLoading = false;
	}

	/** Compter juste / faux une question (null : revenir à la correction automatique). */
	async function overrideQ(exercise: string, b: PerBlank, ok: boolean | null) {
		if (!copy) return;
		overriding = `${exercise}:${b.position}`;
		error = null;
		try {
			copy = await evalsApi.override(id, copy.id, exercise, b.position, ok);
			await reload();
		} catch (e) {
			error = errorMessage(e);
		}
		overriding = null;
	}

	/** Libellé d'une réponse dans la liste d'ajustement. */
	function answerLabel(type: string, b: PerBlank): string {
		const given = b.given === null || b.given === undefined || b.given === '' ? '(pas de réponse)' : b.given;
		if (type === 'punctuation') {
			if (b.extra) return `${b.context ?? ''} : « ${given} » en trop`;
			return `${b.context ?? ''} : « ${given} », attendu « ${b.correct} »`;
		}
		const where = b.context ? `${b.context} — ` : `${type === 'qcm' || type === 'span' || type === 'transform' ? 'Question' : 'Trou'} ${b.position} : `;
		return `${where}« ${given} »${b.correct ? `, attendu « ${b.correct} »` : ''}`;
	}

	async function duplicateEval() {
		busy = true;
		error = null;
		try {
			const r = await evalsApi.duplicate(id);
			await goto(`${base}/evaluations/${r.id}`);
			msg = 'Copie créée : choisis les élèves et les dates, puis publie-la.';
		} catch (e) {
			error = errorMessage(e);
		}
		busy = false;
	}

	/** « 16/11/2026 21:33 » : reconnu comme date par les tableurs français. */
	function csvDate(iso: string | null | undefined): string {
		if (!iso) return '';
		const d = new Date(iso.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		return d
			.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
			.replace(',', '');
	}

	/** Tableau des résultats en CSV (point-virgule, virgule décimale : s'ouvre tel quel dans un tableur français). */
	function exportCsv() {
		if (!data || !ev) return;
		const num = (n: number | null | undefined) =>
			n === null || n === undefined ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
		const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
		const head = [
			'Élève',
			'Classes',
			'État',
			'Commencée',
			'Rendue',
			'Durée (min)',
			'Réponses données (%)',
			'Sorties de la page',
			'Temps hors de la page (min)',
			'Note /20',
			'Points',
			'Sur',
			...ev.parts.map((p, i) => `P${i + 1} ${p.rule_name} /${p.points}`),
			'Corrections manuelles'
		];
		const rows = data.students.map((st: ResultsStudent) => [
			st.username,
			st.classes.join(', '),
			STATUS_LABEL[st.status] + (st.auto_submitted ? ' (temps écoulé)' : ''),
			csvDate(st.started_at),
			csvDate(st.submitted_at),
			st.duration_s === null || st.duration_s === undefined ? '' : num(st.duration_s / 60),
			st.answered_pct === undefined ? '' : String(st.answered_pct),
			st.leaves === undefined ? '' : String(st.leaves),
			st.away_seconds === undefined ? '' : num(st.away_seconds / 60),
			st.status === 'submitted' ? num(st.note20) : '',
			st.status === 'submitted' ? num(st.score_points) : '',
			st.status === 'submitted' ? num(st.total_points) : '',
			...ev.parts.map((p) => num(st.parts?.find((x) => x.exercise === p.exercise_id)?.earned)),
			st.overrides ? String(st.overrides) : ''
		]);
		const csv = '\ufeff' + [head, ...rows].map((r) => r.map((v) => cell(String(v))).join(';')).join('\r\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
		const slug = ev.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
		a.download = `${slug || 'evaluation'}-resultats.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	function allowRetake(subId: string, username: string) {
		if (!confirm(`Effacer la copie de « ${username} » ? Il ou elle pourra refaire l'évaluation.`)) return;
		run(async () => {
			await pb.collection('eval_submissions').delete(subId);
			if (copyOf === subId) {
				copyOf = null;
				copy = null;
			}
			await reload();
		}, 'Copie effacée.');
	}

	const STATUS_LABEL = { not_started: 'pas commencée', in_progress: 'en cours', submitted: 'rendue' };
	const hardest = $derived(
		(data?.stats.questions ?? [])
			.filter((q) => q.total > 0 && q.ok / q.total < 0.7)
			.sort((a, b) => a.ok / a.total - b.ok / b.total)
			.slice(0, 8)
	);
	const partIndex = (exId: string) => (ev?.parts.findIndex((p) => p.exercise_id === exId) ?? -1) + 1;
	const partName = (exId: string) => ev?.parts.find((p) => p.exercise_id === exId)?.rule_name ?? '';
</script>

<section class="container stack">
	<a href={`${base}/evaluations`} class="back">← Évaluations</a>
	{#if loading}
		<p class="muted">Chargement…</p>
	{:else if loadError}
		<p class="error">{loadError}</p>
	{:else if ev && data}
		<header class="head">
			<div>
				<h1>{ev.title}</h1>
				<p class="muted">
					<span class="badge state-{ev.state}">{STATE_LABEL[ev.state]}</span>
					{ev.grade_level} · {ev.parts.length} partie{ev.parts.length > 1 ? 's' : ''} · {totalPoints} points
				</p>
			</div>
			<div class="head-actions">
				{#if !published}
					<button type="button" disabled={busy || !ev.parts.length} onclick={() => publish(true)}>
						{#if publishing}<span class="spinner" aria-hidden="true"></span> Publication…{:else}Publier{/if}
					</button>
				{:else if !started}
					<button type="button" class="secondary" disabled={busy} onclick={() => publish(false)}>Repasser en préparation</button>
				{/if}
				<button type="button" class="link" disabled={busy || !ev.parts.length} onclick={duplicateEval} title="Même sujet et même barème, pour une autre classe"
					>Dupliquer</button
				>
				<button type="button" class="link danger" disabled={busy} onclick={removeEval}>Supprimer</button>
			</div>
		</header>

		{#if msg}<p class="ok">{msg}</p>{/if}
		{#if error}<p class="error">{error}</p>{/if}

		{#if published}
			<!-- ─── Résultats ─── -->
			<div class="card stack">
				<h2>Résultats</h2>
				<div class="stats">
					<span class="stat"><strong>{data.stats.submitted}</strong>/{data.students.length} copies rendues</span>
					{#if data.stats.average20 !== null}
						<span class="stat">moyenne <strong>{fmtNote(data.stats.average20)}</strong>/20</span>
						<span class="stat">de {fmtNote(data.stats.min20)} à {fmtNote(data.stats.max20)}</span>
					{/if}
				</div>
				{#if ev.correction_mode === 'manual' && !ev.correction_released}
					<div class="release">
						<span class="muted">Les élèves ne voient pas encore leur note ni la correction.</span>
						<button type="button" disabled={busy || !data.stats.submitted} onclick={release}>Donner la correction</button>
					</div>
				{:else}
					<p class="muted small">
						{ev.correction_visible
							? 'Les élèves voient leur note et la correction.'
							: `Les élèves verront leur note et la correction ${CORRECTION_LABELS[ev.correction_mode]}${ev.closes_at ? ` (${formatDateTime(ev.closes_at)})` : ''}.`}
					</p>
				{/if}

				{#if ev.mails.scheduled_day}
					<p class="muted small">📧 Les élèves seront prévenus par mail le {fmtDay(ev.mails.scheduled_day)}, à minuit.</p>
				{:else if mailing || ev.mails.sending}
					<p class="muted small" role="status"><span class="spinner" aria-hidden="true"></span> 📧 Envoi des mails en cours…</p>
				{:else if ev.mails.targets}
					{@const retry = ev.mails.failed - ev.mails.gave_up}
					<p class="muted small">
						📧 Mail envoyé à {ev.mails.sent} élève{ev.mails.sent > 1 ? 's' : ''} sur {ev.mails.targets}{retry
							? ` · ${retry} en attente (nouvel essai cette nuit à minuit)`
							: ''}{ev.mails.gave_up ? ` · ${ev.mails.gave_up} non envoyé${ev.mails.gave_up > 1 ? 's' : ''} après 3 essais` : ''}.
					</p>
				{/if}

				<div class="table-wrap">
					<table class="results">
						<thead>
							<tr>
								<th>Élève</th>
								<th class="hide-sm">État</th>
								<th class="num" title="Temps mis pour rendre la copie">Durée</th>
								<th class="num" title="Réponses données, justes ou fausses">Répondu</th>
								<th class="num hide-sm" title="Nombre de fois où l'élève a quitté la page (autre onglet, autre appli)">Sorties</th>
								<th class="num">Note</th>
								{#each ev.parts as p, i (p.exercise_id)}
									<th class="num part-col" title={p.rule_name}>P{i + 1}<span class="muted">/{p.points}</span></th>
								{/each}
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each data.students as s (s.id)}
								<tr class:open={copyOf === s.submission_id}>
									<td>
										<strong class="nowrap">{s.username}</strong>
										{#if s.classes.length}<span class="muted small hide-sm"> · {s.classes.join(', ')}</span>{/if}
									</td>
									<td class="small hide-sm">
										{STATUS_LABEL[s.status]}{#if s.auto_submitted}<span class="muted" title="Rendue automatiquement à la fin du temps"> (temps écoulé)</span>{/if}
									</td>
									<td class="num small">{s.status === 'submitted' ? fmtDuration(s.duration_s) : '—'}</td>
									<td class="num small" title={s.answered_total ? `${s.answered}/${s.answered_total} réponses` : ''}>
										{s.answered_pct === undefined ? '—' : `${s.answered_pct} %`}
									</td>
									<td
										class="num small hide-sm"
										class:warn={(s.leaves ?? 0) > 0}
										title={s.leaves ? `${fmtDuration(s.away_seconds ?? 0)} hors de la page` : ''}
									>
										{s.leaves === undefined ? '—' : s.leaves}{#if s.away_now}<span title="Hors de la page en ce moment"> ⏸</span>{/if}
									</td>
									<td class="num">
										{#if s.status === 'submitted'}<strong>{fmtNote(s.note20)}</strong>{:else if s.status === 'in_progress'}<span
												class="muted small">en cours</span
											>{:else}<span class="muted" title="pas commencée">—</span>{/if}{#if s.overrides}<span
												class="muted"
												title={`${s.overrides} réponse(s) corrigée(s) à la main`}>*</span
											>{/if}
									</td>
									{#each ev.parts as p (p.exercise_id)}
										{@const r = s.parts?.find((x) => x.exercise === p.exercise_id)}
										<td class="num part-col">{r ? fmtNote(r.earned) : '—'}</td>
									{/each}
									<td class="row-actions">
										{#if s.status === 'submitted' && s.submission_id}
											<button type="button" class="link" onclick={() => openCopy(s.submission_id ?? '')}
												>{copyOf === s.submission_id ? 'Fermer' : 'Copie'}</button
											>
										{/if}
										{#if s.submission_id}
											<button
												type="button"
												class="link danger"
												title="Effacer la copie pour qu'il ou elle recommence"
												disabled={busy}
												onclick={() => allowRetake(s.submission_id ?? '', s.username)}>Refaire</button
											>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="muted small legend">
					{#each ev.parts as p, i (p.exercise_id)}<span>P{i + 1} = {p.rule_name}</span>{/each}
					<span>Répondu = réponses données, justes ou fausses</span>
					<span>* = note ajustée à la main</span>
				</p>
				<div>
					<button type="button" class="secondary csv" disabled={!data.students.length} onclick={exportCsv}
						>Exporter en CSV (tableur)</button
					>
				</div>
			</div>

			{#if copyOf}
				<div class="card stack copy">
					{#if copyLoading || !copy}
						<p class="muted">Chargement de la copie…</p>
					{:else}
						<h2>Copie de {copy.student_username} : {fmtNote(copy.note20)}/20</h2>
						<p class="muted small">
							Rendue {formatDateTime(copy.submitted_at)}{copy.auto_submitted ? ' (automatiquement, temps écoulé)' : ''}
							en {fmtDuration(Math.round((Date.parse(copy.submitted_at.replace(' ', 'T')) - Date.parse(copy.started_at.replace(' ', 'T'))) / 1000))}
							· {fmtNote(copy.score_points)}/{copy.total_points} points
							· {copy.leaves
								? `a quitté la page ${copy.leaves} fois (${fmtDuration(copy.away_seconds)} en tout)`
								: "n'a pas quitté la page"}
						</p>
						{#each copy.parts as p, i (p.exercise_id)}
							<div class="copy-part stack">
								<h3>
									Partie {i + 1} · {p.rule_name}
									<span class="muted">— {fmtNote(p.result?.earned)}/{p.points} ({p.result?.score ?? 0}/{p.result?.score_total ?? 0})</span>
								</h3>
								<ExercisePart
									rule={p.rule}
									text={p.text}
									hardMode={p.hard_mode}
									blanks={p.blanks}
									extra={p.extra}
									responses={p.responses as unknown as Record<number, string | null>}
									readonly
									results={p.result?.per_blank ?? []}
								/>
								{#if p.result?.per_blank?.length}
									{@const list = [...p.result.per_blank].sort((a, b) => a.position - b.position)}
									{@const toCheck = list.filter((b) => b.uncertain && !b.overridden).length}
									<details class="adjust" open={toCheck > 0}>
										<summary>
											Ajuster la correction{#if toCheck}<span class="to-check"> · {toCheck} à vérifier</span>{/if}
										</summary>
										<ul>
											{#each list as b (b.position + (b.extra ? 'x' : ''))}
												{@const key = `${p.exercise_id}:${b.position}`}
												<li class:uncertain={b.uncertain && !b.overridden}>
													<span class="mark" class:right={b.ok}>{b.ok ? '✓' : '✗'}</span>
													<span class="what">
														{answerLabel(p.rule_type, b)}
														{#if b.overridden}<span class="tag">revu à la main</span>{:else if b.uncertain}<span class="tag warn"
																>l'IA a un doute</span
															>{/if}
													</span>
													<span class="adj-actions">
														<button
															type="button"
															class="link"
															disabled={overriding === key}
															onclick={() => overrideQ(p.exercise_id, b, !b.ok)}>{b.ok ? 'Compter faux' : 'Compter juste'}</button
														>
														{#if b.overridden}
															<button type="button" class="link" disabled={overriding === key} onclick={() => overrideQ(p.exercise_id, b, null)}
																>Annuler</button
															>
														{/if}
													</span>
												</li>
											{/each}
										</ul>
									</details>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if hardest.length}
				<div class="card stack">
					<h2>Questions les plus ratées</h2>
					<ul class="hard-list">
						{#each hardest as q (q.exercise + q.position)}
							<li>
								<span class="pct">{Math.round((q.ok / q.total) * 100)} %</span>
								<span>
									<span class="muted small">P{partIndex(q.exercise)} · {partName(q.exercise)}</span><br />
									{#if q.context}{q.context}&nbsp;{/if}{#if q.correct}<span class="muted">→&nbsp;</span><strong>{q.correct}</strong>{/if}
									<span class="muted small"> ({q.ok}/{q.total} juste{q.ok > 1 ? 's' : ''})</span>
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

		<!-- ─── Sujet ─── -->
		<div class="card stack">
			<h2>Sujet</h2>
			{#if started}
				<p class="muted small">Des élèves ont commencé : le sujet et le barème ne peuvent plus changer.</p>
			{:else}
				<p class="muted small">
					Chaque partie est générée une fois, pour tous les élèves. <strong>Relis-la</strong> (et corrige-la si
					besoin) avant de publier : l'IA peut se tromper.
				</p>
			{/if}
			{#if ev.parts.length === 0}
				<p class="muted">Pas encore de partie : ajoute une notion ci-dessous.</p>
			{/if}
			<ol class="parts">
				{#each ev.parts as p, i (p.exercise_id)}
					{@const r = ruleById(p.rule_id)}
					{@const hl = hardLabel(r)}
					<li class="part">
						<div class="part-head">
							<strong>Partie {i + 1} · {p.rule_name}</strong>
							<span class="muted small">{p.count} {unitOf(p.rule_type)}{p.theme ? ` · ${p.theme}` : ''}</span>
						</div>
						<div class="part-controls">
							<label class="pts">
								<input
									type="number"
									min="1"
									max="100"
									disabled={started}
									bind:value={partEdits[p.exercise_id].points}
								/>
								points
							</label>
							{#if hl}
								<label class="hard">
									<input type="checkbox" disabled={started} bind:checked={partEdits[p.exercise_id].hard} />
									<span>{hl}</span>
								</label>
							{/if}
						</div>
						{#if !started}
							<div class="part-actions">
								<a href={`${base}/exercise/${p.exercise_id}/edit`}>Relire / corriger</a>
								<button type="button" class="link" disabled={!!partBusy} onclick={() => partAction(p, 'regenerate')}
									>{partBusy === p.exercise_id ? 'Génération…' : 'Regénérer'}</button
								>
								<button type="button" class="link danger" disabled={!!partBusy} onclick={() => partAction(p, 'remove')}
									>Retirer</button
								>
							</div>
						{/if}
					</li>
				{/each}
			</ol>

			{#if !started && ev.parts.length < 6}
				<form class="add-part stack" onsubmit={addPart}>
					<h3>Ajouter une partie</h3>
					<div>
						<label for="np-rule">Notion</label>
						<select id="np-rule" bind:value={newRule}>
							{#each rulesByCategory as cat (cat.id)}
								<optgroup label={cat.label}>
									{#each cat.rules as r (r.id)}<option value={r.id}>{r.display_name}</option>{/each}
								</optgroup>
							{/each}
						</select>
					</div>
					{#if newNeedsTheme}
						<div>
							<label for="np-theme">Thème</label>
							<input id="np-theme" type="text" bind:value={newTheme} maxlength="120" placeholder="ex. une journée à la plage" />
						</div>
					{/if}
					<div class="row">
						<div class="grow">
							<label for="np-count">Nombre de {unitOf(newRuleOpt?.rule_type)} : <strong>{newCount}</strong></label>
							<input id="np-count" type="range" min="3" max={newMax} bind:value={newCount} />
						</div>
						<label class="pts">
							<input type="number" min="1" max="100" bind:value={newPoints} />
							points
						</label>
					</div>
					{#if hardLabel(newRuleOpt)}
						<label class="hard">
							<input type="checkbox" bind:checked={newHard} />
							<span>{hardLabel(newRuleOpt)}</span>
						</label>
					{/if}
					<button type="submit" disabled={generating || (newNeedsTheme && !newTheme.trim())}>
						{generating ? 'Génération en cours (30 s à 1 min)…' : 'Générer cette partie'}
					</button>
				</form>
			{/if}
		</div>

		<!-- ─── Élèves ─── -->
		<div class="card stack">
			<h2>Élèves</h2>
			{#if poolClasses.length}
				<fieldset>
					<legend>Classes</legend>
					{#each poolClasses as c (c.id)}
						<label class="check">
							<input type="checkbox" checked={selClasses.includes(c.id)} onchange={() => (selClasses = toggle(selClasses, c.id))} />
							<span>{c.name} <span class="muted">({c.count} élève{c.count > 1 ? 's' : ''})</span></span>
						</label>
					{/each}
				</fieldset>
			{/if}
			{#if poolStudents.length}
				<fieldset>
					<legend>{poolClasses.length ? 'Ou des élèves en particulier' : 'Élèves'}</legend>
					<div class="students">
						{#each poolStudents as s (s.id)}
							{@const via = viaClass(s)}
							<label class="check" class:via>
								<input
									type="checkbox"
									checked={via || selStudents.includes(s.id)}
									disabled={via}
									onchange={() => (selStudents = toggle(selStudents, s.id))}
								/>
								<span>
									{s.username}
									{#if via}<span class="muted small">(via {s.classes.filter((c) => selClasses.includes(c)).map(className).join(', ')})</span>{/if}
								</span>
							</label>
						{/each}
					</div>
				</fieldset>
			{:else if !poolClasses.length}
				<p class="muted">
					Aucun élève : {activeUsername.role === 'parent'
						? 'lie d’abord le compte de ton enfant (Suivi → Gérer mes élèves).'
						: 'crée une classe ou lie des élèves dans le Suivi.'}
				</p>
			{/if}
			<p class="muted small">{targetCount} élève{targetCount > 1 ? 's' : ''} concerné{targetCount > 1 ? 's' : ''}.</p>
		</div>

		<!-- ─── Réglages ─── -->
		<div class="card stack">
			<h2>Réglages</h2>
			<div>
				<label for="st-title">Titre</label>
				<input id="st-title" type="text" bind:value={editTitle} maxlength="100" />
			</div>
			<div class="row">
				<div class="grow">
					<label for="st-opens">Ouverture <span class="muted">(vide = tout de suite)</span></label>
					<input id="st-opens" type="datetime-local" bind:value={editOpens} />
				</div>
				<div class="grow">
					<label for="st-closes">Fin <span class="muted">(vide = pas de fin)</span></label>
					<input id="st-closes" type="datetime-local" bind:value={editCloses} />
				</div>
			</div>
			<div>
				<label for="st-limit">Durée pour faire l'évaluation <span class="muted">(minutes, 0 = sans limite)</span></label>
				<input id="st-limit" type="number" min="0" max="240" bind:value={editLimit} class="short" />
				<p class="muted small">Le chrono part quand l'élève clique sur « Commencer ». À la fin du temps (ou à la date de fin), la copie est rendue avec ce qui a été répondu.</p>
			</div>
			<fieldset>
				<legend>L'élève voit sa note et la correction…</legend>
				{#each Object.entries(CORRECTION_LABELS) as [k, label] (k)}
					<label class="check">
						<input type="radio" name="mode" value={k} bind:group={editMode} />
						<span>{label}{k === 'after_close' ? ' (empêche de se passer les réponses)' : ''}</span>
					</label>
				{/each}
			</fieldset>
			{#if !published}
				<p class="muted small">
					📧 À la publication, chaque élève reçoit un mail. Si l'évaluation ouvre un autre jour, le mail part ce
					jour-là, à minuit.
				</p>
			{/if}
			<div class="save-row">
				<button type="button" disabled={busy || !editTitle.trim()} onclick={save}>Enregistrer</button>
				{#if !published}
					<button type="button" class="secondary" disabled={busy || !ev.parts.length} onclick={() => publish(true)}>
						{#if publishing}<span class="spinner" aria-hidden="true"></span> Publication…{:else}Enregistrer et publier{/if}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.spinner {
		display: inline-block;
		width: 0.85em;
		height: 0.85em;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		vertical-align: -0.1em;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2s;
		}
	}
	.back {
		font-size: 0.9em;
	}
	h1,
	h2,
	h3 {
		margin: 0;
	}
	h3 {
		font-size: 1.05em;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.head p {
		margin: 4px 0 0;
	}
	.head-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}
	.head-actions button {
		width: auto;
	}
	.badge {
		display: inline-block;
		font-size: 0.85em;
		font-weight: 600;
		padding: 0 8px;
		border-radius: 999px;
		background: rgba(90, 96, 114, 0.12);
	}
	.state-open {
		background: rgba(46, 139, 87, 0.15);
		color: var(--color-success);
	}
	.state-upcoming {
		background: rgba(47, 93, 177, 0.12);
		color: var(--color-primary);
	}
	.ok {
		color: var(--color-success);
		margin: 0;
	}
	.small {
		font-size: 0.88em;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.stat {
		padding: 4px 12px;
		border-radius: 999px;
		background: rgba(47, 93, 177, 0.08);
	}
	.release {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: var(--space-3);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
	}
	.release button {
		width: auto;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table.results {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95em;
	}
	.results th,
	.results td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--color-border);
		text-align: left;
		vertical-align: middle;
	}
	.results th {
		font-weight: 600;
		white-space: nowrap;
	}
	.results tr.open td {
		background: rgba(47, 93, 177, 0.06);
	}
	.num {
		text-align: right !important;
		white-space: nowrap;
	}
	.row-actions {
		white-space: nowrap;
		text-align: right !important;
	}
	@media (max-width: 640px) {
		.part-col {
			display: none;
		}
	}
	/* Nom d'élève jamais coupé (au tiret notamment) ; le tableau défile s'il le faut. */
	.nowrap {
		white-space: nowrap;
	}
	.warn {
		color: var(--color-warning);
		font-weight: 600;
	}
	@media (max-width: 640px) {
		.hide-sm {
			display: none;
		}
		.results th,
		.results td {
			padding: 6px 4px;
		}
		.row-actions {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
		}
	}
	button.csv {
		width: auto;
	}
	.adjust summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--color-primary);
	}
	.to-check {
		color: var(--color-warning);
	}
	.adjust ul {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
	}
	.adjust li {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
	}
	.adjust li.uncertain {
		background: rgba(201, 122, 29, 0.08);
	}
	.adjust .mark {
		font-weight: 700;
		color: var(--color-error);
		width: 1em;
	}
	.adjust .mark.right {
		color: var(--color-success);
	}
	.adjust .what {
		flex: 1;
		min-width: 12em;
	}
	.adj-actions {
		white-space: nowrap;
	}
	.tag {
		font-size: 0.8em;
		padding: 0 6px;
		margin-left: 4px;
		border-radius: 999px;
		border: 1px solid currentColor;
		color: var(--color-primary);
	}
	.tag.warn {
		color: var(--color-warning);
		font-weight: 400;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin: 0;
	}
	.copy-part {
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border);
	}
	.hard-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.hard-list li {
		display: flex;
		gap: var(--space-3);
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.hard-list li:last-child {
		border-bottom: none;
	}
	.pct {
		font-weight: 700;
		color: var(--color-error);
		min-width: 3.2em;
	}
	.parts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.part {
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.part-head {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		align-items: baseline;
	}
	.part-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		align-items: center;
	}
	.pts {
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		font-weight: 400;
	}
	.pts input {
		width: 5em;
	}
	.hard,
	.check {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-weight: 400;
		cursor: pointer;
	}
	.hard input,
	.check input {
		width: auto;
		margin-top: 4px;
	}
	.check.via {
		cursor: default;
	}
	.part-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		align-items: center;
	}
	.add-part {
		padding: var(--space-3);
		border: 1px dashed var(--color-primary);
		border-radius: var(--radius-sm);
	}
	.row {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.grow {
		flex: 1;
		min-width: 180px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	legend {
		font-weight: 600;
		margin-bottom: 4px;
	}
	.students {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 6px 12px;
	}
	.short {
		max-width: 8em;
	}
	.save-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.save-row button {
		width: auto;
	}
	button.link {
		width: auto;
		background: transparent;
		color: var(--color-primary);
		border: none;
		padding: 2px 6px;
	}
	button.link.danger {
		color: var(--color-error);
	}
	button.link:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.08);
		color: var(--color-primary);
	}
	button.link.danger:hover:not(:disabled) {
		background: rgba(184, 51, 60, 0.1);
		color: var(--color-error);
	}
</style>
