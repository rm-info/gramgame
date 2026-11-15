<script lang="ts">
	import { onMount } from 'svelte';
	import { pb, errorMessage } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { activeUsername } from '$lib/active-username.svelte';
	import { callGram } from '$lib/api/_helpers';

	/**
	 * Liens élève ↔ parent / prof. Un côté demande (par nom d'utilisateur),
	 * l'autre accepte. Parent et enfant à la même adresse mail : lien direct.
	 */
	interface Props {
		/** Appelé quand la liste change (pour recharger le suivi). */
		onchange?: () => void;
	}
	let { onchange }: Props = $props();

	interface LinkRow {
		id: string;
		student: string;
		supervisor: string;
		kind: 'parent' | 'prof';
		status: 'pending' | 'accepted';
		initiated_by: string;
		student_username: string;
		supervisor_username: string;
	}

	let links = $state<LinkRow[]>([]);
	let loading = $state(true);
	let username = $state('');
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let error = $state<string | null>(null);

	const me = $derived(auth.user?.id ?? '');
	const isStudent = $derived(activeUsername.isStudent);
	const KIND: Record<string, string> = { parent: 'parent', prof: 'professeur' };

	/** Le nom de l'autre personne du lien. */
	const other = (l: LinkRow) => (l.student === me ? l.supervisor_username : l.student_username);
	const otherLabel = (l: LinkRow) => (l.student === me ? KIND[l.kind] : 'élève');

	const accepted = $derived(links.filter((l) => l.status === 'accepted'));
	const incoming = $derived(links.filter((l) => l.status === 'pending' && l.initiated_by !== me));
	const outgoing = $derived(links.filter((l) => l.status === 'pending' && l.initiated_by === me));

	async function load() {
		loading = true;
		try {
			links = (await pb.collection('links').getFullList({ sort: 'created' })) as unknown as LinkRow[];
		} catch (e) {
			error = errorMessage(e);
		}
		loading = false;
	}

	onMount(load);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const u = username.trim().toLowerCase();
		if (!u) return;
		busy = true;
		msg = null;
		error = null;
		try {
			const res = await callGram<{ status: string }>('links', { username: u });
			msg =
				res.status === 'accepted'
					? `Lien établi avec « ${u} ».`
					: `Demande envoyée à « ${u} » : elle apparaîtra dans son espace, à accepter.`;
			username = '';
			await load();
			onchange?.();
		} catch (e) {
			error = (e as Error).message;
		}
		busy = false;
	}

	async function accept(l: LinkRow) {
		busy = true;
		error = null;
		try {
			await callGram(`links/${l.id}/accept`, {});
			msg = `Lien établi avec « ${other(l)} ».`;
			await load();
			onchange?.();
		} catch (e) {
			error = (e as Error).message;
		}
		busy = false;
	}

	async function remove(l: LinkRow, verb: string) {
		if (verb === 'retirer' && !confirm(`Retirer le lien avec « ${other(l)} » ?`)) return;
		busy = true;
		error = null;
		try {
			await pb.collection('links').delete(l.id);
			msg = null;
			await load();
			onchange?.();
		} catch (e) {
			error = errorMessage(e);
		}
		busy = false;
	}
</script>

<div class="links stack">
	{#if loading}
		<p class="muted">Chargement…</p>
	{:else}
		{#if incoming.length}
			<div class="incoming">
				<h3>Demandes à accepter</h3>
				<ul>
					{#each incoming as l (l.id)}
						<li>
							<span>
								<strong>{other(l)}</strong>
								{#if isStudent}({KIND[l.kind]}) veut suivre tes progrès.{:else}(élève) veut que tu suives ses
									progrès.{/if}
							</span>
							<span class="actions">
								<button type="button" disabled={busy} onclick={() => accept(l)}>Accepter</button>
								<button type="button" class="secondary" disabled={busy} onclick={() => remove(l, 'refuser')}
									>Refuser</button
								>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if accepted.length}
			<ul>
				{#each accepted as l (l.id)}
					<li>
						<span><strong>{other(l)}</strong> <span class="muted">({otherLabel(l)})</span></span>
						<button type="button" class="link danger" disabled={busy} onclick={() => remove(l, 'retirer')}
							>Retirer</button
						>
					</li>
				{/each}
			</ul>
		{:else if !incoming.length}
			<p class="muted">
				{isStudent ? "Aucun parent ni professeur ne suit encore tes progrès." : 'Aucun élève lié pour l\'instant.'}
			</p>
		{/if}

		{#if outgoing.length}
			<ul class="outgoing">
				{#each outgoing as l (l.id)}
					<li>
						<span class="muted">Demande envoyée à <strong>{other(l)}</strong> — en attente.</span>
						<button type="button" class="link" disabled={busy} onclick={() => remove(l, 'annuler')}>Annuler</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if !activeUsername.isAdmin}
			<form class="add" onsubmit={add}>
				<label for="link-username">
					{isStudent ? 'Ajouter un parent ou un professeur' : 'Ajouter un élève'} (son nom d'utilisateur)
				</label>
				<div class="add-row">
					<input
						id="link-username"
						type="text"
						bind:value={username}
						placeholder="nom d'utilisateur"
						autocapitalize="off"
						spellcheck="false"
						maxlength="20"
					/>
					<button type="submit" disabled={busy || !username.trim()}>Ajouter</button>
				</div>
				<p class="muted small">
					{isStudent
						? "La personne devra accepter. Si c'est un parent inscrit avec la même adresse mail que toi, le lien est immédiat."
						: "L'élève devra accepter dans son profil. Si c'est ton enfant inscrit avec la même adresse mail que toi, le lien est immédiat."}
				</p>
			</form>
		{/if}

		{#if msg}<p class="ok">{msg}</p>{/if}
		{#if error}<p class="error">{error}</p>{/if}
	{/if}
</div>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3, 12px);
		flex-wrap: wrap;
		padding: var(--space-2, 8px) 0;
		border-bottom: 1px solid var(--color-border);
	}
	li:last-child {
		border-bottom: none;
	}
	h3 {
		margin: 0 0 4px;
		font-size: 1em;
	}
	.incoming {
		padding: var(--space-3, 12px);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		background: rgba(47, 93, 177, 0.05);
	}
	.actions {
		display: flex;
		gap: 6px;
	}
	.actions button {
		width: auto;
		padding: 4px 12px;
	}
	.add label {
		font-weight: 600;
	}
	.add-row {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
	.add-row input {
		flex: 1;
		min-width: 0;
	}
	.add-row button {
		width: auto;
	}
	.small {
		font-size: 0.85em;
		margin: 4px 0 0;
	}
	button.link {
		width: auto;
		background: transparent;
		color: var(--color-primary);
		border: none;
		padding: 2px 6px;
	}
	button.link.danger {
		color: var(--color-error);
	}
	button.link:hover:not(:disabled) {
		background: rgba(47, 93, 177, 0.08);
		color: var(--color-primary);
	}
	button.link.danger:hover:not(:disabled) {
		background: rgba(184, 51, 60, 0.1);
		color: var(--color-error);
	}
	.ok {
		color: var(--color-success);
		margin: 0;
	}
</style>
