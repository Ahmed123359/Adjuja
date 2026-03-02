# Base de connaissances — OffrIA

Ce dossier contient les documents internes de votre entreprise. Ils sont analysés automatiquement
au démarrage et utilisés pour enrichir la génération de réponses AO via RAG (Retrieval-Augmented Generation).

## Structure des dossiers

| Dossier           | Contenu recommandé |
|-------------------|--------------------|
| `references/`     | Références de projets passés (fiches clients, retours d'expérience, attestations) |
| `methodologies/`  | Documents de méthodes : approches techniques, processus qualité, frameworks |
| `certifications/` | Certificats ISO, qualifications, accréditations, labels |
| `company/`        | Plaquettes commerciales, présentation entreprise, profil corporate |
| `templates/`      | Réponses AO gagnantes (anonymisées), modèles de sections |

## Formats supportés

- `.txt` — texte brut
- `.md`  — Markdown
- `.pdf` — PDF (texte extractible)
- `.docx` — Word

> **Note** : les PDF scannés (images) ne sont pas supportés. Utilisez des PDF avec texte intégré.

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
├── references/
│   ├── projet_smart_city_casablanca_2023.txt
│   ├── refonte_si_banque_populaire.pdf
│   └── fiche_reference_ocp_2022.docx
├── methodologies/
│   ├── methode_conduite_changement.md
│   └── approche_agile_projets_publics.pdf
├── certifications/
│   └── iso_9001_2015.pdf
├── company/
│   ├── plaquette_commerciale.pdf
│   └── presentation_entreprise.md
└── templates/
    ├── reponse_ao_type_si.md
    └── offre_type_conseil.txt
```
