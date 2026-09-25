// Appels du tableau de bord. Aucun composant n'appelle fetch directement.

import { authHeaders, readJson } from '../../shared/lib/http';
import type {
  AtRiskOut, CalendarEvent, DashboardSummary, PendingValidationsOut,
  Task, TaskForm, TaskList, TaskStatut,
} from './types';

const BASE = '/api/v1';

export async function fetchSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${BASE}/dashboard/summary`, { headers: authHeaders() });
  return readJson<DashboardSummary>(res, 'Erreur chargement du tableau de bord.');
}

/** Bornes obligatoires côté serveur, fenêtre limitée à 92 jours : on demande
 *  exactement le mois affiché, jamais plus large. */
export async function fetchCalendar(from: string, to: string): Promise<CalendarEvent[]> {
  const p = new URLSearchParams({ from, to });
  const res = await fetch(`${BASE}/dashboard/calendar?${p}`, { headers: authHeaders() });
  return readJson<CalendarEvent[]>(res, 'Erreur chargement du calendrier.');
}

/** Les AO dont l'echeance approche plus vite que le dossier n'avance. Le
 *  serveur croise date limite et progression ; le client n'a aucun seuil a
 *  connaitre. */
export async function fetchAtRisk(limit = 6): Promise<AtRiskOut> {
  const res = await fetch(`${BASE}/dashboard/at-risk?limit=${limit}`, { headers: authHeaders() });
  return readJson<AtRiskOut>(res, 'Erreur chargement des AO a risque.');
}

/** Les etapes du mode accompagne arretees sur une validation humaine. */
export async function fetchPendingValidations(limit = 6): Promise<PendingValidationsOut> {
  const res = await fetch(`${BASE}/dashboard/pending-validations?limit=${limit}`, { headers: authHeaders() });
  return readJson<PendingValidationsOut>(res, 'Erreur chargement des validations en attente.');
}

export async function fetchTasks(params: {
  assignee?: string;
  statut?:   string;
  ao_id?:    string;
  page?:     number;
  limit?:    number;
} = {}): Promise<TaskList> {
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') p.set(cle, String(valeur));
  }
  const res = await fetch(`${BASE}/tasks?${p}`, { headers: authHeaders() });
  return readJson<TaskList>(res, 'Erreur chargement des tâches.');
}

export async function createTask(data: TaskForm): Promise<Task> {
  const res = await fetch(`${BASE}/tasks`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(data),
  });
  return readJson<Task>(res, 'Erreur création de la tâche.');
}

export async function updateTask(id: string, data: Partial<TaskForm>): Promise<Task> {
  const res = await fetch(`${BASE}/tasks/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(data),
  });
  return readJson<Task>(res, 'Erreur modification de la tâche.');
}

export async function setTaskStatut(id: string, statut: TaskStatut): Promise<Task> {
  return updateTask(id, { statut });
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${BASE}/tasks/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Erreur suppression de la tâche.');
}

/** Correction manuelle d'un AO : sert ici à poser une date limite quand l'AO
 *  n'en a pas (créé à la main, ou importé avant la migration 014). */
export async function updateAoDateLimite(aoId: string, dateLimite: string | null): Promise<void> {
  const res = await fetch(`${BASE}/ao/${aoId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ date_limite: dateLimite }),
  });
  if (!res.ok) throw new Error("Erreur modification de l'appel d'offres.");
}
