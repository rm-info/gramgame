import { supabase } from '$lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface SigninResponse {
	ok: true;
	email_hint: string;
}

async function invoke(body: Record<string, unknown>): Promise<SigninResponse> {
	const { data, error } = await supabase.functions.invoke('signin', { body });
	if (error) {
		if (error instanceof FunctionsHttpError) {
			try {
				const errBody = await error.context.json();
				if (errBody?.error) throw new Error(errBody.error);
			} catch (e) {
				if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
			}
		}
		throw new Error(error instanceof Error ? error.message : 'Erreur réseau.');
	}
	return data as SigninResponse;
}

export function registerWithUsername(input: {
	username: string;
	email: string;
	redirect_to: string;
}): Promise<SigninResponse> {
	return invoke({ mode: 'register', ...input });
}

export function loginWithUsername(input: {
	username: string;
	redirect_to: string;
}): Promise<SigninResponse> {
	return invoke({ mode: 'login', ...input });
}
