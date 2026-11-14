<script lang="ts">
	interface Props {
		position: number;
		value: string | null;
		/** Indice affiché après le champ, ex. l'infinitif « jeter ». */
		hint?: string;
		readonly?: boolean;
		state?: 'neutral' | 'correct' | 'incorrect';
		correct?: string;
		/** Réponse acceptée en orthographe rectifiée. */
		variant?: boolean;
	}

	let {
		position,
		value = $bindable(),
		hint = '',
		readonly = false,
		state = 'neutral',
		correct = '',
		variant = false
	}: Props = $props();

	// Le champ s'élargit avec ce qui est tapé (min ~6 caractères).
	const width = $derived(`${Math.max(6, (value ?? '').length + 2)}ch`);
</script>

<span class="blank-input {state}" data-position={position}>
	{#if readonly}
		<span class="readonly-value">{value || '—'}</span>
		{#if state === 'incorrect' && correct}
			<span class="correct-hint">→ {correct}</span>
		{/if}
		{#if state === 'correct' && variant}
			<span class="variant-hint" title="Orthographe rectifiée (réforme de 1990), acceptée">✓ rectifiée</span>
		{/if}
	{:else}
		<input
			type="text"
			id={`blank-${position}`}
			bind:value
			style:width
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			aria-label={`Trou numéro ${position}${hint ? ` (${hint})` : ''}`}
		/>
	{/if}
	{#if hint}<span class="hint">({hint})</span>{/if}
</span>

<style>
	.blank-input {
		display: inline-block;
		margin: 0 2px;
		vertical-align: middle;
	}
	input {
		font: inherit;
		height: 1.5em;
		padding: 0 0.3em;
		box-sizing: border-box;
		border: none;
		border-bottom: 2px solid var(--color-primary);
		border-radius: 0;
		background: rgba(47, 93, 177, 0.06);
		min-width: 4em;
		max-width: 14em;
	}
	input:focus {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}
	.hint {
		margin-left: 3px;
		font-size: 0.8em;
		color: var(--color-muted, #667);
		font-style: italic;
	}
	.correct .readonly-value {
		background: rgba(46, 139, 87, 0.18);
		color: var(--color-success);
		font-weight: 600;
		padding: 0 6px;
		border-radius: var(--radius-sm);
	}
	.incorrect .readonly-value {
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
	.variant-hint {
		margin-left: 4px;
		font-size: 0.75em;
		color: var(--color-success);
	}
</style>
