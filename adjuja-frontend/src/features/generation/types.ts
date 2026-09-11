// Generation de documents et historique.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


export interface CompanyData {
  nom:               string;
  forme_juridique:   string;
  date_creation:     string;
  site_web:          string;
  description:       string;
  secteurs:          string;
  expertises:        string;
  certifications:    string;
  effectif:          string;
  chiffre_affaires:  string;
  adresse:           string;
  ville:             string;
  telephone:         string;
  rc:                string;
  ice:               string;
  cnss:              string;
  if_fiscal:         string;
  references:        string;
}

export interface GenerationResult {
  succes:              boolean;
  provider_utilise:    string;
  model_utilise:       string;
  texte_complet:       string;
  sections:            { titre: string; contenu: string; ordre: number }[];
  tokens_utilises:     number;
  erreur:              string | null;
  brief_strategique?:  string;
}

export const DEFAULT_COMPANY: CompanyData = {
  nom:'', forme_juridique:'', date_creation:'', site_web:'',
  description:'', secteurs:'', expertises:'', certifications:'',
  effectif:'', chiffre_affaires:'',
  adresse:'', ville:'', telephone:'',
  rc:'', ice:'', cnss:'', if_fiscal:'',
  references:'',
};

export interface HistorySummary {
  id:              string;
  created_at:      string;
  ao_excerpt:      string;
  company_nom:     string;
  provider:        string;
  model:           string;
  tokens_utilises: number;
  langue:          string;
}

/** Entrée complète avec le résultat de génération */

export interface HistoryEntry extends HistorySummary {
  result: GenerationResult;
}
