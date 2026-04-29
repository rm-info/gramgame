<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { profileState, GRADE_LEVELS } from '$lib/profile.svelte';
	import { generateExercise } from '$lib/api/generate';

	interface RuleOption {
		id: string;
		display_name: string;
		short_description: string;
		candidates: string[];
	}

	let rules = $state<RuleOption[]>([]);
	let rulesLoading = $state(true);
	let rulesError = $state<string | null>(null);

	let ruleId = $state('');
	let theme = $state('');
	let gradeLevel = $state<string>('');
	let numBlanks = $state(20);

	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	const SUGGESTED_THEMES = [
		'Harry Potter à la mer',
		'Une journée à la ferme',
		'Une mission spatiale',
		'Un match de foot épique',
		"Une enquête au musée",
		"Une aventure en forêt"
	];

	onMount(async () => {
		const { data, error } = await supabase
			.from('rules')
			.select('id, display_name, short_description, candidates')
			.eq('rule_type', 'multiple_choice')
			.order('id');
		rulesLoading = false;
		if (error) {
			rulesError = error.message;
			return;
		}
		rules = (data ?? []) as RuleOption[];

		// Pré-remplissage depuis query params (cas "exercice ciblé")
		const params = page.url.searchParams;
		const queryRuleId = params.get('rule_id');
		const queryTheme = params.get('theme');
		const queryGrade = params.get('grade_level');
		const queryNum = params.get('num_blanks');

		ruleId = queryRuleId && rules.some((r) => r.id === queryRuleId) ? queryRuleId : rules[0]?.id ?? '';
		theme = queryTheme ?? '';
		gradeLevel = queryGrade ?? profileState.profile?.grade_level ?? 'CE2';
		numBlanks = queryNum ? Math.min(30, Math.max(3, Number(queryNum))) : 20;
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!ruleId || !theme.trim() || !gradeLevel || !numBlanks) return;
		submitting = true;
		errorMsg = null;

		try {
			const ex = await generateExercise({
				rule_id: ruleId,
				theme: theme.trim(),
				grade_level: gradeLevel,
				num_blanks: numBlanks
			});
			goto(`${base}/exercise/${ex.id}`);
		} catch (e) {
			errorMsg = (e as Error).message;
			submitting = false;
		}
	}
</script>

<section class="container stack">
	<h1>Nouvel exercice</h1>
	<p class="muted">Choisis une règle, un thème, ton niveau et le nombre de trous.</p>

	{#if rulesLoading}
		<p class="muted">Chargement des règles…</p>
	{:else if rulesError}
		<p class="error">Impossible de charger les règles : {rulesError}</p>
	{:else}
		<form onsubmit={handleSubmit} class="card stack">
			<div>
				<label for="rule">Règle à pratiquer</label>
				<select id="rule" bind:value={ruleId} required>
					{#each rules as r (r.id)}
						<option value={r.id}>{r.display_name} — {r.short_description}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="theme">Thème de l'histoire</label>
				<input
					id="theme"
					type="text"
					bind:value={theme}
					placeholder="Ex : Harry Potter à la mer"
					list="theme-suggestions"
					maxlength="120"
					required
				/>
				<datalist id="theme-suggestions">
					{#each SUGGESTED_THEMES as t (t)}
						<option value={t}></option>
					{/each}
				</datalist>
			</div>

			<div>
				<label for="grade">Niveau</label>
				<select id="grade" bind:value={gradeLevel} required>
					{#each GRADE_LEVELS as level (level)}
						<option value={level}>{level}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="num">
					Nombre de trous : <strong>{numBlanks}</strong>
				</label>
				<input id="num" type="range" min="3" max="30" bind:value={numBlanks} />
			</div>

			<button type="submit" disabled={submitting || !theme.trim()}>
				{submitting ? 'Le prof prépare ton texte…' : 'Générer'}
			</button>

			{#if submitting}
				<p class="muted">
					Cela peut prendre 5 à 15 secondes — l'IA écrit ton texte sur mesure et le vérifie.
				</p>
			{/if}

			{#if errorMsg}
				<p class="error">{errorMsg}</p>
			{/if}
		</form>
	{/if}
</section>
