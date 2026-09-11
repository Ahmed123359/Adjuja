// Abonnements et paiement.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders } from '../../shared/lib/http';
import type { Subscription } from '../../types';

export const CHECKOUT_INTENT_KEY = 'adjuja_checkout_intent';

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
