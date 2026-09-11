# ADJUJA : Architecture Technique

_Dernière mise à jour : 2026-05-17 Refonte pipeline Phase 4 (décisions architecturales finales)_

---

## 1. Vision produit

ADJUJA est une plateforme B2B SaaS qui aide les entreprises marocaines à répondre aux appels d'offres publics. Le concept central est le **pipeline "minimal clicks"** : l'utilisateur uploade le CPS + RC (et tout autre document disponible), le système produit automatiquement un dossier complet prêt à soumettre sans autre intervention manuelle.

**Différenciation compétitive :** chaque organisation dispose d'une base de connaissance privée (`kb_{org_id}`) qui s'enrichit automatiquement après chaque pipeline réussi. Plus une organisation utilise la plateforme, plus ses offres sont différenciées et alignées sur son propre style. C'est le vrai moat du produit.

---

## 2. Schéma général : infrastructure complète

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          NAVIGATEUR (React)                             │
│                                                                         │
│  Tab Dashboard   │  Tab Appels d'offres  │  Tab Outils                 │
│  (stats, histo)  │  (pipeline auto)      │  (signatures standalone)    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTPS / REST + polling statut
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             NGINX                                       │
│                   Reverse proxy + terminaison TLS                       │
└────────────┬──────────────────────────────────┬─────────────────────────┘
             │ /api/*                           │ /rag/*
             ▼                                  ▼
┌────────────────────────────┐      ┌───────────────────────┐
│      FastAPI Backend       │      │    RAG ETL Service    │
│         port 8000          │      │       port 8001       │
│                            │      │                       │
│  Auth JWT (login, Google)  │      │  Indexation Qdrant    │
│  Routes :                  │      │  kb_global +          │
│  /ao              (Phase 4)│      │  kb_{org_id}          │
│  /marches                  │      └──────────┬────────────┘
│  /offre-technique          │                 │ vecteurs
│  /filler                   │                 ▼
│  /signing                  │      ┌───────────────────────┐
│  /history                  │      │        Qdrant         │
│  /company-profile          │      │  kb_global            │
└────────────┬───────────────┘      │  kb_{org_id}          │
             │ dispatch tâches      └───────────────────────┘
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CELERY WORKERS                                   │
│                                                                         │
│  Worker IO  (concurrency=4) : LLM calls, analyse, offre technique       │
│  Worker CPU (concurrency=2) : filler, signing, compilation ZIP          │
│                                                                         │
│  Chaîne principale :                                                    │
│    task_classify_uploads     ← détection hybride (keywords + LLM)       │
│    task_analyze_ao_context   ← LLM lit CPS + RC ensemble                │
│    task_build_pipeline       ← construit le groupe dynamique            │
│    task_generate_note_metho  ← offre_technique_service + RAG obligatoire│
│    task_fill_documents       ← filler sur TOUS les docs uploadés        │
│    task_sign_and_compile     ← signing_service + ZIP final              │
│    task_index_results        ← enrichissement kb_{org_id} post-pipeline │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
              ┌────────────────┼──────────────────┐
              ▼                ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PostgreSQL    │ │      MinIO      │ │      Redis      │
│                 │ │                 │ │                 │
│  users          │ │  ao/{ao_id}/    │ │  db=0 : cache   │
│  appels_offres  │ │    source/      │ │    CPS/RC       │
│  ao_documents   │ │    technique/   │ │    dedup SHA256 │
│  company_profiles│ │    financier/   │ │  db=1 : broker  │
│  staff_cvs      │ │    administratif│ │    Celery tasks │
│  marches (legacy)│ │    output/      │ │  db=2 : backend │
│  *_jobs (legacy) │ │  profile/       │ │    Celery results│
│  kb_documents   │ │  cvs/           │ └─────────────────┘
└─────────────────┘ └─────────────────┘
```

---

## 3. Flux utilisateur : pipeline "Minimal Clicks"

```
ÉTAPE 1 : Authentification
  POST /auth/login → JWT HS256 (7 jours) → localStorage

ÉTAPE 2 : Création de l'AO
  POST /api/v1/ao
    Body : { reference, acheteur, objet, custom_instructions? }
    → INSERT appels_offres (statut: "brouillon")

ÉTAPE 3 : Upload multi-fichiers
  POST /api/v1/ao/{id}/upload-multiple (multipart N fichiers)
  Tous les fichiers → MinIO ao/{ao_id}/source/
  Chaque fichier → INSERT ao_documents (origine: "upload", doc_type: "non_classe")

ÉTAPE 4 : Lancement du pipeline
  POST /api/v1/ao/{id}/start-pipeline
  → Vérification profil complet (company_profiles)
  → UPDATE statut="en_analyse"
  → chain(classify → analyze → build_pipeline).delay()
  → Frontend poll GET /ao/{id}/status toutes les 2s

ÉTAPE 5 : Pipeline Celery (arrière-plan)

  ── Séquence complète ──────────────────────────────────────────────────

  chain(
    task_classify_uploads(ao_id),         ← 5%
    task_analyze_ao_context(ao_id),       ← 10-20%
    task_build_pipeline(ao_id),           ← dispatch dynamique
  )

  ── Phase B : Traitement parallèle ────────────────────────────────────

  chord(
    group(
      task_generate_note_metho(ao_id),    ← 30-50% (LLM ~3 min, RAG obligatoire)
      task_fill_documents(ao_id),         ← 55-70% (filler sur TOUS les uploads)
    ),
    task_sign_and_compile(ao_id)          ← 85-99%
  )

  ── Phase C : Enrichissement ──────────────────────────────────────────

  task_index_results(ao_id)              ← 100% + indexation kb_{org_id}

ÉTAPE 6 : Résultats
  GET /api/v1/ao/{id}
  → Documents par dossier (technique / financier / administratif)
  → Presigned URLs MinIO valides 15 min
  → Bouton ZIP : tout en un clic
```

---

## 4. Modèle de données PostgreSQL

```sql
appels_offres
  id                UUID PK
  org_id            VARCHAR(36)        -- user.id si pas d'org (pas de FK)
  user_id           UUID FK users.id
  reference         VARCHAR(255)
  acheteur          VARCHAR(255)
  objet             TEXT
  statut            VARCHAR(50)        -- brouillon | en_analyse | en_traitement | termine | erreur
  pipeline_pct      INT DEFAULT 0      -- 0 à 100
  analyse_json      JSONB              -- sortie task_analyze_ao_context
  custom_instructions TEXT             -- NOUVEAU : instructions spécifiques à cet AO
                                       -- injectées dans tous les prompts du pipeline
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
  erreur_message    TEXT

ao_documents
  id          UUID PK
  ao_id       UUID FK appels_offres.id  ON DELETE CASCADE
  dossier     VARCHAR(30)    -- source | technique | financier | administratif | output
  doc_type    VARCHAR(100)   -- cps | rc | note_metho | acte_engagement |
                             -- bordereau | declaration_honneur | autre | zip_final
  origine     VARCHAR(20)    -- upload | genere | rempli | signe
  statut      VARCHAR(20)    -- en_attente | traite | erreur
  minio_key   VARCHAR(512)
  nom_fichier VARCHAR(255)
  taille_octets INT
  created_at  TIMESTAMPTZ

company_profiles
  org_id              VARCHAR(36) PK
  nom_entreprise      VARCHAR(255)
  forme_juridique     VARCHAR(100)
  ice                 VARCHAR(50)
  rc                  VARCHAR(50)
  gerant_nom          VARCHAR(255)
  gerant_prenom       VARCHAR(255)
  gerant_cin          VARCHAR(50)
  capital_social      VARCHAR(50)
  adresse             TEXT
  ville               VARCHAR(100)
  telephone           VARCHAR(50)
  cnss                VARCHAR(50)
  if_fiscal           VARCHAR(50)
  signature_key       VARCHAR(512)   -- MinIO : image signature
  cachet_key          VARCHAR(512)   -- MinIO : image cachet
  logo_key            VARCHAR(512)   -- MinIO : logo
  custom_instructions TEXT           -- NOUVEAU : style et tonalité globaux de l'org
                                     -- (toujours injectés, en complément des instructions AO)
  updated_at          TIMESTAMPTZ

staff_cvs
  id         UUID PK
  org_id     VARCHAR(36)
  nom_prenom VARCHAR(255)
  poste      VARCHAR(100)
  cv_key     VARCHAR(512)
  created_at TIMESTAMPTZ
```

**Règle d'injection des instructions :**

```
instructions_finales = [
  company_profiles.custom_instructions,   ← style global de l'org (toujours)
  appels_offres.custom_instructions,      ← instructions spécifiques à cet AO
]
→ concaténées et injectées dans TOUS les prompts LLM du pipeline
```

---

## 5. task_analyze_ao_context Coeur du pipeline

Lit **CPS et RC ensemble**. Le RC est prioritaire pour la liste des documents requis.

**Sortie : `analyse_json` (JSONB)**

```json
{
  "type_marche": "services",
  "lots": [{ "numero": 1, "intitule": "...", "montant_estimatif": 500000 }],

  "source_cps": {
    "contexte_technique": "...",
    "exigences_techniques": ["ISO 9001", "3 références similaires"],
    "methodologie_attendue": "Diagnostic + Plan + Suivi"
  },

  "source_rc": {
    "date_limite": "2026-06-15T12:00:00",
    "langue": "fr",
    "caution_provisoire": "1%",
    "presentation": "technique_financier_separes"
  },

  "criteres_ponderation": {
    "methodologie": { "poids": 50, "source": "rc" },
    "prix": { "poids": 30, "source": "rc" },
    "experience": { "poids": 20, "source": "rc" }
  },

  "documents_requis": [
    {
      "type": "note_metho",
      "dossier": "technique",
      "obligatoire": true,
      "a_signer": false
    },
    {
      "type": "acte_engagement",
      "dossier": "financier",
      "obligatoire": true,
      "a_signer": true
    },
    {
      "type": "bordereau",
      "dossier": "financier",
      "obligatoire": true,
      "a_signer": false
    },
    {
      "type": "declaration_honneur",
      "dossier": "administratif",
      "obligatoire": true,
      "a_signer": true
    },
    {
      "type": "attestation_fiscale",
      "dossier": "administratif",
      "obligatoire": true,
      "externe": true
    },
    {
      "type": "attestation_cnss",
      "dossier": "administratif",
      "obligatoire": true,
      "externe": true
    }
  ],

  "strategie_offre_technique": {
    "angle_principal": "méthodologie structurée en 3 phases",
    "points_forts_a_valoriser": ["expérience sectorielle", "équipe dédiée"],
    "note_guidance": "Insister sur méthodo  critère pondéré à 50%"
  }
}
```

---

## 6. Classification des documents (task_classify_uploads)

**Stratégie hybride en deux passes :**

```
Passe 1  Keywords (gratuite, < 50ms par doc)
  detect_document_type(text) depuis filler_settings.DOCUMENT_TYPE_KEYWORDS
  → score élevé et non-ambigu → classifié directement

Passe 2  LLM (seulement si ambigu ou score faible)
  Mistral + filename + 3 premières pages
  → classification robuste pour PDFs complexes

Mapping classification → dossier :
  cps / rc          → source/
  acte_engagement   → financier/
  bordereau         → financier/
  declaration_honneur → administratif/
  attestation_*     → administratif/
  autre             → source/ (par défaut)
```

La classification sert à l'organisation MinIO et à l'affichage. Elle ne bloque pas le filler qui re-segmente lui-même chaque document.

---

## 7. Remplissage des documents (task_fill_documents)

**Principe fondamental :** passer TOUS les documents uploadés au filler, pas seulement les templates pré-classifiés. Le `filler_orchestrator.run()` segmente chaque PDF et détecte lui-même ce qui est remplissable dedans.

```python
# Correct : tous les uploads passent au filler
docs = SELECT * FROM ao_documents
       WHERE ao_id = ? AND origine = 'upload' AND minio_key IS NOT NULL

for doc in docs:
    pdf_bytes = mc.get_file_bytes(doc.minio_key)
    result = await run_filler(
        pdf_bytes=pdf_bytes,
        filename=doc.nom_fichier,
        company_info=build_company_info(profile),  # depuis DB
        lots=lots,
        api_key=settings.mistral_api_key,
        org_id=org_id,
        ao_id=ao_id,               # MinIO → ao/{ao_id}/financier/ ou /administratif/
    )
```

**Cas couverts par le filler :**

- Templates séparés uploadés (acte d'engagement .docx, bordereau .pdf)
- Templates en annexe du CPS (le segmenter les trouve sur les bonnes pages)
- Templates en annexe du RC (idem)
- PDFs scannés (Pixtral vision)
- PDFs texte natif (Mistral texte)

**company_adapter.py migration JSON → DB :**

```python
# Avant (à supprimer) : lit company_defaults.json
def get_company_info() -> dict

# Après : accepte le profil DB directement
def get_company_info(profile: CompanyProfile | None = None) -> dict
    # Si profile fourni → construit depuis DB
    # Sinon → fallback JSON (compatibilité legacy filler standalone)
```

---

## 8. Génération note méthodologique (task_generate_note_metho)

**RAG obligatoire.** Aucune section ne se génère sans RAG.

```
Requête RAG pour chaque section :
  search(kb_global)    ← CPS publics marocains, modèles sectoriels
  search(kb_{org_id})  ← offres passées de l'org (enrichi après chaque pipeline)
  merge scores → top-k → injecté dans les prompts

Instructions injectées dans l'ordre :
  1. strategie_offre_technique depuis analyse_json
  2. criteres_ponderation (poids exacts → adapter l'emphase)
  3. company_profiles.custom_instructions (style global org)
  4. appels_offres.custom_instructions (spécifique à cet AO)
  5. Contextes RAG par section
```

**Fix MinIO (bug actuel) :** `offre_technique_service._upload_outputs()` doit retourner la `minio_key` en plus de l'URL presigned. La tâche utilise la clé directement pour re-copier vers `ao/{ao_id}/technique/` sans parser d'URL.

---

## 9. Enrichissement RAG (task_index_results)

Tâche finale, après `task_sign_and_compile`. Lance l'indexation dans `kb_{org_id}` :

**Ce qui est indexé :**

- Sections de la note méthodologique générée (chunked par section)
- Résumé de l'analyse CPS + RC (`analyse_json.strategie_offre_technique`)
- Métadonnées : secteur, type marché, critères pondération

**Ce qui n'est pas indexé :**

- Documents remplis (AE, bordereau, DSH) données de formulaire, pas de connaissance
- ZIP final
- Sources originales (CPS/RC de l'acheteur)

**Impact :**

| Nb AOs traités | Effet sur les prochaines générations                      |
| -------------- | --------------------------------------------------------- |
| 0              | kb_global uniquement, résultat générique                  |
| 3-5            | Style émergent, sections plus pertinentes pour le secteur |
| 10+            | Différenciation forte, ton et angle propres à l'org       |

---

## 10. Différenciation par organisation

**Problème fondamental :** sans mécanisme de différenciation, deux organisations qui soumettent au même AO obtiendraient la même note méthodologique. Inacceptable pour un produit B2B.

**Solution en trois couches (ordre de priorité) :**

```
Couche 1  kb_{org_id} (long terme, auto-enrichi)
  → Différenciation basée sur l'historique réel des offres de l'org
  → Neutre au départ, puissant après 5+ AOs

Couche 2  company_profiles.custom_instructions (immédiat, global)
  → Renseigné une seule fois dans le profil
  → Ex: "Toujours insister sur ISO 9001, notre proximité Casablanca,
         notre équipe senior dédiée (jamais junior), planning en 3 phases"
  → Injecté dans TOUS les pipelines de l'org

Couche 3  appels_offres.custom_instructions (immédiat, par AO)
  → Renseigné à la création ou avant lancement du pipeline
  → Ex: "Pour ce marché, mettre en avant notre expérience ANEF 2023,
         insister sur la formation présentielle, budget serré"
  → Remplace et complète les instructions globales pour cet AO précis
```

---

## 11. Structure MinIO

```
{org_id}/
  profile/
    signature.png
    cachet.png
    logo.png
  cvs/
    {staff_id}_{nom}.pdf

  ao/{ao_id}/
    source/           ← bruts uploadés par l'user (CPS, RC, templates, etc.)
    technique/        ← note_methodologique.docx + .pdf, DSH signée, CVs
    financier/        ← bordereau.xlsx + .pdf, acte_engagement_signe.pdf
    administratif/    ← CPS signé, RC, slots attestations externes
    output/           ← dossier_complet.zip

  marches/{marche_id}/  ← legacy Phase 3, inchangé
```

---

## 12. Cache Redis

```
db=0  cache applicatif
  cache:cps:{sha256}    TTL 24h    CPSContext JSON
  cache:rc:{sha256}     TTL 24h    RCContext JSON
  minio:dedup:{sha256}  TTL 90j    clé MinIO (déduplication)

db=1  Celery broker (critique)
db=2  Celery result backend (critique)
```

---

## 13. Base de connaissance Qdrant

```
kb_global            ← CPS publics marocains, modèles sectoriels (seedé offline)
kb_{org_id}          ← offres passées de l'org (enrichi par task_index_results)

Requête lors de task_generate_note_metho :
  merge(search(kb_global), search(kb_{org_id})) → top-k → prompts sections
```

---

## 14. Authentification

JWT HS256, bcrypt, Google OAuth. `org_id = current_user.org_id or current_user.id`. Jamais `"default"`. Pas de FK de `org_id` vers `organizations`.

---

## 15. Infrastructure Docker

```yaml
services:
  nginx        # reverse proxy, TLS
  api          # FastAPI backend (8000)
  celery-io    # worker IO : LLM, analyse, note métho (concurrency=4)
  celery-cpu   # worker CPU : filler, signing, ZIP, indexation (concurrency=2)
  rag-etl      # indexation Qdrant (8001)
  postgres
  minio
  qdrant
  redis
```

---

## 16. Réutilisation code existant

| Service                         | Changement requis                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `filler_service.py`             | Ajouter param `company_info` (dict), passer `ao_id` pour chemin MinIO               |
| `filler/company_adapter.py`     | `get_company_info(profile=None)` : DB si profile fourni, JSON sinon                 |
| `offre_technique_service.py`    | Retourner `minio_key` dans `OffreTechniqueOutputFile`, passer `custom_instructions` |
| `signing_service.py`            | Zéro changement                                                                     |
| `rag_service.py`                | Ajouter méthode `index_document(org_id, text, metadata)`                            |
| `task_classify_uploads`         | Ajouter passe LLM si score keywords ambigu                                          |
| `task_fill_documents`           | Passer TOUS les uploads (plus de filtre par doc_type)                               |
| `task_generate_note_metho`      | Injecter custom_instructions (org + AO)                                             |
| Nouvelle : `task_index_results` | Indexer note métho dans kb\_{org_id}                                                |

---

## 17. Ordre d'implémentation (état 2026-05-17)

```
Phase 4a  Socle Celery                              [TERMINE]
Phase 4b  Upload + Classification                   [TERMINE]
Phase 4c  Analyse CPS + RC (task_analyze_ao_context)[TERMINE]
Phase 4d  Note métho + Filler                       [PARTIEL  bugs identifiés]

  PROCHAINS CORRECTIFS :
  [ ] Fix task_fill_documents : filler sur TOUS uploads (pas que templates classifiés)
  [ ] Fix company_adapter : get_company_info(profile) depuis DB
  [ ] Fix task_generate_note_metho : retourner minio_key, pas URL presigned
  [ ] Fix task_classify_uploads : ajouter passe LLM si score ambigu
  [ ] Ajouter custom_instructions sur AppelOffre (migration DB)
  [ ] Injecter custom_instructions (org + AO) dans task_generate_note_metho
  [ ] Injecter custom_instructions dans task_fill_documents (prompts filler)
  [ ] Nouvelle tâche task_index_results (enrichissement kb_{org_id})

Phase 4e  Signature + Compilation                   [TERMINE  fonctionnel]
Phase 4f  Frontend                                  [PARTIEL]

  [ ] Champ custom_instructions dans formulaire création AO
  [ ] Champ custom_instructions dans company_profiles (onglet profil)
  [ ] Vue résultats : 3 dossiers organisés + download individuel + ZIP
  [ ] Slots documents externes (attestation fiscale, CNSS)
```

---

## 18. Décisions techniques

| Problème                                    | Solution retenue                                               |
| ------------------------------------------- | -------------------------------------------------------------- |
| Pas de différenciation entre orgs           | kb\_{org_id} enrichi + custom_instructions (2 niveaux)         |
| Templates parfois dans CPS, parfois séparés | Filler sur TOUS les uploads (segmentation auto)                |
| company_adapter lisait JSON                 | get_company_info(profile) depuis DB company_profiles           |
| MinIO copy fragile (URL presigned parsée)   | Retourner minio_key directement depuis offre_technique_service |
| Classification ambiguë sur PDFs complexes   | Hybride : keywords → LLM si score faible                       |
| RAG optionnel → offres génériques           | RAG obligatoire dans task_generate_note_metho                  |
| 429 Mistral                                 | Retry 10/30/60s                                                |
| Planning vide DOCX                          | json_mode + \_DEFAULT_PHASES fallback                          |
| Récomputing inutile                         | Cache Redis SHA256 TTL 24h                                     |
| Déduplication fichiers                      | upload_dedup() hash SHA256 MinIO                               |
| org_id FK violation                         | Pas de FK, fallback user.id (migration 004)                    |
| Traitement lourd sous charge                | Celery workers IO + CPU                                        |
| asyncio loop conflict Celery                | engine.dispose() dans \_run_async() finally                    |
| Postgres hors réseau workers                | ao_network sur tous les services docker                        |
