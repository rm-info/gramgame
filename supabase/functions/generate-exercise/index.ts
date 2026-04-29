// Edge Function : generate-exercise
// Génère un texte à trous via LLM, valide la sortie programmatiquement
// avec retry max 2, et persiste dans la table `exercises`.
//
// Provider-agnostique : utilise n'importe quelle API compatible OpenAI
// (Gemini, OpenRouter, Anthropic compat layer, Mistral, OpenAI lui-même).
// Configuré via les secrets Supabase :
//   LLM_API_KEY  — clé d'API du provider
//   LLM_BASE_URL — base URL (défaut : Gemini OpenAI compat)
//   LLM_MODEL    — modèle (défaut : gemini-2.0-flash)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const MODEL = Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash';
const LLM_BASE_URL =
	Deno.env.get('LLM_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai';
const MAX_ATTEMPTS = 3; // 1 essai + 2 retries

interface GenerateRequest {
	username: string;
	rule_id: string;
	theme: string;
	grade_level: string;
	num_blanks: number;
}

interface ToolBlank {
	position: number;
	correct: string;
	distractor: string;
}

interface ToolOutput {
	text: string;
	blanks: ToolBlank[];
}

interface Rule {
	id: string;
	display_name: string;
	short_description: string;
	rule_type: 'multiple_choice' | 'free_text';
	candidates: string[];
	difficulty_hint: string | null;
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

		const body = (await req.json()) as GenerateRequest;
		const reqError = validateRequest(body);
		if (reqError) return jsonResponse({ error: reqError }, 400);

		// Vérifie que l'utilisateur possède bien le username demandé.
		// RLS sur usernames autorise les SELECT seulement sur les lignes
		// dont user_id = auth.uid(). Une ligne absente = pas autorisé.
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

		const { data: rule, error: ruleError } = await supabase
			.from('rules')
			.select('*')
			.eq('id', body.rule_id)
			.single();
		if (ruleError || !rule) {
			return jsonResponse({ error: `Règle introuvable : ${body.rule_id}` }, 404);
		}

		const apiKey = Deno.env.get('LLM_API_KEY');
		if (!apiKey) {
			console.error('LLM_API_KEY non configuré.');
			return jsonResponse({ error: 'Configuration serveur incomplète.' }, 500);
		}

		let exercise: ToolOutput | null = null;
		let lastError = '';
		let providerErrorStatus: number | null = null;

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			try {
				const candidate = await callLLM(apiKey, rule as Rule, body, attempt);
				const validationError = validateExercise(candidate, rule as Rule, body.num_blanks);
				if (!validationError) {
					exercise = candidate;
					break;
				}
				lastError = validationError;
				console.warn(`Tentative ${attempt + 1} invalide : ${validationError}`);
			} catch (e) {
				const err = e as Error & { providerStatus?: number };
				lastError = err.message;
				console.warn(`Tentative ${attempt + 1} a échoué : ${lastError}`);
				if (err.providerStatus !== undefined) {
					// Erreur côté provider (429, 401, 5xx…) : ne pas retry, c'est pas une
					// question de prompt mais de configuration / rate limit / quota.
					providerErrorStatus = err.providerStatus;
					break;
				}
			}
		}

		if (!exercise) {
			if (providerErrorStatus === 429) {
				return jsonResponse(
					{
						error:
							"Quota du provider LLM dépassé pour le moment. Patiente quelques minutes (rate limit par minute) ou vérifie ton quota journalier.",
						debug: lastError
					},
					429
				);
			}
			if (providerErrorStatus === 401 || providerErrorStatus === 403) {
				return jsonResponse(
					{
						error: 'Clé API LLM invalide ou non autorisée côté serveur.',
						debug: lastError
					},
					providerErrorStatus
				);
			}
			if (providerErrorStatus !== null) {
				return jsonResponse(
					{
						error: `Le provider LLM a renvoyé une erreur (HTTP ${providerErrorStatus}). Réessaie dans un instant.`,
						debug: lastError
					},
					502
				);
			}
			return jsonResponse(
				{
					error:
						"L'IA n'a pas réussi à générer un texte valide. Réessaie dans un instant ou modifie le thème.",
					debug: lastError
				},
				422
			);
		}

		const { data: row, error: insertError } = await supabase
			.from('exercises')
			.insert({
				created_by_username: body.username,
				rule_id: rule.id,
				theme: body.theme,
				grade_level: body.grade_level,
				num_blanks: body.num_blanks,
				text: exercise.text,
				blanks: exercise.blanks,
				llm_model: MODEL
			})
			.select()
			.single();

		if (insertError || !row) {
			console.error('Insert failed', insertError);
			return jsonResponse({ error: 'Sauvegarde échouée.' }, 500);
		}

		// Réponse au frontend : on N'EXPOSE PAS les bonnes réponses.
		return jsonResponse({
			id: row.id,
			text: row.text,
			blanks: exercise.blanks.map((b) => ({ position: b.position })),
			rule: {
				id: rule.id,
				display_name: rule.display_name,
				candidates: rule.candidates
			}
		});
	} catch (e) {
		console.error('Erreur inattendue', e);
		return jsonResponse({ error: 'Erreur inattendue.' }, 500);
	}
});

function validateRequest(body: unknown): string | null {
	if (!body || typeof body !== 'object') return 'Corps de requête invalide.';
	const b = body as Record<string, unknown>;
	if (typeof b.username !== 'string' || !b.username) return 'username requis.';
	if (typeof b.rule_id !== 'string' || !b.rule_id) return 'rule_id requis.';
	if (typeof b.theme !== 'string' || b.theme.trim().length < 2) return 'theme invalide.';
	if (typeof b.grade_level !== 'string' || !b.grade_level) return 'grade_level requis.';
	if (typeof b.num_blanks !== 'number' || b.num_blanks < 3 || b.num_blanks > 30) {
		return 'num_blanks doit être entre 3 et 30.';
	}
	return null;
}

function validateExercise(ex: ToolOutput, rule: Rule, numBlanks: number): string | null {
	if (!ex.text || typeof ex.text !== 'string') return 'Texte manquant.';
	if (!Array.isArray(ex.blanks)) return 'Liste de trous manquante.';
	if (ex.blanks.length !== numBlanks) {
		return `Nombre de trous incorrect : attendu ${numBlanks}, reçu ${ex.blanks.length}.`;
	}

	const candidates = new Set(rule.candidates);
	const positions = new Set<number>();
	for (const b of ex.blanks) {
		if (typeof b.position !== 'number' || b.position < 1 || b.position > numBlanks) {
			return `Position invalide : ${b.position}.`;
		}
		if (positions.has(b.position)) return `Position dupliquée : ${b.position}.`;
		positions.add(b.position);
		if (!candidates.has(b.correct)) {
			return `Bonne réponse hors candidats autorisés : "${b.correct}" (autorisés : ${rule.candidates.join(', ')}).`;
		}
		if (!candidates.has(b.distractor)) {
			return `Distracteur hors candidats autorisés : "${b.distractor}".`;
		}
		if (b.correct === b.distractor) {
			return `correct === distractor à la position ${b.position}.`;
		}
	}

	for (let i = 1; i <= numBlanks; i++) {
		const marker = `{{${i}}}`;
		if (!ex.text.includes(marker)) {
			return `Marqueur manquant dans le texte : ${marker}.`;
		}
	}

	return null;
}

async function callLLM(
	apiKey: string,
	rule: Rule,
	req: GenerateRequest,
	attemptIdx: number
): Promise<ToolOutput> {
	const textLength = Math.min(60 + req.num_blanks * 12, 350);

	const systemPrompt = `Tu es un professeur de français expérimenté qui crée des exercices à trous pour des élèves de niveau ${req.grade_level}. Tu écris des textes narratifs, plaisants, adaptés à l'âge et au vocabulaire des élèves.`;

	const retryHint =
		attemptIdx > 0
			? '\n\nIMPORTANT : ta tentative précédente était invalide. Respecte STRICTEMENT le format demandé.'
			: '';

	const userPrompt = `RÈGLE TRAVAILLÉE : ${rule.display_name}
DESCRIPTION : ${rule.short_description}
CANDIDATS AUTORISÉS pour les trous : ${JSON.stringify(rule.candidates)}

CONSIGNES :
- Écris un texte narratif d'environ ${textLength} mots sur le thème : « ${req.theme} ».
- Insère EXACTEMENT ${req.num_blanks} trous portant uniquement sur la règle ci-dessus.
- Chaque trou est marqué \`{{N}}\` où N est l'index 1-based (1, 2, 3, …, ${req.num_blanks}).
- Numérote les trous dans l'ordre d'apparition dans le texte.
- Pour chaque trou, fournis la bonne réponse (parmi les candidats autorisés) ET le distracteur (l'autre candidat).
- Vérifie SOIGNEUSEMENT que chaque bonne réponse est grammaticalement correcte dans son contexte (la phrase doit avoir du sens).
- Adapte le vocabulaire et la longueur des phrases au niveau ${req.grade_level}.${retryHint}

Réponds UNIQUEMENT en appelant le tool submit_exercise.`;

	const tools = [
		{
			type: 'function',
			function: {
				name: 'submit_exercise',
				description: "Soumet l'exercice à trous généré.",
				parameters: {
					type: 'object',
					required: ['text', 'blanks'],
					properties: {
						text: {
							type: 'string',
							description: `Texte avec marqueurs {{1}}, {{2}}, …, {{${req.num_blanks}}}`
						},
						blanks: {
							type: 'array',
							items: {
								type: 'object',
								required: ['position', 'correct', 'distractor'],
								properties: {
									position: { type: 'integer', minimum: 1, maximum: req.num_blanks },
									correct: { type: 'string', enum: rule.candidates },
									distractor: { type: 'string', enum: rule.candidates }
								}
							}
						}
					}
				}
			}
		}
	];

	const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			tools,
			tool_choice: { type: 'function', function: { name: 'submit_exercise' } },
			temperature: 0.7,
			max_tokens: 2000
		})
	});

	if (!response.ok) {
		const errText = await response.text();
		const err = new Error(`LLM HTTP ${response.status} : ${errText.slice(0, 300)}`) as Error & {
			providerStatus?: number;
		};
		err.providerStatus = response.status;
		throw err;
	}

	const json = await response.json();
	const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
	if (!toolCall) {
		throw new Error('Pas de tool_call dans la réponse LLM.');
	}
	let args: unknown;
	try {
		args = JSON.parse(toolCall.function.arguments);
	} catch (e) {
		throw new Error(`JSON invalide dans tool_call.arguments : ${(e as Error).message}`);
	}
	return args as ToolOutput;
}
