// Abonnements et paiement.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders } from '../../shared/lib/http';
import type { Subscription } from '../../types';
import type { PlanInfo } from './types';

export const CHECKOUT_INTENT_KEY = 'adjuja_checkout_intent';

// ── Billing & Subscriptions ─────────────────────────────────────────────────

export async function getSubscription(): Promise<Subscription> {
  const res = await fetch('/api/v1/billing/subscription', { headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de récupérer votre abonnement.');
  return res.json();
}

/** Catalogue des offres (route publique). Les prix affiches dans l'application
 *  viennent d'ici, plus d'une copie en dur qui avait diverge (79 EUR / 249 EUR
 *  in-app contre 490 / 990 MAD factures). */
export async function fetchPlans(): Promise<Record<string, PlanInfo>> {
  const res = await fetch('/api/v1/billing/plans');
  if (!res.ok) throw new Error('Impossible de charger les offres.');
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
