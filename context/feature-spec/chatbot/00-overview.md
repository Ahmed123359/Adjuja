## Deliverable

The existing chat assistant (`FloatingChat.tsx`, already shipped, UI needs no rework)
actually answers questions correctly, both about Moroccan public procurement law and
about how ADJUJA itself works, grounded in real source documents instead of the two
things broken today: a default LLM provider with no API key configured, and a RAG
retrieval path that reads from a collection nothing ever writes into.

## Depends on

Nothing new architecturally. Reuses `RagService` (`app/services/rag_service.py`,
Qdrant-backed, already used by offer generation), `ChatService`
(`app/services/chat_service.py`), and `ProviderFactory` (`app/providers/`, already
supports mistral/openai/anthropic). No new service, no new table, no new container.
See `context/architecture-context.md` for the Qdrant collection model this feature
relies on.

## Source documents

- `hafid-taches-docs/chatbot/decret_des_marches_publics_version_francais.pdf` --
  Decret n2-22-431 du 15 chaabane 1444 (8 mars 2023) relatif aux marches publics, the
  current core procurement law, 88 pages, vector-drawn text (needs OCR, see api.md).
- `hafid-taches-docs/chatbot/2-16-344+interets+moratoires.pdf.docx` -- Decret
  n2-16-344, payment delays and late-payment interest, 14 articles, plain extractable
  text.
- `hafid-taches-docs/chatbot/guide_plateforme_adjuja.md` -- first-pass platform guide
  drafted 2026-08-18 from the real codebase (no existing product-facing doc existed
  anywhere in the repo, `conception/` is internal/technical only). **Must be read and
  corrected by the user before ingestion** -- flagged as a draft in its own header,
  not yet validated on tone or commercial positioning.

## Build order

1. `api.md` -- fix `ChatService._retrieve_rag`, add `reglementation`/`plateforme` to
   `RagService.DOCUMENT_TYPES`, write the one-off ingestion script.
2. `client.md` -- one-line provider default fix.
3. Run the ingestion script once against the three source documents above.

## Check when the feature is done

- Asking "quel est le delai de paiement des commandes publiques ?" returns an answer
  citing a real article number, not a generic paraphrase.
- Asking a question about ADJUJA itself ("comment fonctionne la veille ?", "c'est quoi
  Go/No-Go ?") returns an accurate answer grounded in `guide_plateforme_adjuja.md`,
  not a hallucinated feature.
- A fresh session, no provider manually selected, does not fail with "Cle API
  manquante pour le provider 'anthropic'".
- `GET /api/v1/rag/status` reports `chunk_count > 0` and `ready: true` after ingestion.
- Everything in `api.md` and `client.md` individually passes its own check first.
