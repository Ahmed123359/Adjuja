// Marches (ancien parcours, anterieur au pipeline AO).
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


// ── Marchés ─────────────────────────────────────────────────────────────────

export interface JobSummary {
  id:         string;
  job_id:     string;
  created_at: string;
  statut:     string;
}

export interface MarcheSummary {
  id:           string;
  reference:    string;
  acheteur:     string;
  objet:        string;
  statut:       string;
  created_at:   string;
  cps_uploaded: boolean;
  rc_uploaded:  boolean;
}

export interface MarcheDetail extends MarcheSummary {
  offre_technique_jobs: JobSummary[];
  filler_jobs:          JobSummary[];
  signing_jobs:         JobSummary[];
}
