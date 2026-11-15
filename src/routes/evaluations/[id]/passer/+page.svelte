<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { activeUsername } from '$lib/active-username.svelte';
	import ExercisePart from '$lib/components/ExercisePart.svelte';
	import { evalsApi, formatDateTime, fmtNote, type StudentView } from '$lib/api/evals';

	const id = $derived(page.params.id ?? '');
	let view = $state<StudentView | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	// Réponses par partie (id de l'exercice) puis par position.
	let answers = $state<Record<string, Record<number, string | null>>>({});
	let saveState = $state<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSaved = '';

	// Chrono : écart entre l'horloge du serveur et celle de l'appareil.
	let offset = 0;
	let now = $state(Date.now());
	let ticker: ReturnType<typeof setInterval> | null = null;
	let autoSubmitting = false;

	$effect(() => {
		if (!activeUsername.loaded || !id) return;
		if (!activeUsername.isStudent) {
			goto(`${base}/evaluations/${id}`, { replaceState: true });
			return;
		}
		load();
	});

	onDestroy(() => {
		if (ticker) clearInterval(ticker);
		if (saveTimer) clearTimeout(saveTimer);
	});

	async function load() {
		loading = true;
		loadError = null;
		try {
			setView(await evalsApi.paper(id));
		} catch (e) {
			loadError = (e as Error).message;
		}
		loading = false;
	}

	function setView(v: StudentView) {
		view = v;
		offset = Date.parse(v.now) - Date.now();
		now = Date.now() + offset;
		if (v.paper) {
			const a: Record<string, Record<number, string | null>> = {};
			for (const p of v.paper) {
				const r: Record<number, string | null> = {};
				if (p.rule_type !== 'punctuation') for (const it of p.items) r[it.position] = null;
				for (const [k, val] of Object.entries(p.responses ?? {})) r[Number(k)] = val;
				a[p.exercise_id] = r;
			}
			answers = a;
			lastSaved = JSON.stringify(payload());
			if (!ticker) ticker = setInterval(tick, 1000);
		} else if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
	}

	const deadline = $derived(view?.submission?.deadline ? Date.parse(view.submission.deadline) : null);
	const remaining = $derived(deadline === null ? null : Math.max(0, deadline - now));
	const inProgress = $derived(!!view?.paper);

	function tick() {
		now = Date.now() + offset;
		if (deadline !== null && now >= deadline && inProgress && !autoSubmitting) {
			autoSubmitting = true;
			submit(true);
		}
	}

	function fmtRemaining(ms: number): string {
		const s = Math.ceil(ms / 1000);
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return h ? `${h} h ${pad(m)}` : `${pad(m)}:${pad(sec)}`;
	}

	/** Réponses non vides, au format attendu par le serveur. */
	function payload(): Record<string, Record<string, string>> {
		const out: Record<string, Record<string, string>> = {};
		for (const [ex, r] of Object.entries(answers)) {
			const kept: Record<string, string> = {};
			for (const [k, v] of Object.entries(r)) if (typeof v === 'string' && v.trim() !== '') kept[k] = v.trim();
			out[ex] = kept;
		}
		return out;
	}

	// Sauvegarde automatique, quelques secondes après la dernière réponse.
	$effect(() => {
		if (!inProgress) return;
		const current = JSON.stringify(payload());
		if (current === lastSaved) return;
		saveState = 'pending';
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveNow(current), 1500);
	});

	async function saveNow(current: string) {
		saveState = 'saving';
		try {
			await evalsApi.save(id, JSON.parse(current));
			lastSaved = current;
			saveState = 'saved';
		} catch (e) {
			saveState = 'error';
			// Temps écoulé côté serveur : la copie est rendue, on affiche la suite.
			if (/temps est écoulé|déjà rendue/i.test((e as Error).message)) await load();
		}
	}

	const unanswered = $derived(
		(view?.paper ?? []).reduce((n, p) => {
			if (p.rule_type === 'punctuation') return n;
			const r = answers[p.exercise_id] ?? {};
			return n + p.items.filter((it) => !(typeof r[it.position] === 'string' && (r[it.position] as string).trim())).length;
		}, 0)
	);

	async function start() {
		busy = true;
		error = null;
		try {
			setView(await evalsApi.start(id));
			window.scrollTo({ top: 0 });
		} catch (e) {
			error = (e as Error).message;
		}
		busy = false;
	}

	async function submit(auto = false) {
		if (!auto) {
			const warn = unanswered
				? `Il reste ${unanswered} question${unanswered > 1 ? 's' : ''} sans réponse (comptée${unanswered > 1 ? 's' : ''} fausse${unanswered > 1 ? 's' : ''}). `
				: '';
			if (!confirm(`${warn}Rendre ta copie ? Tu ne pourras plus la modifier.`)) return;
		}
		busy = true;
		error = null;
		if (saveTimer) clearTimeout(saveTimer);
		try {
			setView(await evalsApi.submit(id, payload()));
			window.scrollTo({ top: 0 });
		} catch (e) {
			error = (e as Error).message;
			autoSubmitting = false;
		}
		busy = false;
	}

	const UNIT: Record<string, string> = { qcm: 'questions', span: 'phrases', punctuation: 'phrases', transform: 'phrases' };
	const unitOf = (t: string) => UNIT[t] ?? 'trous';
</script>

<section class="container stack">
	<a href={`${base}/evaluations`} class="back">← Mes évaluations</a>
	{#if loading}
		<p class="muted">Chargement…</p>
	{:else if loadError}
		<div class="card"><p class="error">{loadError}</p></div>
	{:else if view}
		{@const e = view.evaluation}
		<header>
			<h1>{e.title}</h1>
			<p class="muted">par {e.author_username}</p>
		</header>

		{#if !view.submission}
			<!-- ─── Présentation ─── -->
			<div class="card stack">
				<h2>Avant de commencer</h2>
				<ul class="parts-summary">
					{#each view.parts as p, i (p.exercise_id)}
						<li>
							<span>Partie {i + 1} · <strong>{p.rule_name}</strong> <span class="muted">({p.count} {unitOf(p.rule_type)})</span></span>
							<span class="muted">{p.points} pts</span>
						</li>
					{/each}
				</ul>
				<ul class="rules">
					<li><strong>Une seule tentative.</strong> Tes réponses sont enregistrées au fur et à mesure.</li>
					{#if e.time_limit_min}
						<li>
							Tu as <strong>{e.time_limit_min} minutes</strong>. Le chrono part quand tu cliques sur « Commencer »
							et continue même si tu fermes la page. À la fin, ta copie est rendue automatiquement.
						</li>
					{/if}
					{#if e.closes_at}<li>À rendre avant le <strong>{formatDateTime(e.closes_at)}</strong>.</li>{/if}
					<li>Pas d'indice ni de correction pendant l'évaluation.</li>
				</ul>
				{#if view.state === 'open'}
					<button type="button" disabled={busy} onclick={start}>{busy ? '…' : 'Commencer'}</button>
				{:else if view.state === 'upcoming'}
					<p class="muted">Elle commence le {formatDateTime(e.opens_at)}.</p>
				{:else}
					<p class="muted">Cette évaluation est terminée.</p>
				{/if}
				{#if error}<p class="error">{error}</p>{/if}
			</div>
		{:else if view.paper}
			<!-- ─── Épreuve ─── -->
			<div class="bar" class:urgent={remaining !== null && remaining < 60000}>
				<span>
					{#if remaining !== null}⏱ <strong>{fmtRemaining(remaining)}</strong>{:else}Pas de limite de temps{/if}
				</span>
				<span class="save muted">
					{saveState === 'saving' || saveState === 'pending'
						? 'Enregistrement…'
						: saveState === 'saved'
							? 'Réponses enregistrées ✓'
							: saveState === 'error'
								? 'Pas enregistré (connexion ?)'
								: ''}
				</span>
			</div>

			{#each view.paper as p, i (p.exercise_id)}
				<div class="card stack">
					<h2>Partie {i + 1} · {p.rule_name} <span class="muted pts">({p.points} pts)</span></h2>
					<ExercisePart
						rule={p.rule}
						text={p.text}
						hardMode={p.hard_mode}
						items={p.items}
						extra={p.extra}
						bind:responses={answers[p.exercise_id]}
					/>
				</div>
			{/each}

			<div class="actions">
				<button type="button" disabled={busy} onclick={() => submit(false)}>{busy ? 'Correction…' : 'Rendre ma copie'}</button>
				{#if unanswered}<span class="muted">{unanswered} question{unanswered > 1 ? 's' : ''} sans réponse</span>{/if}
				{#if error}<p class="error">{error}</p>{/if}
			</div>
		{:else}
			<!-- ─── Copie rendue ─── -->
			{#if view.copy}
				{@const c = view.copy}
				<div class="card stack result">
					<p class="big"><strong>{fmtNote(c.note20)}</strong>/20</p>
					<p class="muted">
						{fmtNote(c.score_points)} points sur {c.total_points} · rendue {formatDateTime(c.submitted_at)}{c.auto_submitted
							? ' (automatiquement, temps écoulé)'
							: ''}
					</p>
					<ul class="parts-summary">
						{#each c.parts as p, i (p.exercise_id)}
							<li>
								<span>Partie {i + 1} · {p.rule_name}</span>
								<strong>{fmtNote(p.result?.earned)}/{p.points}</strong>
							</li>
						{/each}
					</ul>
				</div>
				{#each c.parts as p, i (p.exercise_id)}
					<details class="card" open={i === 0}>
						<summary>
							<strong>Partie {i + 1} · {p.rule_name}</strong>
							<span class="muted"> — {p.result?.score ?? 0}/{p.result?.score_total ?? 0} juste{(p.result?.score ?? 0) > 1 ? 's' : ''}</span>
						</summary>
						<div class="copy-body">
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
						</div>
					</details>
				{/each}
			{:else}
				<div class="card stack">
					<h2>Copie rendue ✓</h2>
					<p>
						{view.submission.auto_submitted ? 'Le temps était écoulé : ta copie a été rendue automatiquement' : 'Ta copie est rendue'}
						{formatDateTime(view.submission.submitted_at)}.
					</p>
					<p class="muted">
						{e.correction_mode === 'after_close' && e.closes_at
							? `Ta note et la correction seront visibles le ${formatDateTime(e.closes_at)}.`
							: `Ta note et la correction seront visibles quand ${e.author_username} les publiera.`}
					</p>
				</div>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.back {
		font-size: 0.9em;
	}
	h1,
	h2 {
		margin: 0;
	}
	h2 {
		font-size: 1.15em;
	}
	header p {
		margin: 4px 0 0;
	}
	.pts {
		font-weight: 400;
		font-size: 0.85em;
	}
	.parts-summary {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.parts-summary li > :last-child {
		white-space: nowrap;
	}
	.parts-summary li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.parts-summary li:last-child {
		border-bottom: none;
	}
	.rules {
		margin: 0;
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.bar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		font-size: 1.05em;
	}
	.bar.urgent {
		border-color: var(--color-error);
		color: var(--color-error);
	}
	.save {
		font-size: 0.85em;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.actions button {
		width: auto;
	}
	.result {
		text-align: center;
	}
	.result .parts-summary {
		text-align: left;
	}
	.big {
		font-size: 2.4em;
		margin: 0;
		color: var(--color-primary);
	}
	.result p {
		margin: 0;
	}
	.copy-body {
		margin-top: var(--space-4);
	}
	details summary {
		cursor: pointer;
	}
</style>
