<script lang="ts">
	import { base } from '$app/paths';
	import { supabase } from '$lib/supabase';

	let email = $state('');
	let submitting = $state(false);
	let sent = $state(false);
	let errorMsg = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!email.trim()) return;
		submitting = true;
		errorMsg = null;

		const redirectTo = `${window.location.origin}${base}/auth-callback`;
		const { error } = await supabase.auth.signInWithOtp({
			email: email.trim(),
			options: { emailRedirectTo: redirectTo }
		});

		submitting = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		sent = true;
	}
</script>

<section class="container stack">
	<h1>Connexion</h1>

	{#if sent}
		<div class="card stack">
			<h2>Lien envoyé !</h2>
			<p>
				Un lien de connexion a été envoyé à <strong>{email}</strong>. Ouvre ta boîte mail et clique
				sur le lien.
			</p>
			<p class="muted">
				Le lien fonctionne pendant 1 heure. Si tu ne le vois pas, vérifie ton dossier spam.
			</p>
		</div>
	{:else}
		<div class="card stack">
			<form onsubmit={handleSubmit} class="stack">
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
				</div>
				<button type="submit" disabled={submitting || !email.trim()}>
					{submitting ? 'Envoi…' : 'Recevoir un lien magique'}
				</button>
				{#if errorMsg}
					<p class="error">{errorMsg}</p>
				{/if}
			</form>
		</div>

		<details class="card">
			<summary><strong>Plusieurs apprenants dans la famille ?</strong></summary>
			<div class="stack" style="margin-top: var(--space-3);">
				<p>
					Tu peux créer un compte distinct pour chaque enfant à partir d'<strong
						>une seule boîte mail</strong
					>, en utilisant l'astuce du <code>+</code> :
				</p>
				<ul>
					<li><code>parent+lea@gmail.com</code> → compte de Léa</li>
					<li><code>parent+tom@gmail.com</code> → compte de Tom</li>
				</ul>
				<p>
					Tous les emails arrivent dans <code>parent@gmail.com</code>, mais Gramgame voit deux
					comptes indépendants. Chaque enfant a sa progression à lui.
				</p>
				<p class="muted">
					Astuce valable sur Gmail, Outlook, ProtonMail, Fastmail. Certaines messageries
					d'opérateur (Orange, SFR…) peuvent ne pas le supporter.
				</p>
			</div>
		</details>
	{/if}
</section>
