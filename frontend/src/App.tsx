import { useState, useEffect, useCallback } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import { useIsMobile } from './hooks/useIsMobile';
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
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left panel — sidebar (fixé en overlay sur mobile) */}
      <div className={isMobile
        ? `fixed inset-y-0 left-0 z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
        : ''
      }>
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
          onClose={isMobile ? () => setSidebarOpen(false) : undefined}
        />
      </div>

      {/* Right panel — full width sur mobile, avec header mobile en haut */}
      <div className={isMobile ? 'w-full flex flex-col' : 'flex-1'}>
        {/* Mobile header — inside content column so it stays at top */}
        {isMobile && (
          <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors">
              <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2 flex-1">
              <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">O</span>
              </div>
              <span className="font-semibold text-foreground text-base tracking-tight">
                Offr<span className="text-primary">IA</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] text-primary-foreground font-bold">
                  {user.prenom?.[0]?.toUpperCase()}{user.nom?.[0]?.toUpperCase() ?? ''}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Se déconnecter"
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        )}
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
    </div>
  );
}
