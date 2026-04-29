import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import { supabase } from '$lib/supabase';

/**
 * Appelle une edge function Supabase via fetch direct, pour avoir un contrôle
 * total sur la lecture du corps de réponse — y compris en cas d'erreur HTTP.
 *
 * Pourquoi pas `supabase.functions.invoke` : selon la version de supabase-js,
 * invoke consomme le body de la Response en interne et renvoie `data: null`
 * sur non-2xx, rendant le message d'erreur structuré ({ error: "..." }) du
 * backend irrécupérable. En passant par fetch direct on évite ce piège.
 */
export async function invokeFunction<T>(
	name: string,
	body: Record<string, unknown>
): Promise<T> {
	const session = (await supabase.auth.getSession()).data.session;
	const accessToken = session?.access_token ?? PUBLIC_SUPABASE_PUBLISHABLE_KEY;

	const url = `${PUBLIC_SUPABASE_URL}/functions/v1/${name}`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				apikey: PUBLIC_SUPABASE_PUBLISHABLE_KEY,
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify(body)
		});
	} catch {
		throw new Error('Erreur réseau. Vérifie ta connexion.');
	}

	let parsed: unknown = null;
	const text = await response.text();
	if (text) {
		try {
			parsed = JSON.parse(text);
		} catch {
			// Corps non-JSON (probable page d'erreur HTML de la plateforme)
		}
	}

	if (!response.ok) {
		if (
			parsed &&
			typeof parsed === 'object' &&
			'error' in parsed &&
			typeof (parsed as { error: unknown }).error === 'string'
		) {
			const friendly = (parsed as { error: string }).error.trim();
			const debug = (parsed as { debug?: unknown }).debug;
			if (friendly) {
				const debugStr =
					typeof debug === 'string' && debug.trim() ? ` (détail : ${debug})` : '';
				throw new Error(`${friendly}${debugStr}`);
			}
		}
		throw new Error(
			`Erreur serveur (HTTP ${response.status}). Réessaie dans un instant.`
		);
	}

	return parsed as T;
}
