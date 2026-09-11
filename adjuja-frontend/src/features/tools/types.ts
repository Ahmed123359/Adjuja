// Outils de traitement de documents : acte d'engagement, remplissage,
// offre technique.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


export interface ActeEngagementData {
  type_soumissionnaire: 'physique' | 'morale' | 'groupement';
  signataire_nom:       string;
  adresse_domicile:     string;
  telephone:            string;
  fax:                  string;
  email:                string;
  rib:                  string;
  cnss:                 string;
  rc_localite:          string;
  rc_numero:            string;
  taxe_pro:             string;
  ice:                  string;
  raison_sociale:       string;
  forme_juridique:      string;
  capital_social:       string;
  adresse_siege:        string;
  membres_groupement:   string;
  fait_a_lieu:          string;
  fait_a_date:          string;
}

export const DEFAULT_ACTE_ENGAGEMENT: ActeEngagementData = {
  type_soumissionnaire: 'morale',
  signataire_nom: '', adresse_domicile: '',
  telephone: '', fax: '', email: '', rib: '',
  cnss: '', rc_localite: '', rc_numero: '', taxe_pro: '', ice: '',
  raison_sociale: '', forme_juridique: '', capital_social: '', adresse_siege: '',
  membres_groupement: '',
  fait_a_lieu: '', fait_a_date: '',
};

// ── Remplissage dossier AO ──────────────────────────────────────────────────

export type CompanyCase =
  | 'societe'
  | 'personne_physique'
  | 'auto_entrepreneur'
  | 'groupement'
  | 'cooperative'
  | 'etablissement_public';

export interface FillerOutputFile {
  doc_type:     string;
  filename:     string;
  format:       string;  // 'pdf' | 'docx' | 'excel'
  download_url: string;
}

export interface FillerResult {
  job_id:   string;
  succes:   boolean;
  fichiers: FillerOutputFile[];
  erreurs:  string[];
  message:  string;
}

// ── Offre Technique ──────────────────────────────────────────────────────────

export interface OffreTechniqueOutputFile {
  filename:     string;
  format:       string;
  download_url: string;
}

export interface SectionScore {
  score:  number;
  issues: string[];
}

export interface QualityReport {
  conformite:      SectionScore;
  coherence:       SectionScore;
  differentiation: SectionScore;
  global_score:    number;
  approved:        boolean;
}

export interface OffreTechniqueResult {
  job_id:   string;
  succes:   boolean;
  fichiers: OffreTechniqueOutputFile[];
  quality:  QualityReport | null;
  erreurs:  string[];
  message:  string;
}
