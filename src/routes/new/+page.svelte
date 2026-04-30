<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { activeUsername } from '$lib/active-username.svelte';
	import { profileState, GRADE_LEVELS } from '$lib/profile.svelte';
	import { generateExercise } from '$lib/api/generate';

	interface RuleOption {
		id: string;
		display_name: string;
		short_description: string;
		candidates: string[];
	}

	interface PastExercise {
		id: string;
		rule_id: string;
		theme: string;
		grade_level: string;
		num_blanks: number;
		created_at: string;
		rule: { display_name: string } | null;
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

	let pastExercises = $state<PastExercise[]>([]);
	let pastLoading = $state(true);
	let pastSelectedBlanks = $state<Record<string, number>>({});

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
		} else {
			rules = (data ?? []) as RuleOption[];
		}

		// Pré-remplissage depuis query params (cas "exercice ciblé").
		// Doit se faire après le chargement des règles pour valider rule_id.
		const params = page.url.searchParams;
		const queryRuleId = params.get('rule_id');
		const queryTheme = params.get('theme');
		const queryGrade = params.get('grade_level');
		const queryNum = params.get('num_blanks');

		ruleId =
			queryRuleId && rules.some((r) => r.id === queryRuleId)
				? queryRuleId
				: rules[0]?.id ?? '';
		theme = queryTheme ?? '';
		gradeLevel = queryGrade ?? profileState.gradeLevel ?? 'CE2';
		numBlanks = queryNum ? Math.min(30, Math.max(3, Number(queryNum))) : 20;
	});

	// Fetch des exercices passés en réaction au username actif (qui peut arriver
	// après le mount du composant si le layout charge encore l'auth).
	let lastFetchedFor: string | null = null;
	$effect(() => {
		const username = activeUsername.username;
		if (!username) {
			pastExercises = [];
			pastLoading = !activeUsername.loaded;
			return;
		}
		if (lastFetchedFor === username) return;
		lastFetchedFor = username;
		pastLoading = true;
		supabase
			.from('exercises')
			.select(
				'id, rule_id, theme, grade_level, num_blanks, created_at, rule:rules ( display_name )'
			)
			.eq('created_by_username', username)
			.order('created_at', { ascending: false })
			.limit(20)
			.then(({ data, error }) => {
				pastLoading = false;
				if (error) {
					console.error('Failed to load past exercises', error);
					return;
				}
				pastExercises = (data ?? []) as unknown as PastExercise[];
				for (const ex of pastExercises) {
					pastSelectedBlanks[ex.id] = ex.num_blanks;
				}
			});
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!ruleId || !theme.trim() || !gradeLevel || !numBlanks) return;
		submitting = true;
		errorMsg = null;

		const username = activeUsername.username;
		if (!username) {
			errorMsg = 'Aucun compte actif. Reconnecte-toi.';
			submitting = false;
			return;
		}
		try {
			const ex = await generateExercise({
				username,
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

	function launchExisting(ex: PastExercise) {
		const max = pastSelectedBlanks[ex.id] ?? ex.num_blanks;
		const params = new URLSearchParams();
		if (max < ex.num_blanks) params.set('max', String(max));
		const qs = params.toString();
		goto(`${base}/exercise/${ex.id}${qs ? `?${qs}` : ''}`);
	}

	function formatDate(iso: string) {
		const d = new Date(iso);
		return d.toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
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

	<div class="card stack">
		<h2>Refaire un exercice existant</h2>
		<p class="muted">
			Tes textes générés précédemment sont gardés en mémoire. Tu peux les rejouer (le score d'une
			nouvelle tentative est enregistré séparément) et choisir d'en faire moins de trous que
			l'original.
		</p>

		{#if pastLoading}
			<p class="muted">Chargement…</p>
		{:else if pastExercises.length === 0}
			<p class="muted">Aucun exercice généré pour l'instant.</p>
		{:else}
			<ul class="past-list">
				{#each pastExercises as ex (ex.id)}
					{@const selected = pastSelectedBlanks[ex.id] ?? ex.num_blanks}
					{@const minBlanks = Math.min(3, ex.num_blanks)}
					<li class="past-item">
						<div class="past-meta">
							<div class="past-title">
								<strong>{ex.rule?.display_name ?? ex.rule_id}</strong>
								<span class="muted">· {ex.theme}</span>
							</div>
							<div class="muted past-sub">
								{ex.num_blanks} trous · {ex.grade_level} · {formatDate(ex.created_at)}
							</div>
						</div>
						<div class="past-controls">
							{#if ex.num_blanks > minBlanks}
								<label class="trous-picker">
									<span>Faire <strong>{selected}</strong>/{ex.num_blanks} trous</span>
									<input
										type="range"
										min={minBlanks}
										max={ex.num_blanks}
										bind:value={pastSelectedBlanks[ex.id]}
									/>
								</label>
							{/if}
							<button type="button" onclick={() => launchExisting(ex)}>Lancer</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<style>
	.past-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.past-item {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}
	.past-item:last-child {
		border-bottom: none;
	}
	.past-title strong {
		font-weight: 600;
	}
	.past-sub {
		font-size: 0.9em;
	}
	.past-controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.trous-picker {
		display: flex;
		flex-direction: column;
		font-size: 0.85em;
		min-width: 180px;
	}
	.trous-picker input[type='range'] {
		margin-top: 2px;
	}
	@media (max-width: 600px) {
		.past-item {
			grid-template-columns: 1fr;
		}
		.past-controls {
			justify-content: flex-start;
		}
	}
</style>
