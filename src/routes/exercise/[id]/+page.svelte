<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { pb, errorMessage } from '$lib/pb';
	import { mapExercise, type ExerciseRow, type BlankRow, type RuleInfo } from '$lib/data';
	import { activeUsername } from '$lib/active-username.svelte';
	import ExerciseText from '$lib/components/ExerciseText.svelte';
	import QcmList from '$lib/components/QcmList.svelte';
	import SpanSelectList from '$lib/components/SpanSelectList.svelte';
	import PunctuationText from '$lib/components/PunctuationText.svelte';
	import TransformList from '$lib/components/TransformList.svelte';
	import ResultView from '$lib/components/ResultView.svelte';
	import { correctAttempt, type CorrectionResult } from '$lib/api/correct';
	import { truncateExercise } from '$lib/truncate-exercise';
	import { hasSeveralGroups, optionsForBlank, ruleGroups, groupLabel } from '$lib/confusion';

	const HARD_MODE_KEY = 'gramgame.hard_mode';
	// Réponses en cours, par compte et par exercice : un rechargement (ou un
	// onglet fermé par le système) ne fait plus perdre ce qui a été tapé.
	const draftKey = (id: string) => `gramgame.draft.${pb.authStore.record?.id ?? 'anon'}.${id}`;

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
		extra: ExerciseRow['extra'];
	}

	let exercise = $state<ExerciseData | null>(null);
	let rule = $state<RuleInfo | null>(null);
	const ruleType = $derived(rule?.rule_type ?? 'multiple_choice');
	let loadError = $state<string | null>(null);
	let loading = $state(true);

	let responses = $state<Record<number, string | null>>({});
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let result = $state<CorrectionResult | null>(null);

	// Mode difficile : chaque trou propose tous les mots de la règle au lieu
	// du seul groupe de confusion concerné. Mémorisé d'un exercice à l'autre.
	let hardMode = $state(readHardMode());
	const severalGroups = $derived(
		rule && rule.rule_type === 'multiple_choice' ? hasSeveralGroups(rule) : false
	);
	// QCM dont le mode difficile masque le passage surligné (ex. le GNS).
	const hideHighlightMode = $derived(
		rule?.rule_type === 'qcm' && rule.config?.hard_mode === 'hide_highlight'
	);
	// Transformations : mode difficile = écrire soi-même la phrase transformée.
	const writingMode = $derived(rule?.rule_type === 'transform');
	const hardAvailable = $derived(severalGroups || hideHighlightMode || writingMode);
	const hardActive = $derived(hardMode && hardAvailable);
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

	// Saisie au clavier : l'infinitif du verbe (et la personne si le sujet est
	// un groupe nominal, pour l'accord) est affiché à côté du champ.
	function hintFor(position: number): string {
		const blank = exercise?.blanks.find((b) => b.position === position);
		return blank?.verb ?? '';
	}

	const unit = $derived(
		ruleType === 'qcm'
			? 'questions'
			: ruleType === 'span' || ruleType === 'punctuation' || ruleType === 'transform'
				? 'phrases'
				: 'trous'
	);
	// Ponctuation : réponses indexées par mot (pas par trou) ; on compte les phrases.
	const isPunct = $derived(ruleType === 'punctuation');
	const words = $derived(exercise?.extra?.words ?? []);
	const sentenceCount = $derived(
		exercise ? exercise.blanks.filter((b) => ['.', '?', '!'].includes(b.correct)).length : 0
	);

	function filled(v: string | null | undefined) {
		return v !== null && v !== undefined && v.trim() !== '';
	}

	const exerciseId = $derived(page.params.id);
	const maxParam = $derived(Number(page.url.searchParams.get('max')) || 0);

	// Vue tronquée si ?max=N est présent et < num_blanks (sinon vue complète)
	const view = $derived.by(() => {
		if (!exercise) return null;
		const requested = maxParam > 0 ? maxParam : exercise.num_blanks;
		const effective = Math.max(1, Math.min(requested, exercise.num_blanks));
		// Ponctuation : le texte entier, pas de version courte.
		if (ruleType === 'punctuation') return { text: exercise.text, blanks: exercise.blanks };
		// QCM, GNS : on garde simplement les N premières questions.
		if (ruleType === 'qcm' || ruleType === 'span' || ruleType === 'transform') {
			const sorted = [...exercise.blanks].sort((a, b) => a.position - b.position);
			return { text: exercise.text, blanks: sorted.slice(0, effective) };
		}
		return truncateExercise(exercise.text, exercise.blanks, effective);
	});

	const blankPositions = $derived(view?.blanks.map((b) => b.position) ?? []);
	const allFilled = $derived(
		view &&
			(isPunct
				? Object.values(responses).some((v) => filled(v))
				: blankPositions.every((p) => filled(responses[p])))
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
		// Ponctuation : une réponse par mot, aucune au départ.
		const punctuation = ex.rule?.rule_type === 'punctuation';
		if (!punctuation) {
			for (const b of exercise.blanks) {
				responses[b.position] = null;
			}
		}
		restoreDraft(exercise.id, exercise.blanks, punctuation);

		if (!ex.rule) {
			loadError = 'Règle introuvable.';
			loading = false;
			return;
		}
		rule = ex.rule;
		loading = false;
	});

	function restoreDraft(id: string, blanks: BlankRow[], punctuation = false) {
		try {
			const saved = JSON.parse(localStorage.getItem(draftKey(id)) ?? 'null');
			if (!saved || typeof saved !== 'object') return;
			if (punctuation) {
				for (const [k, v] of Object.entries(saved)) {
					if (/^\d+$/.test(k) && typeof v === 'string') responses[Number(k)] = v;
				}
				return;
			}
			for (const b of blanks) {
				const v = saved[b.position];
				if (typeof v === 'string') responses[b.position] = v;
			}
		} catch {
			// brouillon illisible ou stockage indisponible : on repart de zéro
		}
	}

	// Sauvegarde du brouillon à chaque réponse (tant que l'exercice n'est pas corrigé).
	$effect(() => {
		if (!exercise || result) return;
		const answered = Object.fromEntries(Object.entries(responses).filter(([, v]) => v !== null));
		try {
			if (Object.keys(answered).length) localStorage.setItem(draftKey(exercise.id), JSON.stringify(answered));
			else localStorage.removeItem(draftKey(exercise.id));
		} catch {
			// stockage indisponible : pas de brouillon
		}
	});

	let deleting = $state(false);
	async function handleDelete() {
		if (!exercise) return;
		const ok = confirm(
			"Supprimer définitivement cet exercice ?\n\nLes résultats des élèves qui l'ont déjà fait seront supprimés aussi."
		);
		if (!ok) return;
		deleting = true;
		try {
			await pb.collection('exercises').delete(exercise.id);
			try {
				localStorage.removeItem(draftKey(exercise.id));
			} catch {
				// rien à nettoyer
			}
			await goto(`${base}/`);
		} catch (e) {
			alert(`Suppression impossible : ${errorMessage(e)}`);
			deleting = false;
		}
	}

	async function handleSubmit() {
		if (!exercise || !view || !allFilled) return;
		submitting = true;
		submitError = null;

		// On n'envoie que les réponses des trous présents dans la vue tronquée.
		const keptPositions = new Set(view.blanks.map((b) => b.position));
		const payload: Record<string, string> = {};
		for (const [pos, val] of Object.entries(responses)) {
			if (filled(val) && (isPunct || keptPositions.has(Number(pos)))) {
				payload[pos] = (val as string).trim();
			}
		}

		try {
			result = await correctAttempt({
				exercise_id: exercise.id,
				responses: payload,
				hard_mode: hardActive
			});
			try {
				localStorage.removeItem(draftKey(exercise.id));
			} catch {
				// rien à nettoyer
			}
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
				breakdownTitle={ruleType === 'multiple_choice' ? undefined : 'Détail'}
				theme={exercise.theme}
				gradeLevel={exercise.grade_level}
				numBlanks={view.blanks.length}
			/>

			{#if ruleType === 'free_text'}
				{@const errors = result.per_blank.filter((b) => !b.ok)}
				{#if errors.length > 0}
					<div class="card stack">
						<h3>Tes erreurs expliquées</h3>
						<ul class="explanations">
							{#each errors as e (e.position)}
								<li>
									<span class="wrong">{e.given || '—'}</span> →
									<strong class="right">{e.correct}</strong>
									<span class="muted">({hintFor(e.position)})</span>
									{#if e.explanation}<p>{e.explanation}</p>{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			<details class="card">
				<summary>
					{ruleType === 'qcm' || ruleType === 'span'
						? 'Voir les corrections'
						: 'Voir le texte avec les corrections'}
				</summary>
				<div style="margin-top: var(--space-4);">
					{#if ruleType === 'transform'}
						<TransformList
							items={view.blanks}
							bind:responses
							writing={!!result.hard_mode}
							readonly
							results={result.per_blank}
						/>
					{:else if ruleType === 'span'}
						<SpanSelectList items={view.blanks} bind:responses readonly results={result.per_blank} />
					{:else if ruleType === 'punctuation'}
						<PunctuationText {words} bind:responses readonly results={result.per_blank} />
					{:else if ruleType === 'qcm'}
						<QcmList
							items={view.blanks}
							options={rule.candidates}
							bind:responses
							readonly
							results={result.per_blank}
						/>
					{:else}
						<ExerciseText
							text={view.text}
							blankPositions={view.blanks.map((b) => b.position)}
							mode={ruleType === 'free_text' ? 'input' : 'select'}
							{optionsFor}
							{hintFor}
							bind:responses
							readonly
							results={result.per_blank}
						/>
					{/if}
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
						<div class="editor-actions">
							<a href={`${base}/exercise/${exercise.id}/edit`} class="edit-link">Modifier</a>
							<button type="button" class="delete-btn" onclick={handleDelete} disabled={deleting}>
								{deleting ? 'Suppression…' : 'Supprimer'}
							</button>
						</div>
					{/if}
				</div>
				<p class="muted">
					Thème : <em>{exercise.theme}</em> · Niveau : {exercise.grade_level} ·
					{isPunct ? sentenceCount : view.blanks.length} {unit}
					{#if view.blanks.length < exercise.num_blanks}
						<span class="muted">(version courte sur {exercise.num_blanks} possibles)</span>
					{/if}
				</p>
			</header>

			{#if hardAvailable}
				<div class="mode-row">
					<label class="mode-toggle" class:locked={hardModeLocked}>
						<input
							type="checkbox"
							checked={hardMode}
							disabled={hardModeLocked}
							onchange={(e) => setHardMode((e.currentTarget as HTMLInputElement).checked)}
						/>
						<span>
							<strong>Mode difficile</strong> :
							{#if writingMode}
								tu écris toi-même la phrase transformée (corrigée par l'IA).
							{:else if hideHighlightMode}
								rien n'est surligné, à toi de trouver le passage concerné.
							{:else}
								chaque trou propose tous les mots ({rule.candidates.join(', ')}).
							{/if}
						</span>
					</label>
					<p class="muted small">
						{#if writingMode}
							{hardMode
								? "Ta phrase est d'abord vérifiée par l'appli (ponctuation, négation…), puis corrigée par l'IA."
								: 'Tu choisis la bonne phrase parmi trois propositions.'}
						{:else if hideHighlightMode}
							{hardMode
								? 'Les corrections montreront le passage à trouver.'
								: 'Le passage à observer est surligné dans chaque phrase.'}
						{:else if hardMode}
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

			{#if ruleType === 'transform'}
				<p class="consigne">
					{hardActive
						? 'Écris chaque phrase transformée comme demandé, avec la bonne ponctuation.'
						: 'Pour chaque phrase, choisis la bonne transformation.'}
				</p>
				<div class="card">
					{#key hardActive}
						<TransformList items={view.blanks} bind:responses writing={hardActive} />
					{/key}
				</div>
			{:else if ruleType === 'span'}
				<p class="consigne">{view.text}</p>
				<div class="card">
					<SpanSelectList items={view.blanks} bind:responses />
				</div>
			{:else if ruleType === 'punctuation'}
				<p class="consigne">
					Ce texte a perdu sa ponctuation : remets les points, les virgules, les points
					d'interrogation et les points d'exclamation.
				</p>
				<div class="card">
					<PunctuationText {words} bind:responses />
				</div>
			{:else if ruleType === 'qcm'}
				<p class="consigne">
					{hardActive && rule.config?.hard_consigne ? rule.config.hard_consigne : view.text}
				</p>
				<div class="card">
					<QcmList
						items={view.blanks}
						options={rule.candidates}
						bind:responses
						hideHighlight={hardActive && hideHighlightMode}
					/>
				</div>
			{:else}
				{#if ruleType === 'free_text'}
					<p class="consigne">
						Écris chaque verbe entre parenthèses au <strong>présent</strong>, accordé avec son sujet.
					</p>
				{/if}
				<div class="card">
					<ExerciseText
						text={view.text}
						{blankPositions}
						mode={ruleType === 'free_text' ? 'input' : 'select'}
						{optionsFor}
						{hintFor}
						bind:responses
					/>
				</div>
			{/if}

			{#if view.blanks.length < exercise.num_blanks}
				<aside class="truncation-note">
					💡 Tu fais une version courte de cet exercice. Pour le faire en entier, lance-le avec ses
					<strong>{exercise.num_blanks} {unit}</strong> depuis la page « Nouvel exercice ».
				</aside>
			{/if}

			<div class="actions">
				<button type="button" onclick={handleSubmit} disabled={!allFilled || submitting}>
					{submitting ? 'Correction en cours…' : "J'ai terminé"}
				</button>
				{#if !allFilled}
					<span class="muted">
						{ruleType === 'qcm' || (ruleType === 'transform' && !hardActive)
							? 'Réponds à toutes les questions pour valider.'
							: ruleType === 'transform'
								? 'Écris toutes les phrases pour valider.'
							: ruleType === 'span'
								? 'Choisis des mots dans chaque phrase pour valider.'
								: isPunct
									? 'Place au moins un signe pour valider.'
									: 'Remplis tous les trous pour valider.'}
					</span>
				{/if}
				{#if submitError}
					<p class="error">{submitError}</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.explanations {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 12px);
	}
	.explanations p {
		margin: 4px 0 0;
		font-size: 0.95em;
	}
	.explanations .wrong {
		color: var(--color-error);
		text-decoration: line-through;
	}
	.explanations .right {
		color: var(--color-success);
	}
	.consigne {
		margin: 0;
		font-weight: 500;
	}
	.mode-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 4px);
		margin-bottom: var(--space-2, 8px);
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
	.editor-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.delete-btn {
		font-size: 0.9em;
		padding: 4px 10px;
		border: 1px solid var(--color-error, #b3261e);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-error, #b3261e);
		cursor: pointer;
	}
	.delete-btn:hover:not(:disabled) {
		background: var(--color-error, #b3261e);
		color: white;
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
