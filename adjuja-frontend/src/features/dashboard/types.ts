// Tableau de bord collaboratif : tâches d'équipe, calendrier, tuiles de résumé.
// Voir context/feature-spec/dashboard-collaboratif/.

export type TaskStatut = 'a_faire' | 'en_cours' | 'faite';

export interface Task {
  id:           string;
  org_id:       string;
  ao_id:        string | null;
  titre:        string;
  description:  string | null;
  assignee_id:  string | null;
  created_by:   string;
  statut:       TaskStatut;
  echeance:     string | null;
  created_at:   string;
  updated_at:   string;
  completed_at: string | null;
  /** Repris de l'AO lié par le serveur, pour éviter un second appel. */
  ao_reference: string | null;
  ao_objet:     string | null;
}

export interface TaskList {
  items: Task[];
  total: number;
  page:  number;
  limit: number;
}

export interface TaskForm {
  titre:       string;
  description?: string | null;
  ao_id?:      string | null;
  assignee_id?: string | null;
  echeance?:   string | null;
  statut?:     TaskStatut;
}

export type CalendarEventType = 'ao_deadline' | 'task';

export interface CalendarEvent {
  date:    string;   // AAAA-MM-JJ
  type:    CalendarEventType;
  titre:   string;
  statut:  string;
  ao_id:   string | null;
  task_id: string | null;
}

export interface NextDeadline {
  date:    string;
  titre:   string;
  type:    CalendarEventType;
  ao_id:   string | null;
  task_id: string | null;
}

export interface DashboardSummary {
  ao_par_statut:       Record<string, number>;
  ao_total:            number;
  taches_ouvertes:     number;
  mes_taches_ouvertes: number;
  taches_en_retard:    number;
  prochaine_echeance:  NextDeadline | null;
}

/** Niveaux renvoyes par /dashboard/at-risk. `ok` n'existe pas : un AO qui va
 *  bien n'est pas renvoye. */
export type RiskLevel = 'en_retard' | 'critique' | 'tendu';

export interface AtRiskItem {
  ao_id:       string;
  reference:   string;
  objet:       string;
  acheteur:    string;
  date_limite: string;
  /** Negatif si la date est depassee. */
  jours_restants: number;
  /** 0 a 100, calculee selon le mode de l'AO (voir la spec cote serveur). */
  progression: number;
  /** Avance acquise moins temps consomme, de -1 a 1. */
  marge:       number;
  mode:        string;
  statut:      string;
  niveau:      RiskLevel;
  etape_courante: string | null;
}

export interface AtRiskOut {
  items: AtRiskItem[];
  /** AO actifs sans date limite : leur risque n'est pas calculable. */
  sans_echeance: number;
}

export interface PendingValidationItem {
  ao_id:      string;
  reference:  string;
  objet:      string;
  step_key:   string;
  step_order: number;
  depuis:     string | null;
  jours_attente: number;
  date_limite: string | null;
}

export interface PendingValidationsOut {
  items: PendingValidationItem[];
  total: number;
}
