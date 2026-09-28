# Analyse AO enrichie -- client.md

Écrit le 2026-09-28. Données : `api.md` (clés `risques`,
`decomposition_budgetaire`, `clauses_a_surveiller`, `questions_moa`, `jalons`,
plus les clés existantes de `analyse_json`). Règles visuelles :
`context/ui-context.md` (tokens `--adj-*`, texte >= 14 px, pas de tuiles
d'indicateur génériques, pas de liseré coloré sur le bord gauche, un zéro
reste lisible, échéances en relatif, une réponse produit quelque chose).

## Constat de départ (vérifié dans le code)

- **Mode express** : le détail d'un AO (`AoDetailView.tsx`) n'affiche
  **jamais** l'analyse. L'utilisateur ne voit ni les critères, ni les profils,
  ni les pièces que l'IA a extraits.
- **Mode accompagné**, étape « Compréhension » (`StepPanel.tsx`,
  `VueComprehension`) : l'analyse est affichée **en JSON brut**, avec les clés
  techniques (`criteres_ponderation`, `profils_requis`...) et du texte à 11 et
  12,5 px.
- **Veille** (`AoDetailPanel.tsx`) : l'onglet « Go/No-Go » montre le fit score,
  rien de l'analyse elle-même.

## Un composant partagé : la fiche d'analyse

`features/ao/components/analyse/`, importé par les trois écrans (la veille
importe déjà `FitScore` depuis `features/ao`) :

| Fichier | Rôle |
|---|---|
| `FicheAnalyse.tsx` | assemble les sections, gère l'analyse ancienne ou partielle |
| `MatriceRisques.tsx` | grille 3 x 3 cliquable |
| `ListeRisques.tsx` | un risque par ligne, filtrable par la matrice |
| `Sections.tsx` | contexte (remplace le JSON brut), jalons en relatif, questions au maître d'ouvrage avec « Copier », clauses, budget, pièces à produire. Regroupés dans un seul fichier à l'implémentation (petits blocs de même nature) au lieu des cinq fichiers prévus |
| `gravite.ts` | libellés et styles des quatre niveaux, un seul endroit |

Chaque section se masque si sa donnée est absente (`null`, liste vide), sauf
les risques : une liste vide affiche « Aucun risque relevé dans le CPS et le
RC », pour ne pas confondre « rien trouvé » et « pas encore analysé ».

Props : `FicheAnalyse({ analyse, sections })`, où `sections` choisit ce que
chaque écran montre (voir plus bas). La gravité vient **toujours** du champ
`gravite` calculé par le serveur ; le composant ne la recalcule jamais.

## La matrice de risque

Grille 3 x 3 : lignes = probabilité (forte en haut, faible en bas), colonnes =
impact (faible à gauche, fort à droite). Libellés d'axes en toutes lettres.

- Chaque case affiche **le nombre de risques** (20 px). Une case vide affiche
  `0` en `--adj-ink-3`, lisible, pas grisé jusqu'à disparaître.
- Quatre niveaux, exprimés par l'intensité des trois couleurs d'état
  existantes (pas de nouvelle couleur) :

  | Gravité | Case |
  |---|---|
  | critique | fond `--adj-neg` plein, chiffre blanc |
  | élevée | fond `--adj-neg-tint`, chiffre `--adj-neg` |
  | modérée | fond `--adj-hold-tint`, chiffre `--adj-hold` |
  | faible | fond `--adj-panel-2`, chiffre `--adj-ink-2` |

  Styles définis une fois dans `gravite.ts`. La couleur n'est jamais seule
  porteuse de sens : chaque case a un `aria-label` (« 3 risques, gravité
  élevée ») et une légende des quatre niveaux suit la grille.
- **Cliquer une case filtre la liste** en dessous (bouton, `aria-pressed`,
  clavier) ; recliquer retire le filtre. Une ligne au-dessus de la grille
  résume : « 2 critiques et 3 élevés sur 8 risques ».
- Sur téléphone, la grille garde ses 3 x 3 (cases de 64 px minimum), la liste
  passe dessous en pleine largeur.

## La liste des risques

Triée par gravité (ordre du serveur). Chaque ligne :

1. badge de gravité (texte + couleur du tableau ci-dessus), type en clair
   (« Pénalités », « Éliminatoire »...) ;
2. **titre** en `--adj-t-base`, gras ;
3. la **citation** entre guillemets « », sur fond `--adj-panel-2` (pas de
   liseré latéral), suivie de la référence (« CPS, article 24 ») en
   `--adj-ink-3` ;
4. « À faire : » + le conseil.

## Les autres sections

- **Jalons** : liste chronologique, date + relatif (« dans 5 jours », « passé
  depuis 2 jours »), type en clair. Un jalon passé passe en `--adj-ink-3` sans
  disparaître. Date non interprétable : affichée telle quelle, en fin de liste.
- **Questions au maître d'ouvrage** : liste numérotée, motif et référence sous
  chaque question. Bouton **« Copier les questions »** : copie un texte prêt à
  coller dans un courrier (numéroté, avec les références), confirmation
  « Copié ».
- **Clauses à surveiller** : sujet, citation, référence, « Pourquoi : ».
- **Budget** : montant estimé en grand, puis les postes (libellé, montant, part
  du total calculée), et la citation qui donne ces chiffres. Section masquée si
  le document ne chiffre rien.
- **Contexte** (remplace le JSON brut) : objet, acheteur, lots ; critères de
  jugement avec leur poids (« Offre technique 60 % ») ; profils exigés ;
  qualification, certifications, chiffre d'affaires minimum, références
  exigées, caution, en phrases, montants formatés en MAD.

## Où la fiche apparaît

| Écran | Sections |
|---|---|
| Veille, onglet « Go/No-Go » renommé **« Analyse »** | fit score (inchangé, en tête), matrice + risques, jalons, questions, clauses, budget |
| Détail AO, mode express | nouvelle section « Analyse du dossier » sous la progression, quand `analyse_json` existe : même contenu que la veille, sans le fit score déjà affiché ailleurs ; sur grand écran, matrice et risques à gauche, autres sections à droite |
| Mode accompagné, étape 2 « Compréhension » | contexte + matrice + risques + clauses (ce qu'il faut comprendre avant de décider) |
| Mode accompagné, étape 4 « Préparation » | jalons, questions au maître d'ouvrage, pièces à produire (`documents_requis`) en liste à cocher locale, au-dessus du contenu actuel de l'étape |

Les corrections de l'étape « Compréhension » passent toujours par le circuit
actuel (validation avec corrections) : la fiche est en lecture seule.

## Analyse ancienne ou partielle

- **Sans la clé `risques`** (analyse antérieure au chantier, AO fermé non
  ré-analysé) : le contexte s'affiche, puis une ligne « Analyse antérieure à
  l'analyse des risques. » Pas d'erreur, pas de matrice vide trompeuse.
- **`_analyse_meta.partielle`** : bandeau d'attention en tête (« Analyse établie
  sur 31 articles sur 40 du CPS »), à partir de `articles_gardes` /
  `articles_total`. `sans_texte` non vide : « Le RC est un document scanné non
  lu : l'analyse repose sur le CPS seul. »

## Types et textes

- `features/ao/types.ts` : type `AnalyseAo` complété (nouvelles clés
  optionnelles, `Gravite`, `TypeRisque`, `TypeJalon`), utilisé aussi par
  `ScrapedAo.analyse_json` côté veille au lieu de `Record<string, unknown>`.
- Textes dans `locales/fr.json` et `en.json`, espace `analyse.*`, clés
  vérifiées dans les deux fichiers.

## Vérification

- Sur un AO réel ré-analysé : la matrice compte le même nombre de risques que
  la liste ; cliquer une case ne garde que ses risques ; recliquer les rend
  tous.
- La couleur d'une case correspond au champ `gravite` du serveur (vérifié sur
  un risque « forte / fort » -> critique).
- Une ancienne analyse s'affiche sans erreur, avec la ligne d'explication.
- « Copier les questions » colle un texte numéroté avec références.
- L'étape « Compréhension » ne montre plus aucune clé technique ni JSON.
- Mode clair et sombre ; largeur téléphone sans défilement horizontal.
