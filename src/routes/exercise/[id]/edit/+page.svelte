<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { mapExercise, PERSON_LABELS, type ExerciseRow, type BlankRow, type RuleInfo } from '$lib/data';
	import { activeUsername } from '$lib/active-username.svelte';
	import { ruleGroups, groupLabel } from '$lib/confusion';

	/** Ligne éditable : pour la saisie au clavier, les réponses acceptées en texte. */
	type EditRow = BlankRow & { accepted_text?: string };

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

	let exerciseId = $derived(page.params.id);

	let exercise = $state<ExerciseData | null>(null);
	let rule = $state<RuleInfo | null>(null);
	const ruleType = $derived(rule?.rule_type ?? 'multiple_choice');
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	let editText = $state('');
	let editBlanks = $state<EditRow[]>([]);
	let editVerified = $state(false);
	let saving = $state(false);
	let saveMsg = $state<string | null>(null);
	let saveError = $state<string | null>(null);

	const validation = $derived.by(() => {
		if (ruleType === 'qcm') {
			const incomplete = editBlanks
				.filter((b) => !(b.prompt ?? '').trim() || !(rule?.candidates ?? []).includes(b.correct))
				.map((b) => b.position);
			return {
				markerCount: 0,
				blankCount: editBlanks.length,
				markersWithoutBlank: [] as number[],
				blanksWithoutMarker: [] as number[],
				incomplete,
				ok: editBlanks.length > 0 && incomplete.length === 0
			};
		}
		const incomplete =
			ruleType === 'free_text'
				? editBlanks.filter((b) => parseAccepted(b.accepted_text).length === 0).map((b) => b.position)
				: [];
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
			incomplete,
			ok:
				markersWithoutBlank.length === 0 &&
				blanksWithoutMarker.length === 0 &&
				incomplete.length === 0 &&
				editBlanks.length > 0
		};
	});

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
		editText = exercise.text;
		const type = ex.rule?.rule_type ?? 'multiple_choice';
		editBlanks = exercise.blanks
			.map((b): EditRow => {
				if (type === 'free_text') {
					return { ...b, accepted_text: (b.accepted?.length ? b.accepted : [b.correct]).join(', ') };
				}
				if (type === 'qcm') return { ...b };
				// L'ancien champ distractor est abandonné : les options viennent des groupes.
				return { position: b.position, correct: b.correct };
			})
			.sort((a, b) => a.position - b.position);
		editVerified = exercise.verified;

		if (!ex.rule) {
			loadError = 'Règle introuvable.';
			loading = false;
			return;
		}
		rule = ex.rule;
		loading = false;
	});

	function addBlank() {
		const usedPositions = new Set(editBlanks.map((b) => b.position));
		let pos = 1;
		while (usedPositions.has(pos)) pos++;
		const cands = rule?.candidates ?? [];
		let row: EditRow = { position: pos, correct: cands[0] ?? '' };
		if (ruleType === 'free_text') row = { position: pos, correct: '', verb: '', person: '3s', accepted_text: '' };
		if (ruleType === 'qcm') {
			const next = Math.max(0, ...editBlanks.map((b) => b.position)) + 1;
			row = { position: next, prompt: '', correct: cands[0] ?? '', explanation: '' };
		}
		editBlanks = [...editBlanks, row].sort((a, b) => a.position - b.position);
	}

	function parseAccepted(text: string | undefined): string[] {
		return (text ?? '')
			.split(',')
			.map((w) => w.trim())
			.filter(Boolean);
	}

	/** Lignes éditées → format stocké. */
	function blanksForSave(): BlankRow[] {
		if (ruleType === 'free_text') {
			return editBlanks.map(({ accepted_text, ...b }) => {
				const accepted = parseAccepted(accepted_text);
				return { ...b, accepted, correct: accepted[0] ?? '' };
			});
		}
		if (ruleType === 'qcm') {
			// Questions renumérotées dans l'ordre affiché.
			return editBlanks.map((b, i) => ({
				...b,
				position: i + 1,
				prompt: (b.prompt ?? '').trim(),
				explanation: (b.explanation ?? '').trim(),
				category: b.correct
			}));
		}
		return editBlanks.map((b) => ({ position: b.position, correct: b.correct }));
	}

	function removeBlank(position: number) {
		editBlanks = editBlanks.filter((b) => b.position !== position);
	}

	async function handleSave() {
		if (!exercise) return;
		saving = true;
		saveError = null;
		saveMsg = null;

		// On n'envoie le flag que s'il a basculé : le serveur pose alors
		// verified_at / verified_by_username (et les préserve sinon).
		const verificationFields =
			editVerified !== exercise.verified ? { verified: editVerified } : {};

		// Les méta de vérification (date, auteur) sont posées côté serveur.
		let updated: ExerciseRow;
		try {
			updated = mapExercise(
				await pb.collection('exercises').update(exercise.id, {
					text: editText,
					blanks: blanksForSave(),
					num_blanks: editBlanks.length,
					...verificationFields
				})
			);
		} catch (e) {
			saving = false;
			saveError = errorMessage(e);
			return;
		}
		saving = false;
		// Synchronise l'état local pour que les prochains saves comparent
		// correctement.
		exercise.verified = updated.verified;
		exercise.verified_at = updated.verified_at;
		exercise.verified_by_username = updated.verified_by_username;
		saveMsg = 'Modifications enregistrées.';
	}
</script>

<section class="container stack editor-container">
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
				{#if ruleType === 'qcm'}
				<label for="text">Consigne affichée à l'élève :</label>
				<textarea id="text" bind:value={editText} rows="3" class="consigne-input"></textarea>
				<p class="muted small">
					Dans chaque question, le passage entre <code>[[ ]]</code> est mis en surbrillance (ex. :
					<code>[[Le chien des voisins]] aboie.</code>). Réponses possibles :
					{rule.candidates.join(', ')}.
				</p>
				{:else}
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
				{/if}
				{#if validation.incomplete.length > 0}
					<p class="warning">
						{ruleType === 'qcm' ? 'Questions incomplètes' : 'Trous sans réponse acceptée'} :
						{validation.incomplete.join(', ')}
					</p>
				{/if}
			</div>

			<div class="card stack editor-pane editor-pane-blanks">
				<div class="row-between">
					<h2>{ruleType === 'qcm' ? 'Questions' : 'Trous'}</h2>
					<button type="button" class="secondary" onclick={addBlank}>
						+ Ajouter {ruleType === 'qcm' ? 'une question' : 'un trou'}
					</button>
				</div>

				<div class="blanks-scroll">
					{#if editBlanks.length === 0}
						<p class="muted">Rien pour l'instant. Ajoute-en avec le bouton ci-dessus.</p>
					{:else if ruleType === 'qcm'}
						<ol class="qcm-edit">
							{#each editBlanks as b (b.position)}
								<li class="stack">
									<input type="text" bind:value={b.prompt} placeholder="[[Le chien des voisins]] aboie." />
									<div class="qcm-row">
										<select bind:value={b.correct} aria-label="Bonne réponse">
											{#each rule.candidates as c (c)}
												<option value={c}>{c}</option>
											{/each}
										</select>
										<input
											type="text"
											bind:value={b.explanation}
											placeholder="Explication (montrée après correction)"
										/>
										<button
											type="button"
											class="link danger"
											title="Supprimer cette question"
											onclick={() => removeBlank(b.position)}
										>
											✕
										</button>
									</div>
								</li>
							{/each}
						</ol>
					{:else if ruleType === 'free_text'}
						<p class="muted small">
							Réponses acceptées séparées par des virgules ; la première est celle montrée en
							correction (ex. <code>étiquette, étiquète</code> pour accepter l'orthographe
							rectifiée).
						</p>
						<table class="blanks-table">
							<thead>
								<tr>
									<th>Trou</th>
									<th>Verbe</th>
									<th>Personne</th>
									<th>Réponses acceptées</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{#each editBlanks as b (b.position)}
									<tr>
										<td><code>{`{{${b.position}}}`}</code></td>
										<td><input type="text" class="cell-input" bind:value={b.verb} /></td>
										<td>
											<select bind:value={b.person}>
												{#each Object.entries(PERSON_LABELS) as [code, label] (code)}
													<option value={code}>{label}</option>
												{/each}
											</select>
										</td>
										<td><input type="text" class="cell-input wide" bind:value={b.accepted_text} /></td>
										<td class="actions">
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
					{:else}
						<table class="blanks-table">
							<thead>
								<tr>
									<th>Position</th>
									<th>Bonne réponse</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{#each editBlanks as b (b.position)}
									<tr>
										<td><code>{`{{${b.position}}}`}</code></td>
										<td>
											<select bind:value={b.correct}>
												{#each ruleGroups(rule) as g (groupLabel(g))}
													<optgroup label={groupLabel(g)}>
														{#each g as c (c)}
															<option value={c}>{c}</option>
														{/each}
													</optgroup>
												{/each}
											</select>
										</td>
										<td class="actions">
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

		<div class="card stack">
			<label class="verify-row">
				<input type="checkbox" bind:checked={editVerified} />
				<span>
					<strong>Marquer cet exercice comme vérifié.</strong>
					{#if exercise.verified && exercise.verified_at}
						<span class="muted small">
							(actuellement vérifié{#if exercise.verified_by_username} par <strong>{exercise.verified_by_username}</strong>{/if} le {new Date(exercise.verified_at).toLocaleDateString('fr-FR')})
						</span>
					{/if}
				</span>
			</label>
			<p class="muted small">
				Le badge « Vérifié » apparaîtra à côté du titre quand un utilisateur ouvrira cet exercice.
				À cocher uniquement si le texte et les bonnes réponses sont conformes après relecture.
			</p>
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
		/* Élargit le container pour laisser respirer les 2 colonnes ; uniquement
		   sur l'éditeur, pas sur les autres pages où la largeur 760px reste
		   le bon confort de lecture. */
		.editor-container {
			max-width: min(1400px, calc(100vw - 2 * var(--space-4)));
		}
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
	.verify-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.verify-row input[type='checkbox'] {
		margin-top: 4px;
	}
	.small {
		font-size: 0.9em;
	}
	.consigne-input {
		min-height: 4em;
	}
	.cell-input {
		width: 8em;
		padding: 4px 6px;
	}
	.cell-input.wide {
		width: 12em;
	}
	.qcm-edit {
		margin: 0;
		padding-left: 1.4em;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.qcm-edit .stack {
		gap: 6px;
	}
	.qcm-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.qcm-row select {
		width: auto;
	}
	.qcm-row input {
		flex: 1;
	}
</style>
