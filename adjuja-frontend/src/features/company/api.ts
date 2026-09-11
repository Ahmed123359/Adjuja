// Profil entreprise, documents permanents, signature et equipe (CVs).
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, safeJson, wrapNetworkError } from '../../shared/lib/http';
import type { AoTeamMember, CompanyDocument, CompanyProfile, CompanyProfileForm, ProfileCheck, StaffCv, StaffCvForm } from '../../types';

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
  let res: Response;
  try {
    res = await fetch('/api/v1/staff-cvs', { headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<import('./types').StaffCv[]>(res);
  if (!res.ok) throw new Error('Erreur chargement CVs.');
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
}

export async function createStaffCv(data: import('./types').StaffCvForm): Promise<import('./types').StaffCv> {
  let res: Response;
  try {
    res = await fetch('/api/v1/staff-cvs', {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) { wrapNetworkError(err); }
  const json = await safeJson<{ detail?: unknown } & import('./types').StaffCv>(res);
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : 'Erreur création CV.');
  if (!json) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return json;
}

export async function updateStaffCv(cvId: string, data: import('./types').StaffCvForm): Promise<import('./types').StaffCv> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/staff-cvs/${cvId}`, {
      method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) { wrapNetworkError(err); }
  const json = await safeJson<{ detail?: unknown } & import('./types').StaffCv>(res);
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : 'Erreur mise à jour CV.');
  if (!json) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return json;
}

export async function deleteStaffCv(cvId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/staff-cvs/${cvId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
  } catch (err) { wrapNetworkError(err); }
  if (!res.ok) throw new Error('Erreur suppression CV.');
}

export async function uploadCvPdf(cvId: string, file: File): Promise<import('./types').StaffCv> {
  const form = new FormData();
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch(`/api/v1/staff-cvs/${cvId}/upload`, {
      method: 'POST', headers: authHeaders(), body: form,
    });
  } catch (err) { wrapNetworkError(err); }
  const json = await safeJson<{ detail?: unknown } & import('./types').StaffCv>(res);
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : 'Erreur upload CV PDF.');
  if (!json) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return json;
}

export async function fetchAoTeam(aoId: string): Promise<import('./types').AoTeamMember[]> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/staff-cvs/ao/${aoId}/team`, { headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<import('./types').AoTeamMember[]>(res);
  if (!res.ok) throw new Error('Erreur chargement équipe.');
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
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
  let res: Response;
  try {
    res = await fetch('/api/v1/staff-cvs/extract', {
      method: 'POST', headers: authHeaders(), body: form,
    });
  } catch (err) { wrapNetworkError(err); }
  const json = await safeJson<{ detail?: unknown } & CvExtractResult>(res);
  if (!res.ok) throw new Error(typeof json?.detail === 'string' ? json.detail : "Erreur extraction CV.");
  if (!json) throw new Error('Réponse inattendue du serveur. Réessayez.');
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
