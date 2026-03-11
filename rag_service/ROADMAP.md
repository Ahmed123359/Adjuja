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
| 7 | Retrieval | Query structurée — remplacer texte brut tronqué par champs parsés (titre + acheteur + critères) | Élevé | [ ] |
| 8 | Retrieval | Query différenciée par section — template de query spécifique par section | Élevé | [ ] |
| 9 | Retrieval | Query générée par LLM — 1 appel Haiku/Mistral par section pour produire une query de recherche ciblée à partir du texte AO complet | Très élevé | [x] |

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

**Limite clé :** si le bon chunk n'est pas dans le top-20 Qdrant, le reranker ne peut pas le rattraper → dépend de la qualité de la query (#7) et de l'embedding (#5).

---

### #7 — Retrieval : Query structurée

**Problème actuel :** `generation_service.py` ligne 131 :
```python
ao_context = f"{ao_parse.titre} {ao_parse.description_globale[:200]}"
```
Les champs parsés (`acheteur`, `criteres`, `type_marche`) ne sont pas utilisés dans la query RAG.

**Solution :**
```python
criteres_str = " ".join(c.nom for c in ao_parse.criteres)
ao_context = f"{ao_parse.titre} {ao_parse.acheteur} {ao_parse.type_marche.value} {criteres_str}"
```

**Bénéfice :** la query reflète les vrais enjeux de l'AO plutôt que les 200 premiers chars du texte brut.

---

### #8 — Retrieval : Query différenciée par section

**Problème actuel :** toutes les sections utilisent la même query `"{section_title} {ao_context}"`.

**Solution :** template de query par section dans `app/services/rag_service.py` :
```python
_SECTION_QUERY_TEMPLATE: dict[str, str] = {
    "Présentation de notre entreprise":       "présentation cabinet expertise domaine {ao_context}",
    "Moyens humains et techniques mobilisés": "profils équipe CVs compétences experts {ao_context}",
    "Références similaires":                  "références missions similaires attestations clients {ao_context}",
    "Notre approche méthodologique":          "méthodologie phases démarche outils {ao_context}",
    "Planning prévisionnel":                  "planning jalons livrables calendrier {ao_context}",
    "Conclusion et engagements":              "engagements valeur ajoutée différenciation {ao_context}",
}
```

**Bénéfice :** Qdrant reçoit des requêtes orientées sur ce que chaque section cherche → meilleure précision des top-20 candidats avant reranking.

---

### #9 — Retrieval : Query générée par LLM

**Problème avec #7 et #8 :** même avec des champs parsés ou des templates, la query reste générique.
Les mots-clés vraiment utiles (domaine exact, contraintes terrain, livrables spécifiques) sont **au milieu du texte de l'AO**, pas dans l'en-tête.

**Solution :** 1 appel LLM léger (Haiku ou Mistral) par section qui lit l'AO complet et génère une query de recherche optimisée.

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

**Implémentation :** dans `app/services/rag_service.py`, méthode `_build_query_for_section(section_title, ao_text)`.

**Coût :** ~8 appels Haiku × $0.0003 = **~$0.002 par génération** — négligeable.

**Risques :**

| Risque | Probabilité | Remarque |
|--------|-------------|----------|
| +8 appels LLM en parallèle | Certain | Latence absorbée par le parallélisme des sections |
| LLM génère une query hors sujet | Faible | Prompt simple + température 0 → très stable |
| Modèle Haiku indisponible | Faible | Fallback sur template statique (#8) |
| Surcoût si beaucoup de générations | Faible | ~$0.002/génération → négligeable même à 1000 génération/mois |
