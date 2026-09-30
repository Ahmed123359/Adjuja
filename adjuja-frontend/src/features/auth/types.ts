// Utilisateur authentifie.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


export interface User {
  id:               string;
  org_id?:          string | null;
  nom:              string;
  prenom:           string;
  email:            string;
  created_at:       string;
  email_verified:   boolean;
  generations_used: number;
  max_generations:  number;  // 0 = illimité
  /** Ouvre l'onglet Administration ; chaque route admin revérifie côté serveur. */
  is_platform_admin?: boolean;
}
