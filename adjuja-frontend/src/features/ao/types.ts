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
  analyse_json:   AnalyseAo | null;
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

// ── Fit score (context/feature-spec/fit-score/) ─────────────────────────────

export type FitFacteurCode =
  | 'qualifications' | 'capacite_financiere' | 'references'
  | 'equipe' | 'conformite_administrative' | 'proximite';

export interface FitAction {
  /** Onglet des reglages d'entreprise a ouvrir. */
  cible: 'profil' | 'documents' | 'equipe';
  /** Champ du profil vers lequel defiler, quand il y en a un. */
  champ: string | null;
}

export interface FitFacteur {
  code:          FitFacteurCode;
  poids:         number;
  /** 0-100, null quand l'AO n'exige rien sur ce facteur. */
  score:         number | null;
  exige:         boolean;
  confiance:     'haute' | 'moyenne' | 'faible';
  justification: string;
  action:        FitAction | null;
}

export interface FitScore {
  /** null quand aucun facteur n'est exige : pas de score fabrique. */
  score:              number | null;
  eligibilite:        'eligible' | 'a_verifier' | 'non_eligible';
  bloquants:          string[];
  avertissements:     string[];
  facteurs:           FitFacteur[];
  methode_references: 'embeddings' | 'mots_cles';
}

// ── Analyse enrichie (spec analyse-ao-enrichie) ──────────────────────────────
// Toutes les cles sont optionnelles : une analyse anterieure au chantier n'a
// ni `risques` ni les autres sections. La gravite vient TOUJOURS du serveur.

export type Gravite = 'critique' | 'elevee' | 'moderee' | 'faible';
export type TypeRisque = 'financier' | 'penalites' | 'eliminatoire' | 'capacite_technique' | 'delai' | 'administratif';
export type Probabilite = 'faible' | 'moyenne' | 'forte';
export type Impact = 'faible' | 'moyen' | 'fort';
export type TypeJalon = 'depot' | 'visite' | 'questions' | 'ouverture' | 'execution' | 'autre';

export interface Risque {
  type:        TypeRisque;
  titre:       string;
  clause?:     string;
  reference?:  string;
  probabilite: Probabilite;
  impact:      Impact;
  gravite:     Gravite;
  conseil?:    string;
}

export interface Jalon { libelle: string; date?: string | null; type: TypeJalon; reference?: string }
export interface QuestionMoa { question: string; motif?: string; reference?: string }
export interface ClauseSurveillee { sujet: string; clause?: string; reference?: string; pourquoi?: string }
export interface DecompositionBudgetaire {
  montant_estime?: number | null;
  postes?: { libelle: string; montant?: number | null }[];
  source?: string;
}

export interface MetaTypeDocument {
  lots?: number;
  caracteres_lus?: number;
  caracteres_perdus?: number;
  articles_total?: number;
  articles_gardes?: number;
}

export interface AnalyseAo {
  [cle: string]: unknown;
  contexte?: {
    intitule?: string; acheteur?: string; objet?: string;
    date_limite?: string; budget_estime?: number | null; lots?: unknown[];
  };
  documents_requis?: { nom: string; obligatoire?: boolean; source?: string }[];
  criteres_ponderation?: { nom: string; poids?: number | null }[];
  profils_requis?: { poste?: string; specialite?: string; diplome_min?: string; annees_experience_min?: number | null }[];
  qualification_requise?: string | null;
  certifications_requises?: string[];
  chiffre_affaires_minimum_exige?: number | null;
  nombre_references_similaires_exige?: number | null;
  montant_caution?: number | null;
  risques?: Risque[];
  decomposition_budgetaire?: DecompositionBudgetaire | null;
  clauses_a_surveiller?: ClauseSurveillee[];
  questions_moa?: QuestionMoa[];
  jalons?: Jalon[];
  _analyse_meta?: {
    cps?: MetaTypeDocument;
    rc?: MetaTypeDocument;
    partielle?: boolean;
    sans_texte?: string[];
  };
}
