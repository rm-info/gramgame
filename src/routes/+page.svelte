<script lang="ts">
	import { base } from '$app/paths';
	import { pb } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { activeUsername } from '$lib/active-username.svelte';
	import { mapAttempt, type AttemptRow } from '$lib/data';

	let attempts = $state<AttemptRow[]>([]);
	let loadingAttempts = $state(true);

	$effect(() => {
		const userId = auth.user?.id;
		if (!userId) {
			attempts = [];
			loadingAttempts = false;
			return;
		}
		loadingAttempts = true;
		pb.collection('attempts')
			.getList(1, 10, {
				filter: pb.filter('user = {:id}', { id: userId }),
				sort: '-created',
				expand: 'exercise.rule'
			})
			.then((res) => {
				attempts = res.items.map(mapAttempt);
			})
			.catch((e) => console.error('Failed to load attempts', e))
			.finally(() => {
				loadingAttempts = false;
			});
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
		{#if activeUsername.username}
			Salut {activeUsername.username} !
		{:else}
			Bienvenue
		{/if}
	</h1>
	<p class="muted">
		GramGame génère pour toi des textes à trous sur la grammaire française. Choisis une règle, un
		thème, et l'IA te concocte un exercice sur mesure.
	</p>

	{#if activeUsername.isSupervisor}
		<div class="card stack suivi-card">
			<h2>{activeUsername.role === 'parent' ? 'Le suivi de tes enfants' : 'Le suivi de tes élèves'}</h2>
			<p class="muted">
				Leurs exercices, leurs moyennes, les notions acquises et celles à retravailler.
			</p>
			<a href={`${base}/suivi`}><button type="button">Ouvrir le tableau de suivi</button></a>
		</div>
	{/if}

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
	.suivi-card {
		border-left: 4px solid var(--color-primary);
	}
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
