// Panneau d'administration. Miroir de adjuja-backend/app/models/admin.py.

export interface Remplissage {
  champ: string;
  /** null : aucun avis ouvert. */
  ouverts_pct: number | null;
  /** Taux sur les avis ouverts découverts ces 7 jours ; null s'il n'y en a pas. */
  recents_pct: number | null;
  /** Ouverts deux fois moins remplis que récents : un re-scrape efface le champ. */
  alerte: boolean;
}

export interface EssaiScrape {
  debut: string;
  statut: 'ok' | 'erreur' | 'ignore';
  trouves: number;
  enregistres: number;
  erreur: string | null;
  declenchement: 'planifie' | 'admin';
}

export interface SourceVeille {
  source: string;
  table: 'ao' | 'bdc';
  ouverts: number;
  nouveaux_24h: number;
  nouveaux_7j: number;
  /** Fin du dernier passage réussi ; null si aucun n'est enregistré. */
  dernier_passage: string | null;
  /** Dernière tentative, réussie ou non. */
  dernier_essai: EssaiScrape | null;
  /** Aucun succès depuis deux intervalles planifiés. */
  passage_en_retard: boolean;
  remplissage: Remplissage[];
  dce_en_echec: number;
  analyses: { faites: number; a_enrichir: number } | null;
}

export interface VeilleSources {
  genere_le: string;
  sources: SourceVeille[];
}

export interface DceEchec {
  id: number;
  table: 'ao' | 'bdc';
  source: string;
  reference: string | null;
  titre: string;
  acheteur: string | null;
  date_limite: string | null;
  erreur: string;
}

export interface DceEchecs {
  total: number;
  items: DceEchec[];
}

/* ------------------------------------------------ actions et journal */

export type ActionVeille = 'scrape-ao' | 'scrape-bdc' | 'rattrapage-details' | 'enrichir-analyses';
export type SourceAo = 'marchespublics' | 'safakat_cdg' | 'achats_cimr';

export interface ParametresAction {
  /** Faux : simulation, rien n'est lu ni appelé. */
  reel: boolean;
  limite: number | null;
  source?: SourceAo | null;
}

export interface ActionLancee {
  id: string;
  action: ActionVeille;
  task_id: string;
  params: Record<string, unknown>;
}

export interface EtatTache {
  etat: 'en_attente' | 'en_cours' | 'termine' | 'echec';
  progression: { fait: number; total: number } | null;
  /** Compte rendu de la tâche (forme propre à chaque action). */
  resultat: Record<string, unknown> | null;
  erreur: string | null;
}

export interface LigneJournal {
  id: string;
  created_at: string;
  termine_at: string | null;
  admin_email: string;
  module: string;
  action: string;
  params: Record<string, unknown> | null;
  task_id: string | null;
  statut: 'lance' | 'termine' | 'echec' | 'refuse';
  resultat: Record<string, unknown> | null;
}

/* --------------------------------------- comptes, abonnements, accès */

export type CodeOffre = 'free' | 'starter' | 'pro' | 'enterprise';
export type EtatCompte = 'actif' | 'inactif' | 'suspendu';

export interface OrganisationLigne {
  org_id: string;
  nom: string;
  proprietaire_email: string;
  membres: number;
  offre: CodeOffre;
  statut_abonnement: string | null;
  echeance: string | null;
  dossiers_mois: number;
  dossiers_total: number;
  derniere_connexion: string | null;
  suspendue: boolean;
  creee_le: string;
}

export interface OrganisationsPage {
  total: number;
  page: number;
  par_page: number;
  items: OrganisationLigne[];
}

export interface Membre {
  id: string;
  nom: string;
  email: string;
  email_verifie: boolean;
  cree_le: string;
  derniere_connexion: string | null;
  suspendu_le: string | null;
  admin: boolean;
  proprietaire: boolean;
}

export interface Consommation { utilise: number; limite: number | null }

export interface OrganisationDetail {
  org_id: string;
  nom: string;
  creee_le: string;
  membres: Membre[];
  abonnement: {
    offre: CodeOffre;
    libelle: string;
    prix_mensuel_mad: number;
    statut: string | null;
    echeance: string | null;
    fin_de_grace: string | null;
    fournisseur: string | null;
  };
  dossiers_mois: Consommation;
  documents: Consommation;
  membres_limite: number | null;
  dossiers_par_statut: Record<string, number>;
  derniers_dossiers: { id: string; reference: string; objet: string; statut: string; cree_le: string }[];
  generations_30j: number;
}

export interface AbonnementLigne {
  org_id: string;
  nom: string;
  offre: CodeOffre;
  statut: string;
  echeance: string | null;
  fin_de_grace: string | null;
  fournisseur: string;
  mis_a_jour: string;
}

export interface Acces {
  administrateurs: {
    email: string;
    compte_existe: boolean;
    email_verifie: boolean;
    derniere_connexion: string | null;
    actif: boolean;
  }[];
  inscription_sur_invitation: boolean;
  adresses_autorisees: string[];
}

export interface Periode { j7: number; j30: number }
export interface PointJour { jour: string; valeur: number }

export interface TableauDeBord {
  genere_le: string;
  comptes_total: number;
  comptes_nouveaux: Periode;
  comptes_actifs: Periode;
  comptes_suspendus: number;
  organisations_total: number;
  organisations_par_offre: Record<string, number>;
  abonnements_par_statut: Record<string, number>;
  revenu_mensuel_estime_mad: number;
  dossiers_crees: Periode;
  generations: Periode;
  paiements_en_retard: number;
  echeances_7j: number;
  veille_sources_en_retard: number;
  veille_champs_en_alerte: number;
  veille_dce_en_echec: number;
  inscriptions_30j: PointJour[];
  dossiers_30j: PointJour[];
}
