export interface Blank {
	position: number;
	correct: string;
	distractor: string;
}

export interface FrontendBlank {
	position: number;
}

/**
 * Tronque un exercice à `maxBlanks` trous (le premier `maxBlanks` dans l'ordre
 * d'apparition). Coupe le texte juste avant le premier trou retiré, en
 * remontant si possible jusqu'à la fin de la phrase précédente pour ne pas
 * laisser de phrase coupée en plein milieu.
 *
 * Si maxBlanks >= nombre actuel de trous, retourne l'exercice tel quel.
 * Si maxBlanks <= 0, comportement non défini (à valider en amont).
 */
export function truncateExercise<B extends { position: number }>(
	text: string,
	blanks: B[],
	maxBlanks: number
): { text: string; blanks: B[] } {
	if (maxBlanks >= blanks.length) return { text, blanks };
	if (maxBlanks <= 0) return { text: '', blanks: [] };

	const sorted = [...blanks].sort((a, b) => a.position - b.position);
	const kept = sorted.slice(0, maxBlanks);
	const firstRemovedPos = sorted[maxBlanks].position;

	const removedMarker = `{{${firstRemovedPos}}}`;
	const removedIdx = text.indexOf(removedMarker);
	if (removedIdx === -1) return { text, blanks: kept };

	const lastKeptPos = kept[kept.length - 1].position;
	const lastKeptMarker = `{{${lastKeptPos}}}`;
	const lastKeptIdx = text.indexOf(lastKeptMarker);
	const lastKeptEnd = lastKeptIdx + lastKeptMarker.length;

	// Cherche un point/!/? AVANT le marqueur retiré, mais APRÈS le dernier
	// marqueur conservé (pour ne pas amputer le contenu utile).
	let cutAt = removedIdx;
	for (let i = removedIdx - 1; i >= lastKeptEnd; i--) {
		const ch = text[i];
		if (ch === '.' || ch === '!' || ch === '?') {
			const next = text[i + 1] ?? '';
			if (next === '' || /\s/.test(next)) {
				cutAt = i + 1;
				break;
			}
		}
	}

	return {
		text: text.slice(0, cutAt).trimEnd() + ' …',
		blanks: kept
	};
}
