# Notification preferences -- client.md

Read `00-overview.md` in this folder before starting. Depends on `api.md` being
done -- the form has nothing real to call otherwise.

## Proxy, missing today

Neither `frontend/nginx.conf` nor `frontend/vite.config.ts` proxy anything to
notification-service (port 8002) -- confirmed, grepped both, only `/api/` (main
app) and `/watcher/` (ao-watcher) exist today. This is why the only way to reach
`PUT /preferences/{org_id}` today is a direct `curl`. Add a third proxy target,
same shape as the existing `/watcher/` one:

`frontend/nginx.conf`:
```nginx
location /notifications/ {
    proxy_pass http://notification-api:8002/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

`frontend/vite.config.ts`:
```ts
'/notifications': {
  target: process.env.VITE_NOTIFICATIONS_TARGET ?? 'http://localhost:8002',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/notifications/, ''),
},
```

## API client

`frontend/src/api.ts`, new block (same fetch+authHeaders pattern as every other
function in this file, no exceptions):

```ts
const NOTIFICATIONS_BASE = '/notifications';

export type NotificationPreferences = {
  org_id: string;
  enabled: boolean;
  secteur_codes: string[];
  notify_bdc: boolean;
  cadence_unit: 'day' | 'week' | 'month';
  cadence_value: number;
  send_hour: number;
  max_items: number;
  last_notified_at: string | null;
};

export async function fetchNotificationPreferences(orgId: string): Promise<NotificationPreferences | null> {
  const res = await fetch(`${NOTIFICATIONS_BASE}/preferences/${orgId}`, { headers: authHeaders() });
  if (res.status === 404) return null;  // pas encore configure, pas une erreur
  if (!res.ok) throw new Error('Erreur chargement des préférences de notification.');
  return res.json();
}

export async function updateNotificationPreferences(
  orgId: string,
  body: Omit<NotificationPreferences, 'org_id' | 'last_notified_at'>,
): Promise<NotificationPreferences> {
  const res = await fetch(`${NOTIFICATIONS_BASE}/preferences/${orgId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erreur sauvegarde des préférences.');
  return data;
}
```

`org_id` comes from `current_user.org_id ?? current_user.id`, same resolution
pattern already used everywhere else in this codebase (see
`architecture-context.md`'s Auth model).

## UI

New section in `DashboardPage.tsx`, same tab/section style as the existing
`ProfileTab`'s "Secteurs d'activité" `SectionCard` -- either its own tab, or a new
`SectionCard` inside the existing settings surface (whichever fits without adding
a full new page for what is one form).

- **Enabled toggle** -- top of the section, everything below only makes sense if on.
- **Sector picker** -- reuse `SecteurPicker` + `CategorieSelect` exactly as already
  wired in `ProfileTab` for `secteurs_interet`, but pointed at this feature's own
  state (`notificationSecteurCodes`, not `secteursInteret`) -- **not the same
  state variable**, per the locked decision that these two lists are
  independently editable. On first load, if the org has no existing notification
  preferences row (`fetchNotificationPreferences` returns `null`), pre-fill this
  picker's initial value from their existing `secteurs_interet` as a starting
  point, but changing it here never writes back to the profile's veille-filter
  field.
- **Cadence** -- two controls side by side: a `CustomSelect` (reuse the existing
  component, same one used for `forme_juridique`/sector dropdowns) with options
  day/week/month, and a plain number input for `cadence_value` (1-30, matches the
  backend's `Field(..., ge=1, le=30)`).
- **Hour** -- a simple `CustomSelect` with 24 options (00h-23h), not a full time
  picker -- matches `api.md`'s hour-only decision, no minute field to confuse the
  user with false precision.
- **Max items** -- number input, 1-200, matches the backend bound.
- **Save button** -- calls `updateNotificationPreferences`, shows the same
  inline-error convention already used elsewhere in `DashboardPage.tsx`
  (`<p style={{color:'#dc2626'}}>`), not a toast (no shared toast component exists
  in this codebase, per the existing Open Question in `progress-tracker.md` about
  402 handling -- don't introduce one just for this feature).
- **Last notified display** -- read-only, e.g. "Dernière notification : il y a 3
  jours" or "Jamais" if `last_notified_at` is null, so a user configuring "every 2
  weeks" can see when the countdown actually started, not just guess.

## Check when done

- Loading the section for an org with no existing preferences row shows sensible
  defaults (day/1/08h/50) pre-filled, not a blank/broken form.
- Saving actually round-trips: reload the page, the saved values come back, not
  the defaults.
- `tsc --noEmit` passes.
