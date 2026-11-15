<script lang="ts">
	import { base } from '$app/paths';
	import { registerWithUsername } from '$lib/api/signin';
	import CodeStep from '$lib/components/CodeStep.svelte';

	let username = $state('');
	let email = $state('');
	let role = $state<'eleve' | 'parent'>('eleve');
	let submitting = $state(false);
	let otpId = $state<string | null>(null);
	let emailHint = $state('');
	let errorMsg = $state<string | null>(null);

	const usernameValid = $derived(/^[a-z0-9_-]{3,20}$/.test(username.trim().toLowerCase()));
	const emailValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

	async function requestCode(): Promise<string> {
		const result = await registerWithUsername({
			username: username.trim().toLowerCase(),
			email: email.trim().toLowerCase(),
			role
		});
		emailHint = result.email_hint;
		return result.otpId;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!usernameValid || !emailValid) return;
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
	<h1>Créer un compte</h1>

	{#if otpId}
		<CodeStep {otpId} {emailHint} onResend={requestCode} onCancel={() => (otpId = null)} />
	{:else}
		<div class="card stack">
			<form onsubmit={handleSubmit} class="stack">
				<fieldset class="role-choice">
					<legend>Je suis…</legend>
					<label class:selected={role === 'eleve'}>
						<input type="radio" name="role" value="eleve" bind:group={role} />
						<span><strong>un élève</strong> — je fais les exercices</span>
					</label>
					<label class:selected={role === 'parent'}>
						<input type="radio" name="role" value="parent" bind:group={role} />
						<span><strong>un parent</strong> — je suis les progrès de mes enfants</span>
					</label>
					<p class="muted small-note">
						Tu es professeur ? Inscris-toi, puis demande à un administrateur de te donner le rôle
						professeur.
					</p>
				</fieldset>
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
						C'est là que tu recevras tes codes de connexion. Tu peux réutiliser la même adresse pour
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

<style>
	.role-choice {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.role-choice legend {
		font-weight: 600;
		margin-bottom: 4px;
	}
	.role-choice label {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.role-choice label.selected {
		border-color: var(--color-primary);
		background: rgba(47, 93, 177, 0.06);
	}
	.role-choice input {
		width: auto;
	}
	.small-note {
		font-size: 0.85em;
		margin: 2px 0 0;
	}
</style>
