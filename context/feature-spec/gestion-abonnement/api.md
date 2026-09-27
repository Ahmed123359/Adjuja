# Gestion de l'abonnement -- API

Backend : `adjuja-backend/app/api/routes/billing_routes.py`,
`app/services/subscription_service.py`, `app/billing/`, `app/tasks/billing_tasks.py`.
Toutes les routes ci-dessous exigent `Depends(get_current_user)` et travaillent
sur `org_id = current_user.org_id or current_user.id`, comme les routes
existantes.

## Existant, réutilisé tel quel

| Route | Rôle |
|---|---|
| `GET /billing/plans` | Catalogue public des offres (prix MAD, libellés, limites). |
| `GET /billing/subscription` | Offre, statut, `current_period_end`, consommation. |
| `POST /billing/checkout` | Démarre un paiement CMI pour une offre. Sert aussi au **renouvellement** : même offre que l'actuelle. |
| `POST /billing/webhook/cmi` | Callback CMI, idempotent via `billing_events`. |

## Étape 1 -- corrections préalables (sans migration)

- **`raw_payload` en JSON.** Le webhook écrit `raw_payload=str(event.raw)`, une
  représentation Python, pas du JSON : rien ne peut le relire proprement
  (historique, 4 derniers chiffres de carte). Écrire `json.dumps(event.raw)`.
  Les lignes déjà en base restent illisibles ; il n'y a pas de paiement réel
  tant que CMI n'est pas configuré, donc rien à migrer en pratique.
- **Montant et offre du paiement.** À l'étape 2, ils seront lus depuis les
  nouvelles colonnes ; d'ici là, `plan_code` est déjà dans `event.plan_code`.

## Étape 2 -- lecture consolidée

`GET /billing/overview` : tout ce que l'écran affiche en un appel, pour ne pas
recomposer côté client.

```json
{
  "plan": { "code": "pro", "label": "Pro", "price_mad": 990 },
  "status": "active",
  "current_period_end": "2026-10-19T09:12:00+00:00",
  "grace_until": null,
  "renewal": "manual",
  "cancel_at_period_end": false,
  "provider": "cmi",
  "usage": { "ao_per_month": { "used": 12, "limit": 300 },
             "documents":    { "used": 31, "limit": 200 } },
  "payment_method": { "brand": "Mastercard", "last4": "7688" }
}
```

- `renewal` vaut `"manual"` tant que la décision 1 de `00-overview.md` n'a pas
  retenu le récurrent. Le client s'en sert pour le libellé d'échéance.
- `payment_method` est `null` sauf si le dernier paiement réussi de l'org porte
  un numéro masqué dans son callback CMI (champ à identifier dans la doc
  marchand). Ce n'est **pas** un moyen enregistré : juste « dernier paiement
  par ».
- `GET /billing/subscription` reste en place (tableau de bord, limites).

`GET /billing/payments?limit=24` : historique de l'org, le plus récent d'abord.

```json
[{ "id": "…", "date": "2026-09-19T09:12:00+00:00", "plan_code": "pro",
   "amount_mad": 990, "status": "paid", "invoice_id": null }]
```

`status` : `paid` | `failed`, lu depuis `billing_events.event_type`
(`payment_succeeded` / `payment_failed`), filtré sur `org_id`.

**Migration requise (à valider avant) :** `billing_events.plan_code VARCHAR(20)
NULL`, `billing_events.amount_mad INTEGER NULL`, renseignés par le webhook
(montant : celui du callback CMI si fourni, sinon `PLANS[plan_code].price_mad`
au moment du paiement, pour qu'un changement de grille ne réécrive pas
l'historique).

## Étape 3 -- annulation et reprise

`POST /billing/cancel` : pose `cancel_at_period_end = true`. Refusé (400) sur
l'offre `free`. Idempotent.
`POST /billing/resume` : repasse `cancel_at_period_end = false` tant que
l'échéance n'est pas atteinte (sinon 409 : il faut repayer via
`/billing/checkout`).

`billing_tasks.sweep_subscriptions` : une ligne `active` échue **avec**
`cancel_at_period_end = true` passe directement en `free` / `canceled`, sans
`past_due`, sans e-mail de relance. Sans le drapeau, comportement actuel
inchangé. `SubscriptionService.activate` remet le drapeau à `false` (un nouveau
paiement vaut reprise).

**Migration requise (à valider avant) :** `subscriptions.cancel_at_period_end
BOOLEAN NOT NULL DEFAULT false`. Rappel : les migrations Alembic ne sont
aujourd'hui **jamais appliquées** automatiquement (voir `bugs-connus.md`) ; la
colonne devra être ajoutée à la main en dev et en prod tant que ce point n'est
pas réglé, faute de quoi l'API tombe en 500.

## Étape 4 -- factures (seulement si la décision 2 les retient)

Table `invoices` (numéro continu par année, `org_id`, `billing_event_id`,
montants HT / TVA / TTC, instantané des coordonnées client : raison sociale,
ICE, adresse, pris dans `company_profiles` au moment de l'émission). PDF généré
au webhook de paiement réussi, stocké dans MinIO sous `{org_id}/billing/invoices/`.
`GET /billing/invoices/{id}/pdf` : URL présignée, 404 si la facture n'appartient
pas à l'org.

## Check when done

- `raw_payload` des nouveaux événements est du JSON valide (`json.loads` passe).
- `GET /billing/overview` et `GET /billing/payments` répondent 401 sans jeton et
  ne renvoient **que** les données de l'org du jeton (vérifié avec un second
  compte réel, créé puis supprimé).
- Cancel puis resume puis cancel : l'état final est cohérent ; une org annulée
  à échéance passe en `free` sans e-mail de relance (tâche de balayage lancée à
  la main sur une ligne à échéance passée).
- Aucune route existante ne change de forme de réponse.
