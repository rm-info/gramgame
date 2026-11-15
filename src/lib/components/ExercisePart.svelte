<script lang="ts">
	import type { BlankRow, ExerciseExtra } from '$lib/data';
	import type { PerBlank } from '$lib/api/correct';
	import type { PaperItem, PartRule } from '$lib/api/evals';
	import { optionsForBlank } from '$lib/confusion';
	import ExerciseText from './ExerciseText.svelte';
	import QcmList from './QcmList.svelte';
	import SpanSelectList from './SpanSelectList.svelte';
	import PunctuationText from './PunctuationText.svelte';
	import TransformList from './TransformList.svelte';

	/**
	 * Une partie d'évaluation : le sujet (sans réponses) pendant l'épreuve, ou
	 * la copie corrigée ensuite (sujet complet + résultats).
	 */
	interface Props {
		rule: PartRule;
		text: string;
		hardMode: boolean;
		/** Sujet de l'élève (pendant l'épreuve). */
		items?: PaperItem[];
		/** Sujet complet (correction). */
		blanks?: BlankRow[];
		extra: ExerciseExtra | null;
		responses: Record<number, string | null>;
		readonly?: boolean;
		results?: PerBlank[] | null;
	}
	let {
		rule,
		text,
		hardMode,
		items = [],
		blanks = [],
		extra,
		responses = $bindable(),
		readonly = false,
		results = null
	}: Props = $props();

	const type = $derived(rule.rule_type);
	// Les composants attendent des BlankRow : en épreuve, sans réponse (correct vide).
	const rows = $derived<BlankRow[]>(
		readonly ? blanks : items.map((it) => ({ ...it, correct: '' }) as BlankRow)
	);
	const positions = $derived(rows.map((b) => b.position).sort((a, b) => a - b));

	function optionsFor(position: number): string[] {
		if (readonly) {
			const b = blanks.find((x) => x.position === position);
			return optionsForBlank(rule, b?.correct ?? '', hardMode);
		}
		return items.find((x) => x.position === position)?.options ?? [];
	}
	function hintFor(position: number): string {
		return rows.find((x) => x.position === position)?.verb ?? '';
	}
</script>

{#if type === 'transform'}
	<p class="consigne">
		{hardMode
			? 'Écris chaque phrase transformée comme demandé, avec la bonne ponctuation.'
			: 'Pour chaque phrase, choisis la bonne transformation.'}
	</p>
	<TransformList items={rows} bind:responses writing={hardMode} {readonly} {results} />
{:else if type === 'span'}
	<p class="consigne">{text}</p>
	<SpanSelectList items={rows} bind:responses {readonly} {results} />
{:else if type === 'punctuation'}
	<p class="consigne">
		Ce texte a perdu sa ponctuation : remets les points, les virgules, les points d'interrogation et
		les points d'exclamation.
	</p>
	<PunctuationText words={extra?.words ?? []} bind:responses {readonly} {results} />
{:else if type === 'qcm'}
	<p class="consigne">
		{hardMode && rule.config?.hard_consigne ? rule.config.hard_consigne : text}
	</p>
	<QcmList items={rows} options={rule.candidates} bind:responses {readonly} {results} />
{:else}
	{#if type === 'free_text'}
		<p class="consigne">
			Écris chaque verbe entre parenthèses au <strong>présent</strong>, accordé avec son sujet.
		</p>
	{:else if hardMode}
		<p class="consigne">Choisis le bon mot dans chaque trou (tous les mots sont proposés).</p>
	{:else}
		<p class="consigne">Choisis le bon mot dans chaque trou.</p>
	{/if}
	<ExerciseText
		{text}
		blankPositions={positions}
		mode={type === 'free_text' ? 'input' : 'select'}
		{optionsFor}
		{hintFor}
		bind:responses
		{readonly}
		{results}
	/>
{/if}

<style>
	.consigne {
		margin: 0 0 var(--space-3, 12px);
		font-weight: 500;
	}
</style>
