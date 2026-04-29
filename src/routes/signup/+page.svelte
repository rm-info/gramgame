<script lang="ts">
	import { base } from '$app/paths';
	import { registerWithUsername } from '$lib/api/signin';

	let username = $state('');
	let email = $state('');
	let submitting = $state(false);
	let sent = $state(false);
	let emailHint = $state('');
	let errorMsg = $state<string | null>(null);

	const usernameValid = $derived(/^[a-z0-9_-]{3,20}$/.test(username.trim().toLowerCase()));
	const emailValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!usernameValid || !emailValid) return;
		submitting = true;
		errorMsg = null;

		try {
			const result = await registerWithUsername({
				username: username.trim().toLowerCase(),
				email: email.trim().toLowerCase(),
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
	<h1>Créer un compte</h1>

	{#if sent}
		<div class="card stack">
			<h2>Compte créé !</h2>
			<p>
				Un lien de confirmation a été envoyé à <strong>{emailHint}</strong>. Ouvre ta boîte mail et
				clique sur le lien pour finaliser ton inscription.
			</p>
			<p class="muted">
				Tu pourras te connecter ensuite avec juste ton nom d'utilisateur.
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
						placeholder="lea, tom-du-78, alex_2014…"
						required
						autocomplete="username"
						autocapitalize="off"
						spellcheck="false"
						maxlength="20"
					/>
					<p class="muted" style="font-size: 0.9em; margin-top: 4px;">
						3 à 20 caractères, lettres minuscules, chiffres, tirets ou underscores.
					</p>
				</div>

				<div>
					<label for="email">Adresse email</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder="ton-email@exemple.fr"
						required
						autocomplete="email"
					/>
					<p class="muted" style="font-size: 0.9em; margin-top: 4px;">
						C'est où sera envoyé le lien de connexion. Tu peux réutiliser la même adresse pour
						plusieurs comptes (par ex. plusieurs enfants d'une même famille) — chacun aura son nom
						d'utilisateur distinct.
					</p>
				</div>

				<button type="submit" disabled={submitting || !usernameValid || !emailValid}>
					{submitting ? 'Création…' : 'Créer mon compte'}
				</button>
				{#if errorMsg}
					<p class="error">{errorMsg}</p>
				{/if}
			</form>
		</div>

		<p class="muted">
			Tu as déjà un compte ? <a href={`${base}/login`}>Connecte-toi</a>.
		</p>
	{/if}
</section>
