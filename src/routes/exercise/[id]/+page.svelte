<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { activeUsername } from '$lib/active-username.svelte';
	import ExerciseText from '$lib/components/ExerciseText.svelte';
	import ResultView from '$lib/components/ResultView.svelte';
	import { correctAttempt, type CorrectionResult } from '$lib/api/correct';
	import { truncateExercise } from '$lib/truncate-exercise';

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
		verified: boolean;
		verified_at: string | null;
		verified_by_username: string | null;
	}

	interface RuleData {
		id: string;
		display_name: string;
		candidates: string[];
	}

	let exercise = $state<ExerciseData | null>(null);
	let rule = $state<RuleData | null>(null);
	let loadError = $state<string | null>(null);
	let loading = $state(true);

	let responses = $state<Record<number, string | null>>({});
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let result = $state<CorrectionResult | null>(null);

	const exerciseId = $derived(page.params.id);
	const maxParam = $derived(Number(page.url.searchParams.get('max')) || 0);

	// Vue tronquée si ?max=N est présent et < num_blanks (sinon vue complète)
	const view = $derived.by(() => {
		if (!exercise) return null;
		const requested = maxParam > 0 ? maxParam : exercise.num_blanks;
		const effective = Math.max(1, Math.min(requested, exercise.num_blanks));
		return truncateExercise(exercise.text, exercise.blanks, effective);
	});

	const blankPositions = $derived(view?.blanks.map((b) => b.position) ?? []);
	const allFilled = $derived(
		view && blankPositions.every((p) => responses[p] !== null && responses[p] !== undefined)
	);

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
		for (const b of exercise.blanks) {
			responses[b.position] = null;
		}

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

	async function handleSubmit() {
		if (!exercise || !view || !allFilled) return;
		submitting = true;
		submitError = null;

		// On n'envoie que les réponses des trous présents dans la vue tronquée.
		const keptPositions = new Set(view.blanks.map((b) => b.position));
		const payload: Record<string, string> = {};
		for (const [pos, val] of Object.entries(responses)) {
			if (val !== null && keptPositions.has(Number(pos))) {
				payload[pos] = val;
			}
		}

		const username = activeUsername.username;
		if (!username) {
			submitError = 'Aucun compte actif. Reconnecte-toi.';
			submitting = false;
			return;
		}
		try {
			result = await correctAttempt({
				username,
				exercise_id: exercise.id,
				responses: payload
			});
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (e) {
			submitError = (e as Error).message;
		} finally {
			submitting = false;
		}
	}
</script>

<section class="container stack">
	{#if loading}
		<p class="muted">Chargement de l'exercice…</p>
	{:else if loadError}
		<div class="card stack">
			<h1>Oups</h1>
			<p class="error">{loadError}</p>
		</div>
	{:else if exercise && rule && view}
		{#if result}
			<ResultView
				{result}
				ruleId={exercise.rule_id}
				theme={exercise.theme}
				gradeLevel={exercise.grade_level}
				numBlanks={view.blanks.length}
			/>

			<details class="card">
				<summary>Voir le texte avec les corrections</summary>
				<div style="margin-top: var(--space-4);">
					<ExerciseText
						text={view.text}
						blankPositions={view.blanks.map((b) => b.position)}
						options={rule.candidates}
						bind:responses
						readonly
						results={result.per_blank}
					/>
				</div>
			</details>
		{:else}
			<header class="stack">
				<div class="header-row">
					<div class="title-block">
						<h1>{rule.display_name}</h1>
						{#if exercise.verified}
							<span
								class="verified-badge"
								title={exercise.verified_at
									? `Vérifié${exercise.verified_by_username ? ` par ${exercise.verified_by_username}` : ''} le ${new Date(exercise.verified_at).toLocaleDateString('fr-FR')}`
									: 'Vérifié'}
							>
								✓ Vérifié
							</span>
						{/if}
					</div>
					{#if activeUsername.canEditExercises}
						<a href={`${base}/exercise/${exercise.id}/edit`} class="edit-link">Modifier</a>
					{/if}
				</div>
				<p class="muted">
					Thème : <em>{exercise.theme}</em> · Niveau : {exercise.grade_level} ·
					{view.blanks.length} trous
					{#if view.blanks.length < exercise.num_blanks}
						<span class="muted">(version courte sur {exercise.num_blanks} possibles)</span>
					{/if}
				</p>
			</header>

			<div class="card">
				<ExerciseText
					text={view.text}
					{blankPositions}
					options={rule.candidates}
					bind:responses
				/>
			</div>

			{#if view.blanks.length < exercise.num_blanks}
				<aside class="truncation-note">
					💡 Tu fais une version courte de cet exercice. Pour lire l'histoire en entier, lance-le
					avec ses <strong>{exercise.num_blanks} trous</strong> complets depuis la page « Nouvel
					exercice ».
				</aside>
			{/if}

			<div class="actions">
				<button type="button" onclick={handleSubmit} disabled={!allFilled || submitting}>
					{submitting ? 'Correction en cours…' : "J'ai terminé"}
				</button>
				{#if !allFilled}
					<span class="muted">Remplis tous les trous pour valider.</span>
				{/if}
				{#if submitError}
					<p class="error">{submitError}</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.title-block {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.title-block h1 {
		margin: 0;
	}
	.verified-badge {
		display: inline-block;
		padding: 4px 10px;
		background: rgba(46, 139, 87, 0.15);
		color: var(--color-success);
		border-radius: 999px;
		font-size: 0.85em;
		font-weight: 600;
	}
	.edit-link {
		font-size: 0.9em;
		padding: 4px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-primary);
	}
	.edit-link:hover {
		background: var(--color-primary);
		color: white;
		text-decoration: none;
	}
	.truncation-note {
		background: rgba(47, 93, 177, 0.06);
		border-left: 3px solid var(--color-primary);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		font-size: 0.95em;
		line-height: 1.5;
	}
</style>
