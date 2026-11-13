<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { loginWithUsername } from '$lib/api/signin';
	import CodeStep from '$lib/components/CodeStep.svelte';

	let username = $state('');
	let submitting = $state(false);
	let otpId = $state<string | null>(null);
	let emailHint = $state('');
	let errorMsg = $state<string | null>(null);

	onMount(() => {
		const u = page.url.searchParams.get('username');
		if (u) username = u;
	});

	async function requestCode(): Promise<string> {
		const result = await loginWithUsername({ username: username.trim().toLowerCase() });
		emailHint = result.email_hint;
		return result.otpId;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!username.trim()) return;
		submitting = true;
		errorMsg = null;
		try {
			otpId = await requestCode();
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			submitting = false;
		}
	}
</script>

<section class="container stack">
	<h1>Connexion</h1>

	{#if otpId}
		<CodeStep {otpId} {emailHint} onResend={requestCode} onCancel={() => (otpId = null)} />
	{:else}
		<div class="card stack">
			<form onsubmit={handleSubmit} class="stack">
				<div>
					<label for="username">Nom d'utilisateur</label>
					<input
						id="username"
						type="text"
						bind:value={username}
						placeholder="ton-username"
						required
						autocomplete="username"
						autocapitalize="off"
						spellcheck="false"
						maxlength="20"
					/>
				</div>
				<button type="submit" disabled={submitting || !username.trim()}>
					{submitting ? 'Envoi…' : 'Recevoir un code par mail'}
				</button>
				{#if errorMsg}
					<p class="error">{errorMsg}</p>
				{/if}
			</form>
		</div>

		<p class="muted">
			Pas encore de compte ? <a href={`${base}/signup`}>Crée-en un</a>.
		</p>
	{/if}
</section>
