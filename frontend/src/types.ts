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
  org_id?:          string | null;
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

// ── AO Watcher ───────────────────────────────────────────────────────────────

export type ScrapedAoStatus = 'new' | 'seen' | 'favorited' | 'imported';

export interface ScrapedAo {
  id:               number;
  source:           string;
  external_id:      string;
  url_source:       string;
  acheteur:         string | null;
  titre:            string;
  date_publication: string | null;
  date_limite:      string | null;
  categorie:        string | null;
  secteur:          string | null;
  region:           string | null;
  ville:            string | null;
  budget_estime:    string | null;
  caution:          string | null;
  status:           ScrapedAoStatus;
  scraped_at:       string;
  zip_url:          string | null;
  zip_minio_key:    string | null;
  zip_downloaded_at: string | null;
  zip_error:        string | null;
  classified_docs:  Record<string, string> | null;
  description:      string | null;
  secteur_codes:    string[] | null;
  analyse_json:     Record<string, unknown> | null;
}

export type EligibilityVerdictType = 'go' | 'no_go' | 'risque';

export interface EligibilityVerdict {
  analyse_json: Record<string, unknown>;
  verdict:      EligibilityVerdictType;
  raisons:      string[];
  details:      Record<string, unknown>;
}

export interface ScrapedAoList {
  items: ScrapedAo[];
  total: number;
  page:  number;
  limit: number;
}

export interface WatcherFilters {
  status:           'all' | ScrapedAoStatus;
  search:           string;
  categorie:        string;
  region:           string;
  date_limite_from: string;
  secteur_codes:    string[];
  page:             number;
}

// ── Nomenclature des secteurs d'activite (taxonomie Sodipress) ──────────────

export type AoCategorie = 'Travaux' | 'Fournitures' | 'Services';

export interface Secteur {
  code:      string;
  label:     string;
  activites: string[];
  categorie: AoCategorie;
}

// ── BDC Watcher (Bons de commande, deuxieme source de veille) ──────────────

export type BdcStatus = 'new' | 'seen' | 'favorited';

export interface ScrapedBdc {
  id:                number;
  source:            string;
  external_id:       string;
  url_source:        string;
  acheteur:          string | null;
  titre:             string;
  date_publication:  string | null;
  date_limite:       string | null;
  categorie:         string | null;
  nature_prestation: string | null;
  region:            string | null;
  ville:             string | null;
  est_annule:        boolean;
  date_annulation:   string | null;
  raison_annulation: string | null;
  document_url:      string | null;
  document_nom:      string | null;
  zip_minio_key:     string | null;
  zip_downloaded_at: string | null;
  zip_error:         string | null;
  status:            BdcStatus;
  scraped_at:        string;
}

export interface ScrapedBdcList {
  items: ScrapedBdc[];
  total: number;
  page:  number;
  limit: number;
}

export interface WatcherBdcFilters {
  status:             'all' | BdcStatus;
  search:             string;
  categorie:          string;
  nature_prestations: string[];
  region:             string;
  date_limite_from:   string;
  page:               number;
}

export interface NaturePrestation {
  code:      string;
  label:     string;
  categorie: AoCategorie;
}

// ── Billing & Subscriptions ─────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type PlanCode = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanLimit {
  used:  number;
  limit: number | null; // null = illimité
}

export interface BillingUsage {
  ao_per_month: PlanLimit;
  documents:    PlanLimit;
}

export interface Subscription {
  plan_code:           PlanCode;
  status:               SubscriptionStatus;
  current_period_end:  string | null;
  usage:                BillingUsage;
}
