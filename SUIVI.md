# SUIVI OffrIA (ARCHIVÉ)

> **Obsolète depuis le 2026-07-18.** Ce fichier n'est plus tenu à jour. La trace vivante du
> projet est maintenant dans `context/progress-tracker.md`, avec la discipline
> de mise à jour associée dans `context/ai-workflow-rules.md`. Conservé ici
> uniquement pour l'historique des premières sessions.

## Branche courante : `feat/improve-methodology`

---

## Ce qui a été fait (par session)

### Session 1 Fondations (branches précédentes)

- Génération AO complète (brief + 8 sections en parallèle)
- Auth JWT (register/login/me), historique par user
- Rate limiting slowapi
- Export Word/PDF
- RAG Qdrant (optionnel)

### Session 2 Améliorations qualité (branche `feat/rate-limiting`)

- **Section "Présentation de notre entreprise" figée** : bypass LLM, lit directement `knowledge_base/company/presentation_abi_consulting.md`
  - Fichier : `app/services/generation_service.py` → `_STATIC_SECTIONS` dict
- **Fix max_tokens** : `_SECTION_MAX_TOKENS=1000` hardcodé remplacé par `request.max_tokens`
  - Fichier : `app/services/generation_service.py`
- **company_defaults.json** mis à jour avec les vraies données ABI Consulting (RC, ICE, adresse, expertises)
- **Export Word redesigné** aux couleurs ABI Consulting (BLUE=#1B3F6B, TEAL=#17A589)
  - Page de garde, sommaire avec numéros romains, header/footer par page
  - Fichier : `frontend/src/components/RightPanel.tsx` → `buildDocumentHTML()`
- **Logo ABI** placé dans `frontend/public/logo_abi.png` (TODO : l'intégrer dans le Word)
- **RAG ETL amélioré** :
  - Timeout par fichier (évite le blocage sur PDFs corrompus)
  - Logs détaillés par fichier (`[INDEX]`, `[OK]`, `[VIDE]`, `[TIMEOUT]`, `[ERREUR]`)
  - Fichier : `rag_service/etl.py`
- **.gitignore** : `knowledge_base/` et `data/` exclus

### Session 3 Préparation itération méthodologie (branche `feat/improve-methodology`)

- **`_DEV_SECTIONS`** ajouté dans `prompt_builder_service.py` :
  - `None` = toutes les sections (prod)
  - `["Notre approche méthodologique"]` = une seule section générée (dev)
  - Permet d'itérer vite sur un prompt sans attendre les 8 sections
- **Notebook R&D** créés dans `rd/rag/` :
  - `rag_test.ipynb` : test de recherche vectorielle dans Qdrant
  - `rag_evaluation.ipynb` : pipeline complet (extract → chunk → embed → store → search → rerank)

---

## TODO En cours / À faire

### Priorité 1 Méthodologie (branche `feat/improve-methodology`)

- [ ] Améliorer le prompt "Notre approche méthodologique" dans `prompt_builder_service.py`
- [ ] Tester avec différents AOs et comparer les résultats
- [ ] Remettre `_DEV_SECTIONS = None` avant de merger

### Priorité 2 Logo dans Word

- [ ] Intégrer `logo_abi.png` en base64 dans `buildDocumentHTML()` (RightPanel.tsx)
  - Actuellement : CSS approximation `/BI` en cercle
  - À faire : `fetch('/logo_abi.png')` → base64 → `<img src="data:image/png;base64,...">`

### Priorité 3 RAG

- [ ] Indexer les fichiers de `knowledge_base/` (lancer `POST /index`)
- [ ] Tester la pertinence des chunks récupérés sur un vrai AO
- [ ] Évaluer l'impact du RAG sur la qualité de génération

### Priorité 4 Qualité génération

- [ ] Parser AO par LLM (remplacer les regex)
- [ ] Gestion des échecs partiels (7/8 sections si 1 timeout)
- [ ] Retry automatique avec backoff exponentiel
- [ ] Cohérence inter-sections (passe LLM finale)

---

## Décisions techniques importantes

| Décision                                  | Raison                                                   | Fichier                     |
| ----------------------------------------- | -------------------------------------------------------- | --------------------------- |
| Section "Présentation" figée (pas de LLM) | Contenu exact ABI Consulting, pas de hallucination       | `generation_service.py`     |
| `_DEV_SECTIONS` variable (pas hardcodé)   | Changer de section à tester sans modifier la logique     | `prompt_builder_service.py` |
| ETL timeout 30s/fichier                   | PDFs scannés bloquaient pypdf indéfiniment               | `rag_service/etl.py`        |
| knowledge_base/ dans .gitignore           | Fichiers confidentiels entreprise                        | `.gitignore`                |
| max_tokens depuis request                 | Était hardcodé à 1000, ignorait le paramètre utilisateur | `generation_service.py`     |

---

## Variables DEV à remettre en prod avant merge

| Fichier                                  | Variable        | Valeur DEV                          | Valeur PROD |
| ---------------------------------------- | --------------- | ----------------------------------- | ----------- |
| `app/services/prompt_builder_service.py` | `_DEV_SECTIONS` | `["Notre approche méthodologique"]` | `None`      |
