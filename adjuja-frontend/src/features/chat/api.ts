// Chat RAG.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders } from '../../shared/lib/http';
import type { ChatApiResponse, ChatMessage } from '../../types';

// ── Chat RAG (protégé) ─────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: ChatMessage[],
  provider: string,
  model:    string,
): Promise<ChatApiResponse> {
  const res = await fetch('/api/v1/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ messages, provider, model }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Erreur lors de la réponse du chat.');
  }
  return data;
}
