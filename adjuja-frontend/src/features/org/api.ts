// Organisation : invitations et membres de l'equipe.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, safeJson, setToken, wrapNetworkError } from '../../shared/lib/http';
import type { User } from '../../types';

// ── Organisation / Équipe (invitations) ─────────────────────────────────────

export async function inviteMember(email: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/org/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ email }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : "Erreur lors de l'invitation.");
}

export async function listOrgMembers(): Promise<User[]> {
  let res: Response;
  try {
    res = await fetch('/api/v1/org/members', { headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<User[]>(res);
  if (!res.ok) throw new Error('Erreur chargement des membres.');
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
}

export async function removeOrgMember(userId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/org/members/${userId}`, { method: 'DELETE', headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  if (!res.ok) {
    const data = await safeJson<{ detail?: unknown }>(res);
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur lors du retrait du membre.');
  }
}

export type InvitePreview = { email: string; inviter_name: string };

export async function previewInvite(token: string): Promise<InvitePreview> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/org/invite/${token}`);
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<InvitePreview & { detail?: unknown }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Invitation invalide.');
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
}

export async function acceptInvite(token: string, nom: string, prenom: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/org/accept-invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, nom, prenom, password }),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<{ detail?: unknown; access_token?: string }>(res);
  if (!res.ok) {
    if (Array.isArray(data?.detail)) {
      throw new Error((data.detail as { msg: string }[]).map(e => e.msg).join(' '));
    }
    throw new Error(typeof data?.detail === 'string' ? data.detail : "Erreur lors de l'acceptation de l'invitation.");
  }
  if (!data?.access_token) throw new Error('Réponse inattendue du serveur. Réessayez.');
  setToken(data.access_token);
}
