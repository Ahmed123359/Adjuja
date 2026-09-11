// Configuration applicative : defauts, modeles LLM, RAG, quotas d'usage.
// Decoupe depuis l'ancien src/api.ts monolithique (2026-09-12).

import { authHeaders } from './lib/http';
import type { AppDefaults, Model, RagStatus, UsageData } from '../types';

// ── Defaults & Models (publics) ────────────────────────────────────────

export async function fetchDefaults(): Promise<AppDefaults> {
  const res = await fetch('/api/v1/defaults');
  if (!res.ok) throw new Error('Impossible de charger les valeurs par défaut');
  return res.json();
}

export async function fetchModels(): Promise<Model[]> {
  const res = await fetch('/api/v1/models');
  if (!res.ok) throw new Error('Impossible de charger les modèles');
  return res.json();
}

export async function fetchRagStatus(): Promise<RagStatus> {
  const res = await fetch('/api/v1/rag/status');
  if (!res.ok) throw new Error('Impossible de charger le statut RAG');
  return res.json();
}

export async function fetchUsage(): Promise<UsageData> {
  const res = await fetch('/api/v1/usage', { headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de charger le compteur');
  return res.json();
}

export async function resetUsage(): Promise<UsageData> {
  const res = await fetch('/api/v1/usage/reset', { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error('Impossible de réinitialiser le compteur');
  return res.json();
}

export async function reindexRag(): Promise<RagStatus> {
  const res = await fetch('/api/v1/rag/index', { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error('Échec de la reindexation RAG');
  return res.json();
}
