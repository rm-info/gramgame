// Edge Function : signin
// Gère l'inscription (mode 'register') et la connexion (mode 'login') par username.
//
// 'register' : { username, email, redirect_to } → INSERT dans usernames,
//              envoie un magic link à l'email auth synthétique (sub-adressé
//              en interne pour permettre plusieurs comptes par boîte mail).
// 'login'    : { username, redirect_to } → lookup auth_email depuis username,
//              envoie un magic link.
//
// Cette fonction utilise la service_role_key pour bypasser RLS sur usernames.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BaseReq {
	username?: string;
	redirect_to?: string;
}
interface RegisterReq extends BaseReq {
	mode: 'register';
	email?: string;
}
interface LoginReq extends BaseReq {
	mode: 'login';
}
type Req = RegisterReq | LoginReq;

serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	}

	try {
		const body = (await req.json()) as Req;
		if (!body || (body.mode !== 'register' && body.mode !== 'login')) {
			return jsonResponse({ error: "Mode requis ('register' ou 'login')." }, 400);
		}

		const username = (body.username ?? '').trim().toLowerCase();
		if (!USERNAME_RE.test(username)) {
			return jsonResponse(
				{ error: "Nom d'utilisateur invalide : 3 à 20 caractères, lettres/chiffres/-/_." },
				400
			);
		}

		const admin = createClient(
			Deno.env.get('SUPABASE_URL')!,
			Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
			{ auth: { persistSession: false, autoRefreshToken: false } }
		);

		let authEmail: string;
		let realEmail: string;

		if (body.mode === 'register') {
			const email = ((body as RegisterReq).email ?? '').trim().toLowerCase();
			if (!EMAIL_RE.test(email)) {
				return jsonResponse({ error: 'Adresse email invalide.' }, 400);
			}
			authEmail = synthesizeAuthEmail(email, username);
			realEmail = email;

			// Le PK sur username garantit l'unicité atomiquement.
			const { error: insertError } = await admin
				.from('usernames')
				.insert({ username, real_email: realEmail, auth_email: authEmail });
			if (insertError) {
				if (insertError.code === '23505') {
					// unique violation : soit username, soit auth_email déjà pris
					return jsonResponse(
						{ error: "Ce nom d'utilisateur est déjà pris." },
						409
					);
				}
				console.error('Insert usernames failed', insertError);
				return jsonResponse({ error: 'Inscription échouée.' }, 500);
			}
		} else {
			const { data, error } = await admin
				.from('usernames')
				.select('auth_email, real_email')
				.eq('username', username)
				.maybeSingle();
			if (error) {
				console.error('Lookup failed', error);
				return jsonResponse({ error: 'Erreur interne.' }, 500);
			}
			if (!data) {
				return jsonResponse(
					{ error: "Aucun compte avec ce nom d'utilisateur." },
					404
				);
			}
			authEmail = data.auth_email;
			realEmail = data.real_email;
		}

		// Envoi du magic link à l'email auth synthétique.
		// Supabase Auth crée le user à la première fois, ou réutilise s'il existe.
		const { error: otpError } = await admin.auth.signInWithOtp({
			email: authEmail,
			options: body.redirect_to ? { emailRedirectTo: body.redirect_to } : undefined
		});
		if (otpError) {
			console.error('signInWithOtp failed', otpError);
			return jsonResponse({ error: 'Envoi du lien magique échoué.' }, 500);
		}

		return jsonResponse({
			ok: true,
			email_hint: maskEmail(realEmail)
		});
	} catch (e) {
		console.error('Erreur inattendue', e);
		return jsonResponse({ error: 'Erreur inattendue.' }, 500);
	}
});

/**
 * Synthétise un email "auth" sub-adressé pour permettre plusieurs comptes
 * dans la même boîte mail. Si le local-part contient déjà un `+xxx`, on le
 * remplace pour rester déterministe.
 *
 * Exemple : ('parent+abc@gmail.com', 'lea') → 'parent+gramgame-lea@gmail.com'
 */
function synthesizeAuthEmail(realEmail: string, username: string): string {
	const at = realEmail.lastIndexOf('@');
	const local = realEmail.slice(0, at);
	const domain = realEmail.slice(at + 1);
	const baseLocal = local.split('+')[0];
	return `${baseLocal}+gramgame-${username}@${domain}`;
}

function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`;
	return `${local[0]}${'*'.repeat(Math.min(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
}
