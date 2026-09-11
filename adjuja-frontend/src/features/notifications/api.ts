// Preferences de notification (service adjuja-notification).
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders, safeJson, wrapNetworkError } from '../../shared/lib/http';

// ── Notification preferences ────────────────────────────────────────────────

const NOTIFICATIONS_BASE = '/notifications';

export type NotificationPreferences = {
  org_id: string;
  enabled: boolean;
  secteur_codes: string[];
  notify_bdc: boolean;
  cadence_unit: 'day' | 'week' | 'month';
  cadence_value: number;
  send_hour: number;
  max_items: number;
  last_notified_at: string | null;
};

export async function fetchNotificationPreferences(orgId: string): Promise<NotificationPreferences | null> {
  let res: Response;
  try {
    res = await fetch(`${NOTIFICATIONS_BASE}/preferences/${orgId}`, { headers: authHeaders() });
  } catch (err) { wrapNetworkError(err); }
  if (res.status === 404) return null; // pas encore configuré, pas une erreur
  const data = await safeJson<NotificationPreferences>(res);
  if (!res.ok) throw new Error('Erreur chargement des préférences de notification.');
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
}

export async function updateNotificationPreferences(
  orgId: string,
  body: Omit<NotificationPreferences, 'org_id' | 'last_notified_at'>,
): Promise<NotificationPreferences> {
  let res: Response;
  try {
    res = await fetch(`${NOTIFICATIONS_BASE}/preferences/${orgId}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<NotificationPreferences & { detail?: unknown }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur sauvegarde des préférences.');
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
}

export type NotificationTestSendResult = {
  sent: boolean;
  recipient: string | null;
  ao_count: number;
  reason: string | null;
};

export async function sendTestNotification(
  orgId: string,
  body: Omit<NotificationPreferences, 'org_id' | 'last_notified_at'>,
): Promise<NotificationTestSendResult> {
  let res: Response;
  try {
    res = await fetch(`${NOTIFICATIONS_BASE}/preferences/${orgId}/test-send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    });
  } catch (err) { wrapNetworkError(err); }
  const data = await safeJson<NotificationTestSendResult & { detail?: unknown }>(res);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : "Erreur lors de l'envoi du test.");
  if (!data) throw new Error('Réponse inattendue du serveur. Réessayez.');
  return data;
}
