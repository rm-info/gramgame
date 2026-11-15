import { auth } from './auth.svelte';
import type { Role } from './pb';

export type { Role };

/**
 * Vue pratique sur le compte actif (nom, rôle, comptes disponibles).
 * Tout l'état vit dans `auth` ; ici ce ne sont que des accesseurs.
 */
class ActiveUsername {
	get username(): string | null {
		return auth.user?.username ?? null;
	}
	get availableNames(): string[] {
		const names = new Set(auth.accounts);
		if (auth.user) names.add(auth.user.username);
		return [...names].sort();
	}
	get role(): Role {
		return auth.user?.role ?? 'eleve';
	}
	get isAdmin() {
		return this.role === 'admin';
	}
	get canEditExercises() {
		return this.role === 'prof' || this.role === 'admin';
	}
	/** Parent, prof ou admin : accès au tableau de suivi des élèves. */
	get isSupervisor() {
		return this.role === 'parent' || this.role === 'prof' || this.role === 'admin';
	}
	get isStudent() {
		return this.role === 'eleve';
	}
	get loaded() {
		return !auth.loading;
	}
}

export const activeUsername = new ActiveUsername();
