// Edge Function : signin
// Gère l'inscription (mode 'register') et la connexion (mode 'login') par username.
//
// Modèle : 1 email = 1 auth.users (Supabase). N usernames peuvent pointer vers
// le même auth user. Le bon username est routé via un paramètre URL dans le
// magic link, et "claim" en BDD au /auth-callback (UPDATE usernames.user_id).
//
// 'register' : { username, email, redirect_to } → INSERT usernames(username,
//              real_email, user_id=NULL) puis signInWithOtp(email).
// 'login'    : { username, redirect_to } → lookup real_email depuis username,
//              signInWithOtp(real_email).
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

		let realEmail: string;

		if (body.mode === 'register') {
			const email = ((body as RegisterReq).email ?? '').trim().toLowerCase();
			if (!EMAIL_RE.test(email)) {
				return jsonResponse({ error: 'Adresse email invalide.' }, 400);
			}
			realEmail = email;

			// Le PK sur username garantit l'unicité atomiquement.
			const { error: insertError } = await admin
				.from('usernames')
				.insert({ username, real_email: realEmail });
			if (insertError) {
				if (insertError.code === '23505') {
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
				.select('real_email')
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
			realEmail = data.real_email;
		}

		// Routage : on injecte le username dans l'URL de redirection pour qu'au
		// /auth-callback on sache quel username "activer" (claim côté BDD).
		const redirectTo = appendUsername(body.redirect_to ?? '', username);

		const { error: otpError } = await admin.auth.signInWithOtp({
			email: realEmail,
			options: redirectTo ? { emailRedirectTo: redirectTo } : undefined
		});
		if (otpError) {
			console.error('signInWithOtp failed', otpError);
			return jsonResponse({ error: otpError.message ?? 'Envoi du lien magique échoué.' }, 500);
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
 * Ajoute `?username=<X>` (ou `&username=<X>`) à l'URL de redirection donnée.
 * Si l'URL est vide, retourne une chaîne vide (Supabase utilisera son défaut).
 */
function appendUsername(redirectTo: string, username: string): string {
	if (!redirectTo) return '';
	const sep = redirectTo.includes('?') ? '&' : '?';
	return `${redirectTo}${sep}username=${encodeURIComponent(username)}`;
}

function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`;
	return `${local[0]}${'*'.repeat(Math.min(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
}
