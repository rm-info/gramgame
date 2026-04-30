<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { activeUsername } from '$lib/active-username.svelte';

	type RuleType = 'multiple_choice' | 'free_text';

	interface RuleExample {
		sentence: string;
		answer: string;
		rationale?: string;
	}

	interface Rule {
		id: string;
		display_name: string;
		short_description: string;
		rule_type: RuleType;
		candidates: string[];
		difficulty_hint: string | null;
		examples: RuleExample[] | null;
	}

	interface FormState {
		mode: 'new' | 'edit' | 'duplicate';
		original_id: string | null;
		id: string;
		display_name: string;
		short_description: string;
		rule_type: RuleType;
		candidates: string[];
		difficulty_hint: string;
		examples: RuleExample[];
	}

	let rules = $state<Rule[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let form = $state<FormState | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let saveMsg = $state<string | null>(null);
	let deleting = $state<string | null>(null);
	let candidateDraft = $state('');

	// Garde admin-only (le layout /admin n'autorise que prof+admin)
	$effect(() => {
		if (!activeUsername.loaded) return;
		if (!activeUsername.isAdmin) {
			goto(`${base}/admin`, { replaceState: true });
		}
	});

	$effect(() => {
		if (!activeUsername.isAdmin) return;
		loadRules();
	});

	async function loadRules() {
		loading = true;
		loadError = null;
		const { data, error } = await supabase
			.from('rules')
			.select('id, display_name, short_description, rule_type, candidates, difficulty_hint, examples')
			.order('id');
		loading = false;
		if (error) {
			loadError = error.message;
			return;
		}
		rules = (data ?? []) as Rule[];
	}

	function emptyForm(): FormState {
		return {
			mode: 'new',
			original_id: null,
			id: '',
			display_name: '',
			short_description: '',
			rule_type: 'multiple_choice',
			candidates: [],
			difficulty_hint: '',
			examples: []
		};
	}

	function startNew() {
		form = emptyForm();
		candidateDraft = '';
		saveError = null;
		saveMsg = null;
	}

	function startEdit(r: Rule) {
		form = {
			mode: 'edit',
			original_id: r.id,
			id: r.id,
			display_name: r.display_name,
			short_description: r.short_description,
			rule_type: r.rule_type,
			candidates: [...r.candidates],
			difficulty_hint: r.difficulty_hint ?? '',
			examples: (r.examples ?? []).map((e) => ({ ...e }))
		};
		candidateDraft = '';
		saveError = null;
		saveMsg = null;
	}

	function startDuplicate(r: Rule) {
		form = {
			mode: 'duplicate',
			original_id: null,
			id: `${r.id}-copie`,
			display_name: `${r.display_name} (copie)`,
			short_description: r.short_description,
			rule_type: r.rule_type,
			candidates: [...r.candidates],
			difficulty_hint: r.difficulty_hint ?? '',
			examples: (r.examples ?? []).map((e) => ({ ...e }))
		};
		candidateDraft = '';
		saveError = null;
		saveMsg = null;
	}

	function cancelForm() {
		form = null;
		candidateDraft = '';
		saveError = null;
	}

	function addCandidate() {
		if (!form) return;
		const v = candidateDraft.trim();
		if (!v || form.candidates.includes(v)) {
			candidateDraft = '';
			return;
		}
		form.candidates = [...form.candidates, v];
		candidateDraft = '';
	}

	function removeCandidate(c: string) {
		if (!form) return;
		form.candidates = form.candidates.filter((x) => x !== c);
		// Nettoie les exemples qui référençaient ce candidat
		form.examples = form.examples.map((e) =>
			e.answer === c ? { ...e, answer: form!.candidates[0] ?? '' } : e
		);
	}

	function addExample() {
		if (!form) return;
		form.examples = [
			...form.examples,
			{ sentence: '', answer: form.candidates[0] ?? '', rationale: '' }
		];
	}

	function removeExample(idx: number) {
		if (!form) return;
		form.examples = form.examples.filter((_, i) => i !== idx);
	}

	function validateForm(): string | null {
		if (!form) return 'Pas de formulaire actif.';
		if (!/^[a-z0-9-]+$/.test(form.id)) {
			return 'ID invalide : lettres minuscules, chiffres, tirets uniquement.';
		}
		if (form.id.length < 2) return 'ID trop court.';
		if (!form.display_name.trim()) return 'Nom d\'affichage requis.';
		if (!form.short_description.trim()) return 'Description requise.';
		if (form.candidates.length < 2) {
			return 'Il faut au moins 2 candidats.';
		}
		if (form.rule_type !== 'multiple_choice') {
			return 'Seul le type "multiple_choice" est implémenté pour l\'instant.';
		}
		for (const ex of form.examples) {
			if (!ex.sentence.trim()) return 'Un exemple a une phrase vide.';
			if (!ex.answer || !form.candidates.includes(ex.answer)) {
				return `Réponse d'un exemple ("${ex.answer}") absente des candidats.`;
			}
		}
		return null;
	}

	async function saveForm() {
		if (!form) return;
		const v = validateForm();
		if (v) {
			saveError = v;
			return;
		}
		saving = true;
		saveError = null;
		saveMsg = null;

		const payload = {
			id: form.id.trim(),
			display_name: form.display_name.trim(),
			short_description: form.short_description.trim(),
			rule_type: form.rule_type,
			candidates: form.candidates,
			difficulty_hint: form.difficulty_hint.trim() || null,
			examples: form.examples.length > 0 ? form.examples : null
		};

		let error;
		if (form.mode === 'edit' && form.original_id) {
			// L'ID est immutable (FK). On update tout sauf l'ID.
			const { id: _ignore, ...updateFields } = payload;
			({ error } = await supabase.from('rules').update(updateFields).eq('id', form.original_id));
		} else {
			({ error } = await supabase.from('rules').insert(payload));
		}

		saving = false;
		if (error) {
			saveError = error.message;
			return;
		}
		saveMsg = form.mode === 'edit' ? 'Règle mise à jour.' : 'Règle créée.';
		form = null;
		await loadRules();
	}

	async function deleteRule(r: Rule) {
		const ok = confirm(
			`Supprimer la règle « ${r.display_name} » (id : ${r.id}) ?\n\n` +
				`Si des exercices utilisent cette règle, la suppression sera refusée par la base. ` +
				`Tu devras d'abord les supprimer.`
		);
		if (!ok) return;
		deleting = r.id;
		const { error } = await supabase.from('rules').delete().eq('id', r.id);
		deleting = null;
		if (error) {
			saveError = `Échec : ${error.message}`;
			return;
		}
		saveMsg = `Règle « ${r.display_name} » supprimée.`;
		await loadRules();
	}

	function onCandidateKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addCandidate();
		}
	}
</script>

<section class="container stack">
	<header class="stack">
		<a href={`${base}/admin`} class="back">← Retour à la gestion</a>
		<h1>Règles de grammaire</h1>
		<p class="muted">
			Catalogue des règles que les utilisateurs peuvent pratiquer. Pour le MVP, seul le type
			<code>multiple_choice</code> est exploité par le moteur de génération (homophones binaires :
			ou/où, a/à, et/est, etc.). Le type <code>free_text</code> est prévu pour les futures règles
			à champ libre (accords, conjugaison) mais pas encore implémenté.
		</p>
	</header>

	{#if saveMsg}
		<p class="ok">{saveMsg}</p>
	{/if}
	{#if saveError && !form}
		<p class="error">{saveError}</p>
	{/if}

	{#if !form}
		<div>
			<button type="button" onclick={startNew}>+ Ajouter une règle</button>
		</div>
	{/if}

	{#if form}
		<div class="card stack form-card">
			<h2>
				{#if form.mode === 'edit'}
					Édition de <code>{form.original_id}</code>
				{:else if form.mode === 'duplicate'}
					Nouvelle règle (dupliquée)
				{:else}
					Nouvelle règle
				{/if}
			</h2>

			<div class="form-grid">
				<label>
					<span>Identifiant (immutable une fois créé)</span>
					<input
						type="text"
						bind:value={form.id}
						placeholder="son-sont"
						disabled={form.mode === 'edit'}
						required
					/>
					<span class="muted small">Lettres minuscules, chiffres, tirets. Ex : <code>son-sont</code>, <code>et-est</code>.</span>
				</label>

				<label>
					<span>Nom affiché</span>
					<input type="text" bind:value={form.display_name} placeholder="son / sont" required />
				</label>

				<label class="full">
					<span>Description courte</span>
					<textarea
						rows="2"
						bind:value={form.short_description}
						placeholder='Distinction entre "son" (adjectif possessif) et "sont" (verbe être conjugué).'
						required
					></textarea>
				</label>

				<label>
					<span>Type</span>
					<select bind:value={form.rule_type}>
						<option value="multiple_choice">multiple_choice (homophones binaires)</option>
						<option value="free_text" disabled>free_text (à venir)</option>
					</select>
				</label>

				<label>
					<span>Niveau scolaire indicatif</span>
					<input type="text" bind:value={form.difficulty_hint} placeholder="CE2" />
				</label>

				<div class="full">
					<span class="label-text">Candidats (les valeurs possibles)</span>
					<div class="chips">
						{#each form.candidates as c (c)}
							<span class="chip">
								<span>{c}</span>
								<button type="button" class="chip-remove" onclick={() => removeCandidate(c)}>
									×
								</button>
							</span>
						{/each}
						<input
							type="text"
							class="chip-input"
							bind:value={candidateDraft}
							onkeydown={onCandidateKey}
							onblur={addCandidate}
							placeholder="Tape puis Entrée"
						/>
					</div>
					<span class="muted small">2 candidats minimum. Pour les homophones binaires : exactement 2.</span>
				</div>

				<div class="full">
					<div class="row-between">
						<span class="label-text">Exemples positifs (phrases où la règle s'applique)</span>
						<button type="button" class="secondary small-btn" onclick={addExample}>
							+ Ajouter un exemple
						</button>
					</div>
					{#if form.examples.length === 0}
						<p class="muted small">Aucun exemple. L'IA aura moins de contexte pour générer.</p>
					{/if}
					{#each form.examples as ex, idx (idx)}
						<div class="example">
							<input
								type="text"
								class="example-sentence"
								placeholder={'Le château {{?}} habite la sorcière est sombre.'}
								bind:value={ex.sentence}
							/>
							<select bind:value={ex.answer}>
								{#each form.candidates as c (c)}
									<option value={c}>{c}</option>
								{/each}
							</select>
							<input
								type="text"
								class="example-rationale"
								placeholder="rationale (optionnel)"
								bind:value={ex.rationale}
							/>
							<button type="button" class="link danger" onclick={() => removeExample(idx)}>
								✕
							</button>
						</div>
					{/each}
					<p class="muted small">
						Utilise <code>{`{{?}}`}</code> à la position du mot à deviner dans la phrase.
					</p>
				</div>
			</div>

			<div class="form-actions">
				<button type="button" onclick={saveForm} disabled={saving}>
					{saving ? 'Enregistrement…' : 'Enregistrer'}
				</button>
				<button type="button" class="secondary" onclick={cancelForm} disabled={saving}>
					Annuler
				</button>
				{#if saveError}
					<span class="error">{saveError}</span>
				{/if}
			</div>
		</div>
	{/if}

	<div class="card stack">
		<h2>Catalogue actuel</h2>

		{#if loading}
			<p class="muted">Chargement…</p>
		{:else if loadError}
			<p class="error">Échec : {loadError}</p>
		{:else if rules.length === 0}
			<p class="muted">Aucune règle. Ajoute-en avec le bouton ci-dessus.</p>
		{:else}
			<ul class="rule-list">
				{#each rules as r (r.id)}
					<li class="rule-item">
						<div class="rule-info">
							<div class="rule-title">
								<strong>{r.display_name}</strong>
								<code class="rule-id">{r.id}</code>
								<span class="rule-type">{r.rule_type}</span>
							</div>
							<div class="muted rule-desc">{r.short_description}</div>
							<div class="muted small">
								Candidats : {r.candidates.join(', ')}
								{#if r.difficulty_hint}
									· Niveau : {r.difficulty_hint}
								{/if}
								{#if r.examples}
									· {r.examples.length} exemple{r.examples.length > 1 ? 's' : ''}
								{/if}
							</div>
						</div>
						<div class="rule-actions">
							<button type="button" class="secondary small-btn" onclick={() => startEdit(r)}>
								Éditer
							</button>
							<button type="button" class="secondary small-btn" onclick={() => startDuplicate(r)}>
								Dupliquer
							</button>
							<button
								type="button"
								class="link danger"
								disabled={deleting === r.id}
								onclick={() => deleteRule(r)}
								title="Supprimer cette règle"
							>
								{deleting === r.id ? '…' : '✕'}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

<style>
	.back {
		font-size: 0.9em;
	}
	.ok {
		color: var(--color-success);
	}
	.form-card {
		border: 1px solid var(--color-primary);
	}
	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}
	.form-grid label,
	.form-grid > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.form-grid .full {
		grid-column: 1 / -1;
	}
	.label-text {
		font-weight: 500;
		margin-bottom: 4px;
	}
	.small {
		font-size: 0.85em;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		min-height: 2.4em;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: rgba(47, 93, 177, 0.1);
		color: var(--color-primary);
		border-radius: var(--radius-sm);
	}
	.chip-remove {
		background: transparent;
		border: none;
		color: var(--color-primary);
		font-size: 1.1em;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
	}
	.chip-input {
		flex: 1;
		min-width: 80px;
		border: none;
		background: transparent;
		padding: 2px;
		outline: none;
	}
	.example {
		display: grid;
		grid-template-columns: 2fr auto 1fr auto;
		gap: var(--space-2);
		align-items: center;
		margin-bottom: var(--space-2);
	}
	.example input,
	.example select {
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.row-between {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.small-btn {
		font-size: 0.85em;
		padding: 4px 10px;
	}
	.form-actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		flex-wrap: wrap;
	}
	.rule-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.rule-item {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
		align-items: center;
	}
	.rule-item:last-child {
		border-bottom: none;
	}
	.rule-title {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.rule-id {
		font-size: 0.85em;
		color: var(--color-text-muted);
	}
	.rule-type {
		font-size: 0.75em;
		color: var(--color-text-muted);
		background: rgba(0, 0, 0, 0.04);
		padding: 1px 6px;
		border-radius: 999px;
	}
	.rule-desc {
		margin-top: 2px;
	}
	.rule-actions {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}
	button.link {
		background: transparent;
		color: var(--color-primary);
		border: 1px solid transparent;
		padding: 4px 8px;
	}
	button.link.danger {
		color: var(--color-error);
	}
	button.link:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.08);
	}
	button.link.danger:hover:not(:disabled) {
		background: rgba(184, 51, 60, 0.1);
	}
	@media (max-width: 700px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
		.example {
			grid-template-columns: 1fr;
		}
		.rule-item {
			grid-template-columns: 1fr;
		}
	}
</style>
