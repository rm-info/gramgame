<script lang="ts">
	import { base } from '$app/paths';
	import { activeUsername } from '$lib/active-username.svelte';
</script>

<section class="container stack">
	<h1>Gestion</h1>
	<p class="muted">
		Outils de pilotage de l'application.
		{#if activeUsername.isAdmin}
			Tu as les droits administrateur.
		{:else if activeUsername.role === 'prof'}
			Tu as les droits professeur (édition des exercices).
		{/if}
	</p>

	<div class="grid">
		<a href={`${base}/admin/exercises`} class="card-link">
			<h2>Exercices</h2>
			<p class="muted">
				Lister tous les exercices générés et les éditer (corriger un texte, ajuster les bonnes
				réponses, supprimer un trou mal placé).
			</p>
		</a>

		{#if activeUsername.isAdmin}
			<a href={`${base}/admin/users`} class="card-link">
				<h2>Utilisateurs</h2>
				<p class="muted">
					Lister les comptes, attribuer le rôle <strong>professeur</strong> ou
					<strong>administrateur</strong>.
				</p>
			</a>

			<a href={`${base}/admin/rules`} class="card-link">
				<h2>Règles de grammaire</h2>
				<p class="muted">
					Catalogue des règles disponibles à la pratique. Ajouter, dupliquer, éditer (candidats,
					exemples), supprimer.
				</p>
			</a>
		{/if}
	</div>
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}
	.card-link {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
		color: inherit;
		text-decoration: none;
		transition:
			border-color 120ms ease,
			box-shadow 120ms ease;
	}
	.card-link:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-md);
	}
	.card-link h2 {
		margin-top: 0;
	}
</style>
