import { invokeFunction } from './_helpers';

export interface SigninResponse {
	ok: true;
	email_hint: string;
}

export function registerWithUsername(input: {
	username: string;
	email: string;
	redirect_to: string;
}): Promise<SigninResponse> {
	return invokeFunction<SigninResponse>('signin', { mode: 'register', ...input });
}

export function loginWithUsername(input: {
	username: string;
	redirect_to: string;
}): Promise<SigninResponse> {
	return invokeFunction<SigninResponse>('signin', { mode: 'login', ...input });
}
