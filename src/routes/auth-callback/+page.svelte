<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { profileState } from '$lib/profile.svelte';

	let errorMsg = $state<string | null>(null);

	onMount(async () => {
		// Le client Supabase capte automatiquement le hash (detectSessionInUrl)
		// et déclenche onAuthStateChange. On attend que la session soit posée.
		const { data, error } = await supabase.auth.getSession();
		if (error) {
			errorMsg = error.message;
			return;
		}
		if (!data.session) {
			errorMsg = 'Aucune session détectée. Le lien a peut-être expiré.';
			return;
		}

		// Synchronise notre store et charge le profil pour décider de la destination.
		await auth.init();
		await profileState.load();

		if (profileState.profile) {
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
