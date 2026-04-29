<script lang="ts">
	import { base } from '$app/paths';
	import { loginWithUsername } from '$lib/api/signin';

	let username = $state('');
	let submitting = $state(false);
	let sent = $state(false);
	let emailHint = $state('');
	let errorMsg = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const u = username.trim().toLowerCase();
		if (!u) return;
		submitting = true;
		errorMsg = null;

		try {
			const result = await loginWithUsername({
				username: u,
				redirect_to: `${window.location.origin}${base}/auth-callback`
			});
			emailHint = result.email_hint;
			sent = true;
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			submitting = false;
		}
	}
</script>

<section class="container stack">
	<h1>Connexion</h1>

	{#if sent}
		<div class="card stack">
			<h2>Lien envoyé !</h2>
			<p>
				Un lien de connexion a été envoyé à <strong>{emailHint}</strong>. Ouvre ta boîte mail et
				clique sur le lien.
			</p>
			<p class="muted">
				Le lien fonctionne pendant 1 heure. Si tu ne le vois pas, vérifie ton dossier spam.
			</p>
		</div>
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
					{submitting ? 'Envoi…' : 'Recevoir un lien magique'}
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
