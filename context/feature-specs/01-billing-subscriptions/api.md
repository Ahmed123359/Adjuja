# Billing & Subscriptions -- api.md

## Decisions locked before coding (confirmed with user, 2026-07-18)

- Enforcement provider-agnostic first, CMI is the only real gateway wired now (Morocco
  market, Stripe does not settle MAD to a Moroccan account -- see `progress-tracker.md`).
  Bank/merchant-account setup itself is explicitly out of scope for this pass; everything
  CMI-specific is env-var driven so it activates the moment real credentials exist.
- Limit breach -> hard block with an upgrade-oriented message, no soft-block/warning-only
  mode. Status code is `402 Payment Required`, not the `429` used by
  `User.max_generations` in `generation_routes.py`: `429` implies "wait and retry," which
  is wrong here, a plan limit only lifts by upgrading or waiting for next month, so `402`
  is the semantically correct code even though it diverges from that existing precedent.
- Usage counters (AO/month, documents) reset on the calendar month, not a rolling 30 days
  from subscription start. Matches how `current_period_end` naturally aligns with CMI
  recurring billing.
- Pro/Enterprise are sales-assisted (`Sur devis` on the pricing page today) -- manual
  admin activation only, no CMI checkout for them in this pass.

## Revision 2026-07-18b : Pro moved to self-serve

Pro is no longer "Sur devis" -- 299 MAD/mois (239 annual), self-serve via CMI like
Starter. Only Enterprise stays sales-assisted (on-premise deployment, SSO, dedicated
onboarding genuinely need a conversation; Pro doesn't).

**Real risk this introduces, addressed rather than ignored**: Pro bundles "unlimited"
generation with premium LLM providers (GPT-4o/Claude, meaningfully more expensive per
token than Mistral) and unlimited signatures. Today's `Sur devis` flow implicitly
gatekept this -- a human looked at the deal before an account with this cost profile could
exist. Self-serve removes that filter. Fix: `Plan.max_ao_per_month` for `pro` is `300`,
not `None` -- a fair-use ceiling, not truly unlimited, high enough that no real customer
("plusieurs AOs par semaine" per the pricing tagline) should ever hit it, low enough to
cap worst-case LLM spend exposure. Marketing copy still says "AOs générés illimités"
(`f_ao_illimite`), this is standard SaaS practice (soft-capped "unlimited"), not
misleading given the ceiling is ~10x realistic usage.

**Real bug fixed while wiring this**: `CMIProvider`'s `order_id` encoding was
`sub-{org_id}-{random}` split on `-`, but `org_id` is itself a UUID full of internal
hyphens (`str(uuid.uuid4())`), so `parse_webhook` would have recovered only the first
UUID segment (`11111111` instead of the full `11111111-2222-...`), silently activating
the wrong org or none at all. Also had no way to know which plan was purchased since
Starter was the only self-serve option, hardcoded `plan_code="starter"` in the webhook
event. Fixed by switching the delimiter to `__` (not present in UUIDs or plan codes) and
encoding the plan: `sub__{plan_code}__{org_id}__{random}`. Verified end-to-end with a
full UUID org_id round-tripping correctly through create_checkout -> parse_webhook.

## Feature -> mechanism mapping

Grounded in what actually exists today, not invented:

| Pricing card line | Mechanism | Status |
|---|---|---|
| Génération illimitée | `User.max_generations = 0` | Existing column, now set on subscription activation instead of only at register |
| 1 / 5 / ∞ utilisateurs | `COUNT(users WHERE org_id=X)` | New check on top of existing `users.org_id` |
| 50 / 200 / ∞ AOs générés / mois | `COUNT(appels_offres WHERE org_id=X AND created_at in current month)` | New check, wired into `create_ao` + `import_from_watcher` in `ao_routes.py` |
| Digestion X documents | `COUNT(company_documents WHERE org_id=X)` | New check, wired into `upload_document` in `company_documents_routes.py` |
| Export Word, chat, providers, signatures illimitées, SSO | Plan feature flags | New, not enforced everywhere yet in this pass (see Open Questions) |

## Plan config

`app/billing/plans.py`. Config, not a DB table -- pricing/limits change more often than
schema should, and there is no product need yet to edit plans without a deploy.

```python
@dataclass(frozen=True)
class Plan:
    code: str
    max_users: int | None            # None = unlimited
    max_ao_per_month: int | None
    max_documents: int | None
    providers_allowed: tuple[str, ...]
    has_chat: bool
    unlimited_signatures: bool
    has_sso: bool

PLANS: dict[str, Plan] = {
    "free":       Plan(code="free",       max_users=1, max_ao_per_month=0,   max_documents=5,   providers_allowed=("mistral",), has_chat=False, unlimited_signatures=False, has_sso=False),
    "starter":    Plan(code="starter",    max_users=1, max_ao_per_month=50,  max_documents=50,  providers_allowed=("mistral",), has_chat=False, unlimited_signatures=False, has_sso=False),
    "pro":        Plan(code="pro",        max_users=5, max_ao_per_month=None, max_documents=200, providers_allowed=("mistral","openai","anthropic"), has_chat=True, unlimited_signatures=True, has_sso=False),
    "enterprise": Plan(code="enterprise", max_users=None, max_ao_per_month=None, max_documents=None, providers_allowed=("mistral","openai","anthropic"), has_chat=True, unlimited_signatures=True, has_sso=True),
}
```

`free` is not on the pricing page (the register flow's `max_generations=1` trial covers
that hook), but exists here so an org with no `Subscription` row resolves to a real,
restrictive plan object instead of a null-check scattered through every call site.

## Schema

`app/db/models.py` additions, Alembic migration `010_billing_subscriptions.py`
(mirrors the existing `try/except pass` idempotent style used in `007`-`009`):

```python
class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str]                = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str]            = mapped_column(String(36), ForeignKey("organizations.id"), unique=True, index=True)
    plan_code: Mapped[str]         = mapped_column(String(20), default="free")
    status: Mapped[str]            = mapped_column(String(20), default="active")
    # active | past_due | canceled | trialing
    current_period_end: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider: Mapped[str]          = mapped_column(String(20), default="manual")
    # manual | cmi
    provider_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    grace_until: Mapped[str | None]  = mapped_column(String(50), nullable=True)
    created_at: Mapped[str]        = mapped_column(String(50))
    updated_at: Mapped[str]        = mapped_column(String(50))


class BillingEvent(Base):
    """Webhook idempotency guard. CMI/any provider retries callbacks; a duplicate
    provider_event_id is ignored rather than double-activating a subscription."""
    __tablename__ = "billing_events"
    __table_args__ = (UniqueConstraint("provider", "provider_event_id", name="uq_billing_event"),)

    id: Mapped[str]                 = mapped_column(String(36), primary_key=True)
    provider: Mapped[str]           = mapped_column(String(20))
    provider_event_id: Mapped[str]  = mapped_column(String(255))
    org_id: Mapped[str | None]      = mapped_column(String(36), nullable=True)
    event_type: Mapped[str]         = mapped_column(String(50))
    raw_payload: Mapped[str]        = mapped_column(Text)
    processed_at: Mapped[str]       = mapped_column(String(50))
```

One `Subscription` row per org (`org_id` unique), same convention as `CompanyProfile`.
Timestamps are `String` (ISO 8601), matching every other table in this codebase
(`User.created_at`, `AppelOffre.created_at`, etc.) rather than introducing `DateTime`
as a new convention for just this feature.

## PaymentProvider interface

`app/billing/provider/base.py`. Same Strategy/Factory shape already established for LLM
providers (`AbstractLLMProvider` + `ProviderFactory` in `app/providers/`) -- this codebase
already has a convention for "one interface, swappable implementations, factory picks by
name," reused here rather than inventing a second pattern.

```python
class PaymentProvider(ABC):
    @abstractmethod
    async def create_checkout(self, org_id: str, plan_code: str) -> CheckoutSession: ...

    @abstractmethod
    def parse_webhook(self, headers: dict, raw_body: bytes) -> WebhookEvent | None:
        """Verifies signature, returns None if invalid/unrecognized."""
```

`CheckoutSession` = `{redirect_url: str, provider_ref: str}`.
`WebhookEvent` = `{provider_event_id: str, org_id: str, plan_code: str, event_type: str, raw: dict}`.

### `ManualProvider` (`app/billing/provider/manual.py`)

No external call. `create_checkout` raises (never invoked, manual plans are activated by
an admin endpoint, not a checkout flow). Exists so the `Subscription.provider` field has a
real, non-CMI value for Pro/Enterprise rows, and so the factory has more than one
implementation to select between from day one (avoids the trap of building an "interface"
around a single implementation with no real axis of variation yet -- there are two paths
here, self-serve and sales-assisted, so the abstraction is earning its keep).

### `CMIProvider` (`app/billing/provider/cmi.py`)

CMI's gateway is a hosted-payment-page redirect with an HMAC-signed request/response, the
standard shape for Moroccan/MENA bank payment gateways (merchant builds a signed form,
customer is redirected to CMI's page, CMI redirects back with a signed result). **The exact
field names, hash algorithm details, and callback payload shape are not asserted here as
fact** -- they must be confirmed against CMI's real merchant integration guide once a
merchant account exists, tracked in Open Questions below. What's built now is the
env-driven skeleton so no code changes are needed later, only `.env` values:

```
CMI_MERCHANT_ID=
CMI_STORE_KEY=
CMI_API_URL=              # sandbox vs prod base URL
CMI_OK_URL=                # ADJUJA endpoint CMI redirects to on success
CMI_FAIL_URL=
CMI_CALLBACK_URL=          # server-to-server webhook, independent of browser redirect
```

If `CMI_MERCHANT_ID` is empty, `CMIProvider.create_checkout` raises a clear
"CMI not configured" error rather than silently failing or faking success -- the Starter
checkout button surfaces this as a real error in dev/staging until real credentials land.

### `PaymentProviderFactory` (`app/billing/provider/factory.py`)

`create(provider_name: str) -> PaymentProvider`, same shape as `ProviderFactory.create()`
in `app/providers/provider_factory.py`.

## SubscriptionService

`app/services/subscription_service.py`. All access-control reads go through this, never
a live provider call:

- `get_active(org_id) -> Subscription` -- returns the row, or a synthetic `free` one if
  none exists (never `None`, every call site gets a real plan to check against).
- `get_plan(org_id) -> Plan` -- resolves `Subscription.plan_code` through `PLANS`.
- `check_limit(org_id, counter: Literal["ao_per_month","documents"]) -> None` -- raises
  `PlanLimitExceeded` (mapped to `HTTPException(402, ...)` at the route layer) if the
  `COUNT(...)` for the relevant table meets or exceeds the plan's limit. `None` limit =
  always passes.
- `activate(org_id, plan_code, provider, provider_ref, period_end)` -- upserts the
  `Subscription` row, sets `status="active"`, and sets `User.max_generations=0` for every
  user in that org (closes the loop with the existing free-trial mechanism).
- `mark_past_due(org_id)` / `downgrade_to_free(org_id)` -- used by the Beat sweep, not by
  request-time code.

`check_limit` for `ao_per_month` and `documents` runs a `COUNT` against
`appels_offres`/`company_documents` filtered by `org_id` and, for the monthly counter,
`created_at >= <first of current month>` (string-prefix compare on the ISO timestamp,
matching how `created_at: Mapped[str]` is already queried elsewhere in this codebase, no
new date-handling convention introduced).

## Enforcement wiring

Added as a dependency next to the existing `Depends(get_current_user)`, not a decorator or
middleware -- matches the codebase's existing convention (every protected route already
takes `current_user: UserPublic = Depends(get_current_user)`).

```python
def require_within_limit(counter: Literal["ao_per_month", "documents"]):
    async def _check(
        current_user: UserPublic = Depends(get_current_user),
        subs: SubscriptionService = Depends(get_subscription_service),
    ) -> None:
        org_id = current_user.org_id or current_user.id
        await subs.check_limit(org_id, counter)
    return _check
```

Wired into:
- `POST /ao` (`create_ao`) and `POST /ao/from-watcher` (`import_from_watcher`) in
  `ao_routes.py` -- `counter="ao_per_month"`.
- `POST /company-documents` (`upload_document`) in `company_documents_routes.py` --
  `counter="documents"`.

Seat limit (`max_users`) has no wiring target yet: there is no team-invite/add-user-to-org
endpoint in the codebase today, users get an `org_id` some other way not covered by this
feature. `SubscriptionService` exposes the check (`check_limit` extended with a `"users"`
counter) ready for whenever that endpoint ships, not fabricated here. See Open Questions.

## Routes

`app/api/routes/billing_routes.py`, registered in `main.py` under `/api/v1`:

```
GET  /billing/plans                      Public, returns PLANS (for the pricing page to consume real limits later)
GET  /billing/subscription                Auth required, current org's Subscription + usage against limits
POST /billing/checkout                    Auth required, body {plan_code}, only "starter" allowed -> CMIProvider.create_checkout
POST /billing/webhook/cmi                 Public, CMI calls this server-to-server, signature-verified inside CMIProvider.parse_webhook
POST /billing/admin/activate               Admin only (reuses admin_emails check pattern from auth_routes), body {org_id, plan_code, period_end} -> SubscriptionService.activate(..., provider="manual")
```

Webhook handler: `parse_webhook` returns `None` on bad signature -> `400`, no state
change. On success, checks `BillingEvent` for `(provider, provider_event_id)` first --
if already processed, returns `200` immediately without re-activating (idempotency, CMI
retries on any non-2xx or timeout). Otherwise inserts the `BillingEvent` row and calls
`SubscriptionService.activate(...)` in the same transaction.

## Celery Beat: dunning + auto-revoke

No Beat schedule exists for the main app today (`app/celery_app.py` only has
`task_routes`). Added:

```python
celery_app.conf.beat_schedule = {
    "billing-dunning-sweep": {
        "task": "app.tasks.billing_tasks.sweep_subscriptions",
        "schedule": crontab(hour=6, minute=0),  # once daily, 06h00 Africa/Casablanca
    },
}
```

`app/tasks/billing_tasks.py::sweep_subscriptions`:

1. `SELECT * FROM subscriptions WHERE status='active' AND current_period_end < now()`
   -> set `status='past_due'`, `grace_until = now() + 5 days`, trigger a dunning email via
   the existing notification-service HTTP trigger pattern (`_trigger_notification_batch`
   in `ao-watcher/app/workers/tasks/scrape_tasks.py` is the precedent to follow -- POST to
   `notification-api:8002` with the admin secret, a new template rather than reusing
   `ao_digest`).
2. `SELECT * FROM subscriptions WHERE status='past_due' AND grace_until < now()` ->
   `SubscriptionService.downgrade_to_free(org_id)`: `plan_code='free'`, `status='canceled'`,
   and -- unlike activation -- does NOT touch `User.max_generations` (a downgraded org's
   users simply lose access to plan-gated features going forward via `check_limit`, their
   already-exhausted free-trial generation count is irrelevant at this point).

Grace period is 5 days, a default, not confirmed against any business requirement --
flagged in Open Questions, trivial to change (one constant).

## New settings (`app/config/settings.py`)

```python
cmi_merchant_id: str = ""
cmi_store_key: str = ""
cmi_api_url: str = ""
cmi_ok_url: str = ""
cmi_fail_url: str = ""
cmi_callback_url: str = ""

billing_dunning_grace_days: int = 5
billing_admin_secret: str = ""   # reuses the notification-service ADMIN_SECRET pattern for the internal trigger, separate value
```

No new validator forcing these to be set (unlike `jwt_secret_key`) -- billing being
unconfigured must not block the app from starting, `CMIProvider` fails loudly only when
actually invoked.

## Infra

New Celery Beat service for the main app (docker-compose, both `dev` and prod), mirroring
`ao-watcher-beat`/`notification-beat`'s existing shape:

```yaml
celery-beat:
  build: { context: ., dockerfile: Dockerfile, target: final }
  command: celery -A app.celery_app.celery_app beat --loglevel=info
  env_file: [.env]
  environment: { ...same DATABASE_URL/REDIS_URL/etc as celery-io/celery-cpu... }
  depends_on: [postgres, redis]
```

## Open Questions

- Exact CMI field names, hash algorithm, and callback payload shape: not asserted as fact
  anywhere above, must be confirmed against the real CMI merchant integration guide once a
  merchant account exists. `CMIProvider` is structurally ready, not functionally complete
  until then.
- No team-invite/add-user-to-org endpoint exists yet, so the seat-limit check
  (`max_users`) has a `SubscriptionService` method ready but nowhere wired. Wire it when
  that endpoint is built, do not build it here as a fabricated feature.
- Feature flags (`has_chat`, `providers_allowed`, `unlimited_signatures`, `has_sso`) are
  defined in `Plan` but not yet enforced at their respective call sites
  (`chat_service.py`, provider selection in `generation_routes.py`, `signing_routes.py`,
  no SSO exists at all yet). Enforcing all of them is real scope beyond this pass; flagging
  rather than silently expanding it.
- 5-day grace period before downgrade is a default, not a confirmed business rule.
- `billing_admin_secret` reuses the `notification-service` HTTP-trigger pattern
  conceptually but is a distinct value -- confirm whether it should actually be the same
  secret shared across services (simpler ops) or intentionally separate (smaller blast
  radius if one leaks). Defaulted to separate here.
