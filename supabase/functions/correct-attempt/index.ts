// Edge Function : correct-attempt
// Calcule le score d'une tentative (programmatique), génère une appréciation via LLM,
// persiste dans la table `attempts`, retourne le résultat complet.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const MODEL = Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash';
const LLM_BASE_URL =
	Deno.env.get('LLM_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai';

interface CorrectRequest {
	username: string;
	exercise_id: string;
	responses: Record<string, string>;
}

interface ExerciseRow {
	id: string;
	created_by_username: string;
	rule_id: string;
	theme: string;
	grade_level: string;
	num_blanks: number;
	text: string;
	blanks: { position: number; correct: string; distractor: string }[];
}

interface RuleRow {
	id: string;
	display_name: string;
	short_description: string;
	candidates: string[];
}

serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	}

	try {
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			return jsonResponse({ error: 'Authentification requise.' }, 401);
		}

		const supabase = createClient(
			Deno.env.get('SUPABASE_URL')!,
			Deno.env.get('SUPABASE_ANON_KEY')!,
			{ global: { headers: { Authorization: authHeader } } }
		);

		const { data: userData } = await supabase.auth.getUser();
		const user = userData.user;
		if (!user) {
			return jsonResponse({ error: 'Session invalide.' }, 401);
		}

		const body = (await req.json()) as CorrectRequest;
		if (
			!body ||
			typeof body.username !== 'string' ||
			!body.username ||
			typeof body.exercise_id !== 'string' ||
			typeof body.responses !== 'object'
		) {
			return jsonResponse({ error: 'Corps de requête invalide.' }, 400);
		}

		// Vérifie que l'utilisateur possède bien le username demandé.
		const { data: ownedUsername } = await supabase
			.from('usernames')
			.select('username')
			.eq('username', body.username)
			.eq('user_id', user.id)
			.maybeSingle();
		if (!ownedUsername) {
			return jsonResponse(
				{ error: "Tu n'as pas accès à ce compte d'apprenant." },
				403
			);
		}

		const { data: ex, error: exError } = await supabase
			.from('exercises')
			.select('*')
			.eq('id', body.exercise_id)
			.single();
		if (exError || !ex) {
			return jsonResponse({ error: 'Exercice introuvable.' }, 404);
		}
		const exercise = ex as ExerciseRow;

		const { data: rule, error: ruleError } = await supabase
			.from('rules')
			.select('id, display_name, short_description, candidates')
			.eq('id', exercise.rule_id)
			.single();
		if (ruleError || !rule) {
			return jsonResponse({ error: 'Règle introuvable.' }, 500);
		}

		const grading = grade(exercise, body.responses);

		// L'appréciation LLM est best-effort : si elle échoue, on continue
		// avec un fallback déterministe pour ne pas bloquer le retour à l'élève.
		let appreciation = '';
		try {
			const apiKey = Deno.env.get('LLM_API_KEY');
			if (!apiKey) throw new Error('LLM_API_KEY manquante');
			appreciation = await generateAppreciation(apiKey, exercise, rule as RuleRow, grading);
		} catch (e) {
			console.warn('Appréciation LLM échouée, fallback', e);
			appreciation = fallbackAppreciation(grading);
		}

		// Persistance
		const { error: insertError } = await supabase.from('attempts').insert({
			exercise_id: exercise.id,
			username: body.username,
			responses: body.responses,
			score: grading.score,
			score_total: grading.score_total,
			per_rule_breakdown: grading.per_rule_breakdown,
			appreciation
		});

		if (insertError) {
			console.error('Insert attempt failed', insertError);
			return jsonResponse({ error: 'Sauvegarde échouée.' }, 500);
		}

		return jsonResponse({
			score: grading.score,
			score_total: grading.score_total,
			per_blank: grading.per_blank,
			per_rule_breakdown: grading.per_rule_breakdown,
			appreciation,
			suggested_next_rule_id: grading.suggested_next_rule_id
		});
	} catch (e) {
		console.error('Erreur inattendue', e);
		return jsonResponse({ error: 'Erreur inattendue.' }, 500);
	}
});

interface Grading {
	score: number;
	score_total: number;
	per_blank: { position: number; given: string | null; correct: string; ok: boolean }[];
	per_rule_breakdown: Record<string, { ok: number; total: number }>;
	suggested_next_rule_id: string | null;
}

function grade(exercise: ExerciseRow, responses: Record<string, string>): Grading {
	// On ne note que les trous pour lesquels une réponse a été fournie. Ça permet
	// à l'élève de faire une "version courte" d'un exercice (les positions
	// au-delà du nombre demandé sont absentes de `responses`).
	const attempted = exercise.blanks.filter((b) =>
		Object.prototype.hasOwnProperty.call(responses, String(b.position))
	);

	const per_blank: Grading['per_blank'] = [];
	let score = 0;
	for (const b of attempted) {
		const given = responses[String(b.position)] ?? null;
		const ok = given === b.correct;
		if (ok) score++;
		per_blank.push({ position: b.position, given, correct: b.correct, ok });
	}

	const total = attempted.length;
	const per_rule_breakdown: Record<string, { ok: number; total: number }> = {
		[exercise.rule_id]: { ok: score, total }
	};

	const ratio = total > 0 ? score / total : 0;
	const suggested_next_rule_id = ratio < 0.8 ? exercise.rule_id : null;

	return {
		score,
		score_total: total,
		per_blank,
		per_rule_breakdown,
		suggested_next_rule_id
	};
}

async function generateAppreciation(
	apiKey: string,
	exercise: ExerciseRow,
	rule: RuleRow,
	grading: Grading
): Promise<string> {
	const ratio = grading.score / grading.score_total;
	let toneHint = '';
	if (ratio === 1) toneHint = "Score parfait — félicite chaleureusement et propose d'augmenter la difficulté.";
	else if (ratio >= 0.8) toneHint = 'Très bon score — félicite et identifie les rares confusions.';
	else if (ratio >= 0.5) toneHint = 'Score moyen — encourage et donne une astuce courte sur la règle.';
	else toneHint = 'Score faible — rassure, propose une astuce simple et concrète sur la règle.';

	const errorsList = grading.per_blank
		.filter((b) => !b.ok)
		.map((b) => `position ${b.position} : a écrit "${b.given ?? '(rien)'}" au lieu de "${b.correct}"`)
		.slice(0, 6)
		.join(' ; ');

	const userPrompt = `Tu donnes un retour personnalisé à un élève de ${exercise.grade_level} qui vient de faire un exercice à trous sur la règle "${rule.display_name}" (${rule.short_description}).

Score : ${grading.score}/${grading.score_total}.
${errorsList ? `Erreurs : ${errorsList}.` : 'Aucune erreur.'}
Ton attendu : ${toneHint}

Écris UNE SEULE appréciation courte (3-5 phrases maximum), en français, ton bienveillant et encourageant. Tutoie l'élève. Si pertinent, glisse une astuce mémo pour la règle (ex : « où prend un accent quand il indique un lieu ; ou ne sert qu'à donner le choix »). Pas de formule mécanique, sois naturel. Réponds uniquement avec l'appréciation, sans préambule.`;

	const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: userPrompt }],
			temperature: 0.7,
			max_tokens: 400
		})
	});

	if (!response.ok) {
		throw new Error(`LLM HTTP ${response.status}`);
	}
	const json = await response.json();
	const text = json.choices?.[0]?.message?.content;
	if (typeof text !== 'string' || !text.trim()) {
		throw new Error('Pas de contenu textuel dans la réponse.');
	}
	return text.trim();
}

function fallbackAppreciation(grading: Grading): string {
	const ratio = grading.score / grading.score_total;
	if (ratio === 1)
		return `Bravo, ${grading.score}/${grading.score_total} ! Tu maîtrises cette règle. Tu peux maintenant essayer un exercice plus long ou changer de règle.`;
	if (ratio >= 0.8)
		return `Très bon score : ${grading.score}/${grading.score_total}. Quelques étourderies à corriger en relisant — tu y es presque.`;
	if (ratio >= 0.5)
		return `${grading.score}/${grading.score_total}. Tu progresses, mais cette règle mérite un peu plus de pratique. Refais un exercice ciblé pour ancrer.`;
	return `${grading.score}/${grading.score_total}. Pas de souci, cette règle est piégeuse — relis les bonnes réponses pour comprendre, puis refais un exercice. Tu vas y arriver.`;
}
