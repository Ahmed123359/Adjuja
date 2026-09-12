// Marches (parcours anterieur au pipeline AO).
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, readJson } from '../../shared/lib/http';
import type { MarcheDetail, MarcheSummary } from '../../types';

// ── Marchés (protégé) ─────────────────────────────────────────────────────

export async function createMarche(data: { reference: string; acheteur: string; objet: string }): Promise<MarcheSummary> {
  const res = await fetch('/api/v1/marches', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(data),
  });
  const json = await readJson<MarcheSummary>(res, 'Erreur création marché.');
  return json;
}

export async function fetchMarches(): Promise<MarcheSummary[]> {
  const res = await fetch('/api/v1/marches', { headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de charger les marchés.');
  return res.json();
}

export async function fetchMarche(id: string): Promise<MarcheDetail> {
  const res = await fetch(`/api/v1/marches/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Marché introuvable.');
  return res.json();
}

export async function uploadCps(marcheId: string, file: File): Promise<MarcheSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1/marches/${marcheId}/upload-cps`, {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });
  const json = await readJson<MarcheSummary>(res, 'Erreur upload CPS.');
  return json;
}

export async function uploadRc(marcheId: string, file: File): Promise<MarcheSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1/marches/${marcheId}/upload-rc`, {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });
  const json = await readJson<MarcheSummary>(res, 'Erreur upload RC.');
  return json;
}

export async function downloadPresignedFile(url: string, filename: string): Promise<void> {
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.target   = '_blank';
  a.click();
}
