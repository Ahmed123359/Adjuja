# Panneau d'administration : écrans

Écrit le 2026-09-30. Consomme `api.md`. Règles visuelles : `ui-context.md`
(non recopiées ici).

## Page séparée `/admin` (2026-10-01)

Remplace l'onglet du 2026-09-30, jugé mal organisé par l'utilisateur (« l'admin
doit scroller, on doit différencier les choses, l'administration mérite toute
une autre page »).

- **Route** `/admin/*` (`main.tsx`) : `AdminApp` pour un compte
  `is_platform_admin`, renvoi vers `/app` sinon, connexion pour un visiteur
  (le chemin `/admin/...` est rouvert après la connexion,
  `shared/lib/navigation.ts`). Chaque route `/api/v1/admin/*` revérifie.
- **Entrée** : « Administration » dans la barre latérale de l'application
  (groupe Entreprise), visible pour les seuls admins ; elle ouvre `/admin`.
  L'onglet `admin` d'`AppTab` n'existe plus.
- **Coquille** (`features/admin/AdminApp.tsx`) : rail sombre de l'application
  (mêmes tokens), groupes et une URL par écran. Sous 900px, le rail devient un
  tiroir ouvert depuis une barre du haut. Pied du rail : « Retour à
  l'application », adresse, déconnexion.

| Groupe | Écran | Adresse |
|---|---|---|
| Pilotage | Tableau de bord | `/admin` |
| Clients | Comptes, fiche d'un compte | `/admin/comptes`, `/admin/comptes/:orgId` |
| Clients | Abonnements | `/admin/abonnements` |
| Veille | Sources, Remplissage, Actions, Téléchargements DCE | `/admin/veille/...` |
| Sécurité | Accès, Journal | `/admin/acces`, `/admin/journal` |

Notifications, Santé et Coûts IA n'apparaissent qu'une fois livrés.

- **Gabarit** : `components/ui.tsx` (`PageAdmin` : titre 30px, phrase qui dit
  ce qu'on lit, actions à droite ; `Section`, tableaux, états vide, erreur,
  chargement ; dates robustes au format PostgreSQL). Contenu en pleine
  largeur, jamais une colonne centrée entre deux marges vides.
- **Tableau de bord** : référence « pupitre de poste d'aiguillage », tout est
  calme et seul l'anormal s'allume. 1) À surveiller (paiements en retard,
  échéances sous 7 jours, sources en retard, champs en alerte, DCE en échec,
  comptes suspendus ; chaque ligne mène à son écran ; sinon « Rien à
  signaler »). 2) Registre ligné Clients / Activité (libellé, chiffre,
  contexte ; revenu présenté comme estimation). 3) Barres sur 30 jours
  (inscriptions, dossiers créés) : une série par graphique, une couleur,
  infobulle par barre, valeurs listées sous un repli.
- **Comptes** : recherche (300 ms après la frappe), filtres offre et état,
  25 par page, ligne cliquable vers la fiche ; cartes sous 900px.
- **Fiche** : abonnement et consommation face aux limites, changement d'offre
  (offre + durée, confirmation qui dit l'échéance), membres (suspendre /
  réactiver avec raison, confirmation ; « Vous » et « Administrateur » au
  lieu du bouton), activité (dossiers par statut, 5 derniers, générations).
- **Abonnements** : filtre de statut, échéance proche signalée, ligne vers la
  fiche. **Accès** : lecture seule, dit comment ajouter un administrateur.
- **Suppression d'un compte** : pas de bouton tant que la route n'est pas
  spécifiée et codée (voir `api.md`).

## Module Veille

Cinq blocs séparés par des filets, dans cet ordre : sources, remplissage,
actions, DCE en échec, journal.

### 1. Sources

Tableau, une ligne par source : source, avis ouverts, découverts sur 24 h,
découverts sur 7 jours, DCE en échec, analyses (faites / à enrichir),
dernier passage.

- Noms lisibles : « Marchés publics (portail national) », « Safakat (CDG) »,
  « Achats CIMR », « Bons de commande ».
- « Dernier passage » : âge du dernier succès (« il y a 3 h », date exacte en
  info-bulle) ; en retard : rouge, icône et mot « en retard ». Si la dernière
  tentative a échoué après ce succès : « Dernier essai en échec, il y a 1 h »
  et le message sous un repli. « Non enregistré » si aucune trace.
- Un zéro reste en encre pleine (`ui-context.md`, « Un zéro reste lisible ») ;
  un nombre de DCE en échec non nul est en `--adj-neg`.

### 2. Remplissage des avis ouverts

Matrice champ x source (AO), puis une seconde pour les bons de commande
(champs différents). Chaque cellule : le taux sur les avis ouverts, en
chiffre, et dessous « 74 % des récents » (découverts sur 7 jours).

- **Alerte** (`alerte: true`) : cellule en `--adj-neg` sur `--adj-neg-tint`,
  avec icône ; une phrase sous la matrice dit ce que signifie l'alerte (« les
  avis ouverts sont deux fois moins remplis que les avis récents : un
  re-scrape efface probablement ce champ »). La couleur ne porte jamais le
  sens seule.
- Pas de barre de progression : le chiffre suffit et se compare d'une colonne
  à l'autre (barres décoratives rejetées).
- Taux `null` (aucun avis) : « - ».

### 3. Dossiers DCE en échec

Liste (référence ou identifiant, titre, acheteur, échéance en relatif) ;
le message d'erreur complet sous un repli, car il est souvent long et
technique. Total affiché (« 3 sur 3 » ou « 50 sur 212 »).

### Téléphone

Sous 900px, les deux tableaux deviennent une carte par source (même règle que
la liste des AO : pas de défilement horizontal, qui cache la moitié des
données).

### 4. Actions de maintenance

Une ligne par action : titre, une phrase qui dit ce qu'elle fait (et que la
ré-analyse coûte), contrôles.

- Relance d'un scrape (AO, BDC) : un bouton, pas de simulation (le cooldown
  d'1 h protège les portails, un refus s'affiche comme tel).
- Rattrapage (source, nombre maximum) et ré-analyse (nombre maximum) :
  **« Simuler » puis « Lancer pour de vrai »**. Le bouton réel ne s'active
  qu'après une simulation terminée **avec les mêmes paramètres** ; le résumé
  de la simulation reste affiché au-dessus (« 42 avis ouverts à compléter,
  environ 3 min »). Bouton réel en variante `danger`.
- Pendant l'exécution : progression réelle (« 37 sur 120 » et sa barre ; une
  barre qui mesure un vrai avancement n'est pas décorative), lue toutes les
  2 s. La tâche suivie est gardée hors du composant : changer d'onglet puis
  revenir reprend le suivi.
- Fin : compte rendu en une phrase (même texte que le journal,
  `components/rapport.ts`), liste des avis ignorés sous un repli ; échec :
  message sous un repli.

### 5. Journal des actions

Tableau : date, action, mode (simulation / réel, limite), auteur, statut
(en cours, terminé, échec, refusé), compte rendu. Carte par ligne sous 900px.

## Textes

Clés `admin.*` dans `fr.json` et `en.json`, vérifiées dans les deux.
