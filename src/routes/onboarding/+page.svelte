<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { activeUsername } from '$lib/active-username.svelte';
	import { GRADE_LEVELS, profileState } from '$lib/profile.svelte';

	let gradeLevel = $state<string>('CE2');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!gradeLevel) return;
		submitting = true;
		errorMsg = null;

		try {
			await profileState.upsertGradeLevel(gradeLevel);
			goto(`${base}/`, { replaceState: true });
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			submitting = false;
		}
	}
</script>

<section class="container stack">
	<h1>
		{#if activeUsername.username}
			Bienvenue {activeUsername.username} !
		{:else}
			Bienvenue !
		{/if}
	</h1>
	<p class="muted">Une dernière info avant de commencer à pratiquer.</p>

	<div class="card stack">
		<form onsubmit={handleSubmit} class="stack">
			<div>
				<label for="grade">Ton niveau scolaire</label>
				<select id="grade" bind:value={gradeLevel} required>
					{#each GRADE_LEVELS as level (level)}
						<option value={level}>{level}</option>
					{/each}
				</select>
				<p class="muted" style="font-size: 0.9em; margin-top: 4px;">
					Le niveau guide la difficulté des textes générés (longueur, vocabulaire). Tu pourras le
					modifier plus tard.
				</p>
			</div>

			<button type="submit" disabled={submitting}>
				{submitting ? 'Enregistrement…' : "C'est parti !"}
			</button>
			{#if errorMsg}
				<p class="error">{errorMsg}</p>
			{/if}
		</form>
	</div>
</section>
