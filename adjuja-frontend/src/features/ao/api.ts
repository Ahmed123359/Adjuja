// Pipeline Appel d'offres, dans ses deux regimes : express et accompagne.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, readJson } from '../../shared/lib/http';
import type { FitScore, OffreSaisie, Suivi, SuiviData } from './types';
import type { AoDocumentOut, AoMode, AoResponse, AoStatus, AoStep, AoStepKey, AoSummary, StepAssistResponse } from '../../types';

// ── Pipeline Appel d'offres (Phase 4) ────────────────────────────────────────

export async function createAo(data: { reference: string; acheteur: string; objet: string }): Promise<AoSummary> {
  const res = await fetch('/api/v1/ao', {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const json = await readJson<AoSummary>(res, 'Erreur création AO.');
  return json;
}

export async function fetchAos(): Promise<AoSummary[]> {
  const res = await fetch('/api/v1/ao', { headers: authHeaders() });
  const json = await readJson<AoSummary[]>(res, 'Erreur chargement AOs.');
  return json;
}

export async function fetchAo(id: string): Promise<AoResponse> {
  const res = await fetch(`/api/v1/ao/${id}`, { headers: authHeaders() });
  const json = await readJson<AoResponse>(res, 'Erreur chargement AO.');
  return json;
}

export async function fetchAoStatus(id: string): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${id}/status`, { headers: authHeaders() });
  const json = await readJson<AoStatus>(res, 'Erreur statut AO.');
  return json;
}

export async function uploadAoDocuments(aoId: string, files: File[]): Promise<AoDocumentOut[]> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(`/api/v1/ao/${aoId}/upload-multiple`, {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });
  const json = await readJson<AoDocumentOut[]>(res, 'Erreur upload documents.');
  return json;
}

export async function startAoPipeline(aoId: string, mode: AoMode = 'express'): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${aoId}/start-pipeline`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ mode }),
  });
  const json = await readJson<AoStatus>(res, 'Erreur demarrage pipeline.');
  return json;
}

// ── Mode accompagne : parcours en 7 etapes ───────────────────────────────────

export async function fetchAoSteps(aoId: string): Promise<AoStep[]> {
  const res = await fetch(`/api/v1/ao/${aoId}/steps`, { headers: authHeaders() });
  const json = await readJson<AoStep[]>(res, 'Erreur chargement des etapes.');
  return json;
}

export async function validateAoStep(
  aoId: string,
  stepKey: AoStepKey,
  corrections?: Record<string, unknown>,
): Promise<AoStep[]> {
  const res = await fetch(`/api/v1/ao/${aoId}/steps/${stepKey}/validate`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ corrections: corrections ?? null }),
  });
  const json = await readJson<AoStep[]>(res, 'Erreur validation etape.');
  return json;
}

export async function rerunAoStep(aoId: string, stepKey: AoStepKey): Promise<AoStep[]> {
  const res = await fetch(`/api/v1/ao/${aoId}/steps/${stepKey}/rerun`, {
    method:  'POST',
    headers: authHeaders(),
  });
  const json = await readJson<AoStep[]>(res, 'Erreur relance etape.');
  return json;
}

export async function abandonAo(aoId: string): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${aoId}/abandon`, {
    method:  'POST',
    headers: authHeaders(),
  });
  const json = await readJson<AoStatus>(res, 'Erreur abandon.');
  return json;
}

export async function askStepAssistant(
  aoId: string,
  stepKey: AoStepKey,
  messages: { role: string; content: string }[],
): Promise<StepAssistResponse> {
  const res = await fetch(`/api/v1/ao/${aoId}/steps/${stepKey}/assist`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages, provider: 'mistral', model: '' }),
  });
  const json = await readJson<StepAssistResponse>(res, 'Erreur assistant.');
  return json;
}

export async function cancelAoPipeline(aoId: string): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${aoId}/cancel`, {
    method:  'POST',
    headers: authHeaders(),
  });
  const json = await readJson<AoStatus>(res, 'Erreur annulation pipeline.');
  return json;
}

/** Remplace un document produit (note, formulaire rempli) par la version
 *  corrigee de l'utilisateur, PDF ou Word. `signable` est faux si un Word n'a
 *  pas pu etre converti en PDF : l'etape Signature ne pourra pas le signer. */
export async function replaceAoDocument(
  aoId: string,
  docType: string,
  file: File,
): Promise<{ documents: AoDocumentOut[]; signable: boolean }> {
  const form = new FormData();
  form.append('doc_type', docType);
  form.append('file', file);
  const res = await fetch(`/api/v1/ao/${aoId}/documents/replace`, {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });
  return readJson(res, 'Remplacement du document impossible.');
}

export async function getAoDocumentDownloadUrl(aoId: string, docId: string): Promise<string> {
  const res = await fetch(`/api/v1/ao/${aoId}/documents/${docId}/download`, { headers: authHeaders() });
  const json = await readJson<{ url: string }>(res, 'Erreur téléchargement.');
  return json.url;
}

export async function deleteAo(aoId: string): Promise<void> {
  const res = await fetch(`/api/v1/ao/${aoId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur suppression AO.');
  }
}

/** Fit score d'un AO du pipeline. 409 tant que l'AO n'est pas analyse. */
export async function fetchFitScore(aoId: string): Promise<FitScore> {
  const res = await fetch(`/api/v1/ao/${aoId}/fit-score`, { headers: authHeaders() });
  return readJson<FitScore>(res, 'Impossible de calculer le score de compatibilite.');
}

/* ---------------------------------------------- suivi après dépôt (2026-10-01) */

export async function fetchSuivi(aoId: string): Promise<Suivi> {
  const res = await fetch(`/api/v1/ao/${aoId}/suivi`, { headers: authHeaders() });
  return readJson<Suivi>(res, 'Impossible de lire le suivi du dossier.');
}

/** Crée le suivi au premier appel (« marquer comme déposé »), le remplace ensuite. */
export async function enregistrerSuivi(aoId: string, data: SuiviData): Promise<Suivi> {
  const res = await fetch(`/api/v1/ao/${aoId}/suivi`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJson<Suivi>(res, "Impossible d'enregistrer le suivi.");
}

/** Remplace le tableau des offres ; renvoie le classement recalculé. */
export async function enregistrerOffres(aoId: string, offres: OffreSaisie[]): Promise<Suivi> {
  const res = await fetch(`/api/v1/ao/${aoId}/suivi/offres`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ offres }),
  });
  return readJson<Suivi>(res, "Impossible d'enregistrer les offres.");
}
