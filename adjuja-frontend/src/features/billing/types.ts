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
