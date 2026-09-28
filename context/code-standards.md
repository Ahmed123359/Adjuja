# Code Standards

Condensed from `CLAUDE.md` (which stays the canonical source for the project's
core conventions) plus patterns confirmed real during implementation. Update both
together when a convention changes, do not let them drift apart.

## Non-Negotiables

Review blockers, not style preferences.

- No hardcoded colors, spacing, or copy in frontend components. CSS vars +
  i18n (`adjuja-frontend/src/locales/*.json`) only. See `ui-context.md`.
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
  through the calling domain's `features/<domain>/api.ts`, which uses
  `authHeaders()` from `shared/lib/http.ts`. `src/api.ts` and `src/types.ts` are
  backwards-compatibility barrels since the 2026-09-12 split: never add anything
  new to them.
- No secrets, credentials, or connection strings in source. `.env` only, gitignored.
- No raw SQL string-concatenates user input. SQLAlchemy's parameterization is the
  default and expected path.
- Uploaded files are validated (size limit, MIME type) before processing.
- `JWT_SECRET_KEY` is >= 32 chars and never the literal default in production,
  enforced by a startup validator, do not weaken it.
- Never modify a DB schema without a real Alembic migration, discussed first if it
  touches an existing table with data. Since 2026-09-28 the schema comes ONLY from
  migrations: `app/scripts/migrate.py` runs `upgrade head` in the `api` container
  before uvicorn (and in CI before the tests); `create_all` is gone from startup.
  A model change without its migration now breaks production and CI.
- Idempotent additive changes use SQL `IF NOT EXISTS` (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`), as in migration `017`. The `try/except pass`
  pattern of migrations `007`-`016` does NOT work on PostgreSQL: a failed
  statement aborts the whole transaction even when Python catches the exception,
  so the next statement fails too. Do not copy it.
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

Chaque service est un dépôt git distinct, cloné frère des autres (voir
`architecture-context.md`). Les arbres ci-dessous sont relatifs à la racine de leur
propre dépôt.

```
adjuja-backend/
├── app/
│   ├── api/routes/   FastAPI routers, thin
│   ├── services/     Business logic (dont rag_service.py)
│   ├── tasks/        Celery tasks (main app)
│   ├── providers/    LLM provider Strategy + Factory
│   ├── billing/provider/ Payment provider Strategy + Factory
│   ├── models/       SQLAlchemy models
│   └── config/       Settings
├── alembic/          Migrations
└── tests/            pytest

adjuja-watcher/app/         Same shape, independent service and repo
adjuja-notification/app/    Same shape, independent service and repo

adjuja-frontend/src/
├── features/<domaine>/ api.ts, types.ts, components/, la page du domaine
│                       ao, veille, company, billing, auth, org, tools, chat,
│                       generation, marches, notifications, landing, legal
├── shared/lib/http.ts  Socle HTTP : jeton, authHeaders(), helpers de reponse
├── shared/layout/      Coquille applicative : RightPanel, LeftPanel, Header,
│                       AppSidebar
├── shared/ui/          CustomSelect, GlowMenu, LanguageSelector
├── shared/             app.api.ts, app.types.ts, SettingsPage.tsx
├── api.ts, types.ts    Barrels de retrocompatibilite, ne rien y ajouter
├── hooks/              Hooks transverses (useIsMobile, useTheme, ...)
├── pages/              Seulement les pages sans domaine (404, ComingSoon)
└── locales/            i18n

adjuja-infra/           docker-compose*.yml, .env, scripts/clone.sh
adjuja-docs/            conception/, business_plan/, hafid-taches-docs/
```

La decoupe par domaine du 2026-09-12 est faite pour tout le code applicatif :
`src/components/` a entierement disparu, `src/pages/` ne garde que les deux pages
sans domaine (404, ComingSoon). Rien n'a change de comportement, seuls les
emplacements et les imports. Un nouvel ecran va dans `features/<domaine>/`,
jamais dans `pages/` ni dans un `components/` racine.

Ce qui reste a faire (etape de factorisation, distincte du deplacement) :
unifier les **quatre implementations differentes du polling Celery**
(`features/ao/components/AoDetailView`, `features/tools/components/DocumentsTab`,
`features/tools/components/FillerTab`, `features/veille/components/AoDetailPanel`)
-- elles n'ont ni la meme mecanique ni la meme condition d'arret, donc c'est une
reecriture a mener explicitement, pas une substitution mecanique.

- One-off maintenance scripts (seeding, ingestion) live at the relevant service's
  repo root, e.g. `adjuja-backend/seed_company_profile.py`, never inside `app/` since they are
  not part of the running application.
