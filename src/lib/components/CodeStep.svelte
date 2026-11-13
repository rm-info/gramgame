<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { verifyCode } from '$lib/api/signin';

	interface Props {
		otpId: string;
		emailHint: string;
		/** Redemande un code ; retourne le nouvel otpId. */
		onResend: () => Promise<string>;
		onCancel: () => void;
	}

	let { otpId, emailHint, onResend, onCancel }: Props = $props();

	let code = $state('');
	let currentOtpId = $state('');
	let submitting = $state(false);
	let resending = $state(false);
	let errorMsg = $state<string | null>(null);
	let infoMsg = $state<string | null>(null);

	$effect(() => {
		currentOtpId = otpId;
	});

	const codeValid = $derived(/^\d{6}$/.test(code.trim()));

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!codeValid) return;
		submitting = true;
		errorMsg = null;
		infoMsg = null;
		try {
			await verifyCode(currentOtpId, code);
			goto(`${base}/`, { replaceState: true });
		} catch (e) {
			errorMsg = (e as Error).message;
			submitting = false;
		}
	}

	async function resend() {
		resending = true;
		errorMsg = null;
		infoMsg = null;
		try {
			currentOtpId = await onResend();
			code = '';
			infoMsg = 'Nouveau code envoyé.';
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			resending = false;
		}
	}
</script>

<div class="card stack">
	<h2>Vérifie ta boîte mail</h2>
	<p>
		Un code à 6 chiffres a été envoyé à <strong>{emailHint}</strong>. Il est valable 15 minutes.
	</p>
	<form onsubmit={handleSubmit} class="stack">
		<div>
			<label for="code">Code reçu</label>
			<input
				id="code"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				pattern="[0-9]*"
				maxlength="6"
				placeholder="123456"
				bind:value={code}
				class="code-input"
			/>
		</div>
		<button type="submit" disabled={submitting || !codeValid}>
			{submitting ? 'Vérification…' : 'Valider'}
		</button>
		{#if errorMsg}
			<p class="error">{errorMsg}</p>
		{/if}
		{#if infoMsg}
			<p class="muted">{infoMsg}</p>
		{/if}
	</form>
	<p class="muted" style="font-size: 0.9em;">
		Rien reçu ? Vérifie tes spams, ou
		<button type="button" class="link" onclick={resend} disabled={resending}>
			{resending ? 'envoi…' : 'renvoie un code'}
		</button>
		· <button type="button" class="link" onclick={onCancel}>changer de nom</button>
	</p>
</div>

<style>
	.code-input {
		font-size: 1.6rem;
		letter-spacing: 0.4em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--color-primary);
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
	}
	.link:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
