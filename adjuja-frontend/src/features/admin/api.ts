// Panneau d'administration. Aucun composant n'appelle fetch directement.
// Chaque route /api/v1/admin/* revérifie côté serveur que le compte est
// administrateur : l'onglet caché n'est qu'un confort d'affichage.

import { authHeaders, readJson } from '../../shared/lib/http';
import type {
  Acces, AbonnementLigne, ActionLancee, ActionVeille, CodeOffre, DceEchecs, EtatCompte, EtatTache,
  LigneJournal, OrganisationDetail, OrganisationsPage, ParametresAction, TableauDeBord, VeilleSources,
} from './types';

const BASE = '/api/v1/admin';

/** 403 : le compte n'est pas (ou plus) administrateur. Levée à part pour que
 *  l'écran dise pourquoi, au lieu d'un « Accès refusé. » sans contexte. */
export class AccesAdminRefuse extends Error {
  constructor() {
    super('admin_refuse');
  }
}

async function lire<T>(res: Response, fallback: string): Promise<T> {
  if (res.status === 403) throw new AccesAdminRefuse();
  return readJson<T>(res, fallback);
}

export async function fetchVeilleSources(): Promise<VeilleSources> {
  const res = await fetch(`${BASE}/veille/sources`, { headers: authHeaders() });
  return lire<VeilleSources>(res, 'Erreur de lecture de la veille.');
}

export async function fetchDceEchecs(limite = 50): Promise<DceEchecs> {
  const res = await fetch(`${BASE}/veille/dce-echecs?limite=${limite}`, { headers: authHeaders() });
  return lire<DceEchecs>(res, 'Erreur de lecture des téléchargements en échec.');
}

/** Relance un scrape, ou lance un rattrapage / une ré-analyse (simulation si
 *  `reel` est faux). 409 : la même action tourne déjà. */
export async function lancerActionVeille(action: ActionVeille, params: ParametresAction): Promise<ActionLancee> {
  const res = await fetch(`${BASE}/veille/actions/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(params),
  });
  return lire<ActionLancee>(res, "Erreur au lancement de l'action.");
}

export async function fetchEtatTache(taskId: string): Promise<EtatTache> {
  const res = await fetch(`${BASE}/veille/taches/${taskId}`, { headers: authHeaders() });
  return lire<EtatTache>(res, "Erreur de lecture de l'état de la tâche.");
}

export async function fetchJournal(limite = 50): Promise<LigneJournal[]> {
  const res = await fetch(`${BASE}/actions?limite=${limite}`, { headers: authHeaders() });
  return lire<LigneJournal[]>(res, 'Erreur de lecture du journal.');
}

/* --------------------------------------- comptes, abonnements, accès */

export async function fetchTableauDeBord(): Promise<TableauDeBord> {
  const res = await fetch(`${BASE}/tableau-de-bord`, { headers: authHeaders() });
  return lire<TableauDeBord>(res, 'Erreur de lecture du tableau de bord.');
}

export async function fetchOrganisations(filtres: {
  recherche?: string; offre?: CodeOffre | ''; etat?: EtatCompte | ''; page?: number;
}): Promise<OrganisationsPage> {
  const p = new URLSearchParams();
  if (filtres.recherche?.trim()) p.set('recherche', filtres.recherche.trim());
  if (filtres.offre) p.set('offre', filtres.offre);
  if (filtres.etat) p.set('etat', filtres.etat);
  p.set('page', String(filtres.page ?? 1));
  const res = await fetch(`${BASE}/comptes?${p}`, { headers: authHeaders() });
  return lire<OrganisationsPage>(res, 'Erreur de lecture des comptes.');
}

export async function fetchOrganisation(orgId: string): Promise<OrganisationDetail> {
  const res = await fetch(`${BASE}/comptes/${encodeURIComponent(orgId)}`, { headers: authHeaders() });
  return lire<OrganisationDetail>(res, 'Erreur de lecture du compte.');
}

export async function changerOffre(orgId: string, plan_code: CodeOffre, duree_mois: number): Promise<OrganisationDetail> {
  const res = await fetch(`${BASE}/comptes/${encodeURIComponent(orgId)}/offre`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ plan_code, duree_mois }),
  });
  return lire<OrganisationDetail>(res, "Erreur au changement d'offre.");
}

async function actionCompte(userId: string, action: 'suspendre' | 'reactiver', raison = ''): Promise<void> {
  const res = await fetch(`${BASE}/utilisateurs/${encodeURIComponent(userId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: action === 'suspendre' ? JSON.stringify({ raison }) : undefined,
  });
  if (res.status === 403) throw new AccesAdminRefuse();
  if (!res.ok) await readJson(res, "Erreur sur le compte.");
}

export const suspendreCompte = (userId: string, raison: string) => actionCompte(userId, 'suspendre', raison);
export const reactiverCompte = (userId: string) => actionCompte(userId, 'reactiver');

export async function fetchAbonnements(statut?: string): Promise<AbonnementLigne[]> {
  const q = statut ? `?statut=${statut}` : '';
  const res = await fetch(`${BASE}/abonnements${q}`, { headers: authHeaders() });
  return lire<AbonnementLigne[]>(res, 'Erreur de lecture des abonnements.');
}

export async function fetchAcces(): Promise<Acces> {
  const res = await fetch(`${BASE}/acces`, { headers: authHeaders() });
  return lire<Acces>(res, "Erreur de lecture des accès.");
}
