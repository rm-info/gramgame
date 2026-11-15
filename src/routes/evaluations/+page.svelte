<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { activeUsername } from '$lib/active-username.svelte';
	import { GRADE_LEVELS } from '$lib/profile.svelte';
	import {
		evalsApi,
		formatDateTime,
		fmtNote,
		type AuthorEvalRow,
		type MyEval
	} from '$lib/api/evals';

	let authorRows = $state<AuthorEvalRow[]>([]);
	let mine = $state<MyEval[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	let title = $state('');
	let grade = $state('CM2');
	let creating = $state(false);
	let createError = $state<string | null>(null);

	$effect(() => {
		if (!activeUsername.loaded) return;
		load();
	});

	async function load() {
		loading = true;
		loadError = null;
		try {
			if (activeUsername.isStudent) mine = (await evalsApi.mine()).evaluations;
			else if (activeUsername.isSupervisor) authorRows = (await evalsApi.authorList()).evaluations;
		} catch (e) {
			loadError = errorMessage(e);
		}
		loading = false;
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!title.trim()) return;
		creating = true;
		createError = null;
		try {
			const rec = await pb.collection('evaluations').create({
				title: title.trim(),
				grade_level: grade,
				correction_mode: 'manual'
			});
			await goto(`${base}/evaluations/${rec.id}`);
		} catch (e) {
			createError = errorMessage(e);
			creating = false;
		}
	}

	const STATE_LABEL: Record<string, string> = {
		draft: 'en préparation',
		upcoming: 'à venir',
		open: 'en cours',
		closed: 'terminée'
	};

	const todo = $derived(mine.filter((m) => m.state === 'open' && (m.status === 'todo' || m.status === 'in_progress')));
	const upcoming = $derived(mine.filter((m) => m.state === 'upcoming' && m.status === 'todo'));
	const done = $derived(mine.filter((m) => m.status === 'submitted' || m.status === 'missed'));
</script>

<section class="container stack">
	<h1>Évaluations</h1>

	{#if !activeUsername.loaded || loading}
		<p class="muted">Chargement…</p>
	{:else if loadError}
		<p class="error">{loadError}</p>
	{:else if activeUsername.isStudent}
		<p class="muted">Les évaluations que tes professeurs ou tes parents t'ont données. Une seule tentative chacune.</p>

		<div class="card stack">
			<h2>À faire</h2>
			{#if todo.length === 0}
				<p class="muted">Rien à faire pour l'instant.</p>
			{:else}
				<ul class="list">
					{#each todo as m (m.id)}
						<li>
							<div class="info">
								<strong>{m.title}</strong>
								<span class="muted small">
									par {m.author_username} · {m.parts_count} partie{m.parts_count > 1 ? 's' : ''}
									{#if m.time_limit_min} · {m.time_limit_min} min{/if}
									{#if m.closes_at} · jusqu'au {formatDateTime(m.closes_at)}{/if}
								</span>
							</div>
							<a class="btn" href={`${base}/evaluations/${m.id}/passer`}
								>{m.status === 'in_progress' ? 'Continuer' : 'Commencer'}</a
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if upcoming.length}
			<div class="card stack">
				<h2>À venir</h2>
				<ul class="list">
					{#each upcoming as m (m.id)}
						<li>
							<div class="info">
								<strong>{m.title}</strong>
								<span class="muted small">par {m.author_username} · à partir du {formatDateTime(m.opens_at)}</span>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if done.length}
			<div class="card stack">
				<h2>Terminées</h2>
				<ul class="list">
					{#each done as m (m.id)}
						<li>
							<div class="info">
								<strong>{m.title}</strong>
								<span class="muted small">
									par {m.author_username}
									{#if m.status === 'missed'}· pas faite{:else if !m.correction_visible}· rendue, correction à venir{/if}
								</span>
							</div>
							{#if m.status === 'submitted'}
								<a class="note-link" href={`${base}/evaluations/${m.id}/passer`}>
									{#if m.note20 !== null}<strong>{fmtNote(m.note20)}/20</strong>{:else}Voir{/if}
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{:else if activeUsername.isSupervisor}
		<p class="muted">
			Prépare une évaluation (une ou plusieurs notions), relis le sujet, puis donne-la
			{activeUsername.role === 'parent' ? 'à tes enfants' : 'à tes classes ou à des élèves'}.
			Une seule tentative, réponses vérifiées par le serveur, correction quand tu le décides.
		</p>

		<form class="card stack" onsubmit={create}>
			<h2>Nouvelle évaluation</h2>
			<div class="row">
				<div class="grow">
					<label for="ev-title">Titre</label>
					<input id="ev-title" type="text" bind:value={title} maxlength="100" placeholder="ex. Révisions période 1" />
				</div>
				<div>
					<label for="ev-grade">Niveau</label>
					<select id="ev-grade" bind:value={grade}>
						{#each GRADE_LEVELS as g (g)}<option value={g}>{g}</option>{/each}
					</select>
				</div>
			</div>
			<button type="submit" disabled={creating || !title.trim()}>{creating ? 'Création…' : 'Créer et préparer le sujet'}</button>
			{#if createError}<p class="error">{createError}</p>{/if}
		</form>

		{#if authorRows.length}
			<div class="card stack">
				<h2>Mes évaluations</h2>
				<ul class="list">
					{#each authorRows as r (r.id)}
						<li>
							<a class="info" href={`${base}/evaluations/${r.id}`}>
								<strong>{r.title}</strong>
								<span class="muted small">
									<span class="badge state-{r.state}">{STATE_LABEL[r.state]}</span>
									{r.parts_count} partie{r.parts_count > 1 ? 's' : ''} · {r.grade_level}
									{#if r.status === 'published'}
										· {r.submitted}/{r.targets} copie{r.submitted > 1 ? 's' : ''} rendue{r.submitted > 1 ? 's' : ''}
										{#if r.average20 !== null}· moyenne {fmtNote(r.average20)}/20{/if}
									{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</section>

<style>
	h2 {
		margin: 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}
	.list li:last-child {
		border-bottom: none;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
		color: inherit;
	}
	a.info:hover {
		text-decoration: none;
	}
	a.info:hover strong {
		color: var(--color-primary);
	}
	.small {
		font-size: 0.88em;
	}
	.btn {
		display: inline-block;
		padding: 8px 16px;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: #fff;
		font-weight: 600;
		white-space: nowrap;
	}
	.btn:hover {
		background: var(--color-primary-hover);
		text-decoration: none;
	}
	.note-link {
		white-space: nowrap;
		font-size: 1.1em;
	}
	.row {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 200px;
	}
	.badge {
		display: inline-block;
		font-size: 0.85em;
		font-weight: 600;
		padding: 0 8px;
		margin-right: 4px;
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
</style>
