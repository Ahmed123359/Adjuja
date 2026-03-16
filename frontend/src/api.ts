import type { Model, CompanyData, GenerationResult, RagStatus, AppDefaults, UsageData, HistorySummary, HistoryEntry, User } from './types';

// ── Token helpers ──────────────────────────────────────────────────────

const TOKEN_KEY = 'offria_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Helpers internes ───────────────────────────────────────────────────

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

// ── Authentification ───────────────────────────────────────────────────

// Règles de mot de passe telles que définies côté backend.
// Récupérées via l'API pour éviter toute duplication : modifier les constantes
// Python dans user.py suffit pour mettre à jour le formulaire d'inscription.
export type PasswordRules = { min_length: number; require_digit: boolean };

export async function getPasswordRules(): Promise<PasswordRules> {
  const res = await fetch('/api/v1/auth/password-rules');
  if (!res.ok) {
    // En cas d'échec réseau, on revient sur des valeurs conservatrices
    // pour ne pas bloquer l'affichage du formulaire.
    return { min_length: 8, require_digit: true };
  }
  return res.json();
}

export async function register(params: {
  nom: string; prenom: string; email: string; password: string;
}): Promise<void> {
  const res = await fetch('/api/v1/auth/register', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    // Pydantic retourne detail comme tableau en cas d'erreur 422 (validation)
    // ex: [{ loc: ["body","password"], msg: "Le mot de passe doit contenir au moins 8 caractères." }]
    // Pour les autres erreurs (409 email déjà pris...), detail est une string.
    if (Array.isArray(data.detail)) {
      throw new Error(data.detail.map((e: { msg: string }) => e.msg).join(' '));
    }
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur inscription.');
  }
  setToken(data.access_token);
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/v1/auth/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Identifiants incorrects.');
  setToken(data.access_token);
}

export async function getMe(): Promise<User> {
  const res = await fetch('/api/v1/auth/me', { headers: authHeaders() });
  if (!res.ok) throw new Error('Non authentifié.');
  return res.json();
}

// ── Defaults & Models (publics) ────────────────────────────────────────

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

// ── Signature PDF (protégée) ───────────────────────────────

export async function signPdf(
  pdf: File,
  signature?: File | null,
  cachet?: File | null,
  lieu?: string,
  date?: string,
): Promise<Blob> {
  const form = new FormData();
  form.append('pdf', pdf);
  if (signature) form.append('signature', signature);
  if (cachet)    form.append('cachet', cachet);
  if (lieu)      form.append('fait_a_lieu', lieu);
  if (date)      form.append('fait_a_date', date);

  const res = await fetch('/api/v1/sign/pdf', {
    method:  'POST',
    headers: authHeaders(),
    body:    form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la signature.');
  }
  return res.blob();
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
