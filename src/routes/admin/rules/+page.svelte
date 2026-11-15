<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { pb, errorMessage } from '$lib/pb';
	import { normalizeWord, parseGroupsText, groupsToText, groupLabel } from '$lib/confusion';
	import { activeUsername } from '$lib/active-username.svelte';

	type RuleType = 'multiple_choice' | 'free_text' | 'qcm' | 'span' | 'punctuation' | 'transform';

	const TYPE_LABELS: Record<RuleType, string> = {
		multiple_choice: 'texte à trous + menu',
		free_text: 'texte à trous au clavier',
		qcm: 'QCM',
		span: 'mots à cliquer (GNS)',
		punctuation: 'ponctuation à rétablir',
		transform: 'transformation de phrases'
	};
	/** Types qui utilisent une liste de candidats / réponses possibles. */
	const WITH_CANDIDATES: RuleType[] = ['multiple_choice', 'qcm'];
	const CATEGORY_LABELS: Record<string, string> = {
		orthographe: 'Orthographe',
		grammaire: 'Grammaire',
		conjugaison: 'Conjugaison'
	};
	const GENERATORS = ['verb_groups', 'llm_qcm', 'conj_present', 'llm_span', 'llm_punctuation', 'llm_transform'];

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
		category: string;
		config: Record<string, unknown> | null;
		candidates: string[];
		groups: string[][] | null;
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
		category: string;
		/** Configuration JSON (types QCM / saisie) */
		configText: string;
		candidates: string[];
		/** Une ligne par groupe de confusion : « on / ont » */
		groupsText: string;
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
		try {
			const data = await pb.collection('rules').getFullList({
				sort: 'id',
				fields:
					'id,display_name,short_description,rule_type,category,config,candidates,groups,difficulty_hint,examples'
			});
			rules = data.map((r) => ({
				...(r as unknown as Rule),
				candidates: Array.isArray(r.candidates) ? r.candidates : [],
				config: r.config && typeof r.config === 'object' ? r.config : null,
				groups: Array.isArray(r.groups) && r.groups.length > 0 ? r.groups : null,
				difficulty_hint: r.difficulty_hint || null,
				examples: Array.isArray(r.examples) ? r.examples : null
			}));
		} catch (e) {
			loadError = errorMessage(e);
		}
		loading = false;
	}

	function emptyForm(): FormState {
		return {
			mode: 'new',
			original_id: null,
			id: '',
			display_name: '',
			short_description: '',
			rule_type: 'multiple_choice',
			category: 'orthographe',
			configText: '',
			candidates: [],
			groupsText: '',
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
			category: r.category ?? '',
			configText: r.config && Object.keys(r.config).length ? JSON.stringify(r.config, null, 2) : '',
			candidates: [...r.candidates],
			groupsText: groupsToText(r.groups),
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
			category: r.category ?? '',
			configText: r.config && Object.keys(r.config).length ? JSON.stringify(r.config, null, 2) : '',
			candidates: [...r.candidates],
			groupsText: groupsToText(r.groups),
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

	/** Même contrôle que le serveur (pb_hooks : validateRuleGroups). */
	function validateGroups(candidates: string[], groups: string[][]): string | null {
		if (groups.length === 0) return null;
		const cands = candidates.map(normalizeWord);
		const seen = new Set<string>();
		for (const g of groups) {
			if (g.length < 2) return `Groupe « ${g.join(' / ')} » : il faut au moins 2 mots.`;
			for (const w of g) {
				const n = normalizeWord(w);
				if (!cands.includes(n)) return `« ${w} » est dans un groupe mais pas dans les candidats.`;
				if (seen.has(n)) return `« ${w} » apparaît dans plusieurs groupes.`;
				seen.add(n);
			}
		}
		const missing = candidates.filter((c) => !seen.has(normalizeWord(c)));
		if (missing.length) return `Candidats sans groupe : ${missing.join(', ')}.`;
		return null;
	}

	/** null si vide, undefined si JSON invalide. */
	function parseConfig(text: string): Record<string, unknown> | null | undefined {
		if (!text.trim()) return null;
		try {
			const v = JSON.parse(text);
			return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
		} catch {
			return undefined;
		}
	}

	function validateForm(): string | null {
		if (!form) return 'Pas de formulaire actif.';
		if (!/^[a-z0-9-]+$/.test(form.id)) {
			return 'ID invalide : lettres minuscules, chiffres, tirets uniquement.';
		}
		if (form.id.length < 2) return 'ID trop court.';
		if (!form.display_name.trim()) return 'Nom d\'affichage requis.';
		if (!form.short_description.trim()) return 'Description requise.';
		if (WITH_CANDIDATES.includes(form.rule_type) && form.candidates.length < 2) {
			return 'Il faut au moins 2 candidats (les réponses possibles).';
		}
		if (form.rule_type !== 'multiple_choice') {
			const cfg = parseConfig(form.configText);
			if (cfg === undefined) return 'Configuration : JSON invalide.';
			if (!cfg || !GENERATORS.includes(String(cfg.generator))) {
				return `Configuration : « generator » doit valoir ${GENERATORS.join(', ')}.`;
			}
		}
		const groupsError = validateGroups(form.candidates, parseGroupsText(form.groupsText));
		if (groupsError) return groupsError;
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
			category: form.category || null,
			config: form.rule_type === 'multiple_choice' ? null : parseConfig(form.configText),
			candidates: WITH_CANDIDATES.includes(form.rule_type) ? form.candidates : null,
			groups: (() => {
				if (form.rule_type !== 'multiple_choice') return null;
				const g = parseGroupsText(form.groupsText);
				return g.length > 0 ? g : null;
			})(),
			difficulty_hint: form.difficulty_hint.trim() || null,
			examples: form.examples.length > 0 ? form.examples : null
		};

		let error: string | null = null;
		try {
			if (form.mode === 'edit' && form.original_id) {
				// L'ID est immutable (référencé par les exercices). On update tout sauf l'ID.
				const { id: _ignore, ...updateFields } = payload;
				await pb.collection('rules').update(form.original_id, updateFields);
			} else {
				await pb.collection('rules').create(payload);
			}
		} catch (e) {
			error = ruleSaveError(e);
		}

		saving = false;
		if (error) {
			saveError = error;
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
		try {
			await pb.collection('rules').delete(r.id);
		} catch (e) {
			deleting = null;
			saveError =
				(e as { status?: number })?.status === 400
					? 'Échec : des exercices utilisent encore cette règle. Supprime-les d\'abord.'
					: `Échec : ${errorMessage(e)}`;
			return;
		}
		deleting = null;
		saveMsg = `Règle « ${r.display_name} » supprimée.`;
		await loadRules();
	}

	function ruleSaveError(e: unknown): string {
		const data = (e as { response?: { data?: Record<string, { message?: string }> } })?.response
			?.data;
		if (data?.id) return `ID déjà utilisé ou invalide (${data.id.message ?? ''}).`;
		const first = data && Object.entries(data)[0];
		if (first) return `${first[0]} : ${first[1]?.message ?? 'invalide'}`;
		return errorMessage(e);
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
			Catalogue des notions que les utilisateurs peuvent pratiquer. Trois types d'exercices :
			<strong>texte à trous + menu</strong> (homophones), <strong>texte à trous au clavier</strong>
			(conjugaison, accord : réponses calculées par le serveur) et <strong>QCM</strong> (une
			question par phrase). Pour les deux derniers, la configuration JSON indique comment générer
			l'exercice (<code>generator</code> : {GENERATORS.join(', ')}) ; le plus simple est de
			dupliquer une règle existante.
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
						{#each Object.entries(TYPE_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Catégorie</span>
					<select bind:value={form.category}>
						<option value="">—</option>
						{#each Object.entries(CATEGORY_LABELS) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>

				{#if form.rule_type !== 'multiple_choice'}
					<label class="full">
						<span>Configuration (JSON)</span>
						<textarea
							rows="4"
							class="mono"
							bind:value={form.configText}
							placeholder={'{ "generator": "llm_qcm", "highlight": true }'}
						></textarea>
						<span class="muted small">
							<code>verb_groups</code> : liste de verbes tirée au sort (sans IA) ·
							<code>llm_qcm</code> : phrases écrites par l'IA (<code>check</code> :
							<code>proche</code> | <code>pronom</code> pour vérifier ses réponses,
							<code>highlight</code>, <code>balance</code> ; <code>"hard_mode": "hide_highlight"</code>
							+ <code>hard_consigne</code> : le mode difficile ne surligne plus le passage) ·
							<code>conj_present</code> : verbes et
							personnes choisis par le serveur, réponses calculées (<code>pool</code> :
							<code>present</code> | <code>eter_eler</code> | <code>accord</code>) · <code>llm_span</code> : phrases avec le GNS entre [[ ]] (type « mots à cliquer ») · <code>llm_punctuation</code> : texte à ponctuer (type « ponctuation ») · <code>llm_transform</code> : phrases à transformer (<code>targets</code> : <code>negative</code>, <code>interrogative</code>, <code>exclamative</code>, <code>imperative</code>).
						</span>
					</label>
				{/if}

				<label>
					<span>Niveau scolaire indicatif</span>
					<input type="text" bind:value={form.difficulty_hint} placeholder="CE2" />
				</label>

				{#if WITH_CANDIDATES.includes(form.rule_type)}
				<div class="full">
					<span class="label-text">
						{form.rule_type === 'qcm' ? 'Réponses possibles' : 'Candidats (les valeurs possibles)'}
					</span>
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
					<span class="muted small">2 minimum.</span>
				</div>
				{/if}

				{#if form.rule_type === 'multiple_choice'}
				<label class="full">
					<span class="label-text">Groupes de confusion (optionnel)</span>
					<textarea
						rows="3"
						bind:value={form.groupsText}
						placeholder={'on / ont\nson / sont\net / es / est'}
					></textarea>
					<span class="muted small">
						Une ligne par groupe de mots qui se confondent, séparés par « / ». Chaque candidat doit
						être dans exactement un groupe. En mode normal, chaque trou ne propose que les mots de son
						groupe ; en mode difficile, tous les candidats. Vide = un seul groupe (tous les candidats).
					</span>
				</label>
				{/if}

				{#if WITH_CANDIDATES.includes(form.rule_type)}
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
				{/if}
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
								<span class="rule-type">{TYPE_LABELS[r.rule_type] ?? r.rule_type}</span>
								{#if r.category}
									<span class="rule-type">{CATEGORY_LABELS[r.category] ?? r.category}</span>
								{/if}
							</div>
							<div class="muted rule-desc">{r.short_description}</div>
							<div class="muted small">
								{#if r.groups}
									Confusions : {r.groups.map(groupLabel).join(' · ')}
								{:else if r.candidates.length}
									{r.rule_type === 'qcm' ? 'Réponses' : 'Candidats'} : {r.candidates.join(', ')}
								{:else}
									Réponses calculées par le serveur
								{/if}
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
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.9em;
	}
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
