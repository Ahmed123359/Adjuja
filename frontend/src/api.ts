import type { Model, CompanyData, GenerationResult, RagStatus, AppDefaults, UsageData, HistorySummary, HistoryEntry, User, ActeEngagementData, ChatMessage, ChatApiResponse, FillerResult, MarcheSummary, MarcheDetail, AoSummary, AoResponse, AoStatus, AoDocumentOut, CompanyProfile, CompanyProfileForm, ProfileCheck, ScrapedAo, ScrapedAoList, WatcherFilters, Secteur, EligibilityVerdict, ScrapedBdc, ScrapedBdcList, WatcherBdcFilters, NaturePrestation, Subscription } from './types';

// ── Token helpers ──────────────────────────────────────────────────────

const TOKEN_KEY = 'offria_token';
/** Plan choisi sur la page pricing avant que l'utilisateur soit connecté. Consommé une
 * seule fois juste après login/register (voir main.tsx::handleAuthSuccess), pour que le
 * clic sur "Commencer" mène au checkout même si l'utilisateur doit d'abord s'inscrire. */
export const CHECKOUT_INTENT_KEY = 'adjuja_checkout_intent';

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

/** Parse JSON sans planter si le corps est vide ou invalide. */
async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** Traduit les erreurs réseau bas-niveau en message lisible. */
function wrapNetworkError(err: unknown): never {
  if (err instanceof TypeError) {
    throw new Error('Serveur inaccessible. Vérifiez votre connexion et réessayez.');
  }
  throw err;
}

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

export type PasswordRules = { min_length: number; require_digit: boolean };

export async function getPasswordRules(): Promise<PasswordRules> {
  const res = await fetch('/api/v1/auth/password-rules');
  if (!res.ok) {
    return { min_length: 8, require_digit: true };
  }
  return res.json();
}

/** Retourne true si admin (connecté directement), false si email envoyé */
export async function register(params: {
  nom: string; prenom: string; email: string; password: string;
  entreprise?: string; secteur_activite?: string; nb_ao_par_an?: number | null;
}): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) {
    if (Array.isArray(data?.detail)) {
      throw new Error((data.detail as { msg: string }[]).map(e => e.msg).join(' '));
    }
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur lors de l\'inscription. Réessayez.');
  }
  if (data?.access_token) {
    setToken(data.access_token);
    return true;
  }
  return false;
}

export async function login(email: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) {
    const msg = typeof data?.detail === 'string' ? data.detail : null;
    throw new Error(msg ?? (res.status === 401 ? 'Email ou mot de passe incorrect.' : 'Erreur serveur. Réessayez dans un instant.'));
  }
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
}

export async function loginWithGoogle(credential: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/google', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ credential }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur Google OAuth. Réessayez.');
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
}

export async function getMe(): Promise<User> {
  let res: Response;
  try {
    res = await fetch('/api/v1/auth/me', { headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  if (!res.ok) throw new Error('Non authentifié.');
  const data = await safeJson<User>(res);
  if (!data) throw new Error('Non authentifié.');
  return data;
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
  const res = await fetch('/api/v1/usage', { headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de charger le compteur');
  return res.json();
}

export async function resetUsage(): Promise<UsageData> {
  const res = await fetch('/api/v1/usage/reset', { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de réinitialiser le compteur');
  return res.json();
}

export async function reindexRag(): Promise<RagStatus> {
  const res = await fetch('/api/v1/rag/index', { method: 'POST', headers: authHeaders() });
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

// ── Chat RAG (protégé) ─────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: ChatMessage[],
  provider: string,
  model:    string,
): Promise<ChatApiResponse> {
  const res = await fetch('/api/v1/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ messages, provider, model }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la réponse du chat.');
  }
  return data;
}
// ── Offre Technique ──────────────────────────────────────────────────────────

import type { OffreTechniqueResult } from './types';

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

// ── Marchés (protégé) ─────────────────────────────────────────────────────

export async function createMarche(data: { reference: string; acheteur: string; objet: string }): Promise<MarcheSummary> {
  const res = await fetch('/api/v1/marches', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur création marché.');
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
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur upload CPS.');
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
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur upload RC.');
  return json;
}

export async function downloadPresignedFile(url: string, filename: string): Promise<void> {
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.target   = '_blank';
  a.click();
}

// ── Pipeline Appel d'offres (Phase 4) ────────────────────────────────────────

export async function createAo(data: { reference: string; acheteur: string; objet: string }): Promise<AoSummary> {
  const res = await fetch('/api/v1/ao', {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur création AO.');
  return json;
}

export async function fetchAos(): Promise<AoSummary[]> {
  const res = await fetch('/api/v1/ao', { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur chargement AOs.');
  return json;
}

export async function fetchAo(id: string): Promise<AoResponse> {
  const res = await fetch(`/api/v1/ao/${id}`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur chargement AO.');
  return json;
}

export async function fetchAoStatus(id: string): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${id}/status`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur statut AO.');
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
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur upload documents.');
  return json;
}

export async function startAoPipeline(aoId: string): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${aoId}/start-pipeline`, {
    method:  'POST',
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur démarrage pipeline.');
  return json;
}

export async function cancelAoPipeline(aoId: string): Promise<AoStatus> {
  const res = await fetch(`/api/v1/ao/${aoId}/cancel`, {
    method:  'POST',
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur annulation pipeline.');
  return json;
}

export async function getAoDocumentDownloadUrl(aoId: string, docId: string): Promise<string> {
  const res = await fetch(`/api/v1/ao/${aoId}/documents/${docId}/download`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur téléchargement.');
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

// ── Profil entreprise ────────────────────────────────────────────────────────

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const res = await fetch('/api/v1/company-profile', { headers: authHeaders() });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur chargement profil.');
  return json;
}

export async function upsertCompanyProfile(data: CompanyProfileForm): Promise<CompanyProfile> {
  const res = await fetch('/api/v1/company-profile', {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur sauvegarde profil.');
  return json;
}

export async function checkCompanyProfile(): Promise<ProfileCheck> {
  const res = await fetch('/api/v1/company-profile/check', { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur vérification profil.');
  return json;
}

// ── Phase 5  Signature / Cachet ─────────────────────────────────────────────

export async function uploadSignature(file: File): Promise<import('./types').CompanyProfile> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/company-profile/signature', {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur upload signature.');
  return json;
}

export async function uploadCachet(file: File): Promise<import('./types').CompanyProfile> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/company-profile/cachet', {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur upload cachet.');
  return json;
}

export async function deleteSignature(): Promise<import('./types').CompanyProfile> {
  const res = await fetch('/api/v1/company-profile/signature', {
    method: 'DELETE', headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur suppression signature.');
  return json;
}

export async function deleteCachet(): Promise<import('./types').CompanyProfile> {
  const res = await fetch('/api/v1/company-profile/cachet', {
    method: 'DELETE', headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur suppression cachet.');
  return json;
}

export async function uploadLuEtAccepte(file: File): Promise<import('./types').CompanyProfile> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/company-profile/lu-et-accepte', {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur upload lu et accepté.');
  return json;
}

export async function deleteLuEtAccepte(): Promise<import('./types').CompanyProfile> {
  const res = await fetch('/api/v1/company-profile/lu-et-accepte', {
    method: 'DELETE', headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur suppression lu et accepté.');
  return json;
}

// ── Phase 5  Documents permanents ───────────────────────────────────────────

export async function fetchCompanyDocuments(): Promise<import('./types').CompanyDocument[]> {
  const res = await fetch('/api/v1/company-documents', { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur chargement documents entreprise.');
  return json;
}

export async function uploadCompanyDocument(
  file: File,
  docType: string,
  description?: string,
  dateValidite?: string,
): Promise<import('./types').CompanyDocument> {
  const form = new FormData();
  form.append('file', file);
  form.append('doc_type', docType);
  if (description) form.append('description', description);
  if (dateValidite) form.append('date_validite', dateValidite);
  const res = await fetch('/api/v1/company-documents', {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur upload document.');
  return json;
}

export async function deleteCompanyDocument(docId: string): Promise<void> {
  const res = await fetch(`/api/v1/company-documents/${docId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Erreur suppression document.');
}

// ── Phase 5  CVs / Equipe ───────────────────────────────────────────────────

export async function fetchStaffCvs(): Promise<import('./types').StaffCv[]> {
  const res = await fetch('/api/v1/staff-cvs', { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur chargement CVs.');
  return json;
}

export async function createStaffCv(data: import('./types').StaffCvForm): Promise<import('./types').StaffCv> {
  const res = await fetch('/api/v1/staff-cvs', {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur création CV.');
  return json;
}

export async function updateStaffCv(cvId: string, data: import('./types').StaffCvForm): Promise<import('./types').StaffCv> {
  const res = await fetch(`/api/v1/staff-cvs/${cvId}`, {
    method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur mise à jour CV.');
  return json;
}

export async function deleteStaffCv(cvId: string): Promise<void> {
  const res = await fetch(`/api/v1/staff-cvs/${cvId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Erreur suppression CV.');
}

export async function uploadCvPdf(cvId: string, file: File): Promise<import('./types').StaffCv> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1/staff-cvs/${cvId}/upload`, {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur upload CV PDF.');
  return json;
}

export async function fetchAoTeam(aoId: string): Promise<import('./types').AoTeamMember[]> {
  const res = await fetch(`/api/v1/staff-cvs/ao/${aoId}/team`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error('Erreur chargement équipe.');
  return json;
}

export interface CvExtractResult {
  nom:               string;
  prenom:            string;
  poste:             string;
  specialite:        string;
  diplome:           string;
  annees_experience: number;
  tmp_pdf_bytes_b64: string;
}

export async function extractCvFromPdf(file: File): Promise<CvExtractResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/staff-cvs/extract', {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? "Erreur extraction CV.");
  return json;
}

export async function uploadTemplateNoteMetho(file: File): Promise<import('./types').CompanyProfile> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/v1/company-profile/template-note-metho', {
    method: 'POST', headers: authHeaders(), body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur upload template.');
  return json;
}

export async function deleteTemplateNoteMetho(): Promise<import('./types').CompanyProfile> {
  const res = await fetch('/api/v1/company-profile/template-note-metho', {
    method: 'DELETE', headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail ?? 'Erreur suppression template.');
  return json;
}

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
  const json = await res.json();
  if (!res.ok) throw new Error('AO introuvable.');
  return json;
}

export async function updateScrapedAoStatus(id: number, status: string): Promise<ScrapedAo> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur statut.');
  return json;
}

export async function importScrapedAo(id: number): Promise<{ ao_id: string; message: string }> {
  const res = await fetch(`${WATCHER_BASE}/aos/${id}/import`, { method: 'POST', headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur import AO.');
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
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur analyse AO.');
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
  const json = await res.json();
  if (!res.ok) throw new Error('Bon de commande introuvable.');
  return json;
}

export async function updateBdcStatus(id: number, status: string): Promise<ScrapedBdc> {
  const res = await fetch(`${WATCHER_BASE}/bdc/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.detail === 'string' ? json.detail : 'Erreur statut.');
  return json;
}

// ── Billing & Subscriptions ─────────────────────────────────────────────────

export async function getSubscription(): Promise<Subscription> {
  const res = await fetch('/api/v1/billing/subscription', { headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de récupérer votre abonnement.');
  return res.json();
}

export async function startCheckout(planCode: string): Promise<{ redirect_url: string }> {
  const res = await fetch('/api/v1/billing/checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ plan_code: planCode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Impossible de démarrer le paiement.');
  }
  return data;
}
