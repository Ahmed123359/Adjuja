import type { RagStatus, UsageData, User } from "../types";

type Props = {
  apiStatus: "online" | "offline" | "connecting";
  ragStatus: RagStatus | null;
  ragLoading: boolean;
  onReindex: () => void;
  usage: UsageData | null;
  onResetUsage: () => void;
  isDark: boolean;
  toggleTheme: () => void;
  onGoLanding: () => void;
  user: User;
  onLogout: () => void;
};

function UsageBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const danger = pct >= 1;
  const warn = pct >= 0.8;
  const color = danger ? "#ef4444" : warn ? "#f59e0b" : "#6366f1";

  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
          {label}
        </span>
        <span className="text-[10px] font-mono font-semibold" style={{ color }}>
          {max > 0
            ? `${value.toLocaleString()} / ${max.toLocaleString()}`
            : value.toLocaleString()}
        </span>
      </div>
      {max > 0 && (
        <div className="h-0.5 rounded-full bg-gray-200 dark:bg-white/[.05] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct * 100}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}

export default function Header({
  apiStatus,
  ragStatus,
  ragLoading,
  onReindex,
  usage,
  onResetUsage,
  isDark,
  toggleTheme,
  onGoLanding,
  user,
  onLogout,
}: Props) {
  const statusColor = {
    online: "bg-emerald-500",
    offline: "bg-red-500",
    connecting: "bg-amber-400 animate-pulse",
  }[apiStatus];

  const statusLabel = {
    online: "Connecté",
    offline: "Hors ligne",
    connecting: "Connexion…",
  }[apiStatus];

  const isLimitReached =
    usage !== null &&
    ((usage.max_appels > 0 && usage.total_appels >= usage.max_appels) ||
      (usage.max_tokens_cumul > 0 &&
        usage.total_tokens >= usage.max_tokens_cumul));

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-5 border-b border-gray-200 dark:border-white/[.04] bg-white dark:bg-navy-900 z-50 relative">
      {/* Logo + back to landing */}
      <div className="flex items-center gap-3">
        <button
          onClick={onGoLanding}
          title="Retour à l'accueil"
          className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Accueil
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-white/[.06]" />
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center select-none flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)" }}
          >
            <span className="text-white font-display font-bold text-sm leading-none">
              O
            </span>
          </div>
          <span className="font-display text-[1.2rem] font-bold tracking-tight leading-none">
            <span className="text-gray-900 dark:text-white">Offr</span>
            <span className="text-gradient">IA</span>
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Usage counter */}
        {usage !== null && (
          <div
            className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${
              isLimitReached
                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/25"
                : "bg-gray-50 dark:bg-white/[.02] border-gray-200 dark:border-white/[.05]"
            }`}
          >
            <UsageBar
              value={usage.total_tokens}
              max={usage.max_tokens_cumul}
              label="tokens"
            />
            <div className="w-px h-5 bg-gray-200 dark:bg-white/[.05]" />
            <UsageBar
              value={usage.total_appels}
              max={usage.max_appels}
              label="appels"
            />
            <button
              onClick={onResetUsage}
              title="Remettre les compteurs à zéro"
              className="w-5 h-5 rounded flex items-center justify-center text-gray-400 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors ml-1"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        )}

        {/* RAG  minimal button */}
        {ragStatus !== null && (
          <button
            onClick={onReindex}
            disabled={ragLoading || !ragStatus.etl_available}
            title={
              ragStatus.etl_available
                ? `RAG ${ragStatus.ready ? `actif · ${ragStatus.chunk_count} chunks` : "vide"}  Cliquer pour réindexer`
                : "Service ETL non disponible"
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all disabled:opacity-40 ${
              ragStatus.ready
                ? "bg-indigo-50 dark:bg-indigo-500/[.08] border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/[.14]"
                : "bg-gray-50 dark:bg-white/[.02] border-gray-200 dark:border-white/[.05] text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-400"
            }`}
          >
            <svg
              className={`w-3 h-3 ${ragLoading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            RAG
          </button>
        )}

        {/* API status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[.02] border border-gray-200 dark:border-white/[.05]">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
            {statusLabel}
          </span>
        </div>

        {/* User + logout */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[.02] border border-gray-200 dark:border-white/[.05]">
          <span className="text-[11px] text-gray-600 dark:text-slate-300 font-medium">
            {user.prenom}
          </span>
          <button
            onClick={onLogout}
            title="Se déconnecter"
            className="ml-1 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Mode clair" : "Mode sombre"}
          className="w-8 h-8 rounded-lg border border-gray-200 dark:border-white/[.06] bg-gray-50 dark:bg-white/[.02] flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all"
        >
          {isDark ? (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
