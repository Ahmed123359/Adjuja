# Notification preferences -- api.md

Read `00-overview.md` in this folder and `context/architecture-context.md` before
starting.

## Decisions locked before coding

- **Cadence model**: `cadence_unit` (`"day" | "week" | "month"`) + `cadence_value`
  (int) -- e.g. unit=week, value=2 means "every 2 weeks". Converted to a day-count
  at query time (`week` = ×7, `month` = ×30, approximate, not calendar-exact --
  see Open Questions if calendar-exact "always the 1st" is actually wanted later).
- **Hour, not hour+minute**: `send_hour` (0-23) only. The Beat tick runs once per
  hour, on the hour -- adding minute precision would need a more frequent tick for
  no real product benefit here, not built in this pass.
- **`max_items` replaces the hardcoded `LIMIT 50`** in the matching query, per-org
  configurable, same column also used as the query's `LIMIT`.
- **`last_notified_at` (internal, not exposed in the API response for editing,
  read-only)** is what makes arbitrary cadence correct: it replaces the old
  hardcoded `date_publication >= NOW() - INTERVAL '24 hours'` lookback. Without
  this, an org on a 2-week cadence would only ever see the last 24h of tenders
  each time it ran, missing everything published in between --
  `notification_log` already deduplicates sends, but never controlled what got
  *scanned* in the first place.
- **Backward compatibility is via column defaults, not a migration flag**: existing
  rows get `cadence_unit='day', cadence_value=1, send_hour=<current
  settings.notification_hour>, max_items=50` on the `ALTER TABLE`, which
  reproduces today's global daily-08h00-no-cap behavior exactly. No separate
  "legacy mode" branch in the task code.
- **No Alembic here**: this service's schema is managed by `init_db.py`
  (`Base.metadata.create_all(checkfirst=True)`, no ALTER support -- confirmed,
  same limitation that required manual SQL for the original table creation). New
  columns on an *existing* table need a manual `ALTER TABLE`, documented below,
  run once per environment. This is not a gap introduced by this feature, it's
  this service's existing schema-management reality.

## Schema changes

`notification-service/app/core/models.py`, `NotificationPreference`:

```python
cadence_unit: Mapped[str] = mapped_column(String(10), nullable=False, default="day")
cadence_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
send_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
max_items: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Manual `ALTER TABLE`, run once against prod (and dev) after this ships -- update
`init_db.py`'s comment header to mention it, since `create_all` will not run this
automatically on the already-existing table:

```sql
ALTER TABLE notifications.notification_preferences
  ADD COLUMN IF NOT EXISTS cadence_unit      VARCHAR(10) NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS cadence_value     INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS send_hour         INTEGER     NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_items         INTEGER     NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS last_notified_at  TIMESTAMPTZ NULL;
```

(`send_hour` default of `8` matches `settings.notification_hour`'s current value at
the time of writing -- if that setting has since changed, use its real current
value instead so existing orgs' behavior doesn't shift.)

## API contract

`notification-service/app/api/router.py`, extend `PreferenceIn`/`PreferenceOut`:

```python
class PreferenceIn(BaseModel):
    enabled: bool = True
    secteur_codes: list[str] = []
    notify_bdc: bool = False
    cadence_unit: Literal["day", "week", "month"] = "day"
    cadence_value: int = Field(1, ge=1, le=30)
    send_hour: int = Field(8, ge=0, le=23)
    max_items: int = Field(50, ge=1, le=200)

class PreferenceOut(PreferenceIn):
    org_id: str
    last_notified_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
```

`upsert_preferences`'s raw INSERT/UPDATE gains the four new columns in both the
`INSERT ... VALUES` and the `ON CONFLICT DO UPDATE SET` clauses, same pattern
already used there for `enabled`/`secteur_codes`/`notify_bdc`. `last_notified_at`
is never written by this endpoint -- only by `notify_org` after a real send, so a
user can never manually reset their own cooldown through the preferences form.

## Beat schedule rework

`notification-service/app/workers/celery_app.py`: replace the single daily
crontab with an hourly tick.

```python
beat_schedule={
    "notification-due-check": {
        "task": "app.workers.tasks.batch_tasks.run_notification_batch",
        "schedule": crontab(minute=0),  # every hour, on the hour
    },
},
```

## `run_notification_batch` query rework

`notification-service/app/workers/tasks/batch_tasks.py`, the org-selection query
gains the due-check:

```sql
SELECT org_id, secteur_codes, max_items, cadence_unit, cadence_value, last_notified_at
FROM notifications.notification_preferences
WHERE enabled = TRUE
  AND jsonb_array_length(secteur_codes) > 0
  AND send_hour = EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Africa/Casablanca')
  AND (
    last_notified_at IS NULL
    OR NOW() - last_notified_at >= make_interval(days =>
         CASE cadence_unit
           WHEN 'week'  THEN cadence_value * 7
           WHEN 'month' THEN cadence_value * 30
           ELSE cadence_value
         END
       )
  )
```

`notify_org.s(...)` gains `max_items` and the computed lookback bound as extra
args (compute the bound in Python from the row's `cadence_unit`/`cadence_value`/
`last_notified_at`, same logic as the SQL above, so `notify_org` doesn't need to
re-derive it).

## `notify_org` rework

Two changes to the existing query in `notify_org`:

```python
def notify_org(org_id: str, secteur_codes: list[str], batch_id: int, max_items: int, since: datetime) -> dict:
    ...
    # AO matching query:
    #   date_publication >= :since   (was: NOW() - INTERVAL '24 hours')
    #   LIMIT :max_items              (was: LIMIT 50)
```

After a successful send, update the preference row's cooldown -- new step, added
right after the existing `notification_log` INSERT:

```sql
UPDATE notifications.notification_preferences
SET last_notified_at = NOW()
WHERE org_id = :org_id
```

If `sent = False` (no new AOs, no email, or send failed), `last_notified_at` is
**not** updated -- an org with nothing to say stays eligible to be checked again
next hour rather than being pushed a full cadence-interval further out for having
had a quiet cycle. This matters most for short intervals (daily) where "nothing
new today" should not delay tomorrow's real check.

## Open Questions

- `month` = 30 elapsed days is an approximation, not calendar-exact. If the real
  want is "always send on the 1st of the month" or similar, this needs a
  different due-check (compare calendar date, not elapsed interval) -- not what's
  built here, flag if wrong.
- No upper bound today on how small `cadence_value` can combine with `unit=day`
  (e.g. "every 1 day" is just today's existing daily behavior, fine) -- but
  nothing stops a user from picking something that would spam mid-interval if a
  bug reintroduces double-counting. `pydantic`'s `ge=1` on `cadence_value` is the
  only guard, matches the `Field(..., ge=1, le=30)` above.
- `notify_bdc` (existing field, separate flag) is untouched by this feature --
  BDC digest cadence, if ever wanted, is a separate decision, not folded in here.
