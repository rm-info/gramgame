<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { profileState } from '$lib/profile.svelte';

	interface AttemptRow {
		id: string;
		score: number;
		score_total: number;
		completed_at: string;
		exercise: {
			id: string;
			theme: string;
			rule_id: string;
			rule: { display_name: string } | null;
		} | null;
	}

	let attempts = $state<AttemptRow[]>([]);
	let loadingAttempts = $state(true);

	onMount(async () => {
		const { data, error } = await supabase
			.from('attempts')
			.select(
				`id, score, score_total, completed_at,
				 exercise:exercises (
					id, theme, rule_id,
					rule:rules ( display_name )
				 )`
			)
			.order('completed_at', { ascending: false })
			.limit(10);
		loadingAttempts = false;
		if (error) {
			console.error('Failed to load attempts', error);
			return;
		}
		attempts = (data ?? []) as unknown as AttemptRow[];
	});

	function formatDate(iso: string) {
		const d = new Date(iso);
		return d.toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function noteFromScore(score: number, total: number) {
		return ((score / total) * 20).toFixed(1);
	}
</script>

<section class="container stack">
	<h1>
		{#if profileState.profile}
			Salut {profileState.profile.display_name} !
		{:else}
			Bienvenue
		{/if}
	</h1>
	<p class="muted">
		Gramgame génère pour toi des textes à trous sur la grammaire française. Choisis une règle, un
		thème, et l'IA te concocte un exercice sur mesure.
	</p>

	<div class="card stack">
		<h2>Prêt à pratiquer ?</h2>
		<p class="muted">
			Lance un exercice sur l'une des règles disponibles. Tu choisis le thème, le niveau et la
			longueur.
		</p>
		<a href={`${base}/new`}>
			<button type="button">Nouvel exercice</button>
		</a>
	</div>

	<div class="card stack">
		<h2>Tes dernières tentatives</h2>
		{#if loadingAttempts}
			<p class="muted">Chargement…</p>
		{:else if attempts.length === 0}
			<p class="muted">
				Aucun exercice fait pour l'instant. Clique sur « Nouvel exercice » pour commencer.
			</p>
		{:else}
			<ul class="attempts">
				{#each attempts as a (a.id)}
					<li>
						<div class="attempt-main">
							<span class="rule">
								{a.exercise?.rule?.display_name ?? a.exercise?.rule_id ?? '—'}
							</span>
							<span class="theme muted">· {a.exercise?.theme ?? '—'}</span>
						</div>
						<div class="attempt-meta">
							<span class="note">{noteFromScore(a.score, a.score_total)}/20</span>
							<span class="muted">{formatDate(a.completed_at)}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<style>
	.attempts {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.attempts li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}
	.attempts li:last-child {
		border-bottom: none;
	}
	.attempt-main {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}
	.rule {
		font-weight: 500;
	}
	.theme {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attempt-meta {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}
	.note {
		font-family: var(--font-serif);
		font-weight: 700;
		color: var(--color-primary);
	}
</style>
