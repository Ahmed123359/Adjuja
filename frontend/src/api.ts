import type { Model, CompanyData, GenerationResult, RagStatus, AppDefaults, UsageData } from './types';

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

export async function fetchDefaults(): Promise<AppDefaults> {
  const res = await fetch('/api/v1/defaults');
  if (!res.ok) throw new Error('Impossible de charger les valeurs par défaut');
  return res.json();
}

export async function fetchModels(): Promise<Model[]> {
  const res = await fetch('/api/v1/models');
  if (!res.ok) throw new Error('Impossible de charger les modèles');
  return res.json();
}

export async function fetchRagStatus(): Promise<RagStatus> {
  const res = await fetch('/api/v1/rag/status');
  if (!res.ok) throw new Error('Impossible de charger le statut RAG');
  return res.json();
}

export async function fetchUsage(): Promise<UsageData> {
  const res = await fetch('/api/v1/usage');
  if (!res.ok) throw new Error('Impossible de charger le compteur');
  return res.json();
}

export async function resetUsage(): Promise<UsageData> {
  const res = await fetch('/api/v1/usage/reset', { method: 'POST' });
  if (!res.ok) throw new Error('Impossible de réinitialiser le compteur');
  return res.json();
}

export async function reindexRag(): Promise<RagStatus> {
  const res = await fetch('/api/v1/rag/index', { method: 'POST' });
  if (!res.ok) throw new Error('Échec de la reindexation RAG');
  return res.json();
}

export async function generate(params: {
  aoText:       string;
  provider:     string;
  model:        string;
  company:      CompanyData;
  temperature:  number;
  maxTokens:    number;
  instructions: string;
  langue:       'fr' | 'en';
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
    instructions_supplementaires: params.instructions,
    temperature: params.temperature,
    max_tokens:  params.maxTokens,
    langue:      params.langue,
  };

  const res = await fetch('/api/v1/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
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
