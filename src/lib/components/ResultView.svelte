<script lang="ts">
	import { base } from '$app/paths';
	import type { CorrectionResult } from '$lib/api/correct';

	interface Props {
		result: CorrectionResult;
		ruleId: string;
		theme: string;
		gradeLevel: string;
		numBlanks: number;
	}

	let { result, ruleId, theme, gradeLevel, numBlanks }: Props = $props();

	const note = $derived(Math.round((result.score / result.score_total) * 200) / 10);

	function buildTargetedUrl(targetRuleId: string) {
		const params = new URLSearchParams({
			rule_id: targetRuleId,
			theme,
			grade_level: gradeLevel,
			num_blanks: String(numBlanks)
		});
		return `${base}/new?${params.toString()}`;
	}
</script>

<div class="result-card stack">
	<header class="result-header">
		<div class="grade">
			<span class="note">{note.toFixed(1)}</span><span class="muted">/20</span>
		</div>
		<div class="ratio muted">
			{result.score} / {result.score_total} bonnes réponses
		</div>
	</header>

	<section class="stack">
		<h3>Détail par règle</h3>
		<ul class="breakdown">
			{#each Object.entries(result.per_rule_breakdown) as [rule, { ok, total }] (rule)}
				{@const ratio = ok / total}
				{@const status = ratio === 1 ? '✅' : ratio >= 0.6 ? '🟡' : '⚠️'}
				<li>
					<span class="rule-name">{rule}</span>
					<span class="rule-score">{ok}/{total}</span>
					<span class="rule-status">{status}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="stack">
		<h3>Appréciation</h3>
		<p class="appreciation">{result.appreciation}</p>
	</section>

	<section class="actions">
		{#if result.suggested_next_rule_id}
			<a href={buildTargetedUrl(result.suggested_next_rule_id)}>
				<button type="button">Lance un exercice ciblé sur {result.suggested_next_rule_id}</button>
			</a>
		{/if}
		<a href={`${base}/new`}>
			<button type="button" class="secondary">Nouvel exercice libre</button>
		</a>
		<a href={`${base}/`}>
			<button type="button" class="secondary">Retour à l'accueil</button>
		</a>
	</section>
</div>

<style>
	.result-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: var(--space-6);
		box-shadow: var(--shadow-md);
	}
	.result-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.grade .note {
		font-family: var(--font-serif);
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-primary);
	}
	.breakdown {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.breakdown li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border);
	}
	.breakdown li:last-child {
		border-bottom: none;
	}
	.rule-name {
		font-weight: 500;
	}
	.appreciation {
		background: rgba(47, 93, 177, 0.06);
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		border-left: 3px solid var(--color-primary);
		font-style: italic;
	}
	.actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
</style>
