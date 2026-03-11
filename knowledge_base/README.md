# Base de connaissances — OffrIA

Ce dossier contient les documents internes de votre entreprise. Ils sont analysés automatiquement
au démarrage et utilisés pour enrichir la génération de réponses AO via RAG (Retrieval-Augmented Generation).

## Structure des dossiers

| Dossier           | Contenu recommandé |
|-------------------|--------------------|
| `company/`        | Documents légaux et institutionnels fixes (PV gérance, statuts, plaquette) |
| `references/`     | Attestations de référence clients, fiches projets réalisés |
| `templates/`      | Offres techniques passées : notes méthodologiques, plannings, évaluations |
| `resources/`      | Moyens humains et matériels : listes équipe, CVs, notes sur les moyens |
| `certifications/` | Certificats ISO, qualifications, accréditations, labels |

## Formats supportés

- `.txt` — texte brut
- `.md`  — Markdown
- `.pdf` — PDF (texte embarqué uniquement pour le RAG)
- `.docx` — Word

> **PDF scannés dans la knowledge_base** : l'indexation RAG nécessite du texte extractible.
> Les PDF scannés sans couche texte ne seront pas indexés par le service ETL.
> Pour les intégrer, convertissez-les d'abord en texte (`.txt` / `.md`) avant de les déposer ici.
>
> **PDF scannés comme AO** : pour importer un AO scanné dans l'interface, utilisez le bouton
> d'import PDF — l'OCR via GPT-4o extrait automatiquement le texte.

## Fonctionnement

1. Au démarrage du serveur, tous les documents sont chargés, découpés en chunks et indexés (BM25).
2. Lors de la génération d'une réponse AO, les chunks les plus pertinents pour chaque section sont récupérés.
3. Ces extraits sont injectés dans le prompt comme contexte documentaire additionnel.
4. Le LLM s'en sert pour enrichir la réponse avec des données réelles de l'entreprise.

## Reindexation

Pour forcer le rechargement des documents sans redémarrer le serveur, appelez :
```
POST /api/v1/rag/index
```
ou utilisez le bouton **Reindexer** dans l'interface.

## Exemple de structure

```
knowledge_base/
├── company/
│   ├── pv_gerance.pdf
│   └── statuts_societe.pdf
├── references/
│   ├── attestation_reference_client_a.pdf
│   └── attestation_reference_client_b.pdf
├── templates/
│   ├── note_methodologique_formation.pdf
│   └── note_methodologique_evaluation.pdf
├── resources/
│   ├── liste_equipe.pdf
│   └── note_sur_les_moyens.pdf
└── certifications/
    └── iso_9001.pdf
```
