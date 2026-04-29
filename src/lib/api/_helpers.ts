import { supabase } from '$lib/supabase';

/**
 * Appelle une edge function Supabase et déballe son corps de réponse.
 * En cas d'erreur HTTP non-2xx, tente d'extraire le champ `error` du corps JSON
 * pour rendre le message lisible à l'utilisateur final.
 */
export async function invokeFunction<T>(
	name: string,
	body: Record<string, unknown>
): Promise<T> {
	const { data, error } = await supabase.functions.invoke(name, { body });
	if (error) {
		throw new Error(await extractFriendlyMessage(error));
	}
	return data as T;
}

/**
 * Récupère un message d'erreur "human-friendly" en lisant le corps de la
 * réponse HTTP. Volontairement basé sur du duck-typing plutôt que sur
 * `instanceof FunctionsHttpError` pour éviter les pièges de modules dupliqués
 * dans le bundle (l'import local et l'import du SDK peuvent être deux classes
 * différentes en mémoire et faire échouer `instanceof`).
 */
async function extractFriendlyMessage(error: unknown): Promise<string> {
	if (error && typeof error === 'object' && 'context' in error) {
		const ctx = (error as { context?: unknown }).context;
		if (ctx && typeof (ctx as Response).clone === 'function') {
			try {
				const body = await (ctx as Response).clone().json();
				if (body && typeof body === 'object' && 'error' in body) {
					const val = (body as { error: unknown }).error;
					if (typeof val === 'string' && val.trim()) return val;
				}
			} catch {
				// Corps non-JSON ou non parsable : on retombe sur le message d'origine.
			}
		}
	}
	if (error instanceof Error && error.message) {
		if (error.message.includes('non-2xx status code')) {
			return "L'opération a échoué côté serveur. Réessaie dans un instant.";
		}
		return error.message;
	}
	return 'Erreur réseau. Vérifie ta connexion.';
}
