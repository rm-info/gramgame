<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { activeUsername } from '$lib/active-username.svelte';
	import { profileState } from '$lib/profile.svelte';

	let errorMsg = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await supabase.auth.getSession();
		if (error) {
			errorMsg = error.message;
			return;
		}
		if (!data.session) {
			errorMsg = 'Aucune session détectée. Le lien a peut-être expiré.';
			return;
		}

		await auth.init();

		// Le username est passé en query param par l'edge function signin.
		const requestedUsername = page.url.searchParams.get('username');

		if (requestedUsername) {
			// Tente de claim (idempotent) puis active.
			const claim = await activeUsername.claim(requestedUsername);
			if (!claim.ok) {
				errorMsg = `Impossible d'activer le compte « ${requestedUsername} » : ${claim.reason ?? 'erreur inconnue'}.`;
				return;
			}
		}

		await activeUsername.load();

		if (requestedUsername && activeUsername.availableNames.includes(requestedUsername)) {
			activeUsername.set(requestedUsername);
		}

		await profileState.load();

		if (profileState.gradeLevel) {
			goto(`${base}/`, { replaceState: true });
		} else {
			goto(`${base}/onboarding`, { replaceState: true });
		}
	});
</script>

<section class="container">
	{#if errorMsg}
		<div class="card stack">
			<h1>Connexion échouée</h1>
			<p class="error">{errorMsg}</p>
			<a href={`${base}/login`}>Retour à la connexion</a>
		</div>
	{:else}
		<p class="muted">Connexion en cours…</p>
	{/if}
</section>
