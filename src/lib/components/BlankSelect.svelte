<script lang="ts">
	interface Props {
		position: number;
		options: string[];
		value: string | null;
		readonly?: boolean;
		state?: 'neutral' | 'correct' | 'incorrect';
		correct?: string;
	}

	let {
		position,
		options,
		value = $bindable(),
		readonly = false,
		state = 'neutral',
		correct = ''
	}: Props = $props();

	const selectId = $derived(`blank-${position}`);
</script>

<span class="blank {state}" data-position={position}>
	{#if readonly}
		<span class="readonly-value">{value ?? '—'}</span>
		{#if state === 'incorrect' && correct}
			<span class="correct-hint">→ {correct}</span>
		{/if}
	{:else}
		<label class="visually-hidden" for={selectId}>Trou n°{position}</label>
		<select id={selectId} bind:value>
			<option value={null}>—</option>
			{#each options as opt (opt)}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{/if}
</span>

<style>
	.blank {
		display: inline-block;
		margin: 0 2px;
		/* Aligne le centre du select sur le centre du texte plutôt que sa baseline,
		   sinon la ligne se "soulève" pour faire de la place au-dessus. */
		vertical-align: middle;
	}
	.blank select {
		padding: 1px 6px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		font: inherit;
		line-height: 1.2;
		min-width: 4em;
	}
	.blank select:focus {
		outline: 2px solid var(--color-primary);
	}
	.blank.correct .readonly-value {
		background: rgba(46, 139, 87, 0.18);
		color: var(--color-success);
		font-weight: 600;
		padding: 0 6px;
		border-radius: var(--radius-sm);
	}
	.blank.incorrect .readonly-value {
		background: rgba(184, 51, 60, 0.15);
		color: var(--color-error);
		text-decoration: line-through;
		padding: 0 6px;
		border-radius: var(--radius-sm);
	}
	.correct-hint {
		margin-left: 4px;
		color: var(--color-success);
		font-weight: 600;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
