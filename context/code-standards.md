# Code Standards

Condensed from `CLAUDE.md` (which stays the canonical source for the project's
core conventions) plus patterns confirmed real during implementation. Update both
together when a convention changes, do not let them drift apart.

## Non-Negotiables

Review blockers, not style preferences.

- No hardcoded colors, spacing, or copy in frontend components. CSS vars +
  i18n (`frontend/src/locales/*.json`) only. See `ui-context.md`.
- No AI-generated design tells: no pill/`rounded-full` buttons, no eyebrow/kicker
  labels, no generic glow badges, no gradient-button default. See `ui-context.md`'s
  Rejected Patterns.
- No em dashes in any product-facing text, ever -- UI copy, error messages, emails,
  generated document content.
- French accents (é è ê à â î ô ù ç) always written correctly, in code comments,
  docs, and product copy alike.
- Every protected FastAPI route takes `Depends(get_current_user)`. Never disable
  auth on a route that was previously protected.
- FastAPI routes contain validation + a call to a service + HTTP response
  translation, never business logic directly.
- New services are singletons via `@lru_cache` in `dependencies.py`, matching the
  existing pattern, not instantiated ad hoc per request.
- Frontend never calls the backend directly from a component. Every call goes
  through `frontend/src/api.ts` with `authHeaders()`.
- No secrets, credentials, or connection strings in source. `.env` only, gitignored.
- No raw SQL string-concatenates user input. SQLAlchemy's parameterization is the
  default and expected path.
- Uploaded files are validated (size limit, MIME type) before processing.
- `JWT_SECRET_KEY` is >= 32 chars and never the literal default in production,
  enforced by a startup validator, do not weaken it.
- Never modify a DB schema without a real Alembic migration, discussed first if it
  touches an existing table with data. The `try/except pass` idempotent pattern
  established in migrations `007`-`011` is the house style for additive changes.
- A design pattern (Strategy, Factory, Repository) is used where there is a real
  axis of variation (LLM providers, payment providers), not spec ulatively wrapped
  around something that will never vary.

## General

- Keep modules small and single purpose.
- Fix root causes, do not layer workarounds on top of a symptom.
- Verify in real conditions before declaring something done -- a Docker service
  change is not done until checked via real logs or a real request, an init/
  migration script is not trusted because it printed success, see
  `ai-workflow-rules.md`.

## Backend

- Type hints on every function.
- New microservice-to-microservice calls are plain HTTP with a shared secret
  header, matching the existing `ao-watcher` -> `notification-service` pattern,
  not a new message bus for a system this size.
- A provider swap (LLM, payment) is a new class + Factory registry entry, see
  `architecture-context.md`'s Invariant 2.
- Timestamps on existing tables stay `String` (ISO 8601) for consistency with what
  is already there; a genuinely new table can use `DateTime` if there's a real
  reason, but do not silently convert an existing column's type.

## Frontend

- CSS vars + i18n only, no hardcoded hex values or literal UI strings.
- Mobile-first: check a component at a small width before tablet/desktop, per
  `ui-context.md`'s Responsiveness section.
- Shared reusable pieces (buttons, cards, inputs) follow the existing inline-style
  + `var(--l-*)` convention already established in the dashboard/veille components,
  do not introduce a second styling system (e.g. a new CSS-in-JS library) for a
  new feature.
- A component that defines a sub-component used only inside its own JSX must
  define that sub-component outside its own render function (module scope), never
  nested inside -- nesting recreates the sub-component's identity on every render
  and breaks input focus, a real bug hit and fixed in `DashboardPage.tsx`'s
  `ProfileTab`/`Field` (2026-08-19).

## File Organization

```
app/
├── api/routes/       FastAPI routers, thin
├── services/         Business logic
├── tasks/            Celery tasks (main app)
├── providers/        LLM provider Strategy + Factory
├── billing/provider/ Payment provider Strategy + Factory
├── models/            SQLAlchemy models
└── config/            Settings

ao-watcher/app/         Same shape, independent service
notification-service/app/  Same shape, independent service
frontend/src/
├── api.ts             Only place that calls the backend
├── components/        Reusable + feature components
├── pages/              Route-level components
└── locales/            i18n
```

- One-off maintenance scripts (seeding, ingestion) live at the relevant service's
  repo root, e.g. `seed_company_profile.py`, never inside `app/` since they are
  not part of the running application.
