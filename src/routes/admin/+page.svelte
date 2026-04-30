<script lang="ts">
	import { base } from '$app/paths';
</script>

<section class="container stack">
	<h1>Administration</h1>
	<p class="muted">Outils de gestion réservés aux administrateurs.</p>

	<div class="grid">
		<a href={`${base}/admin/users`} class="card-link">
			<h2>Utilisateurs</h2>
			<p class="muted">
				Lister les comptes, attribuer le rôle <strong>professeur</strong> ou
				<strong>administrateur</strong>.
			</p>
		</a>
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
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}
	.card-link:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-md);
	}
	.card-link h2 {
		margin-top: 0;
	}
</style>
