<script lang="ts">
	import type { BlankRow } from '$lib/data';
	import { highlightSegments } from '$lib/data';
	import type { PerBlank } from '$lib/api/correct';

	interface Props {
		items: BlankRow[];
		options: string[];
		responses: Record<number, string | null>;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}

	let { items, options, responses = $bindable(), readonly = false, results = null }: Props = $props();

	function resultFor(pos: number) {
		return results?.find((r) => r.position === pos) ?? null;
	}
</script>

<ol class="qcm">
	{#each items as item (item.position)}
		{@const r = resultFor(item.position)}
		<li class:ok={r?.ok === true} class:ko={r?.ok === false}>
			<p class="prompt">
				{#each highlightSegments(item.prompt ?? '') as seg, i (i)}
					{#if seg.mark}<mark>{seg.text}</mark>{:else}{seg.text}{/if}
				{/each}
			</p>
			<div class="choices" role="radiogroup" aria-label={`Question ${item.position}`}>
				{#each options as opt (opt)}
					{@const chosen = responses[item.position] === opt}
					{@const isCorrect = !!r && opt === r.correct}
					<button
						type="button"
						role="radio"
						aria-checked={chosen}
						class="choice"
						class:chosen
						class:right={readonly && isCorrect}
						class:wrong={readonly && chosen && !isCorrect}
						disabled={readonly}
						onclick={() => (responses[item.position] = opt)}
					>
						{opt}
					</button>
				{/each}
			</div>
			{#if readonly && r}
				<p class="feedback">
					{r.ok ? '✓' : '✗'}
					{#if r.explanation}{r.explanation}{:else if !r.ok}Réponse : {r.correct}.{/if}
				</p>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.qcm {
		margin: 0;
		padding-left: 1.6em;
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 16px);
	}
	.qcm li {
		padding-left: 4px;
	}
	.prompt {
		margin: 0 0 6px;
		font-family: var(--font-serif);
		font-size: 1.1em;
		line-height: 1.5;
	}
	mark {
		background: rgba(47, 93, 177, 0.14);
		color: inherit;
		font-weight: 700;
		padding: 0 3px;
		border-radius: 3px;
		text-decoration: underline;
		text-decoration-color: var(--color-primary);
		text-underline-offset: 3px;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.choice {
		width: auto;
		padding: 4px 12px;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.95em;
		cursor: pointer;
	}
	.choice:hover:not(:disabled) {
		border-color: var(--color-primary);
	}
	.choice.chosen {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}
	.choice:disabled {
		cursor: default;
		opacity: 0.85;
	}
	.choice.right {
		background: rgba(46, 139, 87, 0.18);
		border-color: var(--color-success);
		color: var(--color-success);
		font-weight: 600;
		opacity: 1;
	}
	.choice.wrong {
		background: rgba(184, 51, 60, 0.15);
		border-color: var(--color-error);
		color: var(--color-error);
		text-decoration: line-through;
		opacity: 1;
	}
	.feedback {
		margin: 6px 0 0;
		font-size: 0.92em;
	}
	li.ok .feedback {
		color: var(--color-success);
	}
	li.ko .feedback {
		color: var(--color-error);
	}
</style>
