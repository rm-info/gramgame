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

	async function handleSignOut() {
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

<header class="topbar">
	<div class="container topbar-inner">
		<a href={`${base}/`} class="brand">GramGame</a>
		{#if auth.user && activeUsername.username}
			<nav class="nav">
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
					<a href={`${base}/profile`} class="profile-link">{activeUsername.username}</a>
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
	@media (max-width: 480px) {
		.nav {
			gap: var(--space-2);
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
