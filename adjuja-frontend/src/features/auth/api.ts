// Authentification : inscription, connexion, OTP, Google OAuth.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, safeJson, setToken, wrapNetworkError } from '../../shared/lib/http';
import type { User } from '../../types';

// ── Authentification ───────────────────────────────────────────────────

export type PasswordRules = { min_length: number; require_digit: boolean };

export async function getPasswordRules(): Promise<PasswordRules> {
  const res = await fetch('/api/v1/auth/password-rules');
  if (!res.ok) {
    return { min_length: 8, require_digit: true };
  }
  return res.json();
}

/** Retourne true si admin (connecté directement), false si email envoyé */

export async function register(params: {
  nom: string; prenom: string; email: string; password: string;
  entreprise?: string; secteur_activite?: string; nb_ao_par_an?: number | null;
}): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) {
    if (Array.isArray(data?.detail)) {
      throw new Error((data.detail as { msg: string }[]).map(e => e.msg).join(' '));
    }
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur lors de l\'inscription. Réessayez.');
  }
  if (data?.access_token) {
    setToken(data.access_token);
    return true;
  }
  return false;
}

export async function verifyOtp(email: string, otp: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/verify-otp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, otp }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Code invalide. Réessayez.');
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
}

export async function forgotPassword(email: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur. Réessayez.');
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, otp, new_password: newPassword }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) {
    if (Array.isArray(data?.detail)) {
      throw new Error((data.detail as { msg: string }[]).map(e => e.msg).join(' '));
    }
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Code invalide. Réessayez.');
  }
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
}

export async function login(email: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) {
    const msg = typeof data?.detail === 'string' ? data.detail : null;
    throw new Error(msg ?? (res.status === 401 ? 'Email ou mot de passe incorrect.' : 'Erreur serveur. Réessayez dans un instant.'));
  }
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
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
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/google/callback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, redirect_uri: googleCallbackUrl() }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur Google OAuth. Réessayez.');
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
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
