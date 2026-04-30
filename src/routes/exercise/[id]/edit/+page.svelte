<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { activeUsername } from '$lib/active-username.svelte';

	interface BlankRow {
		position: number;
		correct: string;
		distractor: string;
	}

	interface ExerciseData {
		id: string;
		rule_id: string;
		theme: string;
		grade_level: string;
		num_blanks: number;
		text: string;
		blanks: BlankRow[];
	}

	interface RuleData {
		id: string;
		display_name: string;
		candidates: string[];
	}

	let exerciseId = $derived(page.params.id);

	let exercise = $state<ExerciseData | null>(null);
	let rule = $state<RuleData | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	let editText = $state('');
	let editBlanks = $state<BlankRow[]>([]);
	let saving = $state(false);
	let saveMsg = $state<string | null>(null);
	let saveError = $state<string | null>(null);

	const validation = $derived.by(() => {
		const matches = [...editText.matchAll(/\{\{(\d+)\}\}/g)];
		const markerPositions = new Set(matches.map((m) => Number(m[1])));
		const blankPositions = new Set(editBlanks.map((b) => b.position));
		const markersWithoutBlank = [...markerPositions].filter((p) => !blankPositions.has(p));
		const blanksWithoutMarker = [...blankPositions].filter((p) => !markerPositions.has(p));
		return {
			markerCount: markerPositions.size,
			blankCount: blankPositions.size,
			markersWithoutBlank,
			blanksWithoutMarker,
			ok:
				markersWithoutBlank.length === 0 &&
				blanksWithoutMarker.length === 0 &&
				editBlanks.length > 0
		};
	});

	onMount(async () => {
		const { data: ex, error: exError } = await supabase
			.from('exercises')
			.select('*')
			.eq('id', exerciseId)
			.single();
		if (exError || !ex) {
			loadError = exError?.message ?? 'Exercice introuvable.';
			loading = false;
			return;
		}
		exercise = ex as ExerciseData;
		editText = exercise.text;
		editBlanks = exercise.blanks
			.map((b) => ({ ...b }))
			.sort((a, b) => a.position - b.position);

		const { data: r, error: rError } = await supabase
			.from('rules')
			.select('id, display_name, candidates')
			.eq('id', exercise.rule_id)
			.single();
		if (rError || !r) {
			loadError = rError?.message ?? 'Règle introuvable.';
			loading = false;
			return;
		}
		rule = r as RuleData;
		loading = false;
	});

	function addBlank() {
		const usedPositions = new Set(editBlanks.map((b) => b.position));
		let pos = 1;
		while (usedPositions.has(pos)) pos++;
		const cands = rule?.candidates ?? [];
		editBlanks = [
			...editBlanks,
			{
				position: pos,
				correct: cands[0] ?? '',
				distractor: cands[1] ?? cands[0] ?? ''
			}
		].sort((a, b) => a.position - b.position);
	}

	function removeBlank(position: number) {
		editBlanks = editBlanks.filter((b) => b.position !== position);
	}

	function swapCorrectDistractor(position: number) {
		editBlanks = editBlanks.map((b) =>
			b.position === position ? { ...b, correct: b.distractor, distractor: b.correct } : b
		);
	}

	async function handleSave() {
		if (!exercise) return;
		saving = true;
		saveError = null;
		saveMsg = null;
		const { error } = await supabase
			.from('exercises')
			.update({
				text: editText,
				blanks: editBlanks,
				num_blanks: editBlanks.length
			})
			.eq('id', exercise.id);
		saving = false;
		if (error) {
			saveError = error.message;
			return;
		}
		saveMsg = 'Modifications enregistrées.';
	}
</script>

<section class="container stack">
	{#if loading}
		<p class="muted">Chargement…</p>
	{:else if loadError}
		<div class="card stack">
			<h1>Oups</h1>
			<p class="error">{loadError}</p>
		</div>
	{:else if exercise && rule}
		<header class="stack">
			<a href={`${base}/exercise/${exercise.id}`} class="back">← Retour à l'exercice</a>
			<h1>Édition d'un exercice</h1>
			<p class="muted">
				<strong>{rule.display_name}</strong> · Thème : <em>{exercise.theme}</em> · Niveau :
				{exercise.grade_level}
			</p>
			{#if !activeUsername.canEditExercises}
				<p class="error">Tu n'as pas les droits pour éditer cet exercice.</p>
			{/if}
		</header>

		<div class="editor-grid">
			<div class="card stack editor-pane editor-pane-text">
				<label for="text">
					Texte (les marqueurs <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>, … indiquent les
					trous) :
				</label>
				<textarea id="text" bind:value={editText}></textarea>

				<div class="stats">
					<span
						>Marqueurs détectés dans le texte :
						<strong>{validation.markerCount}</strong></span
					>
					<span>Trous définis : <strong>{validation.blankCount}</strong></span>
				</div>

				{#if validation.markersWithoutBlank.length > 0}
					<p class="warning">
						Marqueurs présents dans le texte sans trou défini :
						{validation.markersWithoutBlank.map((p) => `{{${p}}}`).join(', ')}
					</p>
				{/if}
				{#if validation.blanksWithoutMarker.length > 0}
					<p class="warning">
						Trous définis sans marqueur dans le texte :
						{validation.blanksWithoutMarker.map((p) => `{{${p}}}`).join(', ')}
					</p>
				{/if}
			</div>

			<div class="card stack editor-pane editor-pane-blanks">
				<div class="row-between">
					<h2>Trous</h2>
					<button type="button" class="secondary" onclick={addBlank}>+ Ajouter un trou</button>
				</div>

				<div class="blanks-scroll">
					{#if editBlanks.length === 0}
						<p class="muted">Aucun trou. Ajoute-en avec le bouton ci-dessus.</p>
					{:else}
						<table class="blanks-table">
							<thead>
								<tr>
									<th>Position</th>
									<th>Bonne réponse</th>
									<th>Distracteur</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{#each editBlanks as b (b.position)}
									<tr>
										<td><code>{`{{${b.position}}}`}</code></td>
										<td>
											<select bind:value={b.correct}>
												{#each rule.candidates as c (c)}
													<option value={c}>{c}</option>
												{/each}
											</select>
										</td>
										<td>
											<select bind:value={b.distractor}>
												{#each rule.candidates as c (c)}
													<option value={c}>{c}</option>
												{/each}
											</select>
										</td>
										<td class="actions">
											<button
												type="button"
												class="link"
												title="Inverser bonne réponse / distracteur"
												onclick={() => swapCorrectDistractor(b.position)}
											>
												⇄
											</button>
											<button
												type="button"
												class="link danger"
												title="Supprimer ce trou"
												onclick={() => removeBlank(b.position)}
											>
												✕
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>
		</div>

		<div class="actions">
			<button
				type="button"
				onclick={handleSave}
				disabled={saving || !validation.ok || !activeUsername.canEditExercises}
			>
				{saving ? 'Enregistrement…' : 'Enregistrer'}
			</button>
			{#if !validation.ok}
				<span class="muted">Résous les incohérences ci-dessus avant d'enregistrer.</span>
			{/if}
			{#if saveMsg}
				<span class="ok">{saveMsg}</span>
			{/if}
			{#if saveError}
				<span class="error">{saveError}</span>
			{/if}
		</div>
	{/if}
</section>

<style>
	.back {
		font-size: 0.9em;
	}
	textarea {
		width: 100%;
		min-height: 220px;
		font-family: var(--font-serif);
		font-size: 1rem;
		line-height: 1.6;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		resize: vertical;
	}
	.editor-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-4);
	}
	@media (min-width: 900px) {
		.editor-grid {
			grid-template-columns: 1fr 1fr;
			align-items: stretch;
		}
		.editor-pane {
			height: calc(100vh - 280px);
			min-height: 450px;
			max-height: 800px;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}
		/* Le textarea prend toute la hauteur restante du panneau gauche */
		.editor-pane-text textarea {
			flex: 1;
			min-height: 0;
			resize: none;
		}
		/* La zone scrollable des trous prend toute la hauteur restante du panneau droit */
		.editor-pane-blanks .blanks-scroll {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			margin: 0 calc(-1 * var(--space-6));
			padding: 0 var(--space-6);
		}
	}
	.blanks-scroll {
		/* Sur mobile : pas de hauteur contrainte, scroll naturel de la page */
		overflow-y: auto;
	}
	.stats {
		display: flex;
		gap: var(--space-6);
		font-size: 0.95em;
		color: var(--color-text-muted);
	}
	.warning {
		color: var(--color-warning);
		font-size: 0.95em;
	}
	.row-between {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.row-between h2 {
		margin: 0;
	}
	.blanks-table {
		width: 100%;
		border-collapse: collapse;
	}
	.blanks-table th,
	.blanks-table td {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}
	.blanks-table th {
		font-size: 0.85em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.blanks-table select {
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	button.link {
		background: transparent;
		color: var(--color-primary);
		border: 1px solid transparent;
		padding: 4px 8px;
		font-size: 1.05em;
	}
	button.link:hover {
		background: rgba(47, 93, 177, 0.08);
	}
	button.link.danger {
		color: var(--color-error);
	}
	button.link.danger:hover {
		background: rgba(184, 51, 60, 0.1);
	}
	.ok {
		color: var(--color-success);
	}
	.actions .error {
		color: var(--color-error);
	}
</style>
