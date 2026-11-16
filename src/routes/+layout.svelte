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

	const PUBLIC_ROUTES = new Set(['/login', '/signup']);
	const ADD_ACCOUNT = '__add__';

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

		// Élève sans niveau scolaire : direction onboarding (les parents et les
		// profs n'en ont pas besoin).
		if (
			auth.user &&
			activeUsername.isStudent &&
			!profileState.gradeLevel &&
			!isPublic &&
			path !== '/onboarding'
		) {
			goto(`${base}/onboarding`, { replaceState: true });
		}
	});

	// Menu hamburger (petits écrans) : fermé à chaque changement de page.
	let menuOpen = $state(false);
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});
	function onWindowClick(e: MouseEvent) {
		// composedPath : chemin au moment du clic (l'icône ☰/✕ est remplacée entre-temps).
		if (menuOpen && !e.composedPath().some((el) => el instanceof HTMLElement && el.classList.contains('topbar'))) {
			menuOpen = false;
		}
	}
	function onWindowKey(e: KeyboardEvent) {
		if (menuOpen && e.key === 'Escape') menuOpen = false;
	}

	async function handleSignOut() {
		menuOpen = false;
		await auth.signOut();
		if (auth.user) {
			await invalidateAll();
			goto(`${base}/`, { replaceState: true });
		} else {
			goto(`${base}/login`, { replaceState: true });
		}
	}

	async function switchUsername(select: HTMLSelectElement) {
		const name = select.value;
		// Le <select> reste sur le compte actif tant que la bascule n'est pas faite.
		select.value = activeUsername.username ?? '';
		if (name === ADD_ACCOUNT) {
			goto(`${base}/login`);
			return;
		}
		if (name === activeUsername.username) return;
		const ok = await auth.switchTo(name);
		if (!ok) {
			// Session expirée pour ce compte : on redemande un code.
			goto(`${base}/login?username=${encodeURIComponent(name)}`);
			return;
		}
		await invalidateAll();
		goto(`${base}/`, { replaceState: true });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>GramGame</title>
</svelte:head>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<header class="topbar">
	<div class="container topbar-inner">
		<a href={`${base}/`} class="brand">GramGame</a>
		{#if auth.user && activeUsername.username}
			<button
				type="button"
				class="secondary menu-toggle"
				aria-expanded={menuOpen}
				aria-controls="main-nav"
				aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
					{#if menuOpen}
						<line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
					{:else}
						<line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
					{/if}
				</svg>
			</button>
			<nav class="nav" id="main-nav" class:open={menuOpen}>
				{#if activeUsername.availableNames.length > 1}
					<label class="switcher">
						<span class="muted">Compte :</span>
						<select
							value={activeUsername.username}
							onchange={(e) => switchUsername(e.currentTarget as HTMLSelectElement)}
						>
							{#each activeUsername.availableNames as u (u)}
								<option value={u}>{u}</option>
							{/each}
							<option value={ADD_ACCOUNT}>+ Ajouter un compte…</option>
						</select>
					</label>
					<a href={`${base}/profile`} class="profile-link">Profil</a>
				{:else}
					<a href={`${base}/profile`} class="profile-link"
						>{activeUsername.username}<span class="menu-only muted">&nbsp;· mon profil</span></a
					>
				{/if}
				<a href={`${base}/evaluations`} class="admin-link">Évaluations</a>
				{#if activeUsername.isSupervisor}
					<a href={`${base}/suivi`} class="admin-link">Suivi</a>
				{/if}
				{#if activeUsername.canEditExercises}
					<a href={`${base}/admin`} class="admin-link">Gestion</a>
				{/if}
				<button
					type="button"
					class="secondary logout"
					onclick={handleSignOut}
					aria-label="Déconnexion"
					title="Déconnexion"
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
						<polyline points="16 17 21 12 16 7" />
						<line x1="21" y1="12" x2="9" y2="12" />
					</svg>
					<span class="logout-label">Déconnexion</span>
				</button>
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
	.logout {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		line-height: 0;
	}
	.menu-toggle,
	.logout-label,
	.menu-only {
		display: none;
	}
	/* Petits écrans : menu hamburger, les liens s'ouvrent dans un panneau sous la barre. */
	@media (max-width: 640px) {
		.topbar {
			position: relative;
			z-index: 50;
		}
		.menu-toggle svg {
			pointer-events: none;
		}
		.menu-toggle {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: auto;
			padding: 6px;
			line-height: 0;
		}
		.nav {
			display: none;
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			flex-direction: column;
			align-items: stretch;
			gap: 0;
			padding: var(--space-2) var(--space-4) var(--space-3);
			background: var(--color-surface);
			border-bottom: 1px solid var(--color-border);
			box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
		}
		.nav.open {
			display: flex;
		}
		.nav > a,
		.nav > .switcher,
		.nav > .logout {
			padding: 12px 4px;
			border: none;
			border-bottom: 1px solid var(--color-border);
			border-radius: 0;
			font-size: 1rem;
			line-height: 1.3;
			color: var(--color-text);
			background: transparent;
		}
		.nav > a:hover,
		.nav > .logout:hover:not(:disabled) {
			background: rgba(47, 93, 177, 0.06);
			color: var(--color-primary);
		}
		.nav > .logout {
			justify-content: flex-start;
			gap: var(--space-2);
			width: 100%;
			border-bottom: none;
			color: var(--color-error);
		}
		.logout-label,
		.menu-only {
			display: inline;
		}
		.menu-toggle,
		.menu-toggle:hover:not(:disabled) {
			background: var(--color-surface);
			color: var(--color-primary);
		}
		.switcher {
			justify-content: space-between;
		}
	}
	.switcher {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.switcher span {
		white-space: nowrap;
	}
	.switcher select {
		width: auto;
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
	}
	.admin-link {
		font-size: 0.9em;
		padding: 4px 10px;
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		color: var(--color-primary);
	}
	.admin-link:hover {
		background: var(--color-primary);
		color: white;
		text-decoration: none;
	}
	.profile-link {
		font-size: 0.95em;
		color: var(--color-text);
		padding: 4px 8px;
		border-radius: var(--radius-sm);
	}
	.profile-link:hover {
		background: rgba(47, 93, 177, 0.08);
		text-decoration: none;
	}
</style>
