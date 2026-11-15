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

	// Surlignage au glisser : on appuie sur un mot et on glisse jusqu'à un autre
	// mot de la même phrase. Le mot de départ décide : s'il n'était pas
	// sélectionné, la plage est sélectionnée, sinon elle est désélectionnée.
	// Sans déplacement hors du mot de départ, c'est le clic habituel (toggle).
	let drag: { pos: number; anchor: number; add: boolean; base: Set<number>; moved: boolean } | null = null;
	let suppressClick = false;

	function wordAt(x: number, y: number, pos: number): number | null {
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('button.word');
		if (!el || Number(el.dataset.pos) !== pos) return null;
		return Number(el.dataset.i);
	}

	function onPointerDown(e: PointerEvent, pos: number, i: number) {
		if (readonly || (e.pointerType === 'mouse' && e.button !== 0)) return;
		suppressClick = false;
		const base = parse(responses[pos]);
		drag = { pos, anchor: i, add: !base.has(i), base, moved: false };
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', endDrag);
		window.addEventListener('pointercancel', endDrag);
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		const cur = wordAt(e.clientX, e.clientY, drag.pos);
		if (cur === null || (!drag.moved && cur === drag.anchor)) return;
		drag.moved = true;
		const sel = new Set(drag.base);
		const [a, b] = cur < drag.anchor ? [cur, drag.anchor] : [drag.anchor, cur];
		for (let k = a; k <= b; k++) {
			if (drag.add) sel.add(k);
			else sel.delete(k);
		}
		responses[drag.pos] = sel.size ? [...sel].sort((x, y) => x - y).join(',') : null;
	}

	function endDrag() {
		// Après un vrai glisser, le click éventuel (si on relâche sur le mot de
		// départ) ne doit pas refaire un toggle.
		if (drag?.moved) suppressClick = true;
		drag = null;
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', endDrag);
		window.removeEventListener('pointercancel', endDrag);
	}

	function onWordClick(pos: number, i: number) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		toggle(pos, i);
	}

	function resultFor(pos: number) {
		return results?.find((r) => r.position === pos) ?? null;
	}
</script>

{#if !readonly}
	<p class="muted small help">
		Clique sur chaque mot du groupe, ou glisse d'un mot à l'autre pour tout surligner d'un coup
		(glisser depuis un mot déjà choisi enlève la sélection).
	</p>
{/if}

<ol class="span-list">
	{#each items as item (item.position)}
		{@const r = resultFor(item.position)}
		{@const chosen = parse(readonly ? (r?.given_indices ?? responses[item.position]) : responses[item.position])}
		{@const expected = parse(item.answer)}
		<li class:ok={r?.ok === true} class:ko={r?.ok === false}>
			<p class="sentence" class:interactive={!readonly}>
				{#each item.tokens ?? [] as tok, i (i)}
					{@const sel = chosen.has(i)}
					{@const exp = expected.has(i)}
					<button
						type="button"
						class="word"
						class:selected={!readonly && sel}
						class:join-next={!readonly && sel && chosen.has(i + 1)}
						class:right={readonly && sel && exp}
						class:missed={readonly && !sel && exp}
						class:wrong={readonly && sel && !exp}
						aria-pressed={sel}
						disabled={readonly}
						data-pos={item.position}
						data-i={i}
						onpointerdown={(e) => onPointerDown(e, item.position, i)}
						onclick={() => onWordClick(item.position, i)}>{tok}</button
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
	.help {
		margin: 0 0 var(--space-3, 12px);
		font-size: 0.88em;
	}
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
	/* Glisser pour surligner : pas de sélection de texte parasite, et au
	   tactile le glissé horizontal surligne, le vertical fait défiler. */
	.sentence.interactive {
		user-select: none;
		-webkit-user-select: none;
	}
	.sentence.interactive .word {
		touch-action: pan-y;
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
	/* Deux mots choisis consécutifs : le premier s'étend sous l'espace qui le
	   suit (padding + marge négative, donc mise en page inchangée), pour un
	   surlignage d'un seul tenant. */
	.word.selected.join-next {
		padding-right: calc(2px + 0.3em);
		margin-right: -0.3em;
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
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
