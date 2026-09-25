// Veille des appels d'offres et des bons de commande (service ao-watcher).
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


// ── AO Watcher ───────────────────────────────────────────────────────────────

export type ScrapedAoStatus = 'new' | 'seen' | 'favorited' | 'imported';

/** Étape réelle d'un téléchargement de documents en cours (AO ou BDC), renvoyée
 * par GET /aos/{id} et GET /bdc/{id}. Temps calculés côté serveur. */
export interface DownloadProgress {
  etape:          string;
  tentative:      number | null;
  max_tentatives: number | null;
  elapsed_s:      number;
  retry_in_s:     number | null;
}

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
  mode_passation:   string | null;
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
  download_progress?: DownloadProgress | null;
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
  mode_passation:   string;
  region:           string;
  date_limite_from: string;
  secteur_codes:    string[];
  page:             number;
}

export interface ModePassation {
  code:  string;
  label: string;
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
  download_progress?: DownloadProgress | null;
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
