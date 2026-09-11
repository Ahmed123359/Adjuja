# refactoring-frontend / 00-overview.md

## Deliverable

Réorganiser le frontend par domaine métier, sans changer une ligne de
comportement. Demandé par l'utilisateur le 2026-09-12, avant de reprendre les
gros chantiers produit : « une seule page contient des milliers de lignes, pas de
composants, pas de réutilisabilité, hooks séparés, services, types, tout est
déclaré dans la même page ».

## Le diagnostic, mesuré le 2026-09-12

| Fichier | Lignes | Contenu |
|---|---|---|
| `pages/DashboardPage.tsx` | 2485 | **16 composants**, 53 `useState`, 10 `useEffect` |
| `pages/AoPipelinePage.tsx` | 1538 | 5 composants |
| `components/RightPanel.tsx` | 1272 | |
| `api.ts` | 1381 | tous les domaines dans un fichier |
| `components/OffreTechniqueTab.tsx` | 947 | |
| `components/ActeEngagementTab.tsx` | 792 | |
| `types.ts` | 542 | tous les domaines dans un fichier |

Duplications réelles, vérifiées et non supposées :

- **Quatre implémentations différentes du même polling Celery** : backoff
  adaptatif dans `AoPipelinePage`, `setInterval` dans `DocumentsTab`,
  `FillerTab` et `veille/AoDetailPanel`. C'est exactement là qu'ont eu lieu les
  bugs de polling déjà corrigés (polling non borné, 2026-08-17), et le piège que
  `mode-accompagne/client.md` signale pour le stepper.
- `Spinner` défini **deux fois** (`DashboardPage`, `veille/AoDetailPanel`).
- `btnBase` recopié **12 fois**, `animation: "spin 1s linear infinite"` inline
  **9 fois**.
- Une seule violation du standard « jamais de `fetch()` en composant » :
  `components/landing/LandingFooter.tsx:32`.

Ce qui était déjà sain et n'a pas été touché : `hooks/` existait déjà (4 hooks),
`components/veille/` était **déjà découpé par domaine en 9 fichiers** (le modèle
à généraliser existait donc dans le repo), et les sous-composants sont déclarés
au niveau module et non imbriqués dans le render, donc conformes au standard.

## Contrainte qui décide de la méthode

**Aucun test frontend, aucun lint, aucun vitest** : le seul filet est
`tsc && vite build`. D'où la méthode retenue avec l'utilisateur : **déplacement
pur d'abord**, que `tsc` vérifie mécaniquement, et factorisation des doublons
dans une étape séparée et explicite ensuite. Jamais les deux dans le même
mouvement, sinon une régression n'est plus localisable.

## Décisions prises avec l'utilisateur (2026-09-12)

1. **Déplacement pur d'abord**, factorisation ensuite.
2. **Commencer par le socle** `api.ts` + `types.ts`, pas par les pages.
3. **Organisation par domaine métier** (`features/<domaine>/`), pas par type
   technique.

## Fait : étape 1, le socle (2026-09-12)

`api.ts` (1381 lignes) et `types.ts` (542) sont devenus 23 fichiers, le plus gros
à 252 lignes :

```
src/features/<domaine>/api.ts, types.ts
   ao, veille, company, billing, auth, org, tools, chat,
   generation, marches, notifications
src/shared/lib/http.ts     jeton, authHeaders(), safeJson, wrapNetworkError
src/shared/app.api.ts      defaults, modèles LLM, RAG, usage
src/shared/app.types.ts
src/api.ts, src/types.ts   barrels de ré-export
```

Point de méthode qui a rendu l'opération sûre : **`api.ts` et `types.ts` sont
devenus des barrels de ré-export**. Les 30+ fichiers qui importent
`from "../api"` n'ont pas bougé d'une ligne, donc le risque de régression est
celui d'un déplacement de fichier, pas celui d'une réécriture.

Vérifié : 110 exports avant, 110 après, aucun perdu (plus 3 helpers HTTP promus
de privés à partagés, nécessaires au découpage) ; 60 types avant, 60 après ;
`tsc --noEmit` propre et `npm run build` vert. Deux vraies erreurs ont été
révélées par `tsc` et corrigées : une dépendance croisée `AppDefaults` ->
`CompanyData`, et un `import type` égaré au milieu de l'ancien fichier.

Conventions mises à jour en même temps, pour ne pas les laisser dériver :
`CLAUDE.md` et `context/code-standards.md`.

## Reste à faire

### Étape 2 : FAITE (2026-09-12)

`src/components/` n'existe plus. `src/pages/` ne garde que les deux pages sans
domaine (404, ComingSoon). 14 domaines sous `features/`, plus
`shared/{layout,ui,lib}`.

Méthode qui a rendu le déplacement de masse sûr : un script qui **recalcule tous
les imports relatifs du projet** (résolution de chaque spécificateur vers un
chemin absolu, remap, puis recalcul du relatif depuis la nouvelle position),
plutôt que des corrections à la main. `tsc` est passé propre du premier coup sur
la passe de 35 fichiers. Comparaison automatique sur tout l'arbre : 19351 lignes
significatives avant, 19351 après, les seules différences étant des chemins
d'import réécrits -- dont un `lazy(() => import(...))`, correctement repointé.

Les gros fichiers restants le sont **en eux-mêmes**, plus par accumulation :
`RightPanel` 1272 (coquille applicative), `OffreTechniqueTab` 947,
`ActeEngagementTab` 792, `AoDetailPanel` 727, `MarchesPage` 719, `AoDetailView`
694. Les découper relève de la réécriture, pas du déplacement.

### Étape 2 (référence) : ce qui avait été planifié

Par ordre de gain décroissant :

1. `DashboardPage.tsx` (2485) -> `features/company/` par onglet. **Ce découpage
   est de toute façon le préalable du chantier `dashboard-collaboratif`**, qui
   prévoit de remplacer cette page et de reloger ses 5 onglets de réglage dans
   un espace « Mon entreprise / Paramètres ». Ce n'est donc pas du travail jeté.
2. `AoPipelinePage.tsx` (1538) -> `features/ao/`. À faire **avant** d'écrire le
   stepper du mode accompagné, sinon on ajoute plusieurs centaines de lignes à un
   fichier déjà trop gros.
3. `RightPanel.tsx` (1272), `OffreTechniqueTab.tsx` (947),
   `ActeEngagementTab.tsx` (792) -> `features/tools/`.
4. `components/veille/` -> `features/veille/components/` (déjà découpé, c'est un
   simple déplacement de dossier).

### Étape 3 : factorisation -- à mener explicitement, sa nature a changé

**Découverte en lisant les 4 pollings côte à côte le 2026-09-12 : ils ne font pas
la même chose.**

| Fichier | Mécanique | Borne | Arrêt |
|---|---|---|---|
| `features/ao/components/AoDetailView` | backoff 3/5/8/12s | aucune | statut terminal |
| `features/tools/components/DocumentsTab` | `setInterval` fixe, multi-jobs | aucune | par job |
| `features/tools/components/FillerTab` | `setInterval` 4s, mono-job | aucune | statut terminal |
| `features/veille/components/AoDetailPanel` | `setInterval` 3s | **15 tentatives** | condition |

Les unifier n'est donc **pas une substitution mécanique** : c'est une réécriture
de quatre comportements différents, sans aucun test pour la rattraper. Ce qui ne
veut pas dire qu'il ne faut pas le faire -- c'est le doublon qui a déjà produit
des bugs réels, et le mode accompagné en a besoin (son polling doit s'arrêter sur
`attente_validation`, sinon il tourne des heures pendant qu'une étape attend une
validation humaine). Mais cela doit être une décision prise, pas un effet de bord
d'un rangement.

Même constat pour les deux `Spinner` : ils **ne sont pas identiques** (bloc
centré 20px aux tokens du thème vs 14px blanc inline pour un bouton). Les fusionner
demande un composant paramétré, donc une réécriture.

Reste par ailleurs, sans ambiguïté celui-là : corriger le `fetch()` direct de
`features/landing/components/LandingFooter.tsx`, seule violation du standard.

### Étape 4, à proposer et non décidée

Poser un filet de tests (`vitest` + `testing-library`) sur les parcours
critiques. L'utilisateur a écarté l'option « tests d'abord » pour ne pas retarder
le chantier, ce qui est un choix assumé : la couverture reste à zéro et chaque
étape suivante repose sur `tsc` seul.

## Check

- `npx tsc --noEmit` propre et `npm run build` vert après **chaque** étape, pas
  seulement à la fin.
- Aucun export ni type perdu : comparaison automatique avant/après, pas une
  relecture à l'oeil.
- Aucune ligne de logique modifiée pendant une étape de déplacement : si un
  comportement doit changer, c'est une étape séparée qui le dit.
- L'application se lance et un parcours réel fonctionne (pipeline AO de bout en
  bout) -- **pas encore fait pour l'étape 1**, seulement `tsc` + build.

## Open Questions

- Les barrels `src/api.ts` / `src/types.ts` : les garder indéfiniment, ou migrer
  les imports fichier par fichier puis les supprimer ? Les garder coûte un
  niveau d'indirection ; les supprimer touche 30+ fichiers. Non tranché.
- `features/generation/` et `features/marches/` couvrent des parcours antérieurs
  au pipeline AO. À confirmer avec l'utilisateur qu'ils sont toujours vivants
  avant d'investir dans leur découpage.
