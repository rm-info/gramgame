<script lang="ts">
	import type { PerBlank } from '$lib/api/correct';

	/**
	 * Texte sans ponctuation : l'élève touche un mot puis choisit le signe qui
	 * le suit (rien . , ? !). La majuscule s'ajoute toute seule après . ? !
	 * Réponses : { position du mot (1-based) : signe }.
	 */
	interface Props {
		words: string[];
		responses: Record<number, string | null>;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}

	let { words, responses = $bindable(), readonly = false, results = null }: Props = $props();

	const MARKS = ['.', ',', '?', '!'];
	const END = new Set(['.', '?', '!']);
	const LABELS: Record<string, string> = {
		'': 'rien',
		'.': 'point',
		',': 'virgule',
		'?': "point d'interrogation",
		'!': "point d'exclamation"
	};

	let selected = $state<number | null>(null);

	// Correction : signe attendu / donné par position.
	const byPos = $derived(new Map((results ?? []).map((r) => [r.position, r])));

	/** Signe qui détermine la majuscule du mot suivant. */
	function markAfter(pos: number): string | null {
		if (readonly) {
			const r = byPos.get(pos);
			return r && r.correct ? r.correct : null;
		}
		return responses[pos] ?? null;
	}

	function display(i: number): string {
		const w = words[i];
		const cap = i === 0 || END.has(markAfter(i) ?? '');
		return cap ? w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1) : w;
	}

	function setMark(mark: string) {
		if (selected === null) return;
		responses[selected] = mark || null;
	}

	function onKey(e: KeyboardEvent) {
		if (readonly || selected === null) return;
		if (MARKS.includes(e.key)) {
			setMark(e.key);
			e.preventDefault();
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			setMark('');
			e.preventDefault();
		} else if (e.key === 'ArrowRight' && selected < words.length) {
			selected++;
			e.preventDefault();
		} else if (e.key === 'ArrowLeft' && selected > 1) {
			selected--;
			e.preventDefault();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<p class="punct-text">
	{#each words as _, i (i)}
		{@const pos = i + 1}
		{@const r = byPos.get(pos)}
		{@const given = readonly ? (r?.given ?? responses[pos] ?? null) : (responses[pos] ?? null)}
		<span class="unit"
			><button
			type="button"
			class="word"
			class:active={!readonly && selected === pos}
			disabled={readonly}
			onclick={() => (selected = selected === pos ? null : pos)}
			aria-label={`${words[i]}${given ? `, suivi de : ${LABELS[given]}` : ''}`}>{display(i)}</button
		>{#if readonly && r}{#if r.extra}<span class="mark wrong" title="Pas de ponctuation ici">{r.given}</span
				>{:else if r.ok}<span class="mark right">{r.given}</span>{:else}{#if r.given}<span
						class="mark wrong">{r.given}</span
					>{/if}<span class="mark missed" title="Il manquait : {LABELS[r.correct]}">{r.correct}</span
				>{/if}{:else if given}<span class="mark" class:pending={!readonly}>{given}</span>{/if}</span
		>{' '}
	{/each}
</p>

{#if !readonly}
	<div class="toolbar" class:hidden={selected === null} aria-live="polite">
		{#if selected !== null}
			<span class="toolbar-label">Après « {words[selected - 1]} » :</span>
			<div class="toolbar-buttons">
				{#each ['', ...MARKS] as m (m)}
					<button
						type="button"
						class="mark-btn"
						class:current={(responses[selected] ?? '') === m}
						title={LABELS[m]}
						onclick={() => setMark(m)}>{m || 'rien'}</button
					>
				{/each}
			</div>
		{/if}
	</div>
	<p class="muted small help">
		Touche un mot, puis choisis le signe qui le suit. Au clavier : flèches pour changer de mot,
		<kbd>.</kbd> <kbd>,</kbd> <kbd>?</kbd> <kbd>!</kbd> pour placer un signe, <kbd>⌫</kbd> pour l'enlever.
	</p>
{/if}

<style>
	.punct-text {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.15em;
		line-height: 2.1;
	}
	/* Mot + signe insécables : le signe ne part jamais seul à la ligne. */
	.unit {
		white-space: nowrap;
	}
	.word {
		width: auto;
		display: inline;
		font: inherit;
		color: inherit;
		background: transparent;
		border: none;
		border-radius: 3px;
		padding: 1px 2px;
		margin: 0;
		cursor: pointer;
	}
	.word:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.08);
	}
	.word.active {
		background: rgba(47, 93, 177, 0.18);
		outline: 2px solid var(--color-primary);
	}
	.word:disabled {
		cursor: default;
		opacity: 1;
	}
	.mark {
		font-weight: 700;
		padding: 0 2px;
	}
	.mark.pending {
		color: var(--color-primary);
	}
	.mark.right {
		color: var(--color-success);
	}
	.mark.wrong {
		color: var(--color-error);
		text-decoration: line-through;
	}
	.mark.missed {
		color: var(--color-success);
		background: rgba(46, 139, 87, 0.15);
		border-radius: 3px;
	}
	.toolbar {
		position: sticky;
		bottom: 8px;
		margin-top: var(--space-3, 12px);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}
	.toolbar.hidden {
		visibility: hidden;
	}
	.toolbar-label {
		font-size: 0.95em;
	}
	.toolbar-buttons {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.mark-btn {
		width: auto;
		min-width: 2.6em;
		padding: 4px 10px;
		font-size: 1.1em;
		font-weight: 700;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
	}
	/* Le survol global des boutons (fond plein) resterait collé après un tap. */
	.mark-btn:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.1);
		border-color: var(--color-primary);
		color: var(--color-text);
	}
	.mark-btn.current,
	.mark-btn.current:hover:not(:disabled) {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}
	.small {
		font-size: 0.85em;
	}
	.help {
		margin: 6px 0 0;
	}
	kbd {
		font-family: inherit;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		padding: 0 4px;
	}
</style>
