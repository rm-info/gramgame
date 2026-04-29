<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { GRADE_LEVELS, profileState } from '$lib/profile.svelte';

	let displayName = $state('');
	let gradeLevel = $state<string>('CE2');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!displayName.trim() || !gradeLevel) return;
		submitting = true;
		errorMsg = null;

		try {
			await profileState.upsert(displayName.trim(), gradeLevel);
			goto(`${base}/`, { replaceState: true });
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			submitting = false;
		}
	}
</script>

<section class="container stack">
	<h1>Bienvenue sur Gramgame !</h1>
	<p class="muted">Encore deux infos avant de commencer à pratiquer.</p>

	<div class="card stack">
		<form onsubmit={handleSubmit} class="stack">
			<div>
				<label for="name">Prénom (ou pseudo)</label>
				<input
					id="name"
					type="text"
					bind:value={displayName}
					placeholder="Ex : Léa"
					maxlength="40"
					required
					autocomplete="given-name"
				/>
				<p class="muted" style="font-size: 0.9em; margin-top: 4px;">
					C'est ce que Gramgame utilisera pour te saluer.
				</p>
			</div>

			<div>
				<label for="grade">Niveau scolaire</label>
				<select id="grade" bind:value={gradeLevel} required>
					{#each GRADE_LEVELS as level (level)}
						<option value={level}>{level}</option>
					{/each}
				</select>
				<p class="muted" style="font-size: 0.9em; margin-top: 4px;">
					Le niveau guide la difficulté des textes. Tu pourras le modifier plus tard.
				</p>
			</div>

			<button type="submit" disabled={submitting || !displayName.trim()}>
				{submitting ? 'Enregistrement…' : "C'est parti !"}
			</button>
			{#if errorMsg}
				<p class="error">{errorMsg}</p>
			{/if}
		</form>
	</div>
</section>
