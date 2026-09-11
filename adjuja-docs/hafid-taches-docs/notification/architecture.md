# Notification Service : Architecture & Design

---

## What Does This Service Actually Do?

Three jobs, nothing more:

```
1. MATCH    ->  find new AOs that match each org's sector preferences
2. COMPOSE  ->  build a digest email from the matching AOs
3. DELIVER  ->  send the email and log what was sent (deduplication)
```

Everything else is infrastructure around these 3 jobs.

---

## User Journey (the full flow)

```
[Dashboard > Profil > Secteurs d'activité]
  User selects preferred sectors via SecteurPicker
    -> Saved in notification_preferences.secteur_codes (notification service)

[Every day at 08:00 Casablanca time]
  Beat scheduler fires run_notification_batch
    -> For each org with enabled preferences and at least one sector:
         -> Query watcher.scraped_aos WHERE secteur_codes overlaps org sectors
            AND ao not already in notification_log for this org
            AND date_publication >= last 24h
         -> If 0 results: skip (no email, no log entry)
         -> If results: build HTML digest email
              -> Send via email channel (Resend v1)
                   -> Insert rows into notification_log (one row per AO per org)
```

The key value: zero manual work from the user. Set preferences once, receive relevant AOs automatically.

---

## Why a Separate Microservice (not a module in ao-watcher)

ao-watcher has one job: scrape and store AOs. Mixing notification logic into it would:
- Create a single point of failure (scrape crash = no notifications)
- Make the Beat schedule harder to reason about (scrape every 6h, notify daily)
- Couple two concerns that evolve independently (new portal = scrape change, new channel = notification change)

The notification service is a **separate Docker service sharing the same PostgreSQL**.
It reads from `watcher.scraped_aos` (read-only) and `public.company_profiles` (read-only).
It owns the `notifications` schema (read/write).

```
docker-compose.dev.yml additions:
  notification-api      FastAPI :8002
  notification-worker   Celery (gevent, concurrency=10 -- I/O bound: email API calls)
  notification-beat     Celery Beat scheduler
```

---

## Design Patterns : Factory + Adapter for Channels, Registry for Templates

Two orthogonal abstractions, fully decoupled:

```
Channel  (HOW you send)          Template  (WHAT you send)
─────────────────────────        ──────────────────────────────
NotificationChannel (ABC)        NotificationTemplate (ABC)
  ResendEmailChannel               AoDigestTemplate
  BrevoEmailChannel  [future]      BdcDigestTemplate  [future]
  TwilioSmsChannel   [future]      AoAlertTemplate    [future]
  WhatsAppChannel    [future]
         │
  NotificationChannelFactory
    NOTIFICATION_CHANNEL=email_resend → ResendEmailChannel
    NOTIFICATION_CHANNEL=email_brevo  → BrevoEmailChannel  [future]
```

A channel does not know what template rendered the content.
A template does not know which channel will deliver it.

To add WhatsApp tomorrow: one new file + one `@NotificationChannelFactory.register("whatsapp")` decorator. Zero changes to the factory class itself.

To add a new template (e.g., weekly digest): one new file + one `TemplateRegistry.register("weekly_digest", WeeklyDigestTemplate())`. Zero changes to the batch task.

### Channel Interface

```python
# notification-service/app/channels/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class NotificationContent:
    subject: str
    html: str
    text: str          # plaintext fallback for email clients that block HTML

class NotificationChannel(ABC):
    @abstractmethod
    async def send(self, recipient_email: str, content: NotificationContent) -> bool:
        """Send a notification. Returns True on success, False on soft failure."""

    @property
    @abstractmethod
    def channel_type(self) -> str:
        """String identifier, e.g. 'email_resend'. Used in notification_log."""
```

### Factory (registre par décorateur)

```python
# notification-service/app/channels/factory.py

class NotificationChannelFactory:
    _registry: dict[str, type[NotificationChannel]] = {}

    @classmethod
    def register(cls, channel_type: str):
        """Decorator: @NotificationChannelFactory.register("email_resend")"""
        def decorator(klass: type[NotificationChannel]):
            cls._registry[channel_type] = klass
            return klass
        return decorator

    @classmethod
    def create(cls, channel_type: str) -> NotificationChannel:
        if channel_type not in cls._registry:
            raise ValueError(
                f"Unknown channel '{channel_type}'. "
                f"Available: {list(cls._registry.keys())}"
            )
        return cls._registry[channel_type]()
```

### Template Interface

```python
# notification-service/app/templates/base.py

from abc import ABC, abstractmethod

class NotificationTemplate(ABC):
    @abstractmethod
    def render(self, context: dict) -> NotificationContent:
        """Build a NotificationContent from context data."""

# notification-service/app/templates/registry.py

class TemplateRegistry:
    _registry: dict[str, NotificationTemplate] = {}

    @classmethod
    def register(cls, event_type: str, template: NotificationTemplate) -> None:
        cls._registry[event_type] = template

    @classmethod
    def get(cls, event_type: str) -> NotificationTemplate:
        if event_type not in cls._registry:
            raise ValueError(f"No template registered for event '{event_type}'.")
        return cls._registry[event_type]
```

---

## Directory Structure

```
notification-service/
  app/
    channels/
      base.py              <- NotificationChannel ABC + NotificationContent dataclass
      factory.py           <- NotificationChannelFactory (register decorator + create)
      email/
        resend_channel.py  <- ResendEmailChannel  (v1, active)
        brevo_channel.py   <- BrevoEmailChannel   [future placeholder]
    templates/
      base.py              <- NotificationTemplate ABC
      registry.py          <- TemplateRegistry
      ao_digest.py         <- AoDigestTemplate (daily digest of new AOs)
      bdc_digest.py        <- BdcDigestTemplate [future]
    workers/
      celery_app.py        <- Celery app + Beat schedule (daily 08:00 Casablanca)
      tasks/
        batch_tasks.py     <- run_notification_batch + notify_org tasks
    core/
      config.py            <- Settings (DATABASE_URL, REDIS_URL, RESEND_API_KEY, ...)
      database.py          <- engine (NullPool per task, same pattern as ao-watcher)
      models.py            <- NotificationPreference, NotificationLog, NotificationBatch
    api/
      router.py            <- FastAPI: health + /admin/trigger + preferences CRUD
    main.py                <- FastAPI app
  init_db.py               <- idempotent schema creation (CREATE SCHEMA IF NOT EXISTS)
  Dockerfile
  requirements.txt
```

---

## Database Schema

Schema: `notifications` (separate from `public` and `watcher`, same PostgreSQL).

```sql
CREATE SCHEMA IF NOT EXISTS notifications;

-- One row per org. Manages whether notifications are on and for which sectors.
CREATE TABLE notifications.notification_preferences (
    id              SERIAL PRIMARY KEY,
    org_id          VARCHAR(36)  NOT NULL UNIQUE,
    enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    secteur_codes   JSONB        NOT NULL DEFAULT '[]',  -- list of sector code strings
    notify_bdc      BOOLEAN      NOT NULL DEFAULT FALSE, -- include BDC in digest [future]
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_prefs_enabled ON notifications.notification_preferences(enabled)
    WHERE enabled = TRUE;

-- One row per (org, ao) pair. Used for deduplication: never send the same AO twice.
CREATE TABLE notifications.notification_log (
    id          BIGSERIAL    PRIMARY KEY,
    org_id      VARCHAR(36)  NOT NULL,
    ao_id       INTEGER      NOT NULL,   -- watcher.scraped_aos.id
    batch_id    INTEGER      NULL,       -- references notification_batches.id
    channel     VARCHAR(50)  NOT NULL DEFAULT 'email_resend',
    sent_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_notif_log_org_ao
    ON notifications.notification_log(org_id, ao_id);

CREATE INDEX idx_notif_log_org_id  ON notifications.notification_log(org_id);
CREATE INDEX idx_notif_log_sent_at ON notifications.notification_log(sent_at DESC);

-- One row per batch run. Used for monitoring and admin UI.
CREATE TABLE notifications.notification_batches (
    id               SERIAL       PRIMARY KEY,
    started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at      TIMESTAMPTZ  NULL,
    orgs_processed   INTEGER      NOT NULL DEFAULT 0,
    emails_sent      INTEGER      NOT NULL DEFAULT 0,
    orgs_skipped     INTEGER      NOT NULL DEFAULT 0,   -- no new matching AOs
    status           VARCHAR(20)  NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'completed', 'failed'))
);
```

### Key Schema Decisions

**`UNIQUE(org_id, ao_id)` on notification_log** : the primary deduplication guard.
Even if `run_notification_batch` is triggered twice in a row (manual trigger + Beat),
the INSERT for already-sent AOs will conflict silently (`ON CONFLICT DO NOTHING`).
No org will ever receive the same AO twice.

**No `sent_since` timestamp column on preferences** : simpler. The `notification_log`
table is the source of truth for "what has been sent". Querying `notification_log`
for the org is always correct, even after retries, partial batch failures, or schema
changes.

**`notifications` schema** : same PostgreSQL instance, isolated schema. The notification
service reads from `watcher` and `public` schemas but never writes to them.

---

## Data Read Strategy

The notification service reads across three schemas in the same PostgreSQL.
No HTTP calls between services for the batch job.

```sql
-- Step 1: Get all orgs with active preferences
SELECT org_id, secteur_codes
FROM notifications.notification_preferences
WHERE enabled = TRUE
  AND jsonb_array_length(secteur_codes) > 0;

-- Step 2: For a given org, find new AOs not yet notified
SELECT sa.id, sa.titre, sa.acheteur, sa.categorie,
       sa.date_limite, sa.url_source, sa.secteur_codes
FROM watcher.scraped_aos sa
WHERE sa.secteur_codes && $1::jsonb          -- GIN overlap operator
  AND sa.date_publication >= NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
      SELECT 1 FROM notifications.notification_log nl
      WHERE nl.org_id = $2 AND nl.ao_id = sa.id
  )
ORDER BY sa.date_publication DESC;

-- Step 3: Get the org's email for sending
SELECT email FROM public.company_profiles
WHERE org_id = $1;
-- Fallback if company email is empty:
SELECT email FROM public.users
WHERE (org_id = $1 OR id = $1)
ORDER BY created_at ASC LIMIT 1;
```

---

## Celery Batch Tasks

### Task 1 : run_notification_batch (Beat, daily 08:00)

```python
@celery_app.task
def run_notification_batch():
    # 1. INSERT INTO notification_batches -> batch_id
    # 2. SELECT all orgs with enabled preferences
    # 3. Launch group of notify_org tasks
    # 4. chord callback: finalize_batch(batch_id, results)
    batch = create_batch()
    tasks = group(notify_org.s(org_id, codes, batch.id) for org_id, codes in orgs)
    chord(tasks)(finalize_batch.s(batch.id))
```

### Task 2 : notify_org (one per org, I/O bound)

```python
@celery_app.task(autoretry_for=(Exception,), max_retries=2, default_retry_delay=60)
def notify_org(org_id: str, secteur_codes: list[str], batch_id: int):
    # 1. Query new matching AOs (see Data Read Strategy above)
    # 2. If none: return {"sent": False, "reason": "no_new_aos"}
    # 3. Get org email (company_profiles.email, fallback users.email)
    # 4. If no email: return {"sent": False, "reason": "no_email"}
    # 5. TemplateRegistry.get("ao_digest").render(context)
    # 6. NotificationChannelFactory.create(settings.notification_channel).send(email, content)
    # 7. INSERT INTO notification_log (org_id, ao_id, batch_id) ON CONFLICT DO NOTHING
    # 8. Return {"sent": True, "ao_count": N}
```

### Task 3 : finalize_batch (chord callback)

```python
@celery_app.task
def finalize_batch(results: list[dict], batch_id: int):
    # Aggregate: count sent / skipped / failed
    # UPDATE notification_batches SET status='completed', finished_at=NOW(), ...
```

### Worker pool : gevent (not prefork)

`notify_org` is pure I/O (DB reads + HTTPS call to Resend API). gevent with
concurrency=10 handles 10 concurrent email sends per worker with a single process.
No subprocesses, no Playwright -- gevent is safe here (unlike ao-watcher which
uses prefork because Playwright breaks gevent's monkey-patching).

```bash
celery -A app.workers.celery_app worker --pool=gevent --concurrency=10 --loglevel=info
```

---

## Email Digest Template

The `AoDigestTemplate` renders an HTML email with:
- ADJUJA brand colors (#3248CE cobalt, #1BC9A8 teal, #080B1C navy)
- Inline CSS only (external stylesheets are not supported by email clients)
- For each matching AO: titre, acheteur, categorie, date limite, direct link to source portal
- CTA button: "Voir sur ADJUJA" linking to /veille filtered by the org's sectors
- Footer with unsubscribe link (required for email compliance: CAN-SPAM / RGPD)

Plain text fallback is always generated alongside HTML (required by RFC 2822 and
improves deliverability score).

---

## API Surface

```
GET   /health
      Returns {"status": "ok", "service": "notification-service"}

GET   /preferences/{org_id}
      Returns the org's notification preferences (or 404 if none exist yet)

PUT   /preferences/{org_id}
      Upsert: {"enabled": true, "secteur_codes": ["01", "12", ...], "notify_bdc": false}
      Auth: requires Authorization header (JWT relayed from frontend, validated locally)

DELETE /preferences/{org_id}
       Disables notifications (sets enabled=false, does not delete history)

POST  /admin/trigger
      Fires run_notification_batch immediately (manual trigger for testing)
      Auth: requires ADMIN_SECRET header

GET   /admin/batches?limit=20
      Last N batch runs with status, timestamps, counts

GET   /admin/log?org_id=...&limit=50
      Recent notification log entries (for debugging "why didn't I get an email?")
```

---

## Redis DB Allocation

```
DB 0  : ao-watcher Celery results / main app cache
DB 1  : main app Celery broker
DB 2  : main app Celery results
DB 3  : ao-watcher Celery broker
DB 4  : notification-service Celery broker + results   <- NEW
```

---

## Environment Variables

```
DATABASE_URL=postgresql+asyncpg://offria:...@postgres:5432/offria
REDIS_URL=redis://redis:6379/4
RESEND_API_KEY=re_...
NOTIFICATION_CHANNEL=email_resend            # swappable via env var alone
NOTIFICATION_FROM_EMAIL=noreply@adjuja.ma
NOTIFICATION_FROM_NAME=ADJUJA Veille
ADMIN_SECRET=...                             # for /admin/* endpoints
```

---

## Docker Compose Additions

```yaml
notification-api:
  build:
    context: ./notification-service
    dockerfile: Dockerfile
  command: uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
  ports:
    - "8002:8002"
  environment:
    DATABASE_URL: postgresql+asyncpg://offria:${POSTGRES_PASSWORD:-offria_dev}@postgres:5432/offria
    REDIS_URL: redis://redis:6379/4
    RESEND_API_KEY: ${RESEND_API_KEY:-}
    NOTIFICATION_CHANNEL: email_resend
    NOTIFICATION_FROM_EMAIL: ${NOTIFICATION_FROM_EMAIL:-noreply@adjuja.ma}
    NOTIFICATION_FROM_NAME: ADJUJA Veille
    ADMIN_SECRET: ${ADMIN_SECRET:-dev-admin-secret}
  depends_on:
    postgres: {condition: service_healthy}
    redis:    {condition: service_healthy}
  networks:
    - ao_network
  volumes:
    - ./notification-service/app:/app/app

notification-worker:
  build:
    context: ./notification-service
    dockerfile: Dockerfile
  command: >
    celery -A app.workers.celery_app.celery_app worker
    --pool=gevent
    --concurrency=10
    --loglevel=info
    --hostname=notification-worker@%h
  environment:
    DATABASE_URL: postgresql+asyncpg://offria:${POSTGRES_PASSWORD:-offria_dev}@postgres:5432/offria
    REDIS_URL: redis://redis:6379/4
    RESEND_API_KEY: ${RESEND_API_KEY:-}
    NOTIFICATION_CHANNEL: email_resend
    NOTIFICATION_FROM_EMAIL: ${NOTIFICATION_FROM_EMAIL:-noreply@adjuja.ma}
    NOTIFICATION_FROM_NAME: ADJUJA Veille
  depends_on:
    postgres: {condition: service_healthy}
    redis:    {condition: service_healthy}
  networks:
    - ao_network
  volumes:
    - ./notification-service/app:/app/app

notification-beat:
  build:
    context: ./notification-service
    dockerfile: Dockerfile
  command: >
    celery -A app.workers.celery_app.celery_app beat
    --loglevel=info
  environment:
    DATABASE_URL: postgresql+asyncpg://offria:${POSTGRES_PASSWORD:-offria_dev}@postgres:5432/offria
    REDIS_URL: redis://redis:6379/4
  depends_on:
    - redis
  networks:
    - ao_network
  volumes:
    - ./notification-service/app:/app/app
```

---

## Batch Flow Diagram

```
Beat (08:00 Africa/Casablanca)
  │
  └─► run_notification_batch
        │
        ├─ INSERT notification_batches (status='running') -> batch_id
        │
        ├─ SELECT org_id, secteur_codes FROM notification_preferences
        │    WHERE enabled=TRUE AND secteur_codes != '[]'
        │
        └─ chord(
             group [
               notify_org(org_1, [...], batch_id),
               notify_org(org_2, [...], batch_id),
               ...
               notify_org(org_N, [...], batch_id),
             ],
             finalize_batch(batch_id)
           )
                │
                │  Each notify_org:
                │    SELECT new matching AOs  (watcher.scraped_aos GIN query)
                │    IF none → return {sent: False}
                │    GET email from company_profiles (fallback: users)
                │    IF no email → return {sent: False}
                │    AoDigestTemplate.render(context) → NotificationContent
                │    ResendEmailChannel.send(email, content)
                │    INSERT notification_log ON CONFLICT DO NOTHING
                │    return {sent: True, ao_count: N}
                │
                └─► finalize_batch(results, batch_id)
                      UPDATE notification_batches SET status='completed', ...
```

---

## Open Questions

1. **Unsubscribe link** : deep link to `/preferences/{org_id}?token=...` (signed JWT,
   no login required) or just link to the dashboard settings page (requires login)?
   Signed token is better UX but requires implementing a short-lived token mechanism.

2. **Notification preferences UI** : new tab in Dashboard > Profil, or its own settings
   page? The SecteurPicker component already exists -- it just needs to call the
   notification service PUT /preferences/{org_id} instead of saving to company_profiles.

3. **First-run behavior** : when an org just registered and has no notification_log,
   do we send ALL matching AOs from the last 24h, or only those published after
   preferences were set? Sending everything from 24h is safer (no missed AOs on day 1).

4. **BDC in digest** : `notify_bdc` flag is in the schema but BdcDigestTemplate is not
   implemented in v1. When do we want this?

5. **Resend sender domain** : Resend requires a verified sender domain. Is `adjuja.ma`
   available and DNS-configurable, or do we use the Resend shared domain for dev?
