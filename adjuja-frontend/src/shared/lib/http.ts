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

// ── Lecture de reponse ─────────────────────────────────────────────────

/** Message lisible pour un statut HTTP en echec, quand le serveur n'a rien
 *  d'exploitable a dire. Un 500 renvoie "Internal Server Error" en texte brut :
 *  le parser en JSON produisait jusqu'ici "Unexpected token 'I'...", illisible
 *  pour l'utilisateur (constate en reel le 2026-09-12). */
function messagePourStatut(status: number, fallback: string): string {
  if (status === 401) return "Votre session a expiré. Reconnectez-vous.";
  if (status === 403) return "Vous n'avez pas accès à cette ressource.";
  if (status === 404) return "Ressource introuvable.";
  if (status === 413) return "Le fichier est trop volumineux.";
  if (status === 429) return "Trop de requêtes. Patientez un instant avant de réessayer.";
  if (status === 502 || status === 503 || status === 504) {
    return "Le service est momentanément indisponible. Réessayez dans quelques instants.";
  }
  if (status >= 500) {
    return "Le serveur a rencontré une erreur. Si cela se répète, signalez-le nous.";
  }
  return fallback;
}

/** Lit le corps d'une reponse et leve une erreur lisible si le statut est en echec.
 *
 *  Remplace le couple `await res.json()` + `if (!res.ok) throw` qui plantait sur
 *  toute reponse non-JSON : le message d'erreur du parser masquait alors la vraie
 *  cause. Ici un corps non JSON n'empeche jamais d'afficher une erreur claire.
 *
 *  `fallback` est le message metier a afficher quand le serveur ne precise rien
 *  et que le statut n'a pas de message dedie. */
export async function readJson<T = unknown>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Corps non JSON (page d'erreur HTML, "Internal Server Error"...) : on garde
    // le texte brut de cote et on s'appuie sur le statut.
  }

  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail) throw new Error(detail);
    // FastAPI renvoie une liste d'erreurs de validation sur un 422.
    if (Array.isArray(detail) && detail.length) {
      const premier = detail[0] as { msg?: string };
      if (typeof premier?.msg === "string") throw new Error(premier.msg);
    }
    throw new Error(messagePourStatut(res.status, fallback));
  }

  return data as T;
}
