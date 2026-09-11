# Architecture Context

Full technical detail lives in `adjuja-docs/conception/2. Architecture/architecture.md`. This
file is the condensed reference used while implementing, kept current as
architecture actually changes (see `context/ai-workflow-rules.md`'s "Keeping docs
in sync").

## Stack

| Layer | Technology | Role |
|---|---|---|
| Main API | FastAPI, async SQLAlchemy | Core app: auth, org/company profiles, AO pipeline, generation, billing, RAG/chat |
| AO Watcher | FastAPI, separate service | Scrapes public tender portals (Playwright + httpx), owns its own `watcher` DB schema |
| Notification service | FastAPI, separate service | Email digests via Resend, owns its own `notifications` DB schema |
| Database | PostgreSQL, one instance | Three schemas: `public` (main app), `watcher` (ao-watcher), `notifications` (notification-service) -- one instance, not one DB per service |
| Queue | Celery + Redis | Separate Redis DB index per concern (main app io/cpu queues, ao-watcher, notification-service) |
| Object storage | MinIO, self-hosted, S3-compatible | Generated documents, uploaded company docs, downloaded tender DCE zips -- shared bucket `offria` across main app and ao-watcher |
| Vector store | Qdrant | RAG embeddings, collection `offria_kb` (global) and `offria_kb_{org_id}` (per-org, see chatbot feature's architecture note on the mismatch between these two) |
| Frontend | React, Vite, TypeScript | Single SPA, `adjuja-frontend/src/api.ts` is the only place that calls the backend |
| Edge | nginx (in the `frontend` container) | Reverse proxy: `/api/` to main API, `/watcher/` to ao-watcher, serves the built SPA |
| Orchestration | Docker Compose | Self-managed VPS (Hetzner), not a managed platform; separate `adjuja-infra/docker-compose.yml` (prod) and `adjuja-infra/docker-compose.dev.yml` (local) |

## Repository Topology

Since 2026-09-10 ADJUJA is **not one repo**. Each service is its own git repository,
cloned side by side in a workspace folder that is itself not a repo (`e-himaya` model):
`adjuja-backend`, `adjuja-frontend`, `adjuja-watcher`, `adjuja-notification`,
`adjuja-infra` (orchestration, entry point), `adjuja-docs`.

Consequences that bind day-to-day work:

- A change spanning services produces **one commit per repo**. There is no root repo to
  commit to.
- Compose build contexts are relative to `adjuja-infra/` (`context: ../adjuja-backend`),
  so the repos must stay siblings. `adjuja-infra/scripts/clone.sh` enforces the layout.
- No repo can build another's code. This is why `adjuja-backend/Dockerfile` no longer
  builds the SPA, and why `:8000/ui` no longer exists -- the SPA is served only by the
  `frontend` nginx container.
- `CLAUDE.md` and `context/` live unversioned at the workspace root, in no repo at all.

## System Boundaries

- `app/`, the main API. Routes (`app/api/routes/`) stay thin, delegate to
  `app/services/`. Celery tasks live in `app/tasks/`. Providers (LLM) live in
  `app/providers/`, one interface (`AbstractLLMProvider`) plus a Factory
  (`ProviderFactory`), same Strategy/Factory shape billing's `PaymentProvider`
  reused rather than inventing a second pattern -- this is the project's standing
  "one interface, swappable implementations, factory picks by name" convention,
  reach for it before inventing a different abstraction shape.
- `adjuja-watcher/`, independent service and independent git repo, independent `app/` tree, own Dockerfile, own
  Celery app. Talks to the main app over HTTP (`app/core/config.py`'s
  `main_app_host`/`main_app_port`), relays the caller's JWT rather than verifying
  it itself (`ao-watcher` has no access to `JWT_SECRET_KEY` or the `users` table).
- `adjuja-notification/`, independent service and independent git repo, same shape as `ao-watcher`. Talks
  to `ao-watcher` (event-driven trigger after a scrape) and is talked to by the
  main app's Celery Beat (billing dunning emails).
- `adjuja-frontend/`, single React SPA (own git repo) serving both the marketing landing page and the
  authenticated app, nginx-served in production.

## Storage Model

- PostgreSQL holds all relational data, one instance, three schemas as in the
  Stack table. A migration to one schema touches only that schema's owning
  service's Alembic chain (main app's `alembic/`, ao-watcher and notification-
  service manage their own schema creation separately, not via the main app's
  Alembic).
- MinIO holds document bytes. Bucket `offria`, shared between the main app and
  ao-watcher (ao-watcher writes tender DCE downloads under `ao-watcher/{id}/...`,
  main app writes generated/uploaded documents under its own prefixes). Postgres
  stores only the MinIO key, never raw bytes.
- Qdrant holds RAG embeddings, see the chatbot feature's `architecture.md` (once
  written) for the collection model in detail -- summary: `offria_kb` is global and
  is what retrieval actually reads, `offria_kb_{org_id}` is per-org and is
  currently a dead end (written to, never read from).

## Auth and Access Model

- Main app: stateless JWT (`JWT_SECRET_KEY`, must be >= 32 chars, validated at
  startup, never the literal default in production). `current_user.org_id or
  current_user.id` is the standing pattern for resolving which org a request acts
  on (a solo user's own id doubles as their org id).
- ao-watcher and notification-service do not independently verify JWTs for most
  endpoints -- ao-watcher relays the `Authorization` header to the main app for
  anything that needs real auth resolution (`_require_auth_header` just checks the
  header is present, not that it's valid); notification-service does validate JWTs
  itself where it needs org-scoped access (preferences endpoints), using the same
  `JWT_SECRET_KEY`, shared across services for exactly this reason.
- Google Sign-In: ID-token verification only (`google.oauth2.id_token`), needs only
  `GOOGLE_CLIENT_ID` server-side, never a client secret for this flow.

## Security Model

- Every protected route takes `Depends(get_current_user)`, no exceptions, no
  temporarily-unauthenticated routes.
- Inbound webhooks (CMI payment callback) verify signature before trusting the
  payload.
- No secrets in source, `.env` only, `.env` is gitignored.
- User-facing error responses stay meaningful for real product errors (a 402 plan
  limit says why) but never leak stack traces or internal detail.

## Automation Model

- Celery Beat schedules, one per service, each service's own beat container (not
  shared): main app (`celery-beat`, billing dunning sweep, daily), ao-watcher
  (`ao-watcher-beat`, tender scraping + daily expired-entry cleanup),
  notification-service (`notification-beat`, digest fallback if the event-driven
  trigger from ao-watcher fails).
- Cross-service triggers are plain HTTP calls with a shared admin secret
  (`ao-watcher` -> `notification-service`'s `/admin/trigger`), not a message bus.
  This is a deliberate choice for a three-service system this size, reconsider only
  if a fourth consumer of the same event appears.

## Reusability Model

- This codebase runs one live instance for ADJUJA itself, it is not built to be
  forked for other clients (unlike some of the user's other projects). Do not
  introduce a `StoreSettings`-style per-tenant config layer speculatively.
- Design tokens (palette, CSS vars) live in `adjuja-frontend/src/index.css` and
  `context/ui-context.md`'s Design Tokens section. A rebrand is a token edit.

## Invariants

1. `ao-watcher` and `notification-service` never import main-app Python modules
   directly or share a Python process with it -- HTTP is the only integration
   surface between services.
2. A new LLM or payment provider is a new class implementing the existing
   interface plus a Factory registry entry, never a conditional branch inside a
   service.
3. Frontend never calls the backend directly from a component. Every call goes
   through `frontend/src/api.ts` with `authHeaders()`.
4. FastAPI routes validate input, call a service, translate the result to an HTTP
   response. Business logic lives in `app/services/`, not in the route function.
5. Timestamps on existing tables are `String` (ISO 8601), matching the established
   convention -- do not introduce `DateTime` as a competing convention on an
   existing table without a real reason.
6. A behavior specific to one org (billing plan, notification preferences) is a
   row in that org's own table, never a global conditional.
