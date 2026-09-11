// Configuration applicative, modeles LLM et etat du RAG.
// Decoupe depuis l'ancien src/types.ts monolithique (2026-09-12).

import type { CompanyData } from "../features/generation/types";


export interface Model {
  provider:    string;
  model_id:    string;
  description: string;
  defaut:      boolean;
}

export type AppState = 'idle' | 'loading' | 'result' | 'error';

export interface RagStatus {
  ready:           boolean;
  doc_count:       number;
  chunk_count:     number;
  document_types:  Record<string, string>;
  etl_available?:  boolean;
}

export interface AppDefaults {
  company:      CompanyData;
  instructions: string;
  temperature:  number;
  max_tokens:   number;
}

export interface UsageData {
  total_tokens:     number;
  total_appels:     number;
  total_tokens_ocr: number;
  max_tokens_cumul: number;
  max_appels:       number;
}

/** Version allégée pour la liste historique (sans résultat complet) */
