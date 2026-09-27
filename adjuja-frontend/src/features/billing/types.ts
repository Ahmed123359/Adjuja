// Abonnements et facturation.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


// ── Billing & Subscriptions ─────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export type PlanCode = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanLimit {
  used:  number;
  limit: number | null; // null = illimité
}

export interface BillingUsage {
  ao_per_month: PlanLimit;
  documents:    PlanLimit;
}

export interface Subscription {
  plan_code:           PlanCode;
  status:               SubscriptionStatus;
  current_period_end:  string | null;
  usage:                BillingUsage;
}

/** Une offre telle que la sert `GET /billing/plans` (source de verite des prix
 *  et des limites, `app/billing/plans.py`). `null` = illimite. */
export interface PlanInfo {
  code:                 PlanCode;
  label:                string;
  price_mad:            number;
  price_mad_annual:     number;
  max_users:            number | null;
  max_ao_per_month:     number | null;
  max_documents:        number | null;
  providers_allowed:    string[];
  has_chat:             boolean;
  unlimited_signatures: boolean;
  has_sso:              boolean;
}
