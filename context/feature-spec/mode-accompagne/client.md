# mode-accompagne / client.md

Frontend du mode accompagné. À implémenter **après** `api.md`. Voir
`00-overview.md` pour les 7 étapes.

## Ce que le frontend fait aujourd'hui (vérifié le 2026-09-12)

`adjuja-frontend/src/pages/AoPipelinePage.tsx` :

- `canStart` vaut `ao.statut === "brouillon" || ao.statut === "erreur"`
  (ligne 491) -- c'est le point d'entrée où le choix du mode doit apparaître.
- `isRunning` vaut `["en_analyse", "en_traitement"].includes(ao.statut)`
  (lignes 378-380) et pilote le polling.
- Polling avec backoff adaptatif 3s / 5s / 8s / 12s (lignes 346-370), **arrêté
  uniquement sur `termine` ou `erreur`** (ligne 360).

**Piège à traiter explicitement** : en mode accompagné, une étape qui finit met
l'AO en attente d'une action humaine, qui peut durer des heures. Le polling
actuel, qui ne s'arrête que sur `termine`/`erreur`, **tournerait indéfiniment**
toutes les 12 secondes pendant tout ce temps. La condition d'arrêt doit inclure
`attente_validation`, et le polling ne doit repartir qu'après une validation.
C'est exactement la classe de bug déjà rencontrée sur ce projet (polling
`noZipLink` non borné, corrigé le 2026-08-17 par une limite de 15 tentatives).

## Écrans

### 1. Choix du mode, au lancement

Là où `canStart` est vrai. Deux options présentées côte à côte, Express en
premier (c'est le défaut et le chemin rapide), Accompagné en second avec une
phrase qui dit ce qu'il apporte : voir et corriger à chaque étape.

Pas de badge "Nouveau", pas de pilule, pas de bouton dégradé
(`ui-context.md`, Rejected Patterns). Le choix appelle
`startPipeline(aoId, mode)` -- `api.ts` seulement, jamais `fetch()` depuis le
composant.

### 2. Stepper

Colonne d'étapes à gauche sur desktop, barre horizontale scrollable en haut sur
mobile (`useIsMobile()`, le hook établi). Chaque étape montre son `statut` :

| Statut | Traitement visuel |
|---|---|
| `a_faire` | atone, non cliquable |
| `en_cours` | indicateur de travail en cours |
| `attente_validation` | **l'état saillant**, c'est là que l'utilisateur doit agir |
| `validee` | coché, cliquable pour revenir dessus |
| `non_applicable` | affichée grisée avec la raison, ou masquée -- à trancher en implémentant, ne pas la supprimer silencieusement du parcours |
| `erreur` | message + bouton relancer |

Couleurs par les tokens existants (`--l-*`), jamais de hex en dur. Teal
(`#1BC9A8`) est déjà le token de succès du projet, donc l'étape validée.

### 3. Panneau d'étape

Le contenu change par étape, la structure ne change pas : le résultat produit,
ce que l'utilisateur peut corriger, l'assistance IA, et la porte de validation
en bas.

| Étape | Ce qu'on affiche | Ce que l'utilisateur peut corriger |
|---|---|---|
| 1 Documents | fichiers classés par type | réaffecter un fichier à un autre type |
| 2 Compréhension | analyse enrichie (objet, exigences, risques, jalons) | amender les champs extraits |
| 3 Décision | fit score / verdict + justification | décider d'y aller ou d'abandonner |
| 4 Préparation | checklist des pièces, manques du profil, équipe proposée | cocher, compléter son profil |
| 5 Rédaction | note méthodologique générée | éditer le texte avant validation |
| 6 Remplissage | documents administratifs remplis, champ par champ | corriger un champ |
| 7 Signature | dossier final | signer, télécharger le ZIP |

L'étape 3 est particulière : elle n'attend aucun calcul de fond, elle s'ouvre
directement en `attente_validation`. Elle a **deux issues**, valider (je
soumissionne) et abandonner -- l'abandon n'est pas une erreur et ne doit pas
être présenté comme telle.

### 4. Assistance IA

Panneau latéral ou tiroir selon la largeur, contextualisé sur l'AO et l'étape.
Réutilise le composant de chat existant plutôt qu'un second (`FloatingChat`
existe déjà et affiche déjà des sources). Ne pas construire un deuxième système
de conversation.

### 5. Retour en arrière

Cliquer une étape `validee` propose de la refaire, **en disant explicitement que
les étapes suivantes seront à refaire** (c'est la règle posée dans `api.md`).
Confirmation obligatoire : c'est une action destructive du travail déjà validé,
elle ne doit pas se déclencher sur un clic distrait.

## Conventions

- `AoPipelinePage.tsx` utilise le style inline + `var(--l-*)` : rester dessus,
  ne pas introduire Tailwind dans ce fichier (`ui-context.md` est explicite, ce
  n'est pas une exception à corriger).
- Tout texte via i18n `fr.json`/`en.json`, aucune chaîne en dur.
- Aucun tiret cadratin dans la copie produit.
- Les sous-composants (`StepList`, `StepPanel`, `StepGate`) définis **au niveau
  module**, jamais imbriqués dans le render -- le bug de perte de focus déjà
  rencontré sur `ProfileTab`/`Field` le 2026-08-19.
- Mobile d'abord : le stepper est le composant à risque, une colonne de 7 étapes
  ne tient pas en largeur téléphone.

## Check

- Le choix du mode n'apparaît que quand un pipeline peut réellement démarrer
  (`brouillon` ou `erreur`), pas sur un AO déjà en cours.
- Sur un AO réel en accompagné, le polling **s'arrête** quand une étape passe en
  `attente_validation` -- vérifié dans l'onglet réseau du navigateur, pas
  supposé. Il repart après validation.
- Une correction saisie à l'étape 5 est bien celle qu'on retrouve dans le ZIP de
  l'étape 7.
- Le stepper est lisible et utilisable à 375px de large.
- Un AO en mode express affiche exactement l'écran d'avant ce chantier, sans
  stepper (`GET /steps` renvoie une liste vide).
- `tsc --noEmit` propre, `npm run build` propre.

## Open Questions

- Étape `non_applicable` : masquée du parcours ou affichée grisée avec sa
  raison ? Affichée est plus honnête (l'utilisateur comprend pourquoi son AO a
  5 étapes et pas 7), masquée est plus simple. Non tranché.
- Édition de la note méthodologique à l'étape 5 : zone de texte simple ou
  éditeur riche ? Le projet n'a aucun éditeur riche aujourd'hui, en introduire
  un est une dépendance nouvelle à justifier. Défaut proposé : texte simple en
  v1.
