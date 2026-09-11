// Profil entreprise, documents permanents et equipe (CVs).
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


// ── Profil entreprise ────────────────────────────────────────────────────────

export interface CompanyProfile {
  id:             string;
  org_id:         string;
  created_at:     string;
  updated_at:     string;
  nom_entreprise: string;
  ice:            string;
  rc:             string;
  if_fiscal:      string;
  cnss:           string;
  capital_social:  string;
  rib:             string;
  forme_juridique: string;
  adresse:        string;
  ville:          string;
  telephone:      string;
  email:          string;
  gerant_nom:     string;
  gerant_prenom:  string;
  gerant_cin:     string;
  secteur:        string;
  extra:               Record<string, unknown> | null;
  complet:             boolean;
  signature_minio_key: string | null;
  cachet_minio_key:    string | null;
  signature_url:       string | null;
  cachet_url:                    string | null;
  template_note_metho_minio_key: string | null;
  template_note_metho_url:       string | null;
  lu_et_accepte_minio_key:       string | null;
  lu_et_accepte_url:             string | null;
}

export type CompanyProfileForm = Omit<CompanyProfile, "id" | "org_id" | "created_at" | "updated_at" | "complet" | "signature_minio_key" | "cachet_minio_key" | "signature_url" | "cachet_url" | "template_note_metho_minio_key" | "template_note_metho_url" | "lu_et_accepte_minio_key" | "lu_et_accepte_url">;

export interface ProfileCheck {
  complet:          boolean;
  champs_manquants: string[];
  message:          string | null;
}

// ── Phase 5  Documents entreprise + Equipe CVs ──────────────────────────────

export interface StaffCv {
  id:                string;
  org_id:            string;
  created_at:        string;
  updated_at:        string;
  nom:               string;
  prenom:            string;
  poste:             string;
  specialite:        string;
  diplome:           string;
  annees_experience: number;
  actif:             boolean;
  details:           Record<string, unknown> | null;
  cv_minio_key:      string | null;
  cv_url:            string | null;
}

export type StaffCvForm = Omit<StaffCv, "id" | "org_id" | "created_at" | "updated_at" | "cv_minio_key" | "cv_url">;

export interface AoTeamMember {
  id:                string;
  ao_id:             string;
  staff_cv_id:       string | null;
  created_at:        string;
  role_dans_offre:   string;
  profil_requis_ref: string | null;
  warning:           boolean;
  cv:                StaffCv | null;
}

export interface CompanyDocument {
  id:            string;
  org_id:        string;
  created_at:    string;
  updated_at:    string;
  doc_type:      string;
  nom_fichier:   string;
  minio_key:     string | null;
  file_url:      string | null;
  description:   string | null;
  date_validite: string | null;
}
