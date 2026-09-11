// Chat RAG.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).


// ── Chat RAG ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:     'user' | 'assistant';
  content:  string;
  sources?: string[];  // titres des documents RAG utilisés (côté assistant)
}

export interface ChatApiResponse {
  answer:           string;
  sources:          string[];
  tokens_used:      number;
  provider_utilise: string;
  model_utilise:    string;
}
