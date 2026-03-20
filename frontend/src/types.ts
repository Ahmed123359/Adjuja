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
  succes:              boolean;
  provider_utilise:    string;
  model_utilise:       string;
  texte_complet:       string;
  sections:            { titre: string; contenu: string; ordre: number }[];
  tokens_utilises:     number;
  erreur:              string | null;
  brief_strategique?:  string;
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
  total_tokens_ocr: number;
  max_tokens_cumul: number;
  max_appels:       number;
}

/** Version allégée pour la liste historique (sans résultat complet) */
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

export interface User {
  id:               string;
  nom:              string;
  prenom:           string;
  email:            string;
  created_at:       string;
  email_verified:   boolean;
  generations_used: number;
  max_generations:  number;  // 0 = illimité
}

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

export const DEFAULT_COMPANY: CompanyData = {
  nom:'', forme_juridique:'', date_creation:'', site_web:'',
  description:'', secteurs:'', expertises:'', certifications:'',
  effectif:'', chiffre_affaires:'',
  adresse:'', ville:'', telephone:'',
  rc:'', ice:'', cnss:'', if_fiscal:'',
  references:'',
};

// ── Chat RAG ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:     'user' | 'assistant';
  content:  string;
  sources?: string[];  // titres des documents RAG utilisés (côté assistant)
}

export interface ChatApiResponse {
  answer:           string;
  sources:          string[];
  tokens_used:      number;
  provider_utilise: string;
  model_utilise:    string;
}