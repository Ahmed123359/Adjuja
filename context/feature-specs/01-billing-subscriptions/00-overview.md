## Deliverable

An org has a real `Subscription` row governing what it can do: quick-generation stays
gated by the existing `User.max_generations` free-trial mechanism, but the AO pipeline
(monthly cap), team seats, and document digestion are now enforced against the org's
actual plan instead of being unenforced marketing copy on the pricing page. Starter can
be paid for via a real CMI checkout. A failed/expired subscription degrades gracefully
(grace period, dunning email, then downgrade) via a scheduled sweep, never by cutting
someone off the instant CMI's webhook fires.

Pro and Enterprise stay sales-assisted (bank transfer + manual activation by an admin) --
they are already "Sur devis" on the pricing page, not self-serve, so no CMI checkout is
built for them in this pass.

## Depends on

Nothing new architecturally: reuses `organizations`/`users` (existing multi-tenant model),
Celery (`app/celery_app.py`, no Beat schedule existed before this feature), and
`notification-service` (port 8002, already has Resend email + templates) for dunning
emails rather than building a second email pipeline.

## Build order

1. `api.md` -- `Plan` config, `Subscription`/`BillingEvent` tables, `PaymentProvider`
   interface (CMI + Manual), enforcement dependency wired into the four existing endpoints
   that map to pricing-card limits, checkout + webhook routes, Celery Beat dunning/revoke
   sweep.
2. `client.md` -- pricing page Starter CTA wired to a real checkout redirect, a minimal
   subscription-status view in the app (current plan, usage against limits, upgrade path),
   402/429 upgrade-prompt handling.

No `admin.md`: manual activation for Pro/Enterprise is one protected endpoint
(`POST /billing/admin/activate`), not a full screen, in this pass.

## Check when the feature is done

- An org on Starter hits the 50-AO/month cap and gets a clear 402 with an upgrade message,
  not a silent failure or an unrelated 500.
- A real CMI sandbox checkout (once merchant credentials exist, see api.md's env-driven
  design) can activate a `Subscription` end to end via the webhook, idempotently.
- An admin can activate/extend a Pro/Enterprise org's subscription manually with one call,
  no CMI involved.
- A subscription past `current_period_end` gets a dunning email, a grace period, then is
  downgraded automatically by the Beat sweep, without any request-time call to CMI.
- Everything in `api.md` and `client.md` individually passes its own check first.
