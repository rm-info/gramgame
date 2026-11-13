import PocketBase, { LocalAuthStore, type RecordModel } from 'pocketbase';

/**
 * Client PocketBase singleton.
 *
 * L'app est toujours servie sur la même origine que l'API :
 *  - en prod, PocketBase sert lui-même le build statique (pb_public/) ;
 *  - en dev, vite proxifie /api et /_ vers PocketBase (cf. vite.config.ts).
 * D'où la base URL relative.
 */
export const pb = new PocketBase('/', new LocalAuthStore('gramgame.auth'));

// Les $effect Svelte peuvent relancer la même requête : on désactive
// l'annulation automatique des requêtes dupliquées du SDK.
pb.autoCancellation(false);

export type Role = 'user' | 'prof' | 'admin';

export interface UserRecord extends RecordModel {
	username: string;
	real_email: string;
	role: Role;
	grade_level: string;
	verified: boolean;
	created: string;
}

/** Message d'erreur lisible depuis une erreur du SDK ou une Error classique. */
export function errorMessage(e: unknown): string {
	if (e && typeof e === 'object') {
		const resp = (e as { response?: { message?: string; error?: string } }).response;
		if (resp?.error) return resp.error;
		if (resp?.message) return resp.message;
		if ((e as Error).message) return (e as Error).message;
	}
	return String(e);
}

/** Échappe une valeur pour un filtre PocketBase. */
export const filter = (expr: string, params: Record<string, unknown>) => pb.filter(expr, params);
