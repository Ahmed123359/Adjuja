# Chatbot knowledge base -- client.md

Read `00-overview.md` in this folder before starting. Depends on `api.md` being
done: the provider default only matters once there's something real for it to
retrieve against.

## Provider default fix

`frontend/src/App.tsx`: `const [provider, setProviderRaw] = useState("anthropic")`.
No `ANTHROPIC_API_KEY` configured in this environment (confirmed: this is the
exact, sole cause of the "Cle API manquante pour le provider 'anthropic'" error
seen 2026-08-18), so every chat message fails before reaching RAG or generation
regardless of what `api.md` ships.

Change the default to `"mistral"` -- already configured (`MISTRAL_API_KEY` is
required for `RagService`'s own embeddings to work at all, so it is guaranteed
present whenever RAG is usable) and already the provider used elsewhere for
cost-sensitive default paths.

## No other frontend change

`FloatingChat.tsx` and `ChatPanel.tsx` already render answers and sources
correctly (`msg.sources` display already implemented), take `provider`/`model` as
props already wired from `App.tsx`, and need no changes for this feature. Confirmed
by reading both components -- do not add UI work here that isn't needed.

## Check when done

- A fresh session, no manual provider change, sends a chat message successfully
  instead of failing with "Cle API manquante".
- `tsc --noEmit` passes (this is a one-line value change, should not affect types
  at all, but still run it per `context/ai-workflow-rules.md`'s verification
  discipline).
