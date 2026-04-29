<script lang="ts">
	import BlankSelect from './BlankSelect.svelte';
	import type { PerBlank } from '$lib/api/correct';

	interface Props {
		text: string;
		blankPositions: number[];
		options: string[];
		responses: Record<number, string | null>;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}

	let { text, blankPositions, options, responses = $bindable(), readonly = false, results = null }: Props =
		$props();

	type Segment = { kind: 'text'; value: string } | { kind: 'blank'; position: number };

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
				out.push({ kind: 'blank', position: pos });
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

	function blankCorrect(pos: number): string {
		const r = results?.find((b) => b.position === pos);
		return r?.correct ?? '';
	}
</script>

<p class="exercise-text">
	{#each segments as seg, i (i)}
		{#if seg.kind === 'text'}{seg.value}{:else}<BlankSelect
				position={seg.position}
				{options}
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
		line-height: 2;
		white-space: pre-wrap;
	}
</style>
