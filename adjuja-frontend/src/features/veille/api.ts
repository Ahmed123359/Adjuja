// Veille : appels d'offres et bons de commande (service ao-watcher).
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, readJson, safeJson } from '../../shared/lib/http';
import type { EligibilityVerdict, ModePassation, NaturePrestation, ScrapedAo, ScrapedAoList, ScrapedBdc, ScrapedBdcList, Secteur, WatcherBdcFilters, WatcherFilters } from '../../types';

// ── AO Watcher (port 8001, proxied via /watcher) ────────────────────────────

const WATCHER_BASE = '/watcher';

export async function fetchScrapedAos(
  filters: WatcherFilters,
  limit = 50,
): Promise<ScrapedAoList> {
  const p = new URLSearchParams();
  if (filters.status !== 'all') p.set('status', filters.status);
  if (filters.search)           p.set('search', filters.search);
  if (filters.categorie)        p.set('categorie', filters.categorie);
  if (filters.mode_passation)   p.set('mode_passation', filters.mode_passation);
  if (filters.region)           p.set('region', filters.region);
  if (filters.date_limite_from) p.set('date_limite_from', filters.date_limite_from);
  for (const code of filters.secteur_codes) p.append('secteur_codes', code);
  p.set('page', String(filters.page));
  p.set('limit', String(limit));
  const res = await fetch(`${WATCHER_BASE}/aos?${p}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Erreur chargement veille.');
  const json = await safeJson<ScrapedAoList>(res);
  if (!json) throw new Error('Erreur chargement veille.');
  return json;
}

let modesPassationCache: Promise<import('./types').ModePassation[]> | null = null;

export async function fetchModesPassation(): Promise<import('./types').ModePassation[]> {
  if (!modesPassationCache) {
    modesPassationCache = fetch(`${WATCHER_BASE}/aos/mode-passation`)
      .then(res => {
        if (!res.ok) throw new Error('Erreur chargement modes de passation.');
        return res.json();
      })
      .catch(e => { modesPassationCache = null; throw e; });
  }
  return modesPassationCache;
}

let secteursCache: Promise<Secteur[]> | null = null;

export async function fetchSecteurs(): Promise<Secteur[]> {
  if (!secteursCache) {
    secteursCache = fetch(`${WATCHER_BASE}/secteurs`)
      .then(res => {
        if (!res.ok) throw new Error('Erreur chargement secteurs.');
        return res.json();
      })
      .catch(e => { secteursCache = null; throw e; });
  }
  return secteursCache;
}

export async function fetchScrapedAo(id: number): Promise<ScrapedAo> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}`, { headers: authHeaders() });
  const json = await readJson<ScrapedAo>(res, 'AO introuvable.');
  return json;
}

export async function updateScrapedAoStatus(id: number, status: string): Promise<ScrapedAo> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  const json = await readJson<ScrapedAo>(res, 'Erreur statut.');
  return json;
}

export async function importScrapedAo(id: number): Promise<{ ao_id: string; message: string }> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}/import`, { method: 'POST', headers: authHeaders() });
  const json = await readJson<{ ao_id: string; message: string }>(res, 'Erreur import AO.');
  return json;
}

export async function downloadScrapedAoZip(id: number): Promise<void> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}/download`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Erreur téléchargement des documents.');
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `AO-${id}-documents.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function analyzeScrapedAo(id: number): Promise<EligibilityVerdict> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}/verdict`, { method: 'POST', headers: authHeaders() });
  const json = await readJson<EligibilityVerdict>(res, 'Erreur analyse AO.');
  return json;
}

// ── BDC Watcher (Bons de commande) ──────────────────────────────────────────

export async function fetchScrapedBdc(
  filters: WatcherBdcFilters,
  limit = 50,
): Promise<ScrapedBdcList> {
  const p = new URLSearchParams();
  if (filters.status !== 'all') p.set('status', filters.status);
  if (filters.search)           p.set('search', filters.search);
  if (filters.categorie)        p.set('categorie', filters.categorie);
  for (const n of filters.nature_prestations) p.append('nature_prestations', n);
  if (filters.region)           p.set('region', filters.region);
  if (filters.date_limite_from) p.set('date_limite_from', filters.date_limite_from);
  p.set('page', String(filters.page));
  p.set('limit', String(limit));
  const res = await fetch(`${WATCHER_BASE}/bdc?${p}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Erreur chargement bons de commande.');
  const json = await safeJson<ScrapedBdcList>(res);
  if (!json) throw new Error('Erreur chargement bons de commande.');
  return json;
}

let naturesPrestationCache: Promise<NaturePrestation[]> | null = null;

export async function fetchNaturesPrestation(): Promise<NaturePrestation[]> {
  if (!naturesPrestationCache) {
    naturesPrestationCache = fetch(`${WATCHER_BASE}/bdc/nature-prestation`)
      .then(res => {
        if (!res.ok) throw new Error('Erreur chargement natures de prestation.');
        return res.json();
      })
      .catch(e => { naturesPrestationCache = null; throw e; });
  }
  return naturesPrestationCache;
}

export async function fetchScrapedBdcOne(id: number): Promise<ScrapedBdc> {
  const res = await fetch(`${WATCHER_BASE}/bdc/${id}`, { headers: authHeaders() });
  const json = await readJson<ScrapedBdc>(res, 'Bon de commande introuvable.');
  return json;
}

export async function updateBdcStatus(id: number, status: string): Promise<ScrapedBdc> {
  const res = await fetch(`${WATCHER_BASE}/bdc/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  const json = await readJson<ScrapedBdc>(res, 'Erreur statut.');
  return json;
}
