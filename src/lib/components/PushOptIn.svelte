<script lang="ts">
	import { pushReminders } from '$lib/push/reminders.svelte';

	/** Activation des rappels d'évaluations par notification (élève). */
	interface Props {
		/** Version courte (page des évaluations) ou complète (profil). */
		compact?: boolean;
	}
	let { compact = false }: Props = $props();

	const s = $derived(pushReminders.status);
</script>

{#if s !== 'loading' && s !== 'unavailable' && s !== 'unsupported'}
	<div class="push" class:compact class:on={s === 'on'}>
		{#if s === 'on'}
			<p>
				🔔 <strong>Rappels activés</strong> : une notification chaque jour à 17 h 30 tant qu'une évaluation est à
				faire.
			</p>
			{#if !compact}
				<button type="button" class="link" disabled={pushReminders.busy} onclick={() => pushReminders.disable()}
					>Désactiver les rappels</button
				>
			{/if}
		{:else if s === 'off' || s === 'error'}
			<p>🔔 Reçois un rappel chaque jour à 17 h 30 tant que tu as une évaluation à faire.</p>
			<button type="button" disabled={pushReminders.busy} onclick={() => pushReminders.enable()}>
				{pushReminders.busy ? 'Activation…' : 'Me rappeler mes évaluations'}
			</button>
		{:else if s === 'ios_install'}
			<p>
				🔔 Pour recevoir un rappel de tes évaluations sur iPhone ou iPad, installe d'abord GramGame : touche
				<strong>Partager</strong> (le carré avec une flèche), puis <strong>Sur l'écran d'accueil</strong>, et ouvre
				GramGame depuis son icône.
			</p>
		{:else if s === 'denied'}
			<p>
				🔕 Les notifications sont bloquées pour GramGame. Pour recevoir les rappels, autorise-les dans les réglages de
				ton navigateur (ou de ton téléphone), puis recharge la page.
			</p>
		{:else if s === 'revoked'}
			<p class="muted">Les rappels par notification ne sont plus disponibles pour le moment.</p>
		{/if}
		{#if pushReminders.error && s !== 'on'}
			<p class="error small">Impossible d'activer les rappels : {pushReminders.error}</p>
		{/if}
		{#if !compact && (s === 'on' || s === 'off')}
			<p class="muted small">
				Les notifications passent par Apple, Google ou Mozilla, qui ne garantissent ni leur arrivée ni l'heure exacte.
				Aucune information te concernant n'est envoyée au service de rappels : juste un numéro au hasard et une heure.
			</p>
		{/if}
	</div>
{/if}

<style>
	.push {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		background: rgba(47, 93, 177, 0.05);
	}
	.push.on {
		border-color: var(--color-border);
		background: transparent;
	}
	.push p {
		margin: 0;
	}
	.push button {
		width: auto;
		align-self: flex-start;
	}
	.small {
		font-size: 0.88em;
	}
	button.link {
		background: transparent;
		color: var(--color-error);
		border: none;
		padding: 2px 0;
	}
	button.link:hover:not(:disabled) {
		background: transparent;
		text-decoration: underline;
		color: var(--color-error);
	}
</style>
