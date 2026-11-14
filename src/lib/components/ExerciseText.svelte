<script lang="ts">
	import BlankSelect from './BlankSelect.svelte';
	import BlankInput from './BlankInput.svelte';
	import type { PerBlank } from '$lib/api/correct';
	import { startsSentence } from '$lib/confusion';

	interface Props {
		text: string;
		blankPositions: number[];
		/** 'select' : menu déroulant (homophones) ; 'input' : saisie au clavier. */
		mode?: 'select' | 'input';
		/** Options du menu pour un trou donné (groupe de confusion ou tous les candidats). */
		optionsFor?: (position: number) => string[];
		/** Indice affiché à côté d'un champ de saisie (ex. l'infinitif). */
		hintFor?: (position: number) => string;
		responses: Record<number, string | null>;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}

	let {
		text,
		blankPositions,
		mode = 'select',
		optionsFor = () => [],
		hintFor = () => '',
		responses = $bindable(),
		readonly = false,
		results = null
	}: Props = $props();

	type Segment =
		| { kind: 'text'; value: string }
		| { kind: 'blank'; position: number; capitalize: boolean };

	const segments: Segment[] = $derived.by(() => {
		const positionSet = new Set(blankPositions);
		const out: Segment[] = [];
		let lastIndex = 0;
		const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
		for (const m of matches) {
			const idx = m.index ?? 0;
			if (idx > lastIndex) {
				out.push({ kind: 'text', value: text.slice(lastIndex, idx) });
			}
			const pos = Number(m[1]);
			if (positionSet.has(pos)) {
				out.push({ kind: 'blank', position: pos, capitalize: startsSentence(text.slice(0, idx)) });
			} else {
				out.push({ kind: 'text', value: m[0] });
			}
			lastIndex = idx + m[0].length;
		}
		if (lastIndex < text.length) {
			out.push({ kind: 'text', value: text.slice(lastIndex) });
		}
		return out;
	});

	function blankState(pos: number): 'neutral' | 'correct' | 'incorrect' {
		if (!results) return 'neutral';
		const r = results.find((b) => b.position === pos);
		if (!r) return 'neutral';
		return r.ok ? 'correct' : 'incorrect';
	}

	function blankVariant(pos: number): boolean {
		return !!results?.find((b) => b.position === pos)?.variant;
	}

	function blankCorrect(pos: number): string {
		const r = results?.find((b) => b.position === pos);
		return r?.correct ?? '';
	}
</script>

<p class="exercise-text">
	{#each segments as seg, i (i)}
		{#if seg.kind === 'text'}{seg.value}{:else if mode === 'input'}<BlankInput
				position={seg.position}
				hint={hintFor(seg.position)}
				bind:value={responses[seg.position]}
				{readonly}
				state={blankState(seg.position)}
				correct={blankCorrect(seg.position)}
				variant={blankVariant(seg.position)}
			/>{:else}<BlankSelect
				position={seg.position}
				options={optionsFor(seg.position)}
				capitalize={seg.capitalize}
				bind:value={responses[seg.position]}
				{readonly}
				state={blankState(seg.position)}
				correct={blankCorrect(seg.position)}
			/>{/if}
	{/each}
</p>

<style>
	.exercise-text {
		font-family: var(--font-serif);
		font-size: 1.15rem;
		line-height: 1.8;
		white-space: pre-wrap;
	}
</style>
