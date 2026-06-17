import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LeftPanel from "./components/LeftPanel";
import RightPanel, { OutilsLeftPanel } from "./components/RightPanel";
import AppSidebar from "./components/AppSidebar";
import type { Outil } from "./components/RightPanel";
import FloatingChat from "./components/FloatingChat";
import PricingModal from "./components/PricingModal";
import SettingsPage from "./pages/SettingsPage";
import LanguageSelector from "./components/LanguageSelector";
import { useIsMobile } from "./hooks/useIsMobile";
import { useTheme } from "./hooks/useTheme";
import {
  fetchModels,
  fetchDefaults,
  generate,
  getMe,
  fetchRagStatus,
  reindexRag,
  fetchUsage,
  resetUsage,
  fetchHistory,
  fetchHistoryEntry,
  deleteHistoryEntry,
  clearHistory,
} from "./api";
import type {
  Model,
  CompanyData,
  GenerationResult,
  AppState,
  RagStatus,
  UsageData,
  HistorySummary,
  User,
} from "./types";
import { DEFAULT_COMPANY } from "./types";

const CHEAP_KEYWORDS = ["haiku", "mini", "small", "flash"];

function cheapestModel(models: Model[], provider: string): Model | undefined {
  const list = models.filter((m) => m.provider === provider);
  return (
    list.find((m) =>
      CHEAP_KEYWORDS.some((k) => m.model_id.toLowerCase().includes(k)),
    ) ??
    list.find((m) => m.defaut) ??
    list[0]
  );
}

export default function App({
  onGoLanding,
  onLogout,
  user: initialUser,
}: {
  onGoLanding: () => void;
  onLogout: () => void;
  user: User;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(initialUser);

  const isSettings = location.pathname === "/app/settings";

  // Form
  const [aoText, setAoText] = useState("");
  const [provider, setProviderRaw] = useState("anthropic");
  const [model, setModel] = useState("");
  const [company, setCompany] = useState<CompanyData>(DEFAULT_COMPANY);
  const [langue, setLangue] = useState<"fr" | "en">("fr");

  // Navigation principale
  const [mainTab, setMainTab] = useState<"offres" | "marches" | "outils">(
    "offres",
  );
  const [outilSection, setOutilSection] = useState<Outil>("signatures");

  // App state
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [apiStatus, setApiStatus] = useState<
    "online" | "offline" | "connecting"
  >("connecting");
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [history, setHistory] = useState<HistorySummary[]>([]);
  const [showPricing, setShowPricing] = useState(false);

  const reloadHistory = useCallback(() => {
    fetchHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/health")
      .then((r) => setApiStatus(r.ok ? "online" : "offline"))
      .catch(() => setApiStatus("offline"));

    fetchModels()
      .then((data) => {
        setModels(data);
        const def = cheapestModel(data, "anthropic");
        if (def) setModel(def.model_id);
      })
      .catch(() => {});

    fetchRagStatus()
      .then(setRagStatus)
      .catch(() => {});
    fetchUsage()
      .then(setUsage)
      .catch(() => {});
    reloadHistory();

    fetchDefaults()
      .then((defaults) => {
        setCompany(defaults.company);
      })
      .catch(() => {});
  }, [reloadHistory]);

  const setProvider = useCallback(
    (p: string) => {
      setProviderRaw(p);
      const def = cheapestModel(models, p);
      if (def) setModel(def.model_id);
    },
    [models],
  );

  const isLimitReached =
    (usage !== null &&
      ((usage.max_appels > 0 && usage.total_appels >= usage.max_appels) ||
        (usage.max_tokens_cumul > 0 &&
          usage.total_tokens >= usage.max_tokens_cumul))) ||
    (user.max_generations > 0 && user.generations_used >= user.max_generations);

  // Ouvre le modal automatiquement dès que la limite est atteinte
  useEffect(() => {
    if (isLimitReached) setShowPricing(true);
  }, [isLimitReached]);

  const handleGenerate = useCallback(async () => {
    if (aoText.trim().length < 50 || !company.nom.trim()) return;
    setAppState("loading");
    try {
      const res = await generate({ aoText, provider, model, company, langue });
      setResult(res);
      setAppState("result");
      fetchUsage()
        .then(setUsage)
        .catch(() => {});
      reloadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setAppState("error");
    } finally {
      // Rafraîchit l'user pour avoir le generations_used à jour
      getMe()
        .then(setUser)
        .catch(() => {});
    }
  }, [aoText, provider, model, company, langue, reloadHistory]);

  const handleLoadHistory = useCallback(async (id: string) => {
    try {
      const entry = await fetchHistoryEntry(id);
      setResult(entry.result);
      setAppState("result");
    } catch {}
  }, []);

  const handleDeleteHistory = useCallback(
    async (id: string) => {
      try {
        await deleteHistoryEntry(id);
        reloadHistory();
      } catch {}
    },
    [reloadHistory],
  );

  const handleClearHistory = useCallback(async () => {
    try {
      await clearHistory();
      setHistory([]);
    } catch {}
  }, []);

  const handleReindex = useCallback(async () => {
    setRagLoading(true);
    try {
      setRagStatus(await reindexRag());
    } catch {
    } finally {
      setRagLoading(false);
    }
  }, []);

  const handleResetUsage = useCallback(async () => {
    try {
      setUsage(await resetUsage());
    } catch {}
  }, []);

  // Cmd/Ctrl + Enter shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleGenerate();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleGenerate]);

  const { theme, toggle } = useTheme();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>

      {/* Sidebar desktop */}
      {!isMobile && (
        <AppSidebar
          mainTab={mainTab}
          onTabChange={(t) => { setMainTab(t); if (isSettings) navigate("/app"); }}
          user={user}
          onLogout={onLogout}
          onGoSettings={() => navigate("/app/settings")}
          isSettings={isSettings}
          apiStatus={apiStatus}
          onGoLanding={onGoLanding}
        />
      )}

      {/* Sidebar mobile overlay */}
      {isMobile && sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setSidebarOpen(false)} />
      )}
      {isMobile && (
        <div style={{ position: 'fixed', inset: '0 auto 0 0', zIndex: 50, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .28s cubic-bezier(.4,0,.2,1)' }}>
          <AppSidebar
            mainTab={mainTab}
            onTabChange={(t) => { setMainTab(t); setSidebarOpen(false); if (isSettings) navigate("/app"); }}
            user={user}
            onLogout={onLogout}
            onGoSettings={() => { navigate("/app/settings"); setSidebarOpen(false); }}
            isSettings={isSettings}
            apiStatus={apiStatus}
            onGoLanding={onGoLanding}
          />
        </div>
      )}

      {/* Generation left panel */}
      {mainTab === "offres" && appState !== "idle" && (
        <div className={isMobile ? `fixed inset-y-0 left-0 z-50 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}` : ""}>
          <LeftPanel
            aoText={aoText}
            setAoText={setAoText}
            company={company}
            setCompany={setCompany}
            langue={langue}
            setLangue={setLangue}
            onGenerate={handleGenerate}
            loading={appState === "loading"}
            limitReached={isLimitReached}
            onShowPricing={() => setShowPricing(true)}
            onGoLanding={onGoLanding}
            onClose={isMobile ? () => setSidebarOpen(false) : undefined}
          />
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {isSettings ? (
          <>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58, padding: '0 24px', background: 'var(--l-card)', borderBottom: '1px solid var(--l-card-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isMobile && (
                  <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-sub)', padding: 6, display: 'flex', borderRadius: 7 }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                  </button>
                )}
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--l-text)', letterSpacing: '-0.02em' }}>Paramètres</h1>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={toggle} style={{ background: 'none', border: '1px solid var(--l-card-border)', cursor: 'pointer', color: 'var(--l-sub)', padding: '7px 10px', borderRadius: 7, display: 'flex', alignItems: 'center' }}>
                  {theme === 'dark'
                    ? <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                    : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                  }
                </button>
                <LanguageSelector />
              </div>
            </header>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SettingsPage
                provider={provider}
                setProvider={setProvider}
                model={model}
                setModel={setModel}
                models={models}
                usage={usage}
                onRefreshUsage={() => fetchUsage().then(setUsage).catch(() => {})}
                onResetUsage={() => resetUsage().then(setUsage).catch(() => {})}
              />
            </div>
          </>
        ) : (
          <RightPanel
            state={appState}
            result={result}
            error={error}
            company={company}
            aoText={aoText}
            onReset={() => setAppState("idle")}
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
            onGoSettings={() => navigate("/app/settings")}
            mainTab={mainTab}
            onMainTabChange={setMainTab}
            outilSection={outilSection}
            onOpenSidebar={isMobile ? () => setSidebarOpen(true) : undefined}
          />
        )}
      </div>

      <FloatingChat provider={provider} model={model} />
      {showPricing && <PricingModal onClose={() => setShowPricing(false)} />}
    </div>
  );
}
