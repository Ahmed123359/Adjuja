// Discussion d'equipe. Aucun composant n'appelle fetch directement.

import { authHeaders, readJson } from '../../shared/lib/http';
import type { Message, MessageCreate, MessageList } from './types';

const BASE = '/api/v1';

/** Sans `taskId`, c'est le canal general de l'organisation. */
export async function fetchMessages(taskId?: string | null, limit = 50): Promise<MessageList> {
  const p = new URLSearchParams({ limit: String(limit) });
  if (taskId) p.set('task_id', taskId);
  const res = await fetch(`${BASE}/messages?${p}`, { headers: authHeaders() });
  return readJson<MessageList>(res, 'Erreur chargement de la discussion.');
}

export async function postMessage(data: MessageCreate): Promise<Message> {
  const res = await fetch(`${BASE}/messages`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(data),
  });
  return readJson<Message>(res, "Erreur a l'envoi du message.");
}

export async function deleteMessage(id: string): Promise<void> {
  const res = await fetch(`${BASE}/messages/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Erreur suppression du message.');
}
