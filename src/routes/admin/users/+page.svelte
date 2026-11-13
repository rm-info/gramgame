<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { pb, errorMessage, type UserRecord } from '$lib/pb';
	import { activeUsername, type Role } from '$lib/active-username.svelte';

	interface UserRow {
		id: string;
		username: string;
		real_email: string;
		role: Role;
		created_at: string;
		/** false = code jamais saisi (compte jamais activé) */
		verified: boolean;
	}

	async function fetchUsers(): Promise<UserRow[]> {
		const list = await pb.collection('users').getFullList<UserRecord>({ sort: 'created' });
		return list.map((u) => ({
			id: u.id,
			username: u.username,
			real_email: u.real_email,
			role: u.role,
			created_at: u.created,
			verified: u.verified
		}));
	}

	let users = $state<UserRow[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let updating = $state<Record<string, boolean>>({});
	let updateMsg = $state<string | null>(null);

	const ROLES: Role[] = ['user', 'prof', 'admin'];

	// Garde admin-only : la /admin/+layout autorise prof+admin pour le dashboard,
	// mais cette page-ci est strictement admin.
	$effect(() => {
		if (!activeUsername.loaded) return;
		if (!activeUsername.isAdmin) {
			goto(`${base}/admin`, { replaceState: true });
		}
	});

	$effect(() => {
		if (!activeUsername.isAdmin) return;
		loading = true;
		loadError = null;
		fetchUsers()
			.then((list) => {
				users = list;
			})
			.catch((e) => {
				loadError = errorMessage(e);
			})
			.finally(() => {
				loading = false;
			});
	});

	async function deleteUser(u: UserRow) {
		const status = u.verified ? 'activé' : 'en attente (jamais finalisé)';
		const ok = confirm(
			`Supprimer le compte « ${u.username} » (${u.real_email}, ${status}) ?\n\n` +
				`Tous ses exercices et tentatives seront aussi supprimés.\n` +
				`Cette action est irréversible.`
		);
		if (!ok) return;

		updating[u.username] = true;
		updateMsg = null;
		try {
			await pb.collection('users').delete(u.id);
		} catch (e) {
			updating[u.username] = false;
			updateMsg = `Échec : ${errorMessage(e)}`;
			return;
		}
		updating[u.username] = false;
		users = users.filter((x) => x.username !== u.username);
		updateMsg = `Compte « ${u.username} » supprimé.`;
	}

	async function changeRole(username: string, newRole: Role) {
		// Sanity check côté UI : pas de modification de son propre rôle
		// (le trigger 0009 empêche aussi côté DB).
		if (username === activeUsername.username) {
			updateMsg = 'Tu ne peux pas modifier ton propre rôle.';
			users = await fetchUsers().catch(() => users);
			return;
		}

		updating[username] = true;
		updateMsg = null;
		const target = users.find((x) => x.username === username);
		let failure: string | null = null;
		try {
			if (!target) throw new Error('Compte introuvable.');
			await pb.collection('users').update(target.id, { role: newRole });
		} catch (e) {
			failure = errorMessage(e);
		}
		updating[username] = false;
		if (failure) {
			updateMsg = `Échec : ${failure}`;
			users = await fetchUsers().catch(() => users);
			return;
		}
		const u = users.find((x) => x.username === username);
		if (u) u.role = newRole;
		updateMsg = `Rôle de ${username} mis à jour : ${newRole}.`;
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
		<a href={`${base}/admin`} class="back">← Retour à la gestion</a>
		<h1>Utilisateurs</h1>
		<p class="muted">
			Modifie le rôle d'un utilisateur, ou supprime un compte (notamment ceux <em>en attente</em>
			de finalisation, créés avec un email erroné). <strong>Tu ne peux pas modifier ni
				supprimer le tien</strong> — un autre administrateur doit le faire.
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
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.username)}
						{@const isSelf = u.username === activeUsername.username}
						<tr class:current={isSelf}>
							<td>
								<strong>{u.username}</strong>
								{#if isSelf}<span class="muted self-tag">(toi)</span>{/if}
							</td>
							<td class="muted">{u.real_email}</td>
							<td>
								{#if isSelf}
									<span class="role-readonly">{u.role}</span>
								{:else}
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
								{/if}
							</td>
							<td class="muted">{formatDate(u.created_at)}</td>
							<td class="muted">
								{#if u.verified}
									<span class="ok">activé</span>
								{:else}
									<span class="pending">en attente</span>
								{/if}
							</td>
							<td class="row-actions">
								{#if !isSelf}
									<button
										type="button"
										class="link danger"
										title="Supprimer ce compte"
										disabled={!!updating[u.username]}
										onclick={() => deleteUser(u)}
									>
										✕
									</button>
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
	.role-readonly {
		display: inline-block;
		padding: 4px 8px;
		background: rgba(47, 93, 177, 0.1);
		border-radius: var(--radius-sm);
		color: var(--color-primary);
	}
	.self-tag {
		margin-left: 4px;
		font-size: 0.85em;
	}
	.row-actions {
		text-align: right;
	}
	button.link {
		background: transparent;
		color: var(--color-primary);
		border: 1px solid transparent;
		padding: 4px 8px;
		font-size: 1.05em;
	}
	button.link:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.08);
	}
	button.link.danger {
		color: var(--color-error);
	}
	button.link.danger:hover:not(:disabled) {
		background: rgba(184, 51, 60, 0.1);
	}
	.ok {
		color: var(--color-success);
	}
	.pending {
		color: var(--color-warning);
	}
</style>
