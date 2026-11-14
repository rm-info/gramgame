<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { mapExercise, type ExerciseRow } from '$lib/data';
	import { activeUsername } from '$lib/active-username.svelte';
	import ExerciseText from '$lib/components/ExerciseText.svelte';
	import ResultView from '$lib/components/ResultView.svelte';
	import { correctAttempt, type CorrectionResult } from '$lib/api/correct';
	import { truncateExercise } from '$lib/truncate-exercise';
	import { hasSeveralGroups, optionsForBlank, ruleGroups, groupLabel } from '$lib/confusion';

	const HARD_MODE_KEY = 'gramgame.hard_mode';

	interface BlankRow {
		position: number;
		correct: string;
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
		groups: string[][] | null;
	}

	let exercise = $state<ExerciseData | null>(null);
	let rule = $state<RuleData | null>(null);
	let loadError = $state<string | null>(null);
	let loading = $state(true);

	let responses = $state<Record<number, string | null>>({});
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let result = $state<CorrectionResult | null>(null);

	// Mode difficile : chaque trou propose tous les mots de la règle au lieu
	// du seul groupe de confusion concerné. Mémorisé d'un exercice à l'autre.
	let hardMode = $state(readHardMode());
	const severalGroups = $derived(rule ? hasSeveralGroups(rule) : false);
	// Verrouillé dès la première réponse (sinon on pourrait « tricher » en
	// passant en mode normal pour voir le groupe, puis revenir).
	const hardModeLocked = $derived(Object.values(responses).some((v) => v !== null));

	function readHardMode(): boolean {
		try {
			return localStorage.getItem(HARD_MODE_KEY) === '1';
		} catch {
			return false;
		}
	}

	function setHardMode(v: boolean) {
		hardMode = v;
		try {
			localStorage.setItem(HARD_MODE_KEY, v ? '1' : '0');
		} catch {
			// stockage indisponible : réglage limité à cette page
		}
	}

	function optionsFor(position: number): string[] {
		if (!rule || !exercise) return [];
		const blank = exercise.blanks.find((b) => b.position === position);
		return optionsForBlank(rule, blank?.correct ?? '', hardMode && severalGroups);
	}

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
		let ex: ExerciseRow;
		try {
			ex = mapExercise(
				await pb.collection('exercises').getOne(exerciseId ?? '', { expand: 'rule' })
			);
		} catch (e) {
			loadError =
				(e as { status?: number })?.status === 404 ? 'Exercice introuvable.' : errorMessage(e);
			loading = false;
			return;
		}
		exercise = ex as ExerciseData;
		for (const b of exercise.blanks) {
			responses[b.position] = null;
		}

		if (!ex.rule) {
			loadError = 'Règle introuvable.';
			loading = false;
			return;
		}
		rule = ex.rule;
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

		try {
			result = await correctAttempt({
				exercise_id: exercise.id,
				responses: payload,
				hard_mode: hardMode && severalGroups
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
				ruleName={rule.display_name}
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
						{optionsFor}
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

			{#if severalGroups}
				<div class="mode-row">
					<label class="mode-toggle" class:locked={hardModeLocked}>
						<input
							type="checkbox"
							checked={hardMode}
							disabled={hardModeLocked}
							onchange={(e) => setHardMode((e.currentTarget as HTMLInputElement).checked)}
						/>
						<span>
							<strong>Mode difficile</strong> : chaque trou propose tous les mots
							({rule.candidates.join(', ')}).
						</span>
					</label>
					<p class="muted small">
						{#if hardMode}
							Comme dans une dictée : à toi de trouver de quelle confusion il s'agit.
						{:else}
							Chaque trou ne propose que les mots qui se confondent :
							{ruleGroups(rule).map(groupLabel).join(' · ')}.
						{/if}
						{#if hardModeLocked}
							(Choix verrouillé une fois l'exercice commencé.)
						{/if}
					</p>
				</div>
			{/if}

			<div class="card">
				<ExerciseText
					text={view.text}
					{blankPositions}
					{optionsFor}
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
	.mode-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 4px);
	}
	.mode-toggle {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2, 8px);
		cursor: pointer;
	}
	.mode-toggle input {
		width: auto;
		margin-top: 3px;
	}
	.mode-row p {
		margin: 0 0 0 calc(13px + var(--space-2, 8px));
	}
	.mode-toggle.locked {
		cursor: default;
		opacity: 0.8;
	}
	.small {
		font-size: 0.9em;
	}
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
