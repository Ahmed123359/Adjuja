# Roadmap — RAG Pipeline Quality

Améliorations du pipeline RAG : alimentation de la knowledge base, indexation ETL, et qualité de la retrieval.

| # | Catégorie | Amélioration | Impact | Statut |
|---|-----------|-------------|--------|--------|
| 1 | KB | Ajouter présentation ABI Consulting dans `company/` | Très élevé | [x] |
| 2 | KB | Ajouter CVs équipe ABI Consulting dans `resources/` | Très élevé | [ ] |
| 3 | KB | Ajouter attestations clients dans `references/` | Très élevé | [ ] |
| 4 | ETL | Enrichissement payload — ajouter titre de section et numéro de page dans chaque chunk | Élevé | [ ] |
| 5 | ETL | Modèle d'embedding — passer de `text-embedding-3-small` à `text-embedding-3-large` | Élevé | [ ] |
| 6 | Retrieval | Reranker — top-20 Qdrant → LLM cheap → top-K pertinents | Très élevé | [x] |
| 7 | Retrieval | Query générée par LLM — 1 appel gpt-4o-mini par section pour produire une query de recherche ciblée à partir du texte AO complet | Très élevé | [x] |

---

## Détail des améliorations

### #1 — KB company/ : Présentation ABI Consulting
**Statut :** [x] FAIT — `knowledge_base/company/presentation_abi_consulting.md` créé.

---

### #2 — KB resources/ : CVs équipe ABI Consulting

**À créer :** `knowledge_base/resources/equipe_abi_consulting.md`

**Format recommandé :**
```markdown
## Hamid BABACHEIKH — Chef de Projet
- Formation : Ingénieur d'État en Agronomie, ENA Meknès (2013)
- Expérience : 10+ ans
- Compétences : supervision projets phytosanitaires, coordination terrain, arboriculture
- Langues : Arabe, Français, Anglais
```

**Bénéfice :** le RAG injecte les vrais profils dans "Moyens humains" → le LLM les structure en tableau sans inventer.

---

### #3 — KB references/ : Attestations clients

**À créer :** `knowledge_base/references/references_abi_consulting.md`

**Format recommandé :**
```markdown
## Mission ONSSA — Mise à niveau pépinières Marrakech-Safi (2025)
- Client : ONSSA — Direction Régionale Marrakech-Safi
- Périmètre : 825 pépinières, diagnostic phytosanitaire, 6 mois
- Livrables : 825 rapports individuels, 12 ateliers, rapport synthétique régional
```

---

### #4 — ETL : Enrichissement payload

**Problème actuel :** le payload d'un chunk ne contient que `content`, `doc_name`, `doc_type`, `rel_path`, `chunk_idx`. Aucun contexte sur la position dans le document.

**Solution :** extraire lors du chunking :
- le **titre de section** le plus proche au-dessus du chunk (ligne commençant par `#`, chiffre+point, majuscules)
- le **numéro de page** (si PDF)

**Bénéfice :** le contexte injecté devient "Section 3.2 — Méthodologie (page 12) : …" au lieu d'un extrait brut.

**Limites et risques :**

| Risque | Probabilité | Remarque |
|--------|-------------|----------|
| Titre de section non détecté (PDF mal formaté) | Moyen | Valeur `""` par défaut — pas d'erreur |
| Page incorrecte sur PDF en colonnes | Faible | Acceptable en V1 |
| Titres bruités (en-têtes répétés, numéros de page dans le texte) | Moyen | Heuristique peut se tromper |
| Aucun numéro de page pour `.txt`, `.md`, `.docx` | Certain | On stocke `null` — champ optionnel |
| Re-indexation complète obligatoire | Certain | Schéma payload change → recréer collection Qdrant |

---

### #5 — ETL : Modèle d'embedding

**Comparaison :**

| Modèle | Dimension | Coût / 1M tokens | Qualité FR technique |
|--------|-----------|------------------|----------------------|
| `text-embedding-3-small` | 1536 | $0.02 | Bonne |
| `text-embedding-3-large` | 3072 | $0.13 | Très bonne |

**À faire :** changer `EMBEDDING_MODEL` et `EMBEDDING_DIM` dans `config.py`, recréer la collection Qdrant, ré-indexer.

**Décision :** à faire après avoir mesuré la qualité actuelle sur des requêtes réelles.

---

### #6 — Retrieval : Reranker
**Statut :** [x] FAIT — implémenté dans `app/services/rag_service.py`.

Flux : Qdrant top-20 → `gpt-4o-mini` sélectionne les top-K pertinents → injecté dans le prompt de section.

**Limite clé :** si le bon chunk n'est pas dans le top-20 Qdrant, le reranker ne peut pas le rattraper → dépend de la qualité de la query et de l'embedding (#5).

---

### #7 — Retrieval : Query générée par LLM
**Statut :** [x] FAIT — implémenté dans `app/services/rag_service.py`, méthode `_build_query_for_section`.

**Solution :** 1 appel `gpt-4o-mini` par section qui lit l'AO complet et génère une query de recherche optimisée.

**Flux :**
```
AO complet + section_title
       ↓
   LLM Haiku/Mistral (~$0.0003/appel)
       ↓
"inspection sanitaire pépinières terrain Maroc attestations ONSSA certification qualité"
       ↓
   Qdrant top-20
       ↓
   Reranker → top-K injectés dans le prompt
```

**Prompt system :**
```
Tu es un assistant de recherche documentaire.
À partir du texte d'un appel d'offres et d'un nom de section,
génère une query de recherche courte (10-20 mots) pour retrouver
dans une base documentaire les extraits les plus pertinents
pour rédiger cette section. Retourne UNIQUEMENT la query, sans explication.
```

**Coût :** ~8 appels gpt-4o-mini × ~$0.0003 = **~$0.002 par génération** — négligeable.

**Risques :**

| Risque | Probabilité | Remarque |
|--------|-------------|----------|
| +8 appels LLM en parallèle | Certain | Latence absorbée par le parallélisme des sections |
| LLM génère une query hors sujet | Faible | Prompt simple + température 0 → très stable |
| LLM indisponible | Faible | Fallback silencieux sur `"{section_title} {ao_text[:300]}"` |
| Surcoût si beaucoup de générations | Faible | ~$0.002/génération → négligeable même à 1000 générations/mois |
