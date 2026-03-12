import { useState, useEffect, useCallback } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import {
  fetchModels, fetchDefaults, generate,
  fetchRagStatus, reindexRag, fetchUsage, resetUsage,
  fetchHistory, fetchHistoryEntry, deleteHistoryEntry, clearHistory,
} from './api';
import type { Model, CompanyData, GenerationResult, AppState, RagStatus, UsageData, HistorySummary, User } from './types';
import { DEFAULT_COMPANY } from './types';

const CHEAP_KEYWORDS = ['haiku', 'mini', 'small', 'flash'];

function cheapestModel(models: Model[], provider: string): Model | undefined {
  const list = models.filter(m => m.provider === provider);
  return (
    list.find(m => CHEAP_KEYWORDS.some(k => m.model_id.toLowerCase().includes(k))) ??
    list.find(m => m.defaut) ??
    list[0]
  );
}

export default function App({ onGoLanding, onLogout, user }: { onGoLanding: () => void; onLogout: () => void; user: User }) {
  // Form
  const [aoText,   setAoText]      = useState('');
  const [provider, setProviderRaw] = useState('anthropic');
  const [model,    setModel]       = useState('');
  const [company,  setCompany]     = useState<CompanyData>(DEFAULT_COMPANY);
  const [langue,   setLangue]      = useState<'fr' | 'en'>('fr');

  // App state
  const [appState,   setAppState]  = useState<AppState>('idle');
  const [result,     setResult]    = useState<GenerationResult | null>(null);
  const [error,      setError]     = useState('');
  const [models,     setModels]    = useState<Model[]>([]);
  const [apiStatus,  setApiStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [ragStatus,  setRagStatus] = useState<RagStatus | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [usage,      setUsage]     = useState<UsageData | null>(null);
  const [history,    setHistory]   = useState<HistorySummary[]>([]);

  const reloadHistory = useCallback(() => {
    fetchHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/health').then(r => setApiStatus(r.ok ? 'online' : 'offline')).catch(() => setApiStatus('offline'));

    fetchModels().then(data => {
      setModels(data);
      const def = cheapestModel(data, 'anthropic');
      if (def) setModel(def.model_id);
    }).catch(() => {});

    fetchRagStatus().then(setRagStatus).catch(() => {});
    fetchUsage().then(setUsage).catch(() => {});
    reloadHistory();

    fetchDefaults().then(defaults => {
      setCompany(defaults.company);
    }).catch(() => {});
  }, [reloadHistory]);

  const setProvider = useCallback((p: string) => {
    setProviderRaw(p);
    const def = cheapestModel(models, p);
    if (def) setModel(def.model_id);
  }, [models]);

  const isLimitReached = usage !== null && (
    (usage.max_appels > 0 && usage.total_appels >= usage.max_appels) ||
    (usage.max_tokens_cumul > 0 && usage.total_tokens >= usage.max_tokens_cumul)
  );

  const handleGenerate = useCallback(async () => {
    if (aoText.trim().length < 50 || !company.nom.trim()) return;
    setAppState('loading');
    try {
      const res = await generate({ aoText, provider, model, company, langue });
      setResult(res);
      setAppState('result');
      fetchUsage().then(setUsage).catch(() => {});
      reloadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setAppState('error');
    }
  }, [aoText, provider, model, company, langue, reloadHistory]);

  const handleLoadHistory = useCallback(async (id: string) => {
    try {
      const entry = await fetchHistoryEntry(id);
      setResult(entry.result);
      setAppState('result');
    } catch {}
  }, []);

  const handleDeleteHistory = useCallback(async (id: string) => {
    try {
      await deleteHistoryEntry(id);
      reloadHistory();
    } catch {}
  }, [reloadHistory]);

  const handleClearHistory = useCallback(async () => {
    try {
      await clearHistory();
      setHistory([]);
    } catch {}
  }, []);

  const handleReindex = useCallback(async () => {
    setRagLoading(true);
    try { setRagStatus(await reindexRag()); } catch {}
    finally { setRagLoading(false); }
  }, []);

  const handleResetUsage = useCallback(async () => {
    try { setUsage(await resetUsage()); } catch {}
  }, []);

  // Cmd/Ctrl + Enter shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleGenerate]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <LeftPanel
        aoText={aoText}       setAoText={setAoText}
        provider={provider}   setProvider={setProvider}
        model={model}         setModel={setModel}
        models={models}
        company={company}     setCompany={setCompany}
        langue={langue}       setLangue={setLangue}
        onGenerate={handleGenerate}
        loading={appState === 'loading'}
        limitReached={isLimitReached}
        onGoLanding={onGoLanding}
      />
      <RightPanel
        state={appState}
        result={result}
        error={error}
        company={company}
        aoText={aoText}
        onReset={() => setAppState('idle')}
        usage={usage}
        ragStatus={ragStatus}
        history={history}
        onLoadHistory={handleLoadHistory}
        onDeleteHistory={handleDeleteHistory}
        onClearHistory={handleClearHistory}
        apiStatus={apiStatus}
        ragLoading={ragLoading}
        onReindex={handleReindex}
        onResetUsage={handleResetUsage}
        user={user}
        onLogout={onLogout}
      />
    </div>
  );
}
