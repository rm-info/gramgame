<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { auth } from '$lib/auth.svelte';
	import { activeUsername } from '$lib/active-username.svelte';

	let { children } = $props();

	$effect(() => {
		if (auth.loading || !activeUsername.loaded) return;
		if (!auth.user || !activeUsername.canEditExercises) {
			goto(`${base}/`, { replaceState: true });
		}
	});
</script>

{#if activeUsername.canEditExercises}
	{@render children()}
{:else if !activeUsername.loaded}
	<div class="container muted">Chargement…</div>
{:else}
	<div class="container muted">Accès non autorisé. Redirection…</div>
{/if}
