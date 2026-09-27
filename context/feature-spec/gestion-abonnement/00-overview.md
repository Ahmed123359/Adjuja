# Gestion de l'abonnement

Ajouté le 2026-09-27 à la demande de l'utilisateur, capture de référence à
l'appui (écran « Forfait Pro » : offre, paiement, factures, annulation).

## Deliverable

Un onglet **« Abonnement »** dans les réglages d'entreprise (6e onglet de
`CompanySettingsPage`, à côté de Profil, Paraphe & Cachet, Documents, Équipe,
Génération), où une organisation gère son offre de façon professionnelle, au
même endroit que le reste de ses paramètres :

- l'offre en cours, son prix, sa périodicité et sa date d'échéance, avec l'état
  réel (active, paiement en attente, annulée) ;
- **« Modifier l'offre »**, qui ouvre la grille des offres (`PricingModal`,
  refaite le 2026-09-27) : la modale est **déplacée ici**, le tableau de bord ne
  sert plus à changer d'offre ;
- la consommation de la période (appels d'offres ce mois, documents) ;
- le moyen de paiement, dans la limite de ce que CMI permet réellement ;
- l'historique des paiements et, si décidé, les factures téléchargeables ;
- l'annulation (ne pas renouveler), et sa reprise.

La carte « Plan » du tableau de bord reste une lecture de la consommation ; son
lien devient « Gérer l'abonnement » et mène à cet onglet.

## État réel vérifié (2026-09-27)

Lu dans le code, pas supposé. C'est ce qui sépare la capture de ce qui est
constructible sans décision.

| Élément de la capture | Existe ? | Réalité |
|---|---|---|
| Offre, prix, échéance | Oui | `GET /billing/subscription` (offre, statut, `current_period_end`, consommation) et `GET /billing/plans` (prix, libellés, limites, `app/billing/plans.py`). |
| « Modifier le forfait » | Oui | `PricingModal` + `POST /billing/checkout` (CMI). Ouverte aujourd'hui depuis la carte Plan du tableau de bord. |
| « Renouvelé automatiquement le… » | **Non** | CMI est une page de paiement hébergée, en **paiement unique**. Une période payée dure 30 jours (`billing_routes.py`, webhook) ; à l'échéance, le balayage Celery (`billing_tasks.sweep_subscriptions`) passe l'abonnement en `past_due`, envoie un e-mail de relance, laisse 5 jours de grâce (`billing_dunning_grace_days`), puis rétrograde en `free`. Afficher « renouvelé automatiquement » serait faux. |
| Carte « Mastercard •••• 7688 » + « Mettre à jour » | **Non** | Aucune carte n'est enregistrée : CMI ne renvoie pas de jeton exploitable dans l'intégration actuelle (squelette non confirmé contre la doc marchand, voir `cmi.py`). Au mieux, les 4 derniers chiffres du **dernier paiement** si le callback CMI les contient, à vérifier. |
| Factures (date, total, statut, « Voir ») | **Non** | Aucune facture n'est générée. `billing_events` ne garde qu'une trace d'idempotence des callbacks, sans montant ni offre, et son `raw_payload` est un `str(dict)` Python illisible (bug déclaré dans `bugs-connus.md`). |
| « Annuler l'abonnement » | **Non** | Aucune route, aucune colonne. L'état `canceled` n'est posé que par la rétrogradation automatique. |
| Qui peut gérer l'abonnement | -- | Pas de rôles d'organisation (reportés, voir `progress-tracker.md`) : tout membre pourrait changer d'offre ou annuler. |

## Depends on

- `app/billing/` (plans, fournisseur CMI, fournisseur manuel), `SubscriptionService`,
  `billing_tasks.sweep_subscriptions`, tables `subscriptions` et `billing_events`.
- `features/billing/components/PricingModal.tsx` (grille des offres, déjà sur
  le socle visuel), `features/company/CompanySettingsPage.tsx` (onglets),
  `features/company/ui.tsx` (briques de formulaire), `shared/ui/Card`, `Button`,
  `Modal`.
- Un **compte marchand CMI réel** pour tout ce qui touche au paiement effectif :
  sans lui, `POST /billing/checkout` répond 503 « CMI non configuré »,
  comportement attendu.

## Décisions à prendre avant de coder

Chacune change le schéma ou la promesse faite au client ; `CLAUDE.md` impose d'en
discuter avant toute migration.

1. **Renouvellement.** (a) Manuel, comme aujourd'hui, assumé à l'écran : « Valable
   jusqu'au 19 oct. », rappel avant échéance, bouton « Renouveler » (un
   `POST /billing/checkout` sur l'offre en cours, déjà possible). (b) Récurrent :
   exige que le contrat CMI offre la tokenisation / le paiement récurrent, à
   confirmer auprès de CMI. **Recommandation : (a)**, constructible tout de suite
   et honnête ; (b) se branchera plus tard sans changer l'écran.
2. **Factures.** Un historique des paiements suffit-il, ou faut-il de vraies
   factures PDF ? Une facture marocaine exige une numérotation continue, l'ICE
   du vendeur **et** du client (déjà dans le profil entreprise), le détail HT /
   TVA 20 % / TTC. La grille affiche des prix « hors taxes » : le montant débité
   par CMI est-il HT ou TTC ? À trancher avec le comptable.
3. **Annulation.** « Ne pas renouveler » : l'accès reste jusqu'à l'échéance,
   puis passage en offre gratuite **sans** relance ni période de grâce. Demande
   une colonne `subscriptions.cancel_at_period_end` (migration).
4. **Changement d'offre en cours de période.** Aujourd'hui, un paiement repart
   sur 30 jours à compter du paiement et les jours restants sont perdus. Garder
   (simple, à afficher clairement), ou reporter l'échéance restante / prorater ?
5. **Droits.** Faute de rôles d'organisation, réserver l'onglet (au moins
   l'annulation) au créateur de l'organisation, ou l'ouvrir à tous les membres
   comme les invitations aujourd'hui ?

## Build order

1. `api.md` -- correction du `raw_payload`, lecture consolidée de l'abonnement,
   historique des paiements, annulation / reprise, puis (si décidé) factures.
2. `client.md` -- onglet « Abonnement », `PricingModal` ouverte depuis l'onglet,
   carte Plan du tableau de bord redirigée vers l'onglet.

## Check when the feature is done

- L'onglet « Abonnement » existe dans les réglages d'entreprise et montre
  l'offre réelle de l'organisation (libellé et prix lus sur `/billing/plans`,
  jamais en dur), son statut et son échéance.
- **Aucun texte ne promet ce que le système ne fait pas** : pas de
  « renouvelé automatiquement » tant que le paiement est unique, pas de
  « Mettre à jour la carte » tant qu'aucune carte n'est enregistrée.
- « Modifier l'offre » ouvre la grille depuis l'onglet ; le tableau de bord n'a
  plus d'action de changement d'offre, seulement « Gérer l'abonnement ».
- Un abonnement `past_due` affiche la date de fin de grâce et une action pour
  régulariser.
- L'historique liste les paiements réels de l'organisation (et d'elle seule :
  cloisonnement vérifié avec un second compte, comme pour les tâches).
- Annuler puis reprendre fonctionne ; une organisation annulée n'est pas
  relancée par e-mail à l'échéance et passe en offre gratuite.
- `api.md` et `client.md` passent chacun leurs propres vérifications.
