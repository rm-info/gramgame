<script lang="ts">
	import type { BlankRow } from '$lib/data';
	import type { PerBlank } from '$lib/api/correct';

	/**
	 * Transformations de phrases. Mode QCM (writing = false) : 3 propositions,
	 * mélangées de façon stable. Mode écriture : l'élève tape la phrase.
	 */
	interface Props {
		items: BlankRow[];
		responses: Record<number, string | null>;
		writing?: boolean;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}

	let { items, responses = $bindable(), writing = false, readonly = false, results = null }: Props = $props();

	const TARGET_LABELS: Record<string, string> = {
		negative: 'forme négative',
		interrogative: 'phrase interrogative',
		exclamative: 'phrase exclamative',
		imperative: 'phrase impérative'
	};

	/** Ordre des propositions stable (même ordre après rechargement), sans dévoiler la bonne. */
	function shuffled(item: BlankRow): string[] {
		const opts = [...(item.options ?? [])];
		let seed = item.position * 7919 + (item.source ?? '').length * 104729;
		for (let i = opts.length - 1; i > 0; i--) {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			const j = seed % (i + 1);
			[opts[i], opts[j]] = [opts[j], opts[i]];
		}
		return opts;
	}

	const norm = (s: string | null | undefined) =>
		String(s ?? '')
			.toLowerCase()
			.replace(/[’]/g, "'")
			.replace(/\s+([?!.,;:])/g, '$1')
			.replace(/\s+/g, ' ')
			.trim();

	function resultFor(pos: number) {
		return results?.find((r) => r.position === pos) ?? null;
	}
</script>

<ol class="transform-list">
	{#each items as item (item.position)}
		{@const r = resultFor(item.position)}
		<li class:ok={r?.ok === true} class:ko={r?.ok === false}>
			<p class="source">{item.source}</p>
			<p class="target">→ <strong>{TARGET_LABELS[item.target ?? ''] ?? item.instruction}</strong></p>

			{#if writing}
				{#if readonly}
					<p class="given" class:right={r?.ok} class:wrong={r && !r.ok}>{r?.given ?? '—'}</p>
				{:else}
					<input
						type="text"
						class="answer-input"
						bind:value={responses[item.position]}
						placeholder="Écris la phrase transformée"
						autocomplete="off"
						spellcheck="false"
						maxlength="300"
						aria-label={`Phrase ${item.position} transformée`}
					/>
				{/if}
			{:else}
				<div class="choices" role="radiogroup" aria-label={`Phrase ${item.position}`}>
					{#each shuffled(item) as opt (opt)}
						{@const chosen = norm(readonly ? (r?.given ?? responses[item.position]) : responses[item.position]) === norm(opt)}
						{@const isCorrect = norm(opt) === norm(item.correct)}
						<button
							type="button"
							role="radio"
							aria-checked={chosen}
							class="choice"
							class:chosen={!readonly && chosen}
							class:right={readonly && isCorrect}
							class:wrong={readonly && chosen && !isCorrect}
							disabled={readonly}
							onclick={() => (responses[item.position] = opt)}>{opt}</button
						>
					{/each}
				</div>
			{/if}

			{#if readonly && r}
				<div class="feedback">
					<p>
						{r.ok ? '✓' : '✗'}
						{#if writing && r.feedback}{r.feedback}{:else if r.explanation}{r.explanation}{/if}
						{#if writing && r.judged_by === 'ia'}<span class="tag">corrigé par l'IA</span>{/if}
					</p>
					{#if r.uncertain}
						<p class="uncertain">⚠️ Correction non vérifiée : demande à un adulte de regarder ta phrase.</p>
					{/if}
					{#if writing && (!r.ok || (item.references?.length ?? 0) > 1)}
						<p class="refs">
							{r.ok ? 'Autres réponses possibles' : 'Réponses possibles'} :
							{(item.references ?? []).join(' · ')}
						</p>
					{/if}
					{#if writing && r.feedback && r.explanation && !r.ok}
						<p class="refs">{r.explanation}</p>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.transform-list {
		margin: 0;
		padding-left: 1.6em;
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 20px);
	}
	.source {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.15em;
	}
	.target {
		margin: 2px 0 8px;
		font-size: 0.95em;
		color: var(--color-text-muted, #556);
	}
	.answer-input {
		width: 100%;
		font-family: var(--font-serif);
		font-size: 1.05em;
	}
	.given {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.05em;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
	}
	.given.right {
		background: rgba(46, 139, 87, 0.15);
	}
	.given.wrong {
		background: rgba(184, 51, 60, 0.12);
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}
	.choice {
		width: auto;
		max-width: 100%;
		text-align: left;
		padding: 6px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-serif);
		font-size: 1em;
		cursor: pointer;
	}
	.choice:hover:not(:disabled) {
		border-color: var(--color-primary);
		background: rgba(47, 93, 177, 0.06);
		color: var(--color-text);
	}
	.choice.chosen,
	.choice.chosen:hover:not(:disabled) {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}
	.choice:disabled {
		cursor: default;
		opacity: 1;
	}
	.choice.right {
		background: rgba(46, 139, 87, 0.18);
		border-color: var(--color-success);
		color: var(--color-success);
		font-weight: 600;
	}
	.choice.wrong {
		background: rgba(184, 51, 60, 0.15);
		border-color: var(--color-error);
		color: var(--color-error);
		text-decoration: line-through;
	}
	.feedback {
		margin-top: 6px;
		font-size: 0.92em;
	}
	.feedback p {
		margin: 0 0 4px;
	}
	li.ok .feedback > p:first-child {
		color: var(--color-success);
	}
	li.ko .feedback > p:first-child {
		color: var(--color-error);
	}
	.refs {
		color: var(--color-text);
	}
	.uncertain {
		color: var(--color-warning, #a46a00);
	}
	.tag {
		margin-left: 6px;
		font-size: 0.8em;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid currentColor;
		white-space: nowrap;
	}
</style>
