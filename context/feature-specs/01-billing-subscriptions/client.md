# Billing & Subscriptions -- client.md

## Scope

Started as minimal wiring, ended up covering the full pricing-page-to-checkout flow once
Pro moved to self-serve (2026-07-18b) -- the standard SaaS expectation is that clicking a
self-serve plan's CTA leads to checkout, not just "open the app." Enterprise stays a
"Contacter l'équipe" link, unchanged.

## Changes (as built)

- `frontend/src/types.ts`: `Plan`, `Subscription`, `BillingUsage`, `PlanCode` types
  matching `GET /billing/subscription`'s response shape.
- `frontend/src/api.ts`: `getSubscription()`, `startCheckout(planCode)`
  (`authHeaders()`, standing convention), plus `CHECKOUT_INTENT_KEY` -- the localStorage
  key used to remember a pre-auth plan choice (see below). Not a session/token, just a
  plan code string; the actual JWT storage in `localStorage` is a pre-existing,
  independently tracked concern (see `progress-tracker.md`'s Questions ouvertes), not
  introduced by this feature.
- `PricingSection.tsx`, both Starter and Pro CTAs go through one `handlePlanCheckout(planCode)`:
  - Logged in (`getToken()` non-empty) -> calls `startCheckout(planCode)` and redirects to
    `redirect_url` immediately, no detour through the dashboard.
  - Not logged in -> stores `planCode` under `CHECKOUT_INTENT_KEY`, then calls `onEnterApp()`
    (existing landing prop, routes to `/login`).
  - Either path, failure (CMI not configured, etc.) falls back to `onEnterApp()` silently --
    the public page has no toast system, the error surfaces once the user is in the app,
    via `SubscriptionCard`.
  - Enterprise CTA unchanged (`onEnterApp` directly, "Contacter l'équipe").
- `main.tsx`'s `handleAuthSuccess`: after a successful login/register, checks for
  `CHECKOUT_INTENT_KEY` before routing to `/app`. If present, clears it and calls
  `startCheckout(plan)` immediately, redirecting to CMI -- so a logged-out visitor who
  picked Starter/Pro lands on checkout right after signing up, not on the dashboard having
  to rediscover the upgrade button. Falls back to `/app` on failure.
- `DashboardPage.tsx`: new `SubscriptionCard` component, rendered at the top of the
  Vue d'ensemble tab. Shows plan label + status badge, usage bars for `ao_per_month` and
  `documents` (bar only renders when `limit !== null`, unlimited plans show no bar), renewal
  date, and -- only when `plan_code === "free"` -- an "Upgrade to Starter" button (Pro
  upgrade path from in-app not built yet, only the free-tier nudge; a free-tier user who
  wants Pro directly currently has to go back to the public pricing page). Follows this
  file's existing convention exactly: inline `style={{}}` + `var(--l-*)` tokens, not
  Tailwind -- that is the real, established pattern in this specific file, not an exception
  to the project's general Tailwind rule.
- i18n: `dashboard.billing.*` (FR/EN) for the card, `pricing.plans.pro_cta`/`pro_note`
  updated from sales-contact wording to self-serve wording, new
  `pricing.plans.f_ao_illimite` feature line for Pro's card.
- Not yet done: 402 handling on `create_ao`/`from-watcher`/document-upload calls still
  falls into generic error handling rather than a dedicated upgrade-prompt message --
  tracked in `progress-tracker.md`, not silently dropped.

## Check when the feature is done

- A logged-in user on the public pricing page clicks Starter or Pro and lands on a real
  CMI redirect (or the "not configured" error surfaces once they're in the app).
- A logged-out user who clicks Starter/Pro, then signs up, lands on checkout right after
  auth succeeds -- not on the dashboard.
- `SubscriptionCard` shows real usage numbers from the backend, not hardcoded/mocked
  values, and the upgrade button only appears for `free`-tier orgs.
- Hitting the AO/month or document cap surfaces *some* error today (not silent), a
  dedicated upgrade-oriented message is still open work.
