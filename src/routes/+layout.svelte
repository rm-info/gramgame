<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { auth } from '$lib/auth.svelte';
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

		if (auth.user && !profileState.loaded) {
			profileState.load();
		}

		if (auth.user && profileState.loaded && !profileState.profile && path !== '/onboarding') {
			goto(`${base}/onboarding`, { replaceState: true });
		}
	});

	async function handleSignOut() {
		await auth.signOut();
		profileState.reset();
		goto(`${base}/login`, { replaceState: true });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Gramgame</title>
</svelte:head>

<header class="topbar">
	<div class="container topbar-inner">
		<a href={`${base}/`} class="brand">Gramgame</a>
		{#if auth.user && profileState.username}
			<nav class="nav">
				<span class="muted">Bonjour {profileState.username}</span>
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
</style>
