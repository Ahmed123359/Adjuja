# Fournisseurs IA interchangeables

Ouvert le 2026-09-27, à la demande de l'utilisateur : préparer l'arrivée de
DeepSeek sans figer le code sur un fournisseur, « si demain on travaille avec
d'autres fournisseurs, aucun problème ».

## Deliverable

Chaque usage de l'IA passe par une **capacité**, pas par un fournisseur :

| Capacité | Interface | Rôles configurés | Choix de l'utilisateur (2026-09-27) |
|---|---|---|---|
| Texte (analyse, génération, extraction) | `AbstractLLMProvider` (existant, étendu d'un mode JSON) | `LLM_ANALYSIS`, `LLM_FAST` | OpenAI `gpt-4.1` (analyse), `gpt-4.1-mini` (rapide) -- décision révisée le 2026-09-27 : « tout sur GPT » ; DeepSeek reste disponible |
| Embeddings (fit score, recherche RAG) | `AbstractEmbeddingProvider` (nouveau) | `EMBEDDINGS` | OpenAI `text-embedding-3-small`, 1024 dimensions |
| Vision (lecture des formulaires au remplissage) | `AbstractVisionProvider` (nouveau) | `VISION` | OpenAI `gpt-4.1-mini` (remplace Pixtral) |

Un rôle se configure en une ligne `fournisseur:modèle` dans `.env`
(`LLM_ANALYSIS=openai:gpt-4.1`, ou `deepseek:deepseek-chat`). Changer de fournisseur = changer
cette ligne ; le code ne demande jamais « Mistral », il demande « le modèle
d'analyse ». Les valeurs par défaut reproduisent le comportement actuel
(Mistral partout) : rien ne change tant que `.env` n'est pas modifié.

Même principe dans ao-watcher (service séparé, analyse de la veille) : une
petite couche de même forme, même nommage de variables.

## Pourquoi par capacité

DeepSeek ne fournit ni embeddings ni vision (à revérifier dans sa
documentation au moment de brancher). Une interface unique « fournisseur IA »
obligerait à rester chez un fournisseur qui fait tout ; par capacité, chaque
besoin prend le meilleur fournisseur, et un seul change à la fois.

## État réel vérifié (2026-09-27)

Seuls la génération et le chat passent par `ProviderFactory`. Appellent
Mistral en direct, avec des noms de modèles en dur : l'analyse de veille
(`adjuja-watcher/.../analysis.py`), l'analyse du pipeline et l'indexation
(`ao_tasks.py`), l'extraction de CV (`staff_cvs_routes.py`), les cinq modules
d'offre technique (HTTP direct), le remplissage (`filler_llm.py` : texte et
Pixtral), les embeddings (`rag_service.py`).

## Build order

1. **Couche et DeepSeek** : mode JSON sur `generate_text`, `DeepSeekProvider`
   (API compatible OpenAI), interfaces embeddings / vision avec leurs
   implémentations Mistral et OpenAI, routeur de rôles, variables d'env.
2. **Migration, lot 1** : analyse de veille, analyse du pipeline, extraction de
   CV, embeddings du RAG et du fit score.
3. **OCR du pipeline** : repli Tesseract dans `task_analyze_ao_context` (même
   approche que la veille ; voir `bugs-connus.md`).
4. **Migration, lot 2** : les cinq modules d'offre technique.
5. **Remplissage par paliers** (décidé et fait le 2026-09-27) :
   - palier 1, PDF avec couche texte : pipeline texte existant (inchangé, son
     appel passe par le rôle `analysis`) ;
   - palier 2, scan : `filler_ocr_layout.py`, Tesseract en sortie TSV à 300 dpi,
     page reconstruite bloc par bloc (retours à la ligne et pointillés
     conservés), puis modèle de texte avec les mêmes prompts que la vision et
     une consigne « source OCR » ;
   - palier 3 : modèle de vision (rôle `VISION`) si la confiance OCR moyenne est
     sous 70, s'il y a moins de 40 mots, ou si le modèle de texte ne rend rien
     d'exploitable ;
   - tableaux (bordereau) : vision directement, Tesseract perdant les colonnes.
   Mesure réelle : RC scanné de l'AO 6387, 2 pages, 892 mots, confiance 92, 7 s.

**État au 2026-09-27 : étapes 1 à 5 faites.** Plus aucun appel direct à Mistral
ou Pixtral hors des classes de fournisseurs. 35 tests unitaires verts. Aucun
appel réel à un fournisseur tant que les clés ne sont pas dans `.env`.

Changer de modèle d'embeddings impose de **réindexer** Qdrant (espaces de
vecteurs incompatibles) ; 1024 dimensions demandées à OpenAI pour garder la
taille des collections actuelles.

## Check when the feature is done

- Aucun appel `Mistral(` ni URL `api.mistral.ai` en dehors des classes de
  fournisseurs (`grep`).
- Passer `LLM_ANALYSIS` de `mistral:...` à `deepseek:...` bascule l'analyse de
  veille et du pipeline sans autre modification.
- Tests unitaires : routeur de rôles, mode JSON, requête DeepSeek bien formée
  (client HTTP simulé), embeddings OpenAI à 1024 dimensions.
- Un appel réel à DeepSeek et à OpenAI, dès que les clés existent.
