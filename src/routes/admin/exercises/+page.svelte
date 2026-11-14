<script lang="ts">
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { mapExercise } from '$lib/data';
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
		verified: boolean;
		verified_at: string | null;
		verified_by_username: string | null;
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
		pb.collection('exercises')
			.getList(1, 200, {
				sort: '-created',
				expand: 'rule',
				fields:
					'id,rule,theme,grade_level,num_blanks,created,owner_username,llm_model,verified,verified_at,verified_by_username,expand.rule.id,expand.rule.display_name'
			})
			.then((res) => {
				exercises = res.items.map(mapExercise) as unknown as ExerciseRow[];
			})
			.catch((e) => {
				loadError = errorMessage(e);
			})
			.finally(() => {
				loading = false;
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

	let deletingId = $state<string | null>(null);
	let deleteError = $state<string | null>(null);

	async function deleteExercise(ex: ExerciseRow) {
		const label = `${ex.rule?.display_name ?? ex.rule_id} — ${ex.theme}`;
		if (
			!confirm(
				`Supprimer définitivement « ${label} » ?\n\nLes résultats des élèves qui l'ont déjà fait seront supprimés aussi.`
			)
		)
			return;
		deletingId = ex.id;
		deleteError = null;
		try {
			await pb.collection('exercises').delete(ex.id);
			exercises = exercises.filter((x) => x.id !== ex.id);
		} catch (e) {
			deleteError = errorMessage(e);
		} finally {
			deletingId = null;
		}
	}

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
			réponses, supprimer un trou mal placé, ou supprimer un exercice raté.
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

		{#if deleteError}
			<p class="error">Suppression impossible : {deleteError}</p>
		{/if}
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
			<table class="ex-table stack-table">
				<thead>
					<tr>
						<th>Vérifié</th>
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
							<td data-label="Vérifié">
								{#if ex.verified}
									<span
										class="verified-pill"
										title={ex.verified_at
											? `Vérifié${ex.verified_by_username ? ` par ${ex.verified_by_username}` : ''} le ${new Date(ex.verified_at).toLocaleDateString('fr-FR')}`
											: 'Vérifié'}
									>
										✓
									</span>
								{:else}
									<span class="muted small">—</span>
								{/if}
							</td>
							<td data-label="Règle"><strong>{ex.rule?.display_name ?? ex.rule_id}</strong></td>
							<td data-label="Thème">{ex.theme}</td>
							<td data-label="Niveau" class="muted">{ex.grade_level}</td>
							<td data-label="Trous" class="muted">{ex.num_blanks}</td>
							<td data-label="Auteur" class="muted">{ex.created_by_username}</td>
							<td data-label="Modèle" class="muted small">{ex.llm_model}</td>
							<td data-label="Date" class="muted small">{formatDate(ex.created_at)}</td>
							<td data-label="" class="actions">
								<a href={`${base}/exercise/${ex.id}/edit`} class="edit-btn">Éditer</a>
								<button
									type="button"
									class="delete-btn"
									onclick={() => deleteExercise(ex)}
									disabled={deletingId === ex.id}
								>
									{deletingId === ex.id ? '…' : 'Supprimer'}
								</button>
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
	.actions {
		white-space: nowrap;
	}
	.delete-btn {
		margin-left: var(--space-2);
		padding: 4px 10px;
		border: 1px solid var(--color-error, #b3261e);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-error, #b3261e);
		font-size: 0.9em;
		cursor: pointer;
	}
	.delete-btn:hover:not(:disabled) {
		background: var(--color-error, #b3261e);
		color: white;
	}
	.verified-pill {
		display: inline-block;
		padding: 2px 8px;
		background: rgba(46, 139, 87, 0.18);
		color: var(--color-success);
		border-radius: 999px;
		font-weight: 600;
	}
</style>
