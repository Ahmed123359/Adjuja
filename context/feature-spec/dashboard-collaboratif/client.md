# dashboard-collaboratif / client.md

L'écran du tableau de bord, la restructuration de la navigation qu'il impose, et
la refonte visuelle de cette zone. Le backend est livré (`api.md`).

Rappel du périmètre décidé le 2026-09-15 : **calendrier et tâches**. Pas de
mentions `@nom`, pas de flux d'alertes.

## Ce que l'écran fait aujourd'hui (lu le 2026-09-15)

- `App.tsx` tient un état `mainTab` à quatre valeurs : `offres`, `marches`,
  `outils`, `veille`. `AppSidebar` affiche ces quatre entrées, celle d'`offres`
  étant déjà libellée « Tableau de bord » (`app.nav.dashboard`).
- `RightPanel.tsx` (1 272 lignes) rend chaque onglet. Sur `offres`, il affiche
  `DashboardPage` au repos, puis l'espace de génération dès qu'un travail est
  lancé : **une seule entrée de navigation porte donc deux choses différentes**,
  les réglages d'entreprise et la génération.
- `DashboardPage.tsx` est la zone de réglages à 6 onglets. Son onglet « Vue
  d'ensemble » a déjà été refait sur le nouveau socle visuel et préfigure la
  composition du tableau de bord (bandeau de statistiques, colonne d'activité,
  colonne d'échéances).
- `shared/SettingsPage.tsx` (réglages de modèle et d'usage) **n'est importé nulle
  part** : code mort depuis une refonte antérieure. À traiter dans le relogement
  plutôt qu'à laisser traîner.
- Aucun composant de calendrier n'existe, et aucune dépendance de calendrier
  n'est installée.

## Navigation cible

La barre latérale distingue ce qu'on **fait** de ce qu'on **règle**.

| Entrée | Contenu | État |
|---|---|---|
| Tableau de bord | nouvel écran : résumé, calendrier, tâches | à créer |
| Veille | `VeilleHubPage` | inchangé |
| Appels d'offres | `AoPipelinePage` | inchangé |
| Outils | `OutilsContent` | inchangé |
| Génération | l'espace de génération, aujourd'hui mêlé aux réglages | déplacé |

« Mon entreprise » (les 5 onglets de réglages) quitte la navigation principale
et devient un écran atteint depuis le **pied de la barre latérale**, là où
figurent déjà l'utilisateur et la déconnexion. Un réglage se visite rarement ; il
n'a pas à occuper le même rang qu'une activité quotidienne.

`mainTab` passe donc à : `accueil` | `veille` | `marches` | `outils` | `offres`
| `entreprise`. Valeur par défaut : `accueil`.

**Le déménagement est du routage et de la mise en page, jamais une réécriture.**
Les 5 onglets (profil, signature, documents, équipe, génération) gardent leur
code tel quel, y compris `NotificationPreferencesSection` et
`OrgMembersSection`, qui sont en production et testés en réel. Le seul onglet
supprimé est « Vue d'ensemble », dont le contenu devient le tableau de bord.

## Écrans et fichiers

```
features/dashboard/
  api.ts                 fetchSummary, fetchCalendar, fetchTasks, createTask,
                         updateTask, deleteTask  (via authHeaders + readJson)
  types.ts               DashboardSummary, CalendarEvent, Task
  DashboardHomePage.tsx  l'écran
  components/
    SummaryBar.tsx       les tuiles, reprises de l'actuel StatBar d'OverviewTab
    MonthCalendar.tsx    grille mensuelle
    DayEvents.tsx        les événements du jour sélectionné
    TaskPanel.tsx        mes tâches / toutes les tâches
    TaskForm.tsx         création et édition d'une tâche

features/company/
  CompanySettingsPage.tsx  ex-DashboardPage, 5 onglets, « Vue d'ensemble » retirée
```

`OverviewTab.tsx` disparaît : son `StatBar` et sa composition en deux colonnes
sont repris par le tableau de bord, ce pour quoi ils avaient été écrits.

## Composition de l'écran

Largeur gérée par `Page` (`shared/ui`), une seule largeur maximale pour tous les
écrans, comme le fait déjà la vue d'ensemble.

```
┌──────────────────────────────────────────────────────────┐
│ Tuiles : AO en cours · terminés · tâches ouvertes ·      │
│          mes tâches · prochaine échéance                 │
├───────────────────────────────┬──────────────────────────┤
│ Calendrier du mois            │ Mes tâches               │
│ (pastilles par type)          │ (à faire, en cours)      │
│                               │                          │
│ Événements du jour choisi     │ + Nouvelle tâche         │
└───────────────────────────────┴──────────────────────────┘
```

- **Tuiles** : une seule surface divisée par des filets, pas quatre cartes
  flottantes -- le traitement déjà retenu dans la vue d'ensemble, conservé.
  Source unique : `GET /dashboard/summary`.
- **Calendrier** : composant maison, **aucune dépendance nouvelle**. Une grille
  de 7 colonnes en CSS, semaine commençant le lundi. Chaque jour porte au plus
  trois pastilles, puis « +N ». Deux types seulement, donc deux couleurs :
  échéance d'AO (`--ac-primary`) et tâche (`--ac-warn`), une tâche en retard
  passant en `--ac-danger`. Le mois affiché appelle
  `GET /dashboard/calendar?from=&to=` sur ses bornes réelles, jamais plus large.
- **Jour sélectionné** : la liste sous le calendrier, pas une fenêtre modale --
  sur mobile une modale par jour rendrait la navigation pénible.
- **Tâches** : liste ordonnée par échéance, bascule « mes tâches / toutes »,
  case à cocher pour passer à `faite`, menu pour assigner. Les membres viennent
  de `GET /org/members`, déjà en place.

### Mobile

Le calendrier mensuel n'est pas lisible sous 480 px. En dessous, il devient une
**liste des échéances à venir** groupées par jour, et les tâches passent sous
cette liste. `useIsMobile()`, le hook déjà utilisé par la veille.

## Refonte visuelle : ce qui est repris et ce qui ne l'est pas

Le socle existe déjà (`shared/ui/tokens.css`, `Button`, `Card`, `Badge`,
`StatTile`, `Page`), posé le 2026-09-12 et utilisé par deux fichiers seulement.
Cette zone est la première à l'adopter entièrement.

Règles pour tout code écrit ici :
- aucune valeur hexadécimale ni `rgba()` en dur : les jetons `--sf-*`, `--tx-*`,
  `--ac-*`, `--s-*`, `--r-*`, `--e-*` couvrent les besoins, et un besoin non
  couvert devient un jeton ;
- aucun texte en dur : tout passe par `locales/fr.json` et `en.json` ;
- `Button`, `Card`, `Badge`, `Page` plutôt qu'un bouton stylé sur place ;
- pas de bouton entièrement arrondi, pas d'étiquette en surtitre, pas de dégradé
  par défaut (`ui-context.md`, Rejected Patterns) ;
- un sous-composant se définit au niveau du module, jamais dans le rendu d'un
  autre composant (bug de perte de focus déjà rencontré dans `ProfileTab`).

**Les 5 onglets déménagés ne sont pas retouchés visuellement dans ce chantier.**
Ils gardent leur style actuel jusqu'à la vague de refonte suivante : mélanger un
déménagement et une réécriture, c'est perdre la capacité de dire lequel des deux
a cassé quelque chose.

## Livré le 2026-09-15 (écran)

**Navigation restructurée**
- `mainTab` passe à `accueil | veille | marches | outils | offres | entreprise`,
  défaut `accueil`. La barre latérale porte Tableau de bord, Mes offres, Veille,
  Outils ; « Mon entreprise » est en pied de barre, au-dessus du bloc
  utilisateur.
- **`offres` a été retiré de la navigation** : son écran au repos était la page
  de réglages, et son espace de génération n'est atteignable par aucun chemin
  (défaut déclaré dans `bugs-connus.md`, code non touché).
- `DashboardPage.tsx` renommé `CompanySettingsPage.tsx`, 5 onglets, contenu
  inchangé.

**Nouveau domaine `features/dashboard/`**
`api.ts`, `types.ts`, `DashboardHomePage.tsx`, et les composants `SummaryBar`,
`MonthCalendar`, `DayEvents`, `TaskPanel`, `TaskForm`.

**L'ancienne « Vue d'ensemble » n'a pas été jetée** : `OverviewTab.tsx` est
devenu `features/dashboard/components/ActivitySection.tsx` (AO récents, veille,
plan). Seuls son gabarit de page et son bandeau de statistiques ont été retirés,
repris respectivement par `DashboardHomePage` et `SummaryBar`. C'était du travail
non commité, refait le 2026-09-12 pour préfigurer cet écran : le supprimer aurait
été le perdre.

**Calendrier** : composant maison, aucune dépendance ajoutée. Semaine au lundi,
trois pastilles par jour puis « +N », un appel par mois affiché borné à ses dates
réelles. `isoDay()` découpe la date en local plutôt que par `toISOString()`, qui
aurait décalé les échéances d'un jour à l'ouest de Greenwich.

**Vérifié** : `tsc --noEmit` propre, `npm run build` vert, et **51 clés i18n
utilisées par le nouveau code résolues en français et en anglais** (contrôle par
script, y compris les clés construites dynamiquement).

**Non vérifié** : le rendu réel dans un navigateur, faute d'outil de capture dans
la session. À regarder avant commit : le tableau de bord, le calendrier à
400 px de large, et les 5 onglets de réglages à leur nouvel emplacement.

## Refonte de l'écran, 2026-09-15 (retour utilisateur)

Premier jet jugé fade, à raison : captures à l'appui, tuiles hautes et vides,
calendrier réduit à des cases grises, événements représentés par des pastilles
muettes, et le bouton « Aujourd'hui » débordant d'un carré de 30 px. La
modification d'une tâche manquait aussi, alors que ce fichier la prévoyait.

Ce qui a été refait :

- **Bandeau de tête** (`KpiBand`) : les chiffres sur un dégradé de marque, en
  tuiles blanches, avec la prochaine échéance en clair à droite au lieu d'un
  « -- » dans une tuile vide. Chaque tuile porte une **part réelle** (ce statut
  sur le total), pas un ornement.
- **Calendrier** : six semaines pleines (la hauteur ne saute plus d'un mois à
  l'autre), jours des mois voisins affichés en gris plutôt que laissés en trous,
  aujourd'hui en pastille pleine, et surtout **chaque événement affiche son
  intitulé tronqué** au lieu d'une pastille anonyme. Bouton « Aujourd'hui » à
  largeur automatique.
- **Tâches** : lignes avec initiales de la personne assignée, échéance en clair,
  mention « en retard », et les trois actions réelles : cocher, **modifier**,
  supprimer. `TaskForm` sert à la création et à la modification, avec le statut
  en plus.
- **Activité** : les AO récents deviennent un **vrai tableau** (référence, objet,
  statut, échéance) au lieu d'une suite de lignes libres, précédé d'une **barre
  empilée de répartition par statut** avec légende chiffrée.

**Aucune courbe, aucune sparkline.** La référence visuelle en montre, mais nous
n'avons aucune série temporelle derrière ces chiffres : en dessiner une serait
une décoration mensongère. La règle de forme appliquée est celle du guide de
visualisation : une poignée de chiffres de tête se lit en tuiles, une part-à-tout
de quelques classes en barre empilée.

**Vérifié** : `tsc` propre, build vert, 55 clés i18n résolues en fr et en, et
**modification d'une tâche testée sur la vraie API** avec la charge utile exacte
du formulaire (titre, échéance, personne assignée, AO, statut), relecture après
enregistrement, et vidage des champs facultatifs. Le rendu visuel reste à
regarder dans un navigateur.

## Check

- Une tâche créée depuis l'écran apparaît dans « Mes tâches » après rechargement,
  et sa ligne existe en base.
- Une tâche assignée à un autre membre réel apparaît chez ce membre, connecté
  avec son propre compte -- le critère de recette du `00-overview.md`.
- Le calendrier montre la date limite réelle d'un AO importé de la veille, sans
  aucune saisie manuelle.
- Changer de mois déclenche un seul appel, borné au mois affiché.
- À 400 px de large, le calendrier laisse place à la liste d'échéances et rien ne
  déborde horizontalement.
- Les 5 onglets de réglages, à leur nouvel emplacement, fonctionnent exactement
  comme avant : profil enregistré, signature téléversée, document ajouté, membre
  invité, préférences de notification sauvegardées. **Testés un par un** : le
  déménagement est la principale source de régression de ce chantier.
- La génération, désormais sur sa propre entrée de navigation, fonctionne comme
  avant.
- `tsc --noEmit` et `npm run build` propres, clés i18n résolues en fr et en.

## Questions ouvertes

- **`SubscriptionCard`** (plan, usage, bouton d'abonnement) est aujourd'hui en
  tête de la vue d'ensemble. Sa place naturelle est « Mon entreprise », mais
  l'usage AO du mois a aussi sa place sur le tableau de bord. Proposition : la
  carte complète dans « Mon entreprise », et une tuile d'usage sur le tableau de
  bord. À valider.
- `shared/SettingsPage.tsx` est du code mort. Le supprimer ou l'absorber dans
  « Mon entreprise » est une décision de l'utilisateur, pas une décision
  technique.
- Assigner une tâche ne prévient personne en v1 (voir `api.md`). Si l'usage
  montre que c'est gênant, la brique email existe côté `notification-service`.
