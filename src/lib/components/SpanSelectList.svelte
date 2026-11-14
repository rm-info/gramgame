<script lang="ts">
	import type { BlankRow } from '$lib/data';
	import type { PerBlank } from '$lib/api/correct';

	/**
	 * Une phrase par question ; l'élève clique sur les mots qui forment le
	 * groupe demandé (le GNS). Réponse : indices des mots, « 0,1,2 ».
	 */
	interface Props {
		items: BlankRow[];
		responses: Record<number, string | null>;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}

	let { items, responses = $bindable(), readonly = false, results = null }: Props = $props();

	function parse(v: string | null | undefined): Set<number> {
		return new Set(
			String(v ?? '')
				.split(',')
				.map((x) => Number(x))
				.filter((x) => Number.isInteger(x) && x >= 0 && String(v ?? '').trim() !== '')
		);
	}

	function toggle(pos: number, i: number) {
		const sel = parse(responses[pos]);
		if (sel.has(i)) sel.delete(i);
		else sel.add(i);
		responses[pos] = sel.size ? [...sel].sort((a, b) => a - b).join(',') : null;
	}

	function resultFor(pos: number) {
		return results?.find((r) => r.position === pos) ?? null;
	}
</script>

<ol class="span-list">
	{#each items as item (item.position)}
		{@const r = resultFor(item.position)}
		{@const chosen = parse(readonly ? (r?.given_indices ?? responses[item.position]) : responses[item.position])}
		{@const expected = parse(item.answer)}
		<li class:ok={r?.ok === true} class:ko={r?.ok === false}>
			<p class="sentence">
				{#each item.tokens ?? [] as tok, i (i)}
					{@const sel = chosen.has(i)}
					{@const exp = expected.has(i)}
					<button
						type="button"
						class="word"
						class:selected={!readonly && sel}
						class:right={readonly && sel && exp}
						class:missed={readonly && !sel && exp}
						class:wrong={readonly && sel && !exp}
						aria-pressed={sel}
						disabled={readonly}
						onclick={() => toggle(item.position, i)}>{tok}</button
					>{' '}
				{/each}
			</p>
			{#if readonly && r}
				<p class="feedback">
					{r.ok ? '✓' : '✗'}
					{#if !r.ok}Le GNS est : « {r.correct} ».{/if}
					{#if r.explanation}{r.explanation}{/if}
				</p>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.span-list {
		margin: 0;
		padding-left: 1.6em;
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 16px);
	}
	.sentence {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.15em;
		line-height: 2;
	}
	.word {
		width: auto;
		display: inline;
		font: inherit;
		color: inherit;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: 3px;
		padding: 1px 2px;
		margin: 0;
		cursor: pointer;
	}
	.word:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.08);
	}
	.word:focus-visible {
		outline: 2px solid var(--color-primary);
	}
	.word.selected {
		background: rgba(47, 93, 177, 0.16);
		border-bottom-color: var(--color-primary);
	}
	.word:disabled {
		cursor: default;
		opacity: 1;
	}
	.word.right {
		background: rgba(46, 139, 87, 0.18);
		border-bottom-color: var(--color-success);
	}
	.word.missed {
		border-bottom: 2px dashed var(--color-success);
	}
	.word.wrong {
		background: rgba(184, 51, 60, 0.15);
		text-decoration: line-through;
	}
	.feedback {
		margin: 4px 0 0;
		font-size: 0.92em;
	}
	li.ok .feedback {
		color: var(--color-success);
	}
	li.ko .feedback {
		color: var(--color-error);
	}
</style>
