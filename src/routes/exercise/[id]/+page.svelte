<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '$lib/supabase';
	import { activeUsername } from '$lib/active-username.svelte';
	import ExerciseText from '$lib/components/ExerciseText.svelte';
	import ResultView from '$lib/components/ResultView.svelte';
	import { correctAttempt, type CorrectionResult } from '$lib/api/correct';

	interface ExerciseData {
		id: string;
		rule_id: string;
		theme: string;
		grade_level: string;
		num_blanks: number;
		text: string;
		blanks: { position: number; correct: string; distractor: string }[];
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

	const blankPositions = $derived(exercise?.blanks.map((b) => b.position) ?? []);
	const allFilled = $derived(
		exercise && blankPositions.every((p) => responses[p] !== null && responses[p] !== undefined)
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
		// Initialise responses
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
		if (!exercise || !allFilled) return;
		submitting = true;
		submitError = null;

		const payload: Record<string, string> = {};
		for (const [pos, val] of Object.entries(responses)) {
			if (val !== null) payload[pos] = val;
		}

		const username = activeUsername.username;
		if (!username) {
			submitError = "Aucun compte actif. Reconnecte-toi.";
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
	{:else if exercise && rule}
		{#if result}
			<ResultView
				{result}
				ruleId={exercise.rule_id}
				theme={exercise.theme}
				gradeLevel={exercise.grade_level}
				numBlanks={exercise.num_blanks}
			/>

			<details class="card">
				<summary>Voir le texte avec les corrections</summary>
				<div style="margin-top: var(--space-4);">
					<ExerciseText
						text={exercise.text}
						blankPositions={exercise.blanks.map((b) => b.position)}
						options={rule.candidates}
						bind:responses
						readonly
						results={result.per_blank}
					/>
				</div>
			</details>
		{:else}
			<header class="stack">
				<h1>{rule.display_name}</h1>
				<p class="muted">
					Thème : <em>{exercise.theme}</em> · Niveau : {exercise.grade_level} · {exercise.num_blanks}
					trous
				</p>
			</header>

			<div class="card">
				<ExerciseText
					text={exercise.text}
					{blankPositions}
					options={rule.candidates}
					bind:responses
				/>
			</div>

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
</style>
