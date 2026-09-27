## Deliverable

Un score de compatibilité personnalisé /100 par AO, remplaçant la lecture brute
du verdict Go/No-Go par une décomposition pondérée en 6 facteurs, chacun avec
son propre score, sa confiance, une justification et, quand il y en a une,
l'action qui l'améliore (« Renseigner votre chiffre d'affaires »). Inspiré du
« Fit Score personnalisé » de Bidtndr, adapté à ce qu'Adjuja a en base.

Le score reste continu même quand l'éligibilité est bloquée : une exigence
bloquante manquante affiche « Non éligible » au-dessus du score, elle ne le
remet pas à zéro.

## Décisions de l'utilisateur (2026-09-27)

1. **Périmètre V1 : règles + similarité IA pour les références.** Les
   références sont rapprochées de l'objet de l'AO par embeddings
   (`mistral-embed`), dans le profil et dans les documents « Référence de
   réalisation » indexés dans Qdrant. Pas de référentiel équipements en V1.
2. **Pondérations « équilibrées »** : qualifications & certifications 30 %,
   capacité financière 20 %, références 20 %, équipe 15 %, conformité
   administrative 10 %, proximité 5 %.
3. **Exigence absente = facteur écarté.** Un facteur que l'AO n'exige pas est
   affiché « non exigé » et le score est recalculé sur les facteurs restants
   (poids renormalisés). Le score ne reflète que des exigences réelles.
4. **Remplace l'affichage du verdict, garde la barrière.** Le score et son
   détail remplacent le bloc Go/No-Go (panneau de veille, étape « Décision » du
   mode accompagné). Les échecs bloquants de `compute_verdict` restent la
   barrière d'éligibilité. `POST /ao/eligibility-check` garde sa forme de
   réponse (champ ajouté, rien retiré).

## État réel vérifié (2026-09-27)

Corrige plusieurs affirmations de la première version de ce fichier.

- **Ce qui bloque aujourd'hui** (`compute_verdict`, `hard_fails`) : CA inférieur
  au minimum exigé, certification exigée absente, nombre de références
  inférieur au nombre exigé. **La qualification n'est jamais bloquante** (elle ne
  produit qu'un avertissement), contrairement à ce qu'écrivait la version
  précédente.
- `compute_verdict` est appelé par `POST /ao/eligibility-check` (lui-même appelé
  par ao-watcher, `router.py:270`, pour le panneau de veille) et par l'étape
  « Décision » du mode accompagné (`ao_routes.py:746`).
- `analyse_json` (ao-watcher, `analysis.py`) contient : `contexte.objet`,
  `certifications_requises`, `qualification_requise`,
  `chiffre_affaires_minimum_exige`, `nombre_references_similaires_exige`,
  `profils_requis` (poste, spécialité, diplôme, années d'expérience),
  `documents_requis`, `montant_caution`. **Aucun champ de zone d'exécution** :
  la proximité utilise `region` / `ville` de l'AO scrapé.
- Le **profil** porte déjà tout le reste : `extra.certifications`,
  `extra.classifications`, `extra.chiffre_affaires_moyen` (exposé dans le
  formulaire depuis le 2026-09-27), `extra.references_similaires`, ICE / RC /
  IF / CNSS, ville ; les CV sont dans `staff_cvs`, les pièces dans
  `company_documents` (avec `date_validite`).
- **RAG** : les documents d'entreprise en PDF sont indexés dans
  `offria_kb_{org_id}` (`company_documents_routes.py:166`). Le fit score lit
  **cette** collection directement ; il ne dépend donc pas du défaut de
  lecture du chatbot (collection globale `offria_kb`). Il dépend en revanche de
  deux défauts d'indexation déclarés le 2026-09-27 dans `bugs-connus.md`
  (type écrasé en `note_metho`, identifiants de points instables).
- **Clés IA factices en dev** (voir « Questions ouvertes » du tracker) : sans
  vraie `MISTRAL_API_KEY`, pas d'embeddings. Le facteur « Références » a donc un
  mode dégradé par mots-clés, signalé « confiance faible » (voir `api.md`).

## Depends on

- `app/services/eligibility_service.py::compute_verdict` (barrière, inchangée).
- `app/services/rag_service.py` (`_embed`, client Qdrant, collection
  `offria_kb_{org_id}`), après correction des deux défauts d'indexation.
- ao-watcher `POST /aos/{id}/verdict` (relais vers l'app principale).
- `CompanyProfile`, `StaffCv`, `CompanyDocument` (aucune migration).
- Front : `AoDetailPanel` (veille), étape « Décision » du mode accompagné,
  réglages d'entreprise pour les actions « compléter ».

## Build order

1. `api.md` -- correctifs d'indexation RAG, `FitScoreService`, champ
   `fit_score` ajouté à `POST /ao/eligibility-check`, relais ao-watcher,
   `GET /ao/{ao_id}/fit-score` pour les AO du pipeline.
2. `client.md` -- composant `FitScore` (score, barrière, 6 facteurs, actions),
   à la place du bloc Go/No-Go dans les deux écrans.

## Check when the feature is done

- Sur un AO réel analysé et un profil réel, le score global est la moyenne
  pondérée des seuls facteurs exigés, poids renormalisés (vérifiable à la main
  depuis la réponse).
- Une certification exigée absente affiche « Non éligible » même si le score
  est haut ; une qualification non trouvée n'affiche jamais « Non éligible ».
- Avec une vraie clé Mistral et une référence proche indexée, le facteur
  « Références » est calculé par similarité (confiance haute ou moyenne) ; sans
  clé, il bascule en mots-clés et l'écran le dit.
- Un AO sans aucune exigence extraite affiche un message clair plutôt qu'un
  score fabriqué.
- `api.md` et `client.md` passent chacun leurs propres vérifications.

## Hors V1

Référentiel équipements (7e facteur), préférence nationale / PME (aucune donnée
extraite aujourd'hui), zone d'exécution tirée du CPS, correspondance ville →
région (aucun référentiel de régions en base).
