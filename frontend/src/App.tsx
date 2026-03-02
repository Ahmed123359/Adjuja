import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import { fetchModels, fetchDefaults, generate, fetchRagStatus, reindexRag, fetchUsage, resetUsage } from './api';
import type { Model, CompanyData, GenerationResult, AppState, RagStatus, UsageData } from './types';
import { DEFAULT_COMPANY } from './types';

export default function App() {
  // Theme — dark par défaut, persisté en localStorage
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');

  useEffect(() => {
    const el = document.documentElement;
    if (isDark) { el.classList.add('dark'); } else { el.classList.remove('dark'); }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark(d => !d), []);

  // Form
  const [aoText,       setAoText]       = useState('');
  const [provider,     setProviderRaw]  = useState('anthropic');
  const [model,        setModel]        = useState('');
  const [company,      setCompany]      = useState<CompanyData>(DEFAULT_COMPANY);
  const [temperature,  setTemp]         = useState(0.7);
  const [maxTokens,    setMaxTokens]    = useState(4096);
  const [instructions, setInstr]        = useState('');
  const [langue,       setLangue]       = useState<'fr' | 'en'>('fr');

  // App state
  const [appState,   setAppState]  = useState<AppState>('idle');
  const [result,     setResult]    = useState<GenerationResult | null>(null);
  const [error,      setError]     = useState('');
  const [models,     setModels]    = useState<Model[]>([]);
  const [apiStatus,  setApiStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [ragStatus,  setRagStatus] = useState<RagStatus | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [usage,      setUsage]     = useState<UsageData | null>(null);

  // Load on mount
  useEffect(() => {
    fetch('/health').then(r => setApiStatus(r.ok ? 'online' : 'offline')).catch(() => setApiStatus('offline'));

    fetchModels().then(data => {
      setModels(data);
      const def = data.find(m => m.provider === 'anthropic' && m.defaut);
      if (def) setModel(def.model_id);
    }).catch(() => {});

    fetchRagStatus().then(setRagStatus).catch(() => {});
    fetchUsage().then(setUsage).catch(() => {});

    fetchDefaults().then(defaults => {
      setCompany(defaults.company);
      setInstr(defaults.instructions);
      setTemp(defaults.temperature);
      setMaxTokens(defaults.max_tokens);
    }).catch(() => {});
  }, []);

  const setProvider = useCallback((p: string) => {
    setProviderRaw(p);
    const def = models.find(m => m.provider === p && m.defaut);
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
      const res = await generate({ aoText, provider, model, company, temperature, maxTokens, instructions, langue });
      setResult(res);
      setAppState('result');
      fetchUsage().then(setUsage).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setAppState('error');
    }
  }, [aoText, provider, model, company, temperature, maxTokens, instructions, langue]);

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
    <div className="h-screen flex flex-col bg-slate-100 dark:bg-navy-900 overflow-hidden">
      {/* Subtle radial gradient for depth (dark mode only) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden dark:bg-navy-gradient" />

      <Header
        apiStatus={apiStatus}
        ragStatus={ragStatus}
        ragLoading={ragLoading}
        onReindex={handleReindex}
        usage={usage}
        onResetUsage={handleResetUsage}
        isDark={isDark}
        toggleTheme={toggleTheme}
      />

      <div className="flex-1 flex overflow-hidden relative z-10">
        <LeftPanel
          aoText={aoText}       setAoText={setAoText}
          provider={provider}   setProvider={setProvider}
          model={model}         setModel={setModel}
          models={models}
          company={company}     setCompany={setCompany}
          temperature={temperature} setTemp={setTemp}
          maxTokens={maxTokens}     setMaxTokens={setMaxTokens}
          instructions={instructions} setInstr={setInstr}
          langue={langue}       setLangue={setLangue}
          onGenerate={handleGenerate}
          loading={appState === 'loading'}
          limitReached={isLimitReached}
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
        />
      </div>
    </div>
  );
}
