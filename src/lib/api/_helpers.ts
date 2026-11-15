import { pb } from '$lib/pb';

/**
 * Appelle une route custom PocketBase (/api/gram/<name>) en POST JSON.
 * Les routes renvoient { error, debug? } en cas d'échec ; on remonte le
 * message lisible tel quel.
 */
export function callGram<T>(name: string, body: Record<string, unknown>): Promise<T> {
	return gramRequest<T>('POST', name, body);
}

/** Même chose pour GET / DELETE / POST (routes /api/gram/<name>). */
export async function gramRequest<T>(
	method: 'GET' | 'POST' | 'DELETE',
	name: string,
	body?: Record<string, unknown>
): Promise<T> {
	const headers: Record<string, string> = {};
	if (body) headers['Content-Type'] = 'application/json';
	if (pb.authStore.isValid) headers.Authorization = pb.authStore.token;

	let response: Response;
	try {
		response = await fetch(`/api/gram/${name}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined
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
			// corps non-JSON (page d'erreur du reverse proxy…)
		}
	}

	if (!response.ok) {
		const p = (parsed ?? {}) as { error?: unknown; message?: unknown; debug?: unknown };
		const friendly =
			typeof p.error === 'string' && p.error.trim()
				? p.error.trim()
				: response.status === 429
					? 'Trop de requêtes. Patiente une minute avant de réessayer.'
					: typeof p.message === 'string' && p.message.trim()
						? p.message.trim()
						: '';
		if (friendly) {
			const debugStr =
				typeof p.debug === 'string' && p.debug.trim() ? ` (détail : ${p.debug})` : '';
			throw new Error(`${friendly}${debugStr}`);
		}
		throw new Error(`Erreur serveur (HTTP ${response.status}). Réessaie dans un instant.`);
	}

	return parsed as T;
}
