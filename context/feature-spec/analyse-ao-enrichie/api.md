# Analyse AO enrichie -- api.md

Écrit le 2026-09-28. Décisions utilisateur du même jour :
- CPS trop long : **priorisation des articles** avant l'appel au modèle ;
- AO déjà analysés : **ré-analyse unique des AO encore ouverts**.

## Où vit l'analyse aujourd'hui (vérifié dans le code)

Deux appels au modèle, deux services qui ne partagent pas de code :

| Service | Fichier | Quand |
|---|---|---|
| Veille | `adjuja-watcher/app/modules/ao_scraper/analysis.py` (`analyze_ao`) | une fois par AO, résultat dans `watcher.scraped_aos.analyse_json`, partagé entre toutes les organisations |
| Application | `adjuja-backend/app/tasks/ao_tasks.py` (`task_analyze_ao_context`) | AO téléversé à la main ; un AO importé depuis la veille **réutilise** l'`analyse_json` de la veille (pas de second appel) |

Les deux prompts sont déjà des copies l'un de l'autre, et la lecture des lots
(`_lire_type` / `_assemble_lots`) est une « implémentation miroir testée ». Ce
chantier garde ce principe : **mêmes fonctions pures dans les deux services,
mêmes cas de test**.

Déjà en place, rien à refaire :
- lecture de tous les lots (`cps`, `cps_2`...) ;
- troncature signalée dans `_analyse_meta` (`partielle`, `caracteres_perdus`) ;
- `analyse_json` exposé tel quel par `GET /api/v1/ao/{id}` (application) et par
  la route d'analyse de la veille. **Aucune nouvelle route.**

## 1. Nouvelles clés de `analyse_json`

Ajoutées au même prompt, même appel, même coût. Les clés existantes ne changent
pas (le verdict Go/No-Go et le fit score les lisent). Les pièces à produire
restent `documents_requis` : pas de doublon.

```json
{
  "risques": [
    {
      "type": "penalites",
      "titre": "Pénalités de retard sans plafond",
      "clause": "citation courte et exacte du document",
      "reference": "CPS, article 24",
      "probabilite": "moyenne",
      "impact": "fort",
      "conseil": "action concrète pour l'entreprise"
    }
  ],
  "decomposition_budgetaire": {
    "montant_estime": 1250000,
    "postes": [{"libelle": "Lot 1 : gros œuvre", "montant": 800000}],
    "source": "citation du passage qui donne ces montants"
  },
  "clauses_a_surveiller": [
    {"sujet": "Retenue de garantie", "clause": "citation", "reference": "CPS, article 18", "pourquoi": "..."}
  ],
  "questions_moa": [
    {"question": "...", "motif": "ambiguïté ou contradiction relevée", "reference": "RC, article 7"}
  ],
  "jalons": [
    {"libelle": "Visite des lieux", "date": "2026-10-12", "type": "visite", "reference": "RC, article 9"}
  ]
}
```

Valeurs fermées (le modèle reçoit la liste, le code rejette le reste) :

| Champ | Valeurs |
|---|---|
| `risques[].type` | `financier`, `penalites`, `eliminatoire`, `capacite_technique`, `delai`, `administratif` (taxonomie validée le 2026-09-12) |
| `risques[].probabilite` | `faible`, `moyenne`, `forte` |
| `risques[].impact` | `faible`, `moyen`, `fort` |
| `jalons[].type` | `depot`, `visite`, `questions`, `ouverture`, `execution`, `autre` |

Règles du prompt :
- **ne jamais inventer** : un montant, une date ou une clause absents du texte
  donnent `null` ou une liste vide. `decomposition_budgetaire` vaut `null` si le
  document ne chiffre rien ;
- chaque risque, clause et question **cite** le texte et donne sa référence
  (document et article), pour que l'utilisateur puisse vérifier ;
- plafonds : 10 risques, 8 clauses, 8 questions, 10 jalons (tenir dans la
  réponse sans relever `max_tokens`, 8 000 aujourd'hui) ;
- `questions_moa` : seulement les ambiguïtés réelles (contradiction CPS/RC,
  quantité manquante, critère flou), pas des questions génériques.

## 2. Gravité calculée en Python, jamais par le modèle

Le modèle rend `probabilite` et `impact` séparément ; la gravité est calculée
après l'appel, pour être reproductible d'une analyse à l'autre. Fonction pure
`calculer_gravite(probabilite, impact) -> str`, identique dans les deux services :

| probabilité \ impact | faible | moyen | fort |
|---|---|---|---|
| **forte** | modérée | élevée | critique |
| **moyenne** | faible | modérée | élevée |
| **faible** | faible | faible | modérée |

Post-traitement `normaliser_risques(risques) -> list` :
- écrase tout champ `gravite` venu du modèle ;
- écarte un risque dont `type`, `probabilite` ou `impact` sort des valeurs
  fermées (journalisé, pas d'erreur) ;
- trie par gravité décroissante, puis par type.

## 3. Priorisation des articles (CPS et RC trop longs)

Aujourd'hui : texte coupé à 60 000 caractères (CPS) et 40 000 (RC), répartis
entre les lots. Les clauses de pénalités ou de paiement, souvent en fin de CPS,
peuvent disparaître.

Nouvelle fonction pure `prioriser_articles(texte, budget) -> (texte, meta)`,
appelée à la place de la coupe brute, par lot, dans son budget :

1. Texte dans le budget : rendu tel quel.
2. Découpe en articles sur les en-têtes (`Article 12`, `ARTICLE 12 :`,
   `Art. 12`). Moins de 3 articles trouvés (document non structuré) : retour à
   la coupe actuelle, rien de pire qu'aujourd'hui.
3. Le préambule (avant le premier article, 3 000 caractères au plus) est
   toujours gardé : il porte l'objet et l'acheteur.
4. Chaque article reçoit un score : nombre de mots-clés de la taxonomie qu'il
   contient (pénalité, retard, délai, paiement, avance, retenue, garantie,
   caution, cautionnement, révision des prix, résiliation, assurance,
   sous-traitance, réception, pièces, qualification, classification,
   références, chiffre d'affaires, visite, échantillon, critères, note
   technique, éliminé...), rapporté à sa longueur.
5. Sélection des meilleurs scores jusqu'au budget, puis **remise dans l'ordre
   du document** (le modèle lit un CPS cohérent, pas un puzzle).
6. `meta` : `articles_total`, `articles_gardes`, `articles_ecartes` (numéros).
   `_analyse_meta.partielle` reste vrai si un article a été écarté, et la
   fiche l'affiche (« analyse établie sur 31 articles sur 40 »).

## 4. Ré-analyse des AO encore ouverts (une fois)

Script `python -m app.scripts.enrichir_analyses` dans chaque service, mode
`--simulation` par défaut (compte et estime le coût, n'appelle rien) :

- **Veille** : AO avec `analyse_json`, date limite non passée, sans clé
  `risques`. Relance `analyze_ao`, un AO à la fois, pause entre deux appels
  (limite de débit du fournisseur).
- **Application** :
  - AO importé de la veille : recopie les nouvelles clés depuis la veille une
    fois celle-ci ré-analysée, sans nouvel appel au modèle ;
  - AO téléversé à la main : nouvel appel.

**Règle de fusion, obligatoire** : la ré-analyse **ajoute** les cinq nouvelles
clés, elle ne remplace jamais les clés existantes. En mode accompagné,
l'utilisateur a pu corriger l'analyse à l'étape « Compréhension » : l'écraser
effacerait son travail. Le lien entre un AO importé et son AO de veille est à
confirmer dans le code au moment de l'implémentation (champ d'origine de
`import_from_watcher`).

## 5. Tests

Dans les deux services, mêmes cas (le watcher n'a encore aucun test : ce sont
ses premiers, sur fonctions pures, sans base) :
- `calculer_gravite` : les 9 combinaisons du tableau ;
- `normaliser_risques` : gravité du modèle écrasée, valeur hors liste écartée,
  tri ;
- `prioriser_articles` : texte court inchangé ; document sans articles ->
  coupe classique ; article de pénalités en fin de document gardé ; ordre
  d'origine conservé ; `meta` exacte ;
- ancienne analyse sans les nouvelles clés : aucune erreur (lecture tolérante).

## Vérification finale (conditions réelles, avec une vraie clé)

- Un AO réel analysé affiche au moins un risque qui cite une clause réelle du
  CPS, avec sa référence.
- Un CPS de plus de 60 000 caractères : l'article des pénalités est présent dans
  le texte envoyé au modèle, la fiche indique les articles écartés.
- L'AO 6388 (3 lots) : risques issus des trois lots.
- Le script en simulation donne un nombre d'AO et un coût estimé avant tout
  appel ; en réel, une analyse corrigée en mode accompagné garde ses corrections.

## Hors de ce fichier

L'affichage (matrice 3 x 3, fiche « Compréhension » lisible au lieu du JSON
brut, étape « Préparation ») est dans `client.md`, étape suivante du plan.
