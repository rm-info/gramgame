import { auth } from '$lib/auth.svelte';
import { pb, type UserRecord } from '$lib/pb';
import { callGram } from './_helpers';

export interface OtpRequestResponse {
	otpId: string;
	email_hint: string;
}

/** Crée le compte et envoie un code par mail. */
export function registerWithUsername(input: {
	username: string;
	email: string;
	role?: 'eleve' | 'parent';
}): Promise<OtpRequestResponse> {
	return callGram<OtpRequestResponse>('register', input);
}

/** Envoie un code de connexion à l'adresse associée au nom d'utilisateur. */
export function loginWithUsername(input: { username: string }): Promise<OtpRequestResponse> {
	return callGram<OtpRequestResponse>('login', input);
}

/** Valide le code reçu par mail et ouvre la session. */
export async function verifyCode(otpId: string, code: string): Promise<UserRecord> {
	try {
		const res = await pb.collection('users').authWithOTP<UserRecord>(otpId, code.trim());
		auth.addSession(res.token, res.record);
		return res.record;
	} catch (e) {
		const status = (e as { status?: number })?.status;
		if (status === 429) {
			throw new Error('Trop d\'essais. Demande un nouveau code dans quelques minutes.');
		}
		throw new Error('Code invalide ou expiré.');
	}
}
