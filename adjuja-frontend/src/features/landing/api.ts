import { readJson, wrapNetworkError } from "../../shared/lib/http";

/** Inscription a la lettre d'information, route publique (pas de jeton).
 *  Leve une erreur lisible si l'adresse est refusee ou le serveur injoignable. */
export async function subscribeNewsletter(email: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/v1/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch (err) {
    wrapNetworkError(err);
  }
  await readJson(res, "Adresse invalide ou déjà inscrite.");
}
