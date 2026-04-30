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
		/* Centré verticalement sur la ligne, pas calé en baseline (qui ferait
		   déborder le select au-dessus du haut de ligne et étirerait la ligne). */
		vertical-align: middle;
		/* Hauteur explicite < line-height du paragraphe (1.8em) pour que le
		   wrapper rentre proprement dans la ligne sans la dilater. */
		height: 1.5em;
	}
	.blank select {
		/* appearance:none désactive le rendu natif (chevron, hauteur browser-dependent,
		   ombrages). On reprend la main sur les dimensions pour qu'elles s'intègrent
		   proprement dans la ligne de texte. */
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		font: inherit;
		height: 100%;
		line-height: 1.4;
		padding: 0 1.4em 0 0.4em;
		box-sizing: border-box;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 6' fill='%23667'><path d='M0 0l4 6 4-6z'/></svg>");
		background-repeat: no-repeat;
		background-position: right 0.4em center;
		background-size: 8px 6px;
		cursor: pointer;
		min-width: 3em;
		vertical-align: top;
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
