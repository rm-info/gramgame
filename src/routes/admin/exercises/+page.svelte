<script lang="ts">
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { activeUsername } from '$lib/active-username.svelte';

	interface ExerciseRow {
		id: string;
		rule_id: string;
		theme: string;
		grade_level: string;
		num_blanks: number;
		created_at: string;
		created_by_username: string;
		llm_model: string;
		rule: { display_name: string } | null;
	}

	let exercises = $state<ExerciseRow[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let filterRule = $state('');
	let filterTheme = $state('');

	$effect(() => {
		if (!activeUsername.canEditExercises) return;
		loading = true;
		loadError = null;
		supabase
			.from('exercises')
			.select(
				'id, rule_id, theme, grade_level, num_blanks, created_at, created_by_username, llm_model, rule:rules ( display_name )'
			)
			.order('created_at', { ascending: false })
			.limit(200)
			.then(({ data, error }) => {
				loading = false;
				if (error) {
					loadError = error.message;
					return;
				}
				exercises = (data ?? []) as unknown as ExerciseRow[];
			});
	});

	const filtered = $derived(
		exercises.filter((ex) => {
			const ruleOk =
				!filterRule ||
				ex.rule_id.toLowerCase().includes(filterRule.toLowerCase()) ||
				(ex.rule?.display_name ?? '').toLowerCase().includes(filterRule.toLowerCase());
			const themeOk = !filterTheme || ex.theme.toLowerCase().includes(filterTheme.toLowerCase());
			return ruleOk && themeOk;
		})
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<section class="container stack">
	<header class="stack">
		<a href={`${base}/admin`} class="back">← Retour à la gestion</a>
		<h1>Exercices</h1>
		<p class="muted">
			Tous les exercices générés. Tu peux les éditer pour corriger un texte, ajuster les bonnes
			réponses, ou supprimer un trou mal placé.
		</p>
	</header>

	<div class="card stack">
		<div class="filters">
			<label>
				<span class="muted">Filtrer par règle</span>
				<input type="text" bind:value={filterRule} placeholder="ou/où, a/à…" />
			</label>
			<label>
				<span class="muted">Filtrer par thème</span>
				<input type="text" bind:value={filterTheme} placeholder="Astérix, ferme, vacances…" />
			</label>
		</div>

		{#if loading}
			<p class="muted">Chargement…</p>
		{:else if loadError}
			<p class="error">Échec : {loadError}</p>
		{:else if filtered.length === 0}
			<p class="muted">
				{exercises.length === 0
					? 'Aucun exercice généré pour l\'instant.'
					: 'Aucun exercice ne correspond aux filtres.'}
			</p>
		{:else}
			<table class="ex-table">
				<thead>
					<tr>
						<th>Règle</th>
						<th>Thème</th>
						<th>Niveau</th>
						<th>Trous</th>
						<th>Auteur</th>
						<th>Modèle LLM</th>
						<th>Date</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as ex (ex.id)}
						<tr>
							<td><strong>{ex.rule?.display_name ?? ex.rule_id}</strong></td>
							<td>{ex.theme}</td>
							<td class="muted">{ex.grade_level}</td>
							<td class="muted">{ex.num_blanks}</td>
							<td class="muted">{ex.created_by_username}</td>
							<td class="muted small">{ex.llm_model}</td>
							<td class="muted small">{formatDate(ex.created_at)}</td>
							<td>
								<a href={`${base}/exercise/${ex.id}/edit`} class="edit-btn">Éditer</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="muted small">
				{filtered.length} exercice{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1
					? 's'
					: ''}
				{#if filtered.length !== exercises.length}
					(sur {exercises.length} au total)
				{/if}
			</p>
		{/if}
	</div>
</section>

<style>
	.back {
		font-size: 0.9em;
	}
	.filters {
		display: flex;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.filters label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 200px;
	}
	.ex-table {
		width: 100%;
		border-collapse: collapse;
	}
	.ex-table th,
	.ex-table td {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}
	.ex-table th {
		font-size: 0.85em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.ex-table tbody tr:last-child td {
		border-bottom: none;
	}
	.ex-table tbody tr:hover {
		background: rgba(47, 93, 177, 0.03);
	}
	.small {
		font-size: 0.85em;
	}
	.edit-btn {
		display: inline-block;
		padding: 4px 10px;
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		color: var(--color-primary);
		font-size: 0.9em;
	}
	.edit-btn:hover {
		background: var(--color-primary);
		color: white;
		text-decoration: none;
	}
</style>
