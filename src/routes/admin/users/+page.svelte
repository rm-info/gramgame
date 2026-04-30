<script lang="ts">
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { activeUsername, type Role } from '$lib/active-username.svelte';

	interface UserRow {
		username: string;
		real_email: string;
		role: Role;
		created_at: string;
		user_id: string | null;
	}

	let users = $state<UserRow[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let updating = $state<Record<string, boolean>>({});
	let updateMsg = $state<string | null>(null);

	const ROLES: Role[] = ['user', 'prof', 'admin'];

	$effect(() => {
		if (!activeUsername.isAdmin) return;
		loading = true;
		loadError = null;
		supabase
			.from('usernames')
			.select('username, real_email, role, created_at, user_id')
			.order('created_at', { ascending: true })
			.then(({ data, error }) => {
				loading = false;
				if (error) {
					loadError = error.message;
					return;
				}
				users = (data ?? []) as UserRow[];
			});
	});

	async function changeRole(username: string, newRole: Role) {
		updating[username] = true;
		updateMsg = null;
		const { error } = await supabase
			.from('usernames')
			.update({ role: newRole })
			.eq('username', username);
		updating[username] = false;
		if (error) {
			updateMsg = `Échec : ${error.message}`;
			return;
		}
		const u = users.find((x) => x.username === username);
		if (u) u.role = newRole;
		updateMsg = `Rôle de ${username} mis à jour : ${newRole}.`;

		// Si on vient de modifier son propre rôle, recharger l'état pour ne pas
		// avoir d'info périmée dans la nav (exemple : auto-démotion d'admin).
		if (username === activeUsername.username) {
			await activeUsername.load();
		}
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<section class="container stack">
	<header class="stack">
		<a href={`${base}/admin`} class="back">← Retour à l'admin</a>
		<h1>Utilisateurs</h1>
		<p class="muted">
			Modifie le rôle d'un utilisateur. Un <strong>professeur</strong> peut éditer le texte des
			exercices générés. Un <strong>administrateur</strong> peut faire la même chose, plus gérer
			les rôles.
		</p>
	</header>

	{#if loading}
		<p class="muted">Chargement…</p>
	{:else if loadError}
		<p class="error">Échec du chargement : {loadError}</p>
	{:else if users.length === 0}
		<p class="muted">Aucun utilisateur trouvé.</p>
	{:else}
		<div class="card">
			<table class="users-table">
				<thead>
					<tr>
						<th>Username</th>
						<th>Email</th>
						<th>Rôle</th>
						<th>Inscrit le</th>
						<th>Statut</th>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.username)}
						<tr class:current={u.username === activeUsername.username}>
							<td><strong>{u.username}</strong></td>
							<td class="muted">{u.real_email}</td>
							<td>
								<select
									value={u.role}
									disabled={!!updating[u.username]}
									onchange={(e) =>
										changeRole(u.username, (e.currentTarget as HTMLSelectElement).value as Role)}
								>
									{#each ROLES as r (r)}
										<option value={r}>{r}</option>
									{/each}
								</select>
							</td>
							<td class="muted">{formatDate(u.created_at)}</td>
							<td class="muted">
								{#if u.user_id}
									<span class="ok">activé</span>
								{:else}
									<span class="pending">en attente</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if updateMsg}
		<p class="muted">{updateMsg}</p>
	{/if}
</section>

<style>
	.back {
		font-size: 0.9em;
	}
	.users-table {
		width: 100%;
		border-collapse: collapse;
	}
	.users-table th,
	.users-table td {
		text-align: left;
		padding: var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}
	.users-table th {
		font-size: 0.85em;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}
	.users-table tbody tr:last-child td {
		border-bottom: none;
	}
	.users-table tr.current {
		background: rgba(47, 93, 177, 0.04);
	}
	.users-table select {
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.ok {
		color: var(--color-success);
	}
	.pending {
		color: var(--color-warning);
	}
</style>
