<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/auth.svelte';
	import { activeUsername } from '$lib/active-username.svelte';
	import { GRADE_LEVELS, profileState } from '$lib/profile.svelte';

	let gradeLevel = $state<string>('');
	let savingGrade = $state(false);
	let gradeMsg = $state<string | null>(null);

	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	$effect(() => {
		if (profileState.gradeLevel && !gradeLevel) {
			gradeLevel = profileState.gradeLevel;
		}
	});

	async function saveGrade(event: SubmitEvent) {
		event.preventDefault();
		if (!gradeLevel) return;
		savingGrade = true;
		gradeMsg = null;
		try {
			await profileState.upsertGradeLevel(gradeLevel);
			gradeMsg = 'Niveau mis à jour.';
		} catch (e) {
			gradeMsg = `Échec : ${(e as Error).message}`;
		} finally {
			savingGrade = false;
		}
	}

	async function deleteAccount() {
		const username = activeUsername.username;
		if (!username) return;

		const ok = confirm(
			`Es-tu sûr·e de vouloir supprimer le compte « ${username} » ?\n\n` +
				`Tous tes exercices et tentatives seront définitivement effacés.\n` +
				`Cette action est irréversible.`
		);
		if (!ok) return;

		deleting = true;
		deleteError = null;

		const { supabase } = await import('$lib/supabase');
		const { error } = await supabase.from('usernames').delete().eq('username', username);
		if (error) {
			deleting = false;
			deleteError = error.message;
			return;
		}

		// Compte supprimé : on déconnecte et on redirige vers /login.
		await auth.signOut();
		profileState.reset();
		activeUsername.reset();
		goto(`${base}/login`, { replaceState: true });
	}
</script>

<section class="container stack">
	<header class="stack">
		<a href={`${base}/`} class="back">← Retour à l'accueil</a>
		<h1>Mon profil</h1>
	</header>

	<div class="card stack">
		<h2>Informations</h2>
		<dl class="info">
			<dt>Nom d'utilisateur</dt>
			<dd><strong>{activeUsername.username ?? '—'}</strong></dd>

			<dt>Email</dt>
			<dd>
				{auth.user?.email ?? '—'}
				<span class="muted note">(changement d'email à venir)</span>
			</dd>

			<dt>Rôle</dt>
			<dd>
				<span class="role-badge role-{activeUsername.role}">{activeUsername.role}</span>
				{#if activeUsername.role !== 'user'}
					<span class="muted note">(modifiable par un autre administrateur)</span>
				{/if}
			</dd>
		</dl>
	</div>

	<div class="card stack">
		<h2>Niveau scolaire</h2>
		<p class="muted">
			Sert de valeur par défaut quand tu génères un exercice. Tu peux toujours surcharger ce
			niveau ponctuellement au moment de la génération.
		</p>
		<form onsubmit={saveGrade} class="row-form">
			<select bind:value={gradeLevel} disabled={savingGrade}>
				{#each GRADE_LEVELS as level (level)}
					<option value={level}>{level}</option>
				{/each}
			</select>
			<button
				type="submit"
				disabled={savingGrade ||
					!gradeLevel ||
					gradeLevel === profileState.gradeLevel}
			>
				{savingGrade ? 'Enregistrement…' : 'Enregistrer'}
			</button>
			{#if gradeMsg}
				<span class="muted">{gradeMsg}</span>
			{/if}
		</form>
	</div>

	<div class="card stack danger-zone">
		<h2>Zone dangereuse</h2>
		<p class="muted">
			Supprimer ton compte efface définitivement tous tes exercices générés et toutes tes
			tentatives. Ton nom d'utilisateur redevient disponible.
		</p>
		<button type="button" class="danger" disabled={deleting} onclick={deleteAccount}>
			{deleting ? 'Suppression…' : 'Supprimer mon compte'}
		</button>
		{#if deleteError}
			<p class="error">{deleteError}</p>
		{/if}
	</div>
</section>

<style>
	.back {
		font-size: 0.9em;
	}
	.info {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-2) var(--space-4);
		margin: 0;
	}
	.info dt {
		font-weight: 500;
		color: var(--color-text-muted);
	}
	.info dd {
		margin: 0;
	}
	.note {
		font-size: 0.9em;
		margin-left: var(--space-2);
	}
	.role-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.9em;
		background: rgba(47, 93, 177, 0.1);
		color: var(--color-primary);
	}
	.role-badge.role-admin {
		background: rgba(184, 51, 60, 0.12);
		color: var(--color-error);
	}
	.role-badge.role-prof {
		background: rgba(46, 139, 87, 0.15);
		color: var(--color-success);
	}
	.row-form {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		flex-wrap: wrap;
	}
	.row-form select {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.danger-zone {
		border: 1px solid rgba(184, 51, 60, 0.3);
	}
	.danger-zone h2 {
		color: var(--color-error);
		margin: 0;
	}
	button.danger {
		background: var(--color-error);
		align-self: flex-start;
	}
	button.danger:hover:not(:disabled) {
		background: #8e2730;
	}
</style>
