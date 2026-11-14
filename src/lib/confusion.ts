/**
 * Groupes de confusion (homophones) d'une règle — même logique que
 * pocketbase/pb_hooks/lib/gram.js (normalizeWord, ruleGroups).
 */

export interface RuleWithGroups {
	candidates: string[];
	groups?: string[][] | null;
}

/** Forme de comparaison : minuscules, apostrophe droite, espaces normalisés. */
export function normalizeWord(w: string | null | undefined): string {
	return String(w ?? '')
		.replace(/[’ʼ‘`´]/g, "'")
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** Groupes valides de la règle, ou un seul groupe = tous les candidats. */
export function ruleGroups(rule: RuleWithGroups): string[][] {
	const groups = Array.isArray(rule.groups)
		? rule.groups.filter((g) => Array.isArray(g) && g.length >= 2)
		: [];
	return groups.length > 0 ? groups : [rule.candidates];
}

export function hasSeveralGroups(rule: RuleWithGroups): boolean {
	return ruleGroups(rule).length > 1;
}

/** Options proposées pour un trou dont la bonne réponse est `correct`. */
export function optionsForBlank(rule: RuleWithGroups, correct: string, hardMode: boolean): string[] {
	if (hardMode) return rule.candidates;
	const n = normalizeWord(correct);
	return ruleGroups(rule).find((g) => g.some((w) => normalizeWord(w) === n)) ?? rule.candidates;
}

export function capitalizeFirst(w: string): string {
	return w ? w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1) : w;
}

/** Le texte qui précède un trou se termine-t-il par un début de phrase ? */
export function startsSentence(before: string): boolean {
	return /(^|[.!?…«"“\n—–])\s*$/.test(before);
}

/** "on / ont" ← ["on","ont"] */
export function groupLabel(g: string[]): string {
	return g.join(' / ');
}

/** Parse le champ texte de l'admin : une ligne par groupe, mots séparés par / ou , */
export function parseGroupsText(text: string): string[][] {
	return text
		.split('\n')
		.map((line) =>
			line
				.split(/[\/,]/)
				.map((w) => w.trim())
				.filter(Boolean)
		)
		.filter((g) => g.length > 0);
}

export function groupsToText(groups: string[][] | null | undefined): string {
	return (groups ?? []).map((g) => g.join(' / ')).join('\n');
}
