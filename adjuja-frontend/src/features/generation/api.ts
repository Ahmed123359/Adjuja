// Generation de documents et historique.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders } from '../../shared/lib/http';
import type { CompanyData, GenerationResult, HistoryEntry, HistorySummary } from '../../types';

function splitTags(s: string): string[] {
  return s ? s.split(/[,\n]/).map(t => t.trim()).filter(Boolean) : [];
}

function buildDescription(d: CompanyData): string {
  return [
    d.description,
    d.forme_juridique  && `Forme : ${d.forme_juridique}`,
    d.date_creation    && `Fondée en : ${d.date_creation}`,
    d.secteurs         && `Secteurs : ${d.secteurs}`,
    d.certifications   && `Certifications : ${d.certifications}`,
    (d.adresse || d.ville) && `Adresse : ${[d.adresse, d.ville].filter(Boolean).join(', ')}`,
    d.telephone        && `Tél. : ${d.telephone}`,
    d.site_web         && `Web : ${d.site_web}`,
    d.rc               && `RC : ${d.rc}`,
    d.ice              && `ICE : ${d.ice}`,
    d.cnss             && `CNSS : ${d.cnss}`,
    d.if_fiscal        && `IF : ${d.if_fiscal}`,
  ].filter(Boolean).join(' | ');
}

// ── Génération (protégée) ──────────────────────────────────────────────

export async function generate(params: {
  aoText:   string;
  provider: string;
  model:    string;
  company:  CompanyData;
  langue:   'fr' | 'en';
}): Promise<GenerationResult> {
  const body = {
    ao_texte:  params.aoText,
    provider:  params.provider,
    model:     params.model,
    contexte_entreprise: {
      nom:              params.company.nom,
      description:      buildDescription(params.company),
      expertises:       splitTags(params.company.expertises),
      references:       splitTags(params.company.references),
      effectif:         params.company.effectif ? parseInt(params.company.effectif, 10) : null,
      chiffre_affaires: params.company.chiffre_affaires,
    },
    langue: params.langue,
  };

  const res = await fetch('/api/v1/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 422 && Array.isArray(data.detail)) {
      const msgs = data.detail.map((e: { loc?: string[]; msg: string }) =>
        `• ${e.loc?.at(-1) ?? '?'} : ${e.msg}`
      ).join('\n');
      throw new Error(`Données invalides :\n${msgs}`);
    }
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la génération.');
  }

  return data;
}

// ── Export DOCX (protégé) ──────────────────────────────────────────────────

export async function exportDocx(
  result: GenerationResult,
  companyNom: string,
  aoText: string,
): Promise<Blob> {
  const res = await fetch('/api/v1/export/docx', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ result, company_nom: companyNom, ao_text: aoText }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la génération du Word.');
  }
  return res.blob();
}

// ── Historique (protégé) ───────────────────────────────────────────────

export async function fetchHistory(): Promise<HistorySummary[]> {
  const res = await fetch('/api/v1/history', { headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de charger l\'historique');
  return res.json();
}

export async function fetchHistoryEntry(id: string): Promise<HistoryEntry> {
  const res = await fetch(`/api/v1/history/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Entrée introuvable');
  return res.json();
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const res = await fetch(`/api/v1/history/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de supprimer l\'entrée');
}

export async function clearHistory(): Promise<void> {
  const res = await fetch('/api/v1/history', { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de vider l\'historique');
}
