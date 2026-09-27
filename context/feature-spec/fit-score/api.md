# Fit score -- API

Backend : `adjuja-backend/app/services/fit_score_service.py` (nouveau),
`app/services/rag_service.py`, `app/api/routes/ao_routes.py`,
`app/api/dependencies.py`. Relais : `adjuja-watcher/app/modules/ao_scraper/router.py`.
Aucune migration.

## Étape 1 -- correctifs d'indexation RAG (préalables)

Deux défauts de `RagService.index_document`, déclarés dans `bugs-connus.md` :

- **Type écrasé.** `payload = {**metadata, ..., "doc_type": "note_metho"}`
  remplace le `doc_type` fourni (`reference_realisation`, `diplome`…) par
  `note_metho` pour tout document. Mettre la valeur par défaut **avant**
  l'étalement : `{"doc_type": "note_metho", **metadata, "content": ..., "org_id": ...}`.
- **Identifiants instables.** `id=abs(hash(f"{doc_id}_{i}"))` : `hash()` est
  salé par processus (`PYTHONHASHSEED` non fixé dans l'infra), donc réindexer un
  document ajoute des doublons au lieu de les remplacer. Utiliser
  `uuid.uuid5(NAMESPACE, f"{doc_id}_{i}")` (déterministe, accepté par Qdrant).

Les points déjà indexés gardent leur mauvais type : une réindexation des
documents d'entreprise existants est à lancer une fois (script ponctuel,
`offria_kb_{org_id}` supprimée puis reconstruite depuis `company_documents`).

## Étape 2 -- `FitScoreService`

Singleton via `@lru_cache` dans `dependencies.py` (`get_fit_score_service`),
reçoit `RagService` pour les embeddings et Qdrant. Entrée :

```python
async def compute(
    analyse_json: dict,
    ao_context: AoContext,          # objet/titre, region, ville, date_limite
    profile: CompanyProfile | None,
    staff: list[StaffCv],           # actifs seulement
    documents: list[CompanyDocument],
    org_id: str,
) -> dict
```

Réponse (`fit_score`) :

```json
{
  "score": 72,
  "eligibilite": "eligible",
  "bloquants": [],
  "avertissements": ["Delai serre : 6 jour(s) restant(s) avant la date limite."],
  "facteurs": [
    { "code": "qualifications", "poids": 30, "score": 100, "exige": true,
      "confiance": "haute", "justification": "ISO 9001:2015 presente dans votre profil.",
      "action": null },
    { "code": "capacite_financiere", "poids": 20, "score": null, "exige": false,
      "confiance": "haute", "justification": "Aucun chiffre d'affaires minimum exige.",
      "action": null },
    { "code": "references", "poids": 20, "score": 50, "exige": true,
      "confiance": "moyenne", "justification": "1 reference proche de l'objet sur 2 exigees.",
      "action": { "cible": "profil", "champ": "references_similaires" } }
  ],
  "methode_references": "embeddings"
}
```

- `eligibilite` : `non_eligible` si `compute_verdict` produit au moins un
  échec bloquant (`bloquants` = ces messages), sinon `a_verifier` s'il reste un
  avertissement de qualification, sinon `eligible`. `compute_verdict` n'est pas
  modifié : il est appelé tel quel.
- `score` : `round(Σ poids·score / Σ poids)` sur les facteurs `exige: true`.
  `null` si aucun facteur n'est exigé (l'écran l'explique, pas de score inventé).
- `action.cible` ∈ `profil` | `documents` | `equipe` (onglets des réglages
  d'entreprise), `action.champ` = identifiant de champ du profil quand il y en a un.

### Les six facteurs

| Code | Poids | Exigé quand | Calcul du score (0-100) | Confiance |
|---|---|---|---|---|
| `qualifications` | 30 | `certifications_requises` non vide **ou** `qualification_requise` | Moyenne des sous-parties présentes : part des certifications trouvées (même rapprochement textuel que `compute_verdict`) ; qualification : 75 si un domaine de `classifications` correspond (classe/catégorie non vérifiable), 0 sinon. | haute ; moyenne si seule la qualification compte |
| `capacite_financiere` | 20 | `chiffre_affaires_minimum_exige` | `min(1, CA / exigé) × 100` ; CA non renseigné → 0 et action « renseigner le CA ». | haute ; faible si CA absent |
| `references` | 20 | `nombre_references_similaires_exige` **ou** au moins une référence au profil (on mesure alors la seule proximité) | Voir ci-dessous. | haute / moyenne (embeddings), faible (mots-clés) |
| `equipe` | 15 | `profils_requis` non vide | Part des profils requis couverts par un CV actif : poste ou spécialité proche **et** `annees_experience ≥ annees_experience_min` ; diplôme non comparé (formulations trop libres). | moyenne |
| `conformite_administrative` | 10 | toujours (sauf profil absent) | Part des éléments présents : ICE, RC, IF, CNSS au profil ; attestation fiscale en document permanent et non expirée (`date_validite`). | haute |
| `proximite` | 5 | `region` ou `ville` de l'AO connue **et** ville du profil renseignée | 100 si la ville du profil figure dans `ville`/`region` de l'AO (comparaison normalisée, accents et casse ignorés), sinon 40 (l'éloignement ne disqualifie pas). | faible (aucun référentiel ville → région) |

### Références par similarité

1. Texte de l'AO : `contexte.objet`, à défaut le titre scrapé.
2. Candidats : chaque `extra.references_similaires[i].intitule` du profil, et
   les passages Qdrant de `offria_kb_{org_id}` filtrés sur
   `doc_type = "reference_realisation"` (top 10).
3. Similarité cosinus via `mistral-embed` (`RagService._embed`). Les embeddings
   des intitulés du profil sont mis en cache Redis (`fit:emb:{sha1(texte)}`,
   30 jours) : un intitulé ne coûte qu'un appel, une fois.
4. Une référence est « proche » si cosinus ≥ **0,80** (seuil initial, à
   recalibrer sur 10-20 paires réelles avant de clore le chantier ; valeur en
   constante, pas en dur dans le calcul).
5. Score : si `N` références exigées, `min(1, proches / N) × 100` ; sinon, la
   meilleure similarité ramenée sur 0-100.
6. **Mode dégradé** (embeddings indisponibles : clé absente ou invalide,
   Mistral ou Qdrant injoignable) : recouvrement de mots significatifs
   (normalisés, mots vides retirés) entre l'objet et les intitulés, confiance
   `faible`, `methode_references: "mots_cles"`. Aucune erreur ne remonte au
   client pour cette raison.

Temps de réponse visé : < 2 s avec embeddings (1 appel pour l'objet de l'AO,
les intitulés étant en cache).

## Étape 3 -- routes

- `POST /ao/eligibility-check` : payload étendu, champs **optionnels**
  (`objet`, `region`, `ville`) ; réponse = réponse actuelle **plus**
  `fit_score`. Un appelant qui ne lit que `verdict` / `raisons` / `details` ne
  voit aucune différence.
- ao-watcher `POST /aos/{id}/verdict` : transmet `objet` (titre scrapé),
  `region`, `ville` ; `VerdictOut` gagne `fit_score: dict | None`.
- `GET /ao/{ao_id}/fit-score` : pour un AO du pipeline (`appels_offres`,
  `analyse_json` local à l'org). 404 si l'AO n'appartient pas à l'org, 409 si
  pas encore analysé. `Depends(get_current_user)`.
- Étape « Décision » du mode accompagné (`ao_routes.py:746`) : le contexte
  transmis à l'assistant inclut le détail des facteurs, pas seulement le verdict.

## Check when done

- Tests unitaires de `FitScoreService` (`tests/unit/`) : facteurs écartés et
  renormalisation, barrière (certification manquante → `non_eligible` avec un
  score non nul), qualification seule jamais bloquante, CA absent, aucun
  facteur exigé → `score: null`, mode dégradé sans clé.
- `POST /ao/eligibility-check` sans les nouveaux champs répond exactement comme
  avant, plus `fit_score`.
- Réindexation faite : un document « Référence de réalisation » est retrouvé
  par un filtre `doc_type = "reference_realisation"` dans Qdrant, et le
  réindexer deux fois ne double pas ses points.
- `GET /ao/{id}/fit-score` : 401 sans jeton, 404 sur l'AO d'une autre org
  (vérifié avec un second compte réel).
