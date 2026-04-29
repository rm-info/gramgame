<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { auth } from '$lib/auth.svelte';
	import { activeUsername } from '$lib/active-username.svelte';
	import { profileState } from '$lib/profile.svelte';

	let { children } = $props();

	const PUBLIC_ROUTES = new Set(['/login', '/signup', '/auth-callback']);

	onMount(async () => {
		await auth.init();
	});

	$effect(() => {
		if (auth.loading) return;
		const path = page.url.pathname.replace(base, '') || '/';
		const isPublic = PUBLIC_ROUTES.has(path);

		if (!auth.user && !isPublic) {
			goto(`${base}/login`, { replaceState: true });
			return;
		}

		if (auth.user && !activeUsername.loaded) {
			activeUsername.load().then(() => {
				if (activeUsername.username) profileState.load();
			});
			return;
		}

		if (
			auth.user &&
			activeUsername.loaded &&
			activeUsername.username &&
			profileState.loadedFor !== activeUsername.username
		) {
			profileState.load();
			return;
		}

		// Si l'utilisateur a une session mais aucun username (cas dégradé) ou
		// pas de profil pour le username actif, direction onboarding.
		if (
			auth.user &&
			activeUsername.loaded &&
			activeUsername.username &&
			profileState.loaded &&
			profileState.loadedFor === activeUsername.username &&
			!profileState.gradeLevel &&
			path !== '/onboarding'
		) {
			goto(`${base}/onboarding`, { replaceState: true });
		}
	});

	async function handleSignOut() {
		await auth.signOut();
		profileState.reset();
		activeUsername.reset();
		goto(`${base}/login`, { replaceState: true });
	}

	async function switchUsername(name: string) {
		if (name === activeUsername.username) return;
		activeUsername.set(name);
		profileState.reset();
		await profileState.load();
		await invalidateAll();
		goto(`${base}/`, { replaceState: true });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Gramgame</title>
</svelte:head>

<header class="topbar">
	<div class="container topbar-inner">
		<a href={`${base}/`} class="brand">Gramgame</a>
		{#if auth.user && activeUsername.username}
			<nav class="nav">
				{#if activeUsername.available.length > 1}
					<label class="switcher">
						<span class="muted">Compte :</span>
						<select
							value={activeUsername.username}
							onchange={(e) => switchUsername((e.currentTarget as HTMLSelectElement).value)}
						>
							{#each activeUsername.available as u (u)}
								<option value={u}>{u}</option>
							{/each}
						</select>
					</label>
				{:else}
					<span class="muted">Bonjour {activeUsername.username}</span>
				{/if}
				<button type="button" class="secondary" onclick={handleSignOut}>Déconnexion</button>
			</nav>
		{/if}
	</div>
</header>

<main>
	{#if auth.loading}
		<div class="container muted">Chargement…</div>
	{:else}
		{@render children()}
	{/if}
</main>

<style>
	.topbar {
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}
	.topbar-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: var(--space-3);
		padding-bottom: var(--space-3);
	}
	.brand {
		font-family: var(--font-serif);
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-primary);
		text-decoration: none;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	.switcher {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.switcher select {
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
</style>
