# Gestion de l'abonnement -- client

Frontend : `adjuja-frontend/src/features/billing/` (domaine) et
`features/company/CompanySettingsPage.tsx` (hôte de l'onglet). Visuel : socle
`--adj-*`, fond uni, séparation par filets (`context/ui-context.md`).

## Emplacement

- Nouvel onglet **« Abonnement »** dans `CompanySettingsPage`, en dernière
  position (`TABS`, clé i18n `dashboard.tabs.billing`). Pleine largeur
  (`--adj-max`), comme les autres onglets.
- Composant de l'écran dans le domaine facturation :
  `features/billing/BillingTab.tsx`, importé par la page des réglages. La page
  des réglages ne contient aucune logique d'abonnement.
- `CompanySettingsPage` accepte un onglet initial (`initialTab`) pour que le
  tableau de bord puisse y mener directement.

## Écran

Sections empilées pleine largeur, séparées par des filets, sur le modèle de la
capture de référence (pas de cartes posées sur un fond différent).

1. **Offre en cours.** Libellé (`plan.label`), prix (`990 MAD / mois`), puis
   une ligne d'état **qui ne promet rien de faux** :
   - `active`, `renewal: "manual"` : « Valable jusqu'au 19 oct. 2026 », et « dans
     N jours » quand l'échéance est à moins de 15 jours ;
   - `cancel_at_period_end` : « Se termine le 19 oct. 2026, puis passage à l'offre
     gratuite » ;
   - `past_due` : « Paiement en attente. Accès maintenu jusqu'au {grace_until} »,
     en couleur d'attente ;
   - `free` : « Offre gratuite ».

   Actions à droite : **« Modifier l'offre »** (ouvre `PricingModal`, bouton
   secondaire) ; **« Renouveler »** (bouton principal, `startCheckout(plan.code)`)
   quand l'échéance est à moins de 7 jours ou en `past_due`.
2. **Consommation.** « 12 sur 300 appels d'offres ce mois-ci », « 31 sur 200
   documents ». Une barre seulement quand il existe une vraie limite ; « illimité »
   sinon (règle ui-context : pas de barre décorative).
3. **Paiement.** Si `payment_method` : « Dernier paiement par Mastercard •••• 7688 ».
   Sinon : « Paiement par carte bancaire via CMI, à chaque renouvellement. »
   **Pas de bouton « Mettre à jour »** tant qu'aucune carte n'est enregistrée.
4. **Historique des paiements** (ou « Factures » si la décision 2 les retient).
   Tableau : Date, Offre, Montant (`990 MAD`, chiffres tabulaires), Statut
   (« Payé » / « Échoué »), Actions (« Voir la facture » seulement si
   `invoice_id`, ouvre l'aperçu PDF commun `useApercuDocument`). État vide :
   « Aucun paiement pour l'instant. »
5. **Annulation.** « Ne pas renouveler l'abonnement », bouton `danger`, masqué sur
   l'offre gratuite. Confirmation par `Modal` qui dit l'effet exact : accès
   jusqu'au {date}, puis offre gratuite ; les données sont conservées. Une fois
   annulé, la section propose « Reprendre l'abonnement ».

## Grille des offres

- `PricingModal` reste dans `features/billing/components/` ; seul son point
  d'ouverture change. Après un paiement annulé côté CMI ou une erreur, l'onglet
  reste affiché avec le message.
- **Tableau de bord** : la carte « Plan » (`ActivitySection.PlanCard`) perd son
  lien « Changer d'offre » (ajouté le 2026-09-27) au profit de « Gérer
  l'abonnement », qui ouvre les réglages sur l'onglet « Abonnement ».
- **Limite atteinte** : l'ouverture automatique de la grille (`App.tsx`,
  `reason="limit"`) est conservée ; c'est à ce moment que l'utilisateur en a
  besoin, là où il se trouve.

## Données

- `features/billing/api.ts` : `fetchBillingOverview()`, `fetchPayments()`,
  `cancelSubscription()`, `resumeSubscription()` (+ `fetchInvoicePdf(id)` si
  factures).
- Lecture par `useRessource` avec les clés `billing:overview` et
  `billing:payments` ; toute écriture (annulation, reprise, retour de paiement)
  invalide le préfixe `billing:`, ce qui rafraîchit aussi la carte du tableau
  de bord.
- Types dans `features/billing/types.ts`, jamais dans le barrel racine.
- Tous les textes en i18n (`billing.manage.*`), présents en `fr` **et** `en`.

## Check when done

- L'onglet s'affiche pour une org gratuite, active, `past_due` et annulée, avec
  le bon libellé d'état dans chaque cas (états forcés via
  `POST /billing/admin/activate` et la base de dev).
- « Modifier l'offre » ouvre la grille depuis l'onglet ; le tableau de bord ne
  propose plus que « Gérer l'abonnement », qui mène à l'onglet.
- Aucun libellé « renouvelé automatiquement » ni « Mettre à jour la carte »
  n'apparaît tant que l'API ne les rend pas vrais.
- Annuler puis reprendre met l'écran à jour sans rechargement.
- `tsc --noEmit` propre ; clés i18n résolues en `fr` et `en`.
