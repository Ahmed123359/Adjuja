export interface Model {
  provider:    string;
  model_id:    string;
  description: string;
  defaut:      boolean;
}

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
  succes:            boolean;
  provider_utilise:  string;
  model_utilise:     string;
  texte_complet:     string;
  sections:          { titre: string; contenu: string; ordre: number }[];
  tokens_utilises:   number;
  erreur:            string | null;
}

export type AppState = 'idle' | 'loading' | 'result' | 'error';

export interface RagStatus {
  ready:           boolean;
  doc_count:       number;
  chunk_count:     number;
  document_types:  Record<string, string>;
  etl_available?:  boolean;
}

export interface AppDefaults {
  company:      CompanyData;
  instructions: string;
  temperature:  number;
  max_tokens:   number;
}

export interface UsageData {
  total_tokens:     number;
  total_appels:     number;
  max_tokens_cumul: number;
  max_appels:       number;
}

export const DEFAULT_COMPANY: CompanyData = {
  nom:'', forme_juridique:'', date_creation:'', site_web:'',
  description:'', secteurs:'', expertises:'', certifications:'',
  effectif:'', chiffre_affaires:'',
  adresse:'', ville:'', telephone:'',
  rc:'', ice:'', cnss:'', if_fiscal:'',
  references:'',
};
