// Socle HTTP : jeton d'authentification et helpers de reponse.
// Tout appel reseau de l'application passe par authHeaders() defini ici.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

// ── Token helpers ──────────────────────────────────────────────────────

const TOKEN_KEY = 'offria_token';
/** Plan choisi sur la page pricing avant que l'utilisateur soit connecté. Consommé une
 * seule fois juste après login/register (voir main.tsx::handleAuthSuccess), pour que le
 * clic sur "Commencer" mène au checkout même si l'utilisateur doit d'abord s'inscrire. */

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Helpers internes ───────────────────────────────────────────────────

/** Parse JSON sans planter si le corps est vide ou invalide. */

export async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** Traduit les erreurs réseau bas-niveau en message lisible. */

export function wrapNetworkError(err: unknown): never {
  if (err instanceof TypeError) {
    throw new Error('Serveur inaccessible. Vérifiez votre connexion et réessayez.');
  }
  throw err;
}
