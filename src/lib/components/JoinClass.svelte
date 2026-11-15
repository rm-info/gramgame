<script lang="ts">
	import { onMount } from 'svelte';
	import { pb, errorMessage } from '$lib/pb';
	import { callGram } from '$lib/api/_helpers';

	/** Côté élève : rejoindre une classe avec le code du prof, voir / quitter ses classes. */
	interface MemberRow {
		id: string;
		class_name: string;
		teacher_username: string;
	}

	let rows = $state<MemberRow[]>([]);
	let loading = $state(true);
	let code = $state('');
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		try {
			rows = (await pb.collection('class_members').getFullList({ sort: 'class_name' })) as unknown as MemberRow[];
		} catch (e) {
			error = errorMessage(e);
		}
		loading = false;
	}

	onMount(load);

	async function join(event: SubmitEvent) {
		event.preventDefault();
		if (!code.trim()) return;
		busy = true;
		msg = null;
		error = null;
		try {
			const res = await callGram<{ class_name: string; teacher_username: string }>('classes/join', { code });
			msg = `Bienvenue dans la classe « ${res.class_name} » (${res.teacher_username}) !`;
			code = '';
			await load();
		} catch (e) {
			error = errorMessage(e);
		}
		busy = false;
	}

	async function leave(r: MemberRow) {
		if (!confirm(`Quitter la classe « ${r.class_name} » ? ${r.teacher_username} ne verra plus tes résultats.`)) return;
		busy = true;
		msg = null;
		error = null;
		try {
			await pb.collection('class_members').delete(r.id);
			await load();
		} catch (e) {
			error = errorMessage(e);
		}
		busy = false;
	}
</script>

<div class="join stack">
	{#if loading}
		<p class="muted">Chargement…</p>
	{:else}
		{#if rows.length}
			<ul>
				{#each rows as r (r.id)}
					<li>
						<span><strong>{r.class_name}</strong> <span class="muted">({r.teacher_username})</span></span>
						<button type="button" class="link danger" disabled={busy} onclick={() => leave(r)}>Quitter</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Tu n'es dans aucune classe.</p>
		{/if}

		<form onsubmit={join}>
			<label for="class-code">Rejoindre une classe (code donné par ton professeur)</label>
			<div class="add-row">
				<input
					id="class-code"
					type="text"
					bind:value={code}
					placeholder="ex. K7XQ2M"
					autocapitalize="characters"
					autocomplete="off"
					spellcheck="false"
					maxlength="12"
				/>
				<button type="submit" disabled={busy || !code.trim()}>Rejoindre</button>
			</div>
		</form>

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
		gap: 8px;
		padding: var(--space-2, 8px) 0;
		border-bottom: 1px solid var(--color-border);
	}
	li:last-child {
		border-bottom: none;
	}
	label {
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
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.add-row input::placeholder {
		text-transform: none;
		letter-spacing: normal;
	}
	.add-row button {
		width: auto;
	}
	button.link {
		width: auto;
		background: transparent;
		border: none;
		padding: 2px 6px;
	}
	button.link.danger {
		color: var(--color-error);
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
