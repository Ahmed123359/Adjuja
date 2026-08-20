## Deliverable

An org can configure, through a real UI (today this only exists via raw `curl` calls
to `PUT /preferences/{org_id}`): how often they receive the tender-digest email
(every N days/weeks/months, at a specific hour), how many tenders max appear per
digest, and which sectors they want notified about -- independently from the
sectors they already picked for veille filtering, so they can watch outside their
own declared domain.

## Depends on

`notification-service` (`NotificationPreference` model, `PUT /preferences/{org_id}`,
the Celery Beat daily batch), `SecteurPicker` component (frontend, already built
for the veille-filter sector picker in `DashboardPage.tsx`'s profile tab, reused
here for a second, independent selection). No new service.

## Build order

1. `api.md` -- schema fields (`cadence_unit`/`cadence_value`/`send_hour`/
   `send_minute`/`max_items`/`last_notified_at`), rewritten Beat schedule (hourly
   due-check instead of one fixed daily crontab), `notify_org` query fix (per-org
   lookback instead of hardcoded 24h, configurable `LIMIT`).
2. `client.md` -- notification settings screen (cadence picker, max-items input,
   independent sector picker), wired to the extended `PUT /preferences/{org_id}`.

## Check when the feature is done

- An org set to "every 2 weeks, 09:00" actually receives their digest ~14 days
  after their last one, at 09:00 Africa/Casablanca, not before.
- An org set to "max 3" never receives more than 3 tenders in one digest, even if
  more matched.
- An org can select a sector they have never declared as their own business
  domain, and receive tenders for it.
- An existing org with no preferences row configured continues to behave exactly
  as before (daily, global hour, no cap change) -- this feature must not silently
  change behavior for orgs that never touch the new settings.
- Everything in `api.md` and `client.md` individually passes its own check first.
