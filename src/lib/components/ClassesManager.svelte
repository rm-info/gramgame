<script lang="ts">
	import { onMount } from 'svelte';
	import { pb, errorMessage } from '$lib/pb';
	import { auth } from '$lib/auth.svelte';
	import { callGram } from '$lib/api/_helpers';

	/**
	 * Classes du prof : création, code à donner aux élèves (régénérable),
	 * liste des élèves inscrits, retrait d'un élève, renommage, suppression.
	 */
	interface Props {
		/** Appelé quand les classes ou leurs élèves changent (pour recharger le suivi). */
		onchange?: () => void;
	}
	let { onchange }: Props = $props();

	interface ClassRow {
		id: string;
		name: string;
		code: string;
	}
	interface MemberRow {
		id: string;
		class: string;
		student_username: string;
	}

	let classes = $state<ClassRow[]>([]);
	let members = $state<MemberRow[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let newName = $state('');
	let editing = $state<string | null>(null);
	let editName = $state('');
	let copied = $state<string | null>(null);
	let msg = $state<string | null>(null);
	let error = $state<string | null>(null);

	const membersOf = (id: string) => members.filter((m) => m.class === id);

	async function load() {
		try {
			const me = auth.user?.id ?? '';
			classes = (await pb.collection('classes').getFullList({
				filter: pb.filter('teacher = {:me}', { me }),
				sort: 'name'
			})) as unknown as ClassRow[];
			members = (await pb.collection('class_members').getFullList({
				filter: pb.filter('class.teacher = {:me}', { me }),
				sort: 'student_username'
			})) as unknown as MemberRow[];
		} catch (e) {
			error = errorMessage(e);
		}
		loading = false;
	}

	onMount(load);

	async function run(fn: () => Promise<unknown>, changed = true) {
		busy = true;
		error = null;
		msg = null;
		try {
			await fn();
			await load();
			if (changed) onchange?.();
		} catch (e) {
			error = errorMessage(e);
		}
		busy = false;
	}

	function create(event: SubmitEvent) {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		run(async () => {
			const c = (await pb.collection('classes').create({ name })) as unknown as ClassRow;
			newName = '';
			msg = `Classe « ${c.name} » créée. Donne le code ${c.code} à tes élèves.`;
		});
	}

	function startRename(c: ClassRow) {
		editing = c.id;
		editName = c.name;
	}

	function saveRename(event: SubmitEvent, c: ClassRow) {
		event.preventDefault();
		const name = editName.trim();
		if (!name || name === c.name) {
			editing = null;
			return;
		}
		run(async () => {
			await pb.collection('classes').update(c.id, { name });
			editing = null;
		});
	}

	function newCode(c: ClassRow) {
		if (
			!confirm(
				`Générer un nouveau code pour « ${c.name} » ? L'ancien (${c.code}) ne marchera plus. Les élèves déjà inscrits restent dans la classe.`
			)
		)
			return;
		run(() => callGram(`classes/${c.id}/code`, {}), false);
	}

	function removeClass(c: ClassRow) {
		const n = membersOf(c.id).length;
		if (
			!confirm(
				`Supprimer la classe « ${c.name} » ?${n ? ` Ses ${n} élève${n > 1 ? 's' : ''} n'y ser${n > 1 ? 'ont' : 'a'} plus inscrit${n > 1 ? 's' : ''} (leurs résultats sont conservés).` : ''}`
			)
		)
			return;
		run(() => pb.collection('classes').delete(c.id));
	}

	function removeMember(m: MemberRow, c: ClassRow) {
		if (!confirm(`Retirer « ${m.student_username} » de la classe « ${c.name} » ?`)) return;
		run(() => pb.collection('class_members').delete(m.id));
	}

	async function copy(c: ClassRow) {
		try {
			await navigator.clipboard.writeText(c.code);
			copied = c.id;
			setTimeout(() => {
				if (copied === c.id) copied = null;
			}, 2000);
		} catch {
			// Presse-papiers indisponible (http, vieux navigateur) : le code reste lisible.
		}
	}
</script>

<div class="classes stack">
	{#if loading}
		<p class="muted">Chargement…</p>
	{:else}
		{#if classes.length === 0}
			<p class="muted">
				Pas encore de classe. Crée-en une : tu obtiens un code à donner à tes élèves, qui le saisissent dans leur
				profil pour rejoindre la classe.
			</p>
		{/if}

		{#each classes as c (c.id)}
			{@const list = membersOf(c.id)}
			<div class="klass">
				<div class="head">
					{#if editing === c.id}
						<form class="rename" onsubmit={(e) => saveRename(e, c)}>
							<input type="text" bind:value={editName} maxlength="60" aria-label="Nouveau nom de la classe" />
							<button type="submit" disabled={busy || !editName.trim()}>OK</button>
							<button type="button" class="secondary" onclick={() => (editing = null)}>Annuler</button>
						</form>
					{:else}
						<h3>{c.name} <span class="muted count">· {list.length} élève{list.length > 1 ? 's' : ''}</span></h3>
					{/if}
					<div class="code-box">
						<span class="muted small">Code</span>
						<code class="code">{c.code}</code>
						<button type="button" class="link" onclick={() => copy(c)}>{copied === c.id ? 'Copié !' : 'Copier'}</button>
					</div>
				</div>

				{#if list.length}
					<ul class="members">
						{#each list as m (m.id)}
							<li>
								<span>{m.student_username}</span>
								<button type="button" class="link danger" disabled={busy} onclick={() => removeMember(m, c)}
									>Retirer</button
								>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted small">Aucun élève inscrit : donne-leur le code {c.code}.</p>
				{/if}

				<div class="tools">
					<button type="button" class="link" disabled={busy} onclick={() => startRename(c)}>Renommer</button>
					<button type="button" class="link" disabled={busy} onclick={() => newCode(c)}>Nouveau code</button>
					<button type="button" class="link danger" disabled={busy} onclick={() => removeClass(c)}>Supprimer</button>
				</div>
			</div>
		{/each}

		<form class="add" onsubmit={create}>
			<label for="class-name">Nouvelle classe</label>
			<div class="add-row">
				<input id="class-name" type="text" bind:value={newName} placeholder="ex. CM2 A" maxlength="60" />
				<button type="submit" disabled={busy || !newName.trim()}>Créer</button>
			</div>
		</form>

		{#if msg}<p class="ok">{msg}</p>{/if}
		{#if error}<p class="error">{error}</p>{/if}
	{/if}
</div>

<style>
	.klass {
		padding: var(--space-3, 12px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
	}
	h3 {
		margin: 0;
		font-size: 1.05em;
	}
	.count {
		font-weight: 400;
		font-size: 0.9em;
	}
	.code-box {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.code {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 1.25em;
		font-weight: 700;
		letter-spacing: 0.12em;
		padding: 2px 10px;
		border-radius: var(--radius-sm);
		background: rgba(47, 93, 177, 0.08);
		color: var(--color-primary);
		user-select: all;
	}
	.rename {
		display: flex;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}
	.rename input {
		flex: 1;
		min-width: 0;
	}
	.rename button {
		width: auto;
		padding: 4px 12px;
	}
	ul {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 0;
		border-bottom: 1px solid var(--color-border);
	}
	li:last-child {
		border-bottom: none;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 8px;
		margin-left: -6px;
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
		margin: 6px 0 0;
	}
	.code-box .small {
		margin: 0;
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
