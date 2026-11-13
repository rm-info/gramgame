import { pb, type UserRecord } from './pb';

/**
 * Session + comptes multiples sur le même navigateur.
 *
 * Chaque nom d'utilisateur est un compte PocketBase à part entière (avec son
 * propre token). Pour garder le sélecteur « Compte : lea / tom » sans relogin,
 * on mémorise le token de chaque compte connecté dans localStorage ; le compte
 * actif est celui chargé dans pb.authStore.
 */
const ACCOUNTS_KEY = 'gramgame.accounts';

type AccountTokens = Record<string, string>;

function readAccounts(): AccountTokens {
	try {
		const raw = localStorage.getItem(ACCOUNTS_KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function writeAccounts(accounts: AccountTokens) {
	try {
		localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
	} catch {
		// stockage indisponible (navigation privée…) : on garde juste la session active
	}
}

function isHttpStatus(e: unknown, ...codes: number[]) {
	const status = (e as { status?: number })?.status;
	return typeof status === 'number' && codes.includes(status);
}

class AuthState {
	user: UserRecord | null = $state(null);
	loading = $state(true);
	accounts: string[] = $state([]);
	private initialized = false;

	async init() {
		if (this.initialized) return;
		this.initialized = true;

		pb.authStore.onChange((token, record) => {
			this.user = (record as UserRecord | null) ?? null;
			if (token && record) {
				const accounts = readAccounts();
				accounts[(record as UserRecord).username] = token;
				this.saveAccounts(accounts);
			}
		});

		if (pb.authStore.isValid && pb.authStore.record) {
			this.user = pb.authStore.record as UserRecord;
			try {
				// Rafraîchit le token et le record (rôle, niveau…).
				await pb.collection('users').authRefresh();
			} catch (e) {
				if (isHttpStatus(e, 401, 403, 404)) this.dropActive();
				// Sinon (réseau…) on garde la session en cache.
			}
		} else if (pb.authStore.token) {
			this.dropActive();
		}

		// Purge les tokens expirés des autres comptes.
		const accounts = readAccounts();
		for (const [name, token] of Object.entries(accounts)) {
			if (!isTokenValid(token)) delete accounts[name];
		}
		this.saveAccounts(accounts);

		this.loading = false;
	}

	/** Appelée après un authWithOTP réussi. */
	addSession(token: string, record: UserRecord) {
		pb.authStore.save(token, record);
	}

	/** Bascule sur un autre compte déjà connecté sur ce navigateur. */
	async switchTo(username: string): Promise<boolean> {
		const token = readAccounts()[username];
		if (!token || !isTokenValid(token)) {
			this.forget(username);
			return false;
		}
		pb.authStore.save(token, null);
		try {
			await pb.collection('users').authRefresh();
			return true;
		} catch {
			pb.authStore.clear();
			this.forget(username);
			return false;
		}
	}

	/** Déconnecte le compte actif ; bascule sur un autre compte s'il en reste. */
	async signOut() {
		this.dropActive();
		for (const other of this.accounts) {
			if (await this.switchTo(other)) return;
		}
	}

	/** Met à jour le record du compte actif (après modification). */
	setRecord(record: UserRecord) {
		pb.authStore.save(pb.authStore.token, record);
	}

	private dropActive() {
		const name = (pb.authStore.record as UserRecord | null)?.username;
		pb.authStore.clear();
		if (name) this.forget(name);
	}

	private forget(username: string) {
		const accounts = readAccounts();
		delete accounts[username];
		this.saveAccounts(accounts);
		if (this.user?.username === username) {
			pb.authStore.clear();
		}
	}

	private saveAccounts(accounts: AccountTokens) {
		writeAccounts(accounts);
		this.accounts = Object.keys(accounts).sort();
	}
}

function isTokenValid(token: string): boolean {
	try {
		const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
		return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 10_000;
	} catch {
		return false;
	}
}

export const auth = new AuthState();
