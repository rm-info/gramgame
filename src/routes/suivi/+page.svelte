<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { activeUsername } from '$lib/active-username.svelte';
	import LinksManager from '$lib/components/LinksManager.svelte';
	import ClassesManager from '$lib/components/ClassesManager.svelte';

	interface Notion {
		rule_id: string;
		name: string;
		category: string;
		attempts: number;
		hard_attempts: number;
		last_pct: number;
		avg_last3_pct: number;
		last_date: string;
		status: 'acquis' | 'en_cours' | 'a_retravailler' | 'non_commence';
	}
	interface ClassInfo {
		id: string;
		name: string;
		code: string;
		count: number;
	}
	interface Student {
		id: string;
		username: string;
		grade_level: string;
		classes: string[];
		linked: boolean;
		attempts_total: number;
		attempts_7d: number;
		avg_7d: number | null;
		avg_30d: number | null;
		last_activity: string | null;
		notions: Notion[];
		weak_points: { rule_id: string; rule_name: string; label: string; ok: number; total: number; pct: number }[];
		recent: { date: string; rule_id: string; rule_name: string; score: number; score_total: number; hard_mode: boolean }[];
	}

	const STATUS: Record<Notion['status'], { label: string; order: number }> = {
		a_retravailler: { label: 'à retravailler', order: 0 },
		en_cours: { label: 'en cours', order: 1 },
		acquis: { label: 'acquis', order: 2 },
		non_commence: { label: 'pas commencé', order: 3 }
	};

	let students = $state<Student[]>([]);
	let classes = $state<ClassInfo[]>([]);
	/** Filtre : '' = tous, 'linked' = liés individuellement, sinon id de classe. */
	let filter = $state('');
	const hasClasses = $derived(activeUsername.role === 'prof' || activeUsername.isAdmin);
	let classesOpen = $state(false);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	// Volet « Gérer mes élèves » : ouvert d'office s'il n'y a encore personne.
	let linksOpen = $state(false);
	let firstLoad = true;

	$effect(() => {
		if (!activeUsername.loaded) return;
		if (!activeUsername.isSupervisor) {
			goto(`${base}/`, { replaceState: true });
			return;
		}
		load();
	});

	/** silent : rechargement après un changement de liens, sans tout effacer. */
	async function load(silent = false) {
		if (!silent) loading = true;
		loadError = null;
		try {
			const res = await pb.send<{ students: Student[]; classes: ClassInfo[] }>('/api/gram/suivi', { method: 'GET' });
			students = res.students;
			classes = res.classes ?? [];
			if (filter && filter !== 'linked' && !classes.some((c) => c.id === filter)) filter = '';
			if (firstLoad && students.length === 0) {
				if (hasClasses) classesOpen = true;
				else linksOpen = true;
			}
			firstLoad = false;
		} catch (e) {
			loadError = errorMessage(e);
		}
		loading = false;
	}

	const className = (id: string) => classes.find((c) => c.id === id)?.name ?? '';
	const shown = $derived(
		filter === ''
			? students
			: filter === 'linked'
				? students.filter((s) => s.linked)
				: students.filter((s) => s.classes.includes(filter))
	);
	const showLinkedFilter = $derived(!activeUsername.isAdmin && students.some((s) => s.linked));

	const sortedNotions = (s: Student) =>
		[...s.notions].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order);

	function ago(iso: string | null): string {
		if (!iso) return 'jamais';
		const d = new Date(iso.replace(' ', 'T'));
		const days = Math.floor((Date.now() - d.getTime()) / 86400000);
		if (days <= 0) return "aujourd'hui";
		if (days === 1) return 'hier';
		if (days < 30) return `il y a ${days} jours`;
		return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function shortDate(iso: string): string {
		return new Date(iso.replace(' ', 'T')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
	}

	const note = (score: number, total: number) => (total ? ((score / total) * 20).toFixed(1) : '—');
</script>

<section class="container stack">
	<header class="stack">
		<h1>{activeUsername.role === 'parent' ? 'Suivi de mes enfants' : 'Suivi des élèves'}</h1>
		<p class="muted">
			{activeUsername.isAdmin
				? 'En tant qu\'administrateur, tu vois tous les élèves.'
				: activeUsername.role === 'prof'
					? 'Les résultats des élèves de tes classes et de ceux liés à ton compte. Une notion est « acquise » quand la moyenne de ses 3 dernières tentatives atteint 80 % (au moins 2 tentatives).'
					: 'Les résultats des élèves liés à ton compte. Une notion est « acquise » quand la moyenne de ses 3 dernières tentatives atteint 80 % (au moins 2 tentatives).'}
		</p>
	</header>

	{#if hasClasses}
		<details class="card" bind:open={classesOpen}>
			<summary><strong>Mes classes</strong> (créer, codes à donner aux élèves)</summary>
			<div class="links-box"><ClassesManager onchange={() => load(true)} /></div>
		</details>
	{/if}

	{#if !activeUsername.isAdmin}
		<details class="card" bind:open={linksOpen}>
			<summary>
				<strong>{hasClasses ? 'Élèves suivis individuellement' : 'Gérer mes élèves'}</strong> (ajouter, demandes en
				attente)
			</summary>
			<div class="links-box"><LinksManager onchange={() => load(true)} /></div>
		</details>
	{/if}

	{#if loading}
		<p class="muted">Chargement…</p>
	{:else if loadError}
		<p class="error">{loadError}</p>
	{:else if students.length === 0}
		<p class="muted">Aucun élève à suivre pour l'instant.</p>
	{:else}
		{#if classes.length || showLinkedFilter}
			<div class="filters" role="group" aria-label="Filtrer par classe">
				<button type="button" class:active={filter === ''} onclick={() => (filter = '')}
					>Tous ({students.length})</button
				>
				{#each classes as c (c.id)}
					<button type="button" class:active={filter === c.id} onclick={() => (filter = c.id)}
						>{c.name} ({c.count})</button
					>
				{/each}
				{#if showLinkedFilter && classes.length}
					<button type="button" class:active={filter === 'linked'} onclick={() => (filter = 'linked')}
						>Suivis individuellement ({students.filter((s) => s.linked).length})</button
					>
				{/if}
			</div>
		{/if}
		{#if shown.length === 0}
			<p class="muted">Aucun élève dans cette classe pour l'instant.</p>
		{/if}
		{#each shown as s (s.id)}
			<details class="card student" open={shown.length <= 3}>
				<summary>
					<span class="who">
						<strong>{s.username}</strong>
						{#if s.grade_level}<span class="muted">· {s.grade_level}</span>{/if}
						{#if s.classes.length && filter === ''}
							<span class="muted class-names">· {s.classes.map(className).join(', ')}</span>
						{/if}
					</span>
					<span class="chips">
						<span class="chip">dernière activité : {ago(s.last_activity)}</span>
						<span class="chip">{s.attempts_7d} exercice{s.attempts_7d > 1 ? 's' : ''} cette semaine</span>
						{#if s.avg_7d !== null}<span class="chip">moyenne 7 j : {s.avg_7d} %</span>{/if}
						{#if s.avg_30d !== null}<span class="chip">30 j : {s.avg_30d} %</span>{/if}
					</span>
				</summary>

				{#if s.attempts_total === 0}
					<p class="muted">Pas encore d'exercice fait.</p>
				{:else}
					<div class="grid">
						<div class="stack">
							<h3>Notions travaillées</h3>
							<ul class="notions">
								{#each sortedNotions(s) as n (n.rule_id)}
									<li>
										<span class="status status-{n.status}">{STATUS[n.status].label}</span>
										<span class="notion-name">{n.name}</span>
										<span class="muted notion-meta">
											{n.avg_last3_pct} % (3 dernières) · {n.attempts} fois{#if n.hard_attempts}, dont {n.hard_attempts}
												en mode difficile{/if} · {ago(n.last_date)}
										</span>
									</li>
								{/each}
							</ul>
						</div>

						<div class="stack">
							{#if s.weak_points.length}
								<h3>Points faibles (30 derniers jours)</h3>
								<ul class="weak">
									{#each s.weak_points as w (w.rule_id + w.label)}
										<li>
											<span><strong>{w.label}</strong> <span class="muted">· {w.rule_name}</span></span>
											<span class="weak-score">{w.ok}/{w.total} ({w.pct} %)</span>
										</li>
									{/each}
								</ul>
							{/if}

							<h3>Dernières tentatives</h3>
							<ul class="recent">
								{#each s.recent as r, i (i)}
									<li>
										<span class="muted">{shortDate(r.date)}</span>
										<span class="recent-name">{r.rule_name}{#if r.hard_mode} <span class="tag">difficile</span>{/if}</span>
										<span class="recent-note">{note(r.score, r.score_total)}/20</span>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				{/if}
			</details>
		{/each}
	{/if}
</section>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.filters button {
		width: auto;
		padding: 4px 12px;
		border-radius: 999px;
		background: transparent;
		color: var(--color-primary);
		border: 1px solid var(--color-primary);
		font-size: 0.9em;
	}
	.filters button:hover:not(.active) {
		background: rgba(47, 93, 177, 0.08);
		color: var(--color-primary);
	}
	.filters button.active {
		background: var(--color-primary);
		color: #fff;
	}
	.class-names {
		font-size: 0.85em;
	}
	.links-box {
		margin-top: var(--space-3, 12px);
	}
	.student summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2, 8px) var(--space-4, 16px);
		cursor: pointer;
	}
	.who {
		font-size: 1.15em;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		font-size: 0.85em;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(47, 93, 177, 0.08);
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-6, 24px);
		margin-top: var(--space-4, 16px);
	}
	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
	h3 {
		margin: 0;
		font-size: 1em;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		padding: 6px 0;
		border-bottom: 1px solid var(--color-border);
	}
	li:last-child {
		border-bottom: none;
	}
	.notions li {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 8px;
		align-items: baseline;
	}
	.notion-meta {
		grid-column: 2;
		font-size: 0.85em;
	}
	.status {
		font-size: 0.8em;
		font-weight: 600;
		padding: 1px 8px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.status-acquis {
		background: rgba(46, 139, 87, 0.15);
		color: var(--color-success);
	}
	.status-en_cours {
		background: rgba(200, 150, 0, 0.15);
		color: #8a6400;
	}
	.status-a_retravailler {
		background: rgba(184, 51, 60, 0.12);
		color: var(--color-error);
	}
	.weak li,
	.recent li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.weak-score {
		color: var(--color-error);
		white-space: nowrap;
	}
	.recent-name {
		flex: 1;
	}
	.recent-note {
		font-weight: 700;
		color: var(--color-primary);
		white-space: nowrap;
	}
	.tag {
		font-size: 0.75em;
		padding: 0 6px;
		border-radius: 999px;
		border: 1px solid currentColor;
	}
</style>
