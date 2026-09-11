// Outils sur documents : extraction PDF, signature, remplissage,
// acte d'engagement, bordereau, offre technique.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders } from '../../shared/lib/http';
import type { ActeEngagementData, FillerResult, OffreTechniqueResult } from '../../types';

// ── PDF extract (protégé) ──────────────────────────────────────────────

export interface PdfExtractResult {
  text:       string;
  method:     'pymupdf' | 'gpt4o_vision';
  pages:      number;
  is_scanned: boolean;
}

export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/v1/pdf/extract', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Impossible d\'extraire le PDF.');
  }
  return data;
}

// ── Signature PDF -- mode background Celery ───────────────────────────────

export async function startSign(
  pdf: File,
  signature?: File | null,
  cachet?: File | null,
  lieu?: string,
  date?: string,
  parapheMode?: boolean,
): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append('pdf', pdf);
  if (signature)   form.append('signature', signature);
  if (cachet)      form.append('cachet', cachet);
  if (lieu)        form.append('fait_a_lieu', lieu);
  if (date)        form.append('fait_a_date', date);
  if (parapheMode) form.append('paraphe_mode', 'true');

  const res = await fetch('/api/v1/sign/start', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la signature.');
  }
  return res.json();
}

export async function getSignStatus(jobId: string): Promise<{
  job_id: string;
  status: string;
  download_url?: string;
  filename?: string;
  error?: string;
}> {
  const res = await fetch(`/api/v1/sign/status/${jobId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Job introuvable.');
  return res.json();
}

export async function cancelSign(jobId: string): Promise<void> {
  await fetch(`/api/v1/sign/cancel/${jobId}`, { method: 'DELETE', headers: authHeaders() });
}

export async function extractBordereauExcel(pdf: File): Promise<Blob> {
  const form = new FormData();
  form.append('pdf', pdf);

  const res = await fetch('/api/v1/bordereau/excel', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de l\'extraction du bordereau.');
  }
  return res.blob();
}

// ── Acte d'Engagement (protégé) ────────────────────────────────────────

export async function fillActeEngagement(
  pdf: File,
  data: ActeEngagementData,
  signature?: File | null,
  cachet?: File | null,
): Promise<Blob> {
  const form = new FormData();
  form.append('pdf', pdf);
  if (signature) form.append('signature', signature);
  if (cachet)    form.append('cachet', cachet);

  form.append('type_soumissionnaire', data.type_soumissionnaire);
  form.append('signataire_nom',       data.signataire_nom);
  form.append('adresse_domicile',     data.adresse_domicile);
  form.append('telephone',            data.telephone);
  form.append('fax',                  data.fax);
  form.append('email',                data.email);
  form.append('rib',                  data.rib);
  form.append('cnss',                 data.cnss);
  form.append('rc_localite',          data.rc_localite);
  form.append('rc_numero',            data.rc_numero);
  form.append('taxe_pro',             data.taxe_pro);
  form.append('ice',                  data.ice);
  form.append('raison_sociale',       data.raison_sociale);
  form.append('forme_juridique',      data.forme_juridique);
  form.append('capital_social',       data.capital_social);
  form.append('adresse_siege',        data.adresse_siege);
  form.append('membres_groupement',   data.membres_groupement);
  form.append('fait_a_lieu',          data.fait_a_lieu);
  const dateFr = data.fait_a_date ? data.fait_a_date.split('-').reverse().join('/') : '';
  form.append('fait_a_date', dateFr);

  const res = await fetch('/api/v1/acte-engagement/fill', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });

  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.detail === 'string' ? d.detail : 'Erreur lors du remplissage.');
  }
  return res.blob();
}

// ── Remplissage dossier AO -- mode background Celery ─────────────────────

export async function startFiller(
  file: File,
  lots: number[],
  marcheId?: string,
): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('lots', lots.join(','));
  if (marcheId) form.append('marche_id', marcheId);

  const res = await fetch('/api/v1/filler/start', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors du remplissage.');
  }
  return data;
}

export async function getFillerStatus(jobId: string): Promise<{
  job_id: string;
  status: string;
  result?: FillerResult;
  error?: string;
}> {
  const res = await fetch(`/api/v1/filler/status/${jobId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Job introuvable.');
  return res.json();
}

export async function cancelFiller(jobId: string): Promise<void> {
  await fetch(`/api/v1/filler/cancel/${jobId}`, { method: 'DELETE', headers: authHeaders() });
}

export async function runFiller(
  file: File,
  lots: number[],
  marcheId?: string,
): Promise<FillerResult> {
  const { job_id } = await startFiller(file, lots, marcheId);
  // Polling jusqu'a completion
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await getFillerStatus(job_id);
    if (status.status === 'done' && status.result) return status.result;
    if (status.status === 'failed') throw new Error(status.error || 'Remplissage échoué.');
    if (status.status === 'cancelled') throw new Error('Remplissage annulé.');
  }
  throw new Error('Timeout : le remplissage a pris trop de temps.');
}

export async function downloadFillerFile(downloadUrl: string, filename: string): Promise<void> {
  const res = await fetch(downloadUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error('Fichier introuvable ou expiré.');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function runOffreTechnique(
  file: File,
  opts?: { logo?: File; brandColor?: string; customInstructions?: string; rc?: File; marcheId?: string },
): Promise<OffreTechniqueResult> {
  const form = new FormData();
  form.append('file', file);
  if (opts?.logo)               form.append('logo',                opts.logo);
  if (opts?.brandColor)         form.append('brand_color',         opts.brandColor);
  if (opts?.customInstructions) form.append('custom_instructions', opts.customInstructions);
  if (opts?.rc)                 form.append('rc',                  opts.rc);
  if (opts?.marcheId)           form.append('marche_id',           opts.marcheId);

  const res = await fetch('/api/v1/offre-technique/run', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la génération.');
  }
  return data;
}

export async function downloadOffreTechniqueFile(downloadUrl: string, filename: string): Promise<void> {
  const res  = await fetch(downloadUrl, { headers: authHeaders() });
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
