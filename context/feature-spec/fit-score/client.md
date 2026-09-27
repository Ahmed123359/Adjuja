# Fit score -- client

Frontend : composant partagé dans `features/ao/components/FitScore.tsx`, utilisé
par la veille (`features/veille/components/AoDetailPanel.tsx`) et par l'étape
« Décision » du mode accompagné. Visuel : socle `--adj-*`, fond uni, filets
(`context/ui-context.md`).

## Données

- Veille : `analyzeScrapedAo(id)` (ao-watcher `POST /aos/{id}/verdict`) renvoie
  désormais `fit_score` en plus du verdict. Type `FitScore` dans
  `features/ao/types.ts` ; `EligibilityVerdict` (veille) gagne
  `fit_score?: FitScore | null`.
- Pipeline : `fetchFitScore(aoId)` dans `features/ao/api.ts`
  (`GET /api/v1/ao/{ao_id}/fit-score`), lu par `useRessource` avec la clé
  `ao:fit:{aoId}`. Toute sauvegarde du profil entreprise invalide le préfixe
  `ao:fit:` : compléter son profil fait bouger le score au retour.

## Composant `FitScore`

De haut en bas :

1. **Barrière d'éligibilité**, si elle n'est pas « éligible » : bandeau
   « Non éligible » (couleur négative) listant les `bloquants`, ou « À vérifier »
   (couleur d'attente) pour la qualification. Au-dessus du score, jamais à la
   place.
2. **Score** : le nombre en grand (`--adj-t-num`, chiffres tabulaires) « 72 / 100 »,
   et une phrase de lecture qui nomme la base : « calculé sur 5 critères exigés
   par cet AO ». `score: null` → « Cet AO ne précise aucune exigence
   comparable à votre profil. »
3. **Détail des facteurs**, une ligne par facteur, séparées par des filets :
   libellé et poids (« Références · 20 % »), score sur 100 avec une barre de
   longueur réelle (valeur sur 100, pas une barre décorative), justification en
   dessous, action éventuelle à droite (« Compléter mes références »). Un
   facteur non exigé est affiché en retrait : « Non exigé », sans barre, et
   compté comme tel dans la phrase de lecture.
4. **Confiance** : un facteur `faible` porte la mention « estimation » ; si
   `methode_references = "mots_cles"`, une ligne en pied explique que la
   comparaison des références est approximative (service de similarité
   indisponible).
5. `avertissements` (délai serré…) en pied, en texte, pas en bandeau.

Actions : ouvrent les réglages d'entreprise sur l'onglet `action.cible`
(`CompanySettingsPage` avec `initialTab`, même mécanisme que la spec
`gestion-abonnement`), et si `action.champ` est fourni, défilent jusqu'au champ
et lui donnent le focus (identifiants `profil-*` déjà posés par `ProfileTab`).

## Intégration

- **Veille** (`AoDetailPanel`) : le bloc Go/No-Go actuel est remplacé par
  `FitScore`. La présentation du panneau ne change pas par ailleurs (demande de
  l'utilisateur du 2026-09-27). Le bouton d'analyse existant déclenche le calcul
  comme aujourd'hui.
- **Mode accompagné**, étape « Décision » : `FitScore` en tête de l'étape.
- **Liste de veille** : pas de colonne score en V1 (le score n'est calculé qu'à
  l'analyse d'un AO, un seul appel Mistral par AO côté veille).

## i18n

Clés `fitScore.*` en `fr` et `en` : libellés des six facteurs, états
d'éligibilité, phrase de lecture (`fitScore.basis_one` / `_other`),
« Non exigé », « estimation », libellés d'action par `cible`/`champ`, message
du mode mots-clés, message « aucune exigence ». Les `justification` renvoyées
par l'API restent en français en V1 (comme `raisons` aujourd'hui) : limite
connue, notée ici.

## Check when done

- Panneau de veille : un AO analysé montre le score, la barrière et les 6
  lignes ; un AO à certification manquante montre « Non éligible » au-dessus
  d'un score non nul.
- Un facteur non exigé est visiblement écarté et la phrase de lecture compte
  juste.
- « Compléter mes références » ouvre le profil sur le bon champ ; après
  sauvegarde, le score affiché se met à jour sans rechargement.
- Aucune couleur ni taille en dur : tokens `--adj-*`, textes ≥ 14px.
- `tsc --noEmit` propre ; clés `fitScore.*` résolues en `fr` et `en`.
