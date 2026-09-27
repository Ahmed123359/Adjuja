// Authentification : inscription, connexion, OTP, Google OAuth.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, readJson, safeJson, setToken, wrapNetworkError } from '../../shared/lib/http';
import type { User } from '../../types';

// ── Authentification ───────────────────────────────────────────────────
//
// Toutes les reponses passent par readJson (2026-09-27) : il donne un message
// lisible pour un 429 (le limiteur renvoie {"error": ...} sans `detail`, que
// l'ancien code affichait comme « Erreur serveur »), pour un 5xx et pour un
// corps non JSON.

export type PasswordRules = { min_length: number; require_digit: boolean };

const REGLES_PAR_DEFAUT: PasswordRules = { min_length: 8, require_digit: true };

/** Ne leve jamais : les regles par defaut valent mieux qu'un formulaire bloque. */
export async function getPasswordRules(): Promise<PasswordRules> {
  try {
    const res = await fetch('/api/v1/auth/password-rules');
    if (!res.ok) return REGLES_PAR_DEFAUT;
    return (await safeJson<PasswordRules>(res)) ?? REGLES_PAR_DEFAUT;
  } catch {
    return REGLES_PAR_DEFAUT;
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (err) {
    wrapNetworkError(err);
  }
}

function garderJeton(data: { access_token?: string } | null): void {
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
}

/** Retourne true si admin (connecté directement), false si un code a été envoyé.
 *  Rappeler avec les mêmes données renvoie un nouveau code. */

export async function register(params: {
  nom: string; prenom: string; email: string; password: string;
  entreprise?: string; secteur_activite?: string; nb_ao_par_an?: number | null;
}): Promise<boolean> {
  const res = await postJson('/api/v1/auth/register', params);
  const data = await readJson<{ access_token?: string } | null>(res, "Erreur lors de l'inscription. Réessayez.");
  if (data?.access_token) {
    setToken(data.access_token);
    return true;
  }
  return false;
}

export async function verifyOtp(email: string, otp: string): Promise<void> {
  const res = await postJson('/api/v1/auth/verify-otp', { email, otp });
  garderJeton(await readJson<{ access_token?: string } | null>(res, 'Code invalide. Réessayez.'));
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await postJson('/api/v1/auth/forgot-password', { email });
  await readJson(res, 'Envoi impossible. Réessayez.');
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  const res = await postJson('/api/v1/auth/reset-password', { email, otp, new_password: newPassword });
  garderJeton(await readJson<{ access_token?: string } | null>(res, 'Code invalide. Réessayez.'));
}

export async function login(email: string, password: string): Promise<void> {
  const res = await postJson('/api/v1/auth/login', { email, password });
  garderJeton(await readJson<{ access_token?: string } | null>(res, 'Email ou mot de passe incorrect.'));
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

const GOOGLE_OAUTH_STATE_KEY = 'google_oauth_state';

export function googleCallbackUrl(): string {
  return `${window.location.origin}/auth/google/callback`;
}

/** Redirection reelle vers Google -- plus de SDK, plus de bouton cache, plus de clic
 * synthetique. `state` protege contre le CSRF (verifie au retour dans GoogleCallbackPage). */

export function startGoogleLogin(): void {
  const state = crypto.randomUUID();
  sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state);
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  googleCallbackUrl(),
    response_type: 'code',
    scope:         'openid email profile',
    state,
    prompt:        'select_account',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function consumeGoogleOAuthState(): string | null {
  const state = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
  sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
  return state;
}

export async function loginWithGoogleCode(code: string): Promise<void> {
  const res = await postJson('/api/v1/auth/google/callback', { code, redirect_uri: googleCallbackUrl() });
  garderJeton(await readJson<{ access_token?: string } | null>(res, 'Erreur Google OAuth. Réessayez.'));
}

export async function getMe(): Promise<User> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/me', { headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  if (!res.ok) throw new Error('Non authentifié.');
  const data = await safeJson<User>(res);
  if (!data) throw new Error('Non authentifié.');
  return data;
}
