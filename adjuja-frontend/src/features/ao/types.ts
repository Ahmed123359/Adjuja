// Pipeline Appel d'offres, dans ses deux regimes : express et accompagne.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


// ── Pipeline Appel d'offres (Phase 4) ────────────────────────────────────────

export interface AoDocumentOut {
  id:            string;
  dossier:       string;
  doc_type:      string;
  origine:       string;
  statut:        string;
  nom_fichier:   string;
  taille_octets: number;
  minio_key:     string | null;
}

export interface AoSummary {
  id:           string;
  reference:    string;
  acheteur:     string;
  objet:        string;
  statut:       string;
  pipeline_pct: number;
  created_at:   string;
  updated_at:   string;
  mode?:        AoMode;
  /** Date limite de remise (ISO). Ajoutee par la migration 014 : elle arrivait
   *  de la veille a chaque import mais n'etait stockee nulle part. */
  date_limite?: string | null;
}

export interface AoResponse extends AoSummary {
  erreur_message: string | null;
  analyse_json:   Record<string, unknown> | null;
  documents:      AoDocumentOut[];
}

export interface AoStatus {
  id:             string;
  statut:         string;
  pipeline_pct:   number;
  erreur_message: string | null;
}

// Regime de traitement d'un AO : express (un clic, tout s'enchaine) ou
// accompagne (7 etapes, une porte de validation entre chacune).
export type AoMode = 'express' | 'accompagne';

export type AoStepKey =
  | 'documents'
  | 'comprehension'
  | 'decision'
  | 'preparation'
  | 'redaction'
  | 'remplissage'
  | 'signature';

export type AoStepStatut =
  | 'a_faire'
  | 'en_cours'
  | 'attente_validation'
  | 'validee'
  | 'non_applicable'
  | 'erreur';

export interface AoStep {
  step_key:       AoStepKey;
  step_order:     number;
  statut:         AoStepStatut;
  applicable:     boolean | null;
  erreur_message: string | null;
  started_at:     string | null;
  completed_at:   string | null;
  validated_at:   string | null;
  validated_by:   string | null;
}

export interface StepAssistResponse {
  answer:  string;
  sources: string[];
}
