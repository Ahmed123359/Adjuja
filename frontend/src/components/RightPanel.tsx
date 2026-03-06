import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import type { GenerationResult, CompanyData, AppState, UsageData, RagStatus, HistorySummary } from '../types';

// ── Document HTML builder ──────────────────────────────────
function buildDocumentHTML(result: GenerationResult, company: CompanyData, aoText: string): string {
  const now    = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const aoLine = aoText.split('\n').find(l => l.trim().length > 10)?.trim() ?? "Appel d'offres";

  const meta = [
    company.forme_juridique,
    company.rc   ? `RC ${company.rc}`   : null,
    company.ice  ? `ICE ${company.ice}` : null,
  ].filter(Boolean).join('  ·  ');

  const location = [company.adresse, company.ville].filter(Boolean).join(', ');

  const sections = result.sections?.length > 0 ? result.sections : null;
  const totalPages = sections ? sections.length + 1 : 2;

  // ── Styles partagés ──────────────────────────────────────
  const pageCss = [
    'background:white',
    'padding:2.2cm 2.8cm 2cm',
    'box-sizing:border-box',
    'min-height:1060px',
    'display:flex',
    'flex-direction:column',
    'box-shadow:0 2px 16px rgba(0,0,0,0.08)',
    'position:relative',
  ].join(';');

  const headerCss = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'padding-bottom:7px',
    'border-bottom:1px solid #e2e8f0',
    'margin-bottom:24px',
    'font-size:7.5pt',
    'color:#94a3b8',
  ].join(';');

  const footerCss = [
    'margin-top:auto',
    'padding-top:10px',
    'border-top:1px solid #e2e8f0',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'font-size:7.5pt',
    'color:#94a3b8',
  ].join(';');

  const sep = '<div style="height:20px;"></div>';

  // ── Page de garde ─────────────────────────────────────────
  const coverPage = `
<div style="${pageCss}; justify-content:space-between;">

  <div>
    <div style="height:5px;background:linear-gradient(90deg,#4338ca,#6366f1,#818cf8);margin-bottom:2.2cm;"></div>
    <div style="font-size:24pt;font-weight:800;color:#0f1929;letter-spacing:-0.02em;line-height:1.1;">${company.nom || 'Votre Entreprise'}</div>
    ${meta   ? `<div style="font-size:8.5pt;color:#7a8899;margin-top:8px;line-height:1.8;">${meta}</div>` : ''}
    ${location ? `<div style="font-size:8.5pt;color:#7a8899;">${location}</div>` : ''}
    ${company.telephone ? `<div style="font-size:8.5pt;color:#7a8899;">Tél. ${company.telephone}</div>` : ''}
    ${company.site_web  ? `<div style="font-size:8.5pt;color:#7a8899;">${company.site_web}</div>` : ''}
  </div>

  <div style="text-align:center;padding:1.5cm 1cm;">
    <div style="width:52px;height:4px;background:#6366f1;border-radius:2px;margin:0 auto 22px;"></div>
    <div style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#6366f1;margin-bottom:18px;">
      Réponse à l'appel d'offres
    </div>
    <div style="font-size:15pt;font-weight:700;color:#0f1929;line-height:1.55;max-width:480px;margin:0 auto;">
      ${aoLine.slice(0, 130)}${aoLine.length > 130 ? '…' : ''}
    </div>
    <div style="font-size:8.5pt;color:#94a3b8;margin-top:20px;">
      Document confidentiel · ${now}
    </div>
  </div>

  <div style="border-top:1px solid #e2e8f0;padding-top:14px;display:flex;justify-content:space-between;align-items:center;font-size:8pt;color:#94a3b8;">
    <span>${location}</span>
    <span style="font-weight:600;color:#1e3a5f;">Page 1 / ${totalPages}</span>
  </div>
</div>`;

  // ── Pages sections ────────────────────────────────────────
  const sectionPages = sections
    ? sections.map((s, i) => `
${sep}
<div style="${pageCss};">
  <div style="${headerCss}">
    <span style="font-weight:600;color:#1e3a5f;">${company.nom || ''}</span>
    <span style="color:#6366f1;font-weight:600;">${s.titre}</span>
    <span>Page ${i + 2} / ${totalPages}</span>
  </div>
  <div style="flex:1;">
    <h2 style="font-size:13pt;font-weight:700;color:#1e3a5f;margin:0 0 16px 0;padding-bottom:8px;border-bottom:2px solid #6366f1;">${s.titre}</h2>
    ${marked.parse(s.contenu)}
  </div>
  <div style="${footerCss}">
    <span>${company.nom || ''}</span>
    <span>Réponse à l'appel d'offres · ${now}</span>
    <span>Page ${i + 2} / ${totalPages}</span>
  </div>
</div>`).join('')
    : `
${sep}
<div style="${pageCss};">
  <div style="${headerCss}">
    <span style="font-weight:600;color:#1e3a5f;">${company.nom || ''}</span>
    <span style="color:#6366f1;font-weight:600;">Réponse complète</span>
    <span>Page 2 / 2</span>
  </div>
  <div style="flex:1;">
    ${marked.parse(result.texte_complet)}
  </div>
  <div style="${footerCss}">
    <span>${company.nom || ''}</span>
    <span>Réponse à l'appel d'offres · ${now}</span>
    <span>Page 2 / 2</span>
  </div>
</div>`;

  return coverPage + sectionPages;
}

// ── Dashboard (idle state) ──────────────────────────────────
function Dashboard({
  usage, ragStatus, history, onLoadHistory, onDeleteHistory, onClearHistory,
}: {
  usage:            UsageData | null;
  ragStatus:        RagStatus | null;
  history:          HistorySummary[];
  onLoadHistory:    (id: string) => void;
  onDeleteHistory:  (id: string) => void;
  onClearHistory:   () => void;
}) {
  const statCards = [
    {
      label:   'Réponses générées',
      value:   usage?.total_appels ?? 0,
      sub:     usage && usage.max_appels > 0 ? `sur ${usage.max_appels} disponibles` : 'cette session',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label:   'Tokens utilisés',
      value:   usage ? (usage.total_tokens > 999 ? `${(usage.total_tokens / 1000).toFixed(1)}k` : usage.total_tokens) : 0,
      sub:     usage && usage.max_tokens_cumul > 0 ? `sur ${(usage.max_tokens_cumul / 1000).toFixed(0)}k max` : 'cette session',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label:   'Base documentaire',
      value:   ragStatus?.ready ? `${ragStatus.chunk_count}` : '—',
      sub:     ragStatus?.ready ? 'chunks indexés' : 'RAG non configuré',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
  ];

  const steps = [
    { n: '01', title: 'Déposez votre AO',     desc: 'Fichier .txt, .pdf ou texte libre' },
    { n: '02', title: 'Choisissez le modèle', desc: 'Claude, GPT-4 ou Mistral' },
    { n: '03', title: 'Profil entreprise',    desc: 'Vos références et expertises' },
    { n: '04', title: 'Générez',              desc: '9 appels LLM spécialisés en parallèle' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-10 flex flex-col gap-8 max-w-3xl mx-auto w-full">

      {/* Hero */}
      <div>
        <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-white leading-tight">
          Prêt à remporter votre prochain marché ?
        </h1>
        <p className="text-gray-500 dark:text-slate-400 mt-2 text-[15px]">
          Remplissez le formulaire à gauche et générez une réponse professionnelle en quelques secondes.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map(({ label, value, sub, icon }) => (
          <div key={label} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-white/[.06] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">{label}</span>
              <span className="text-indigo-400 dark:text-indigo-500 opacity-70">{icon}</span>
            </div>
            <p className="font-display text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-600 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* CTA card */}
      <div className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #818cf8 100%)' }}>
        {/* Subtle texture */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-indigo-200 text-xs font-semibold uppercase tracking-widest">Démarrer</span>
          </div>
          <h2 className="font-display text-xl font-bold text-white mb-1">Commencer une réponse AO</h2>
          <p className="text-indigo-200 text-sm leading-relaxed">
            Déposez votre appel d'offres dans le panneau gauche, sélectionnez votre LLM et cliquez sur <strong className="text-white">Générer la réponse</strong>.
          </p>
          <div className="mt-4 flex items-center gap-3 text-indigo-200 text-xs">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              9 sections générées en parallèle
            </span>
            <span className="text-indigo-400">·</span>
            <span>Format Word éditable</span>
            <span className="text-indigo-400">·</span>
            <span>⌘ Entrée pour lancer</span>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div>
        <p className="sidebar-label mb-4">Comment ça fonctionne</p>
        <div className="grid grid-cols-2 gap-3">
          {steps.map(({ n, title, desc }) => (
            <div key={n} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-white/[.06] rounded-2xl p-4 flex gap-3 items-start hover:border-indigo-200 dark:hover:border-indigo-500/20 hover:shadow-sm transition-all duration-200">
              <span className="text-[10px] font-display font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/[.10] border border-indigo-200 dark:border-indigo-500/25 w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5">
                {n}
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-gray-800 dark:text-slate-200">{title}</p>
                <p className="text-[11px] text-gray-500 dark:text-slate-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="sidebar-label">Historique des générations</p>
            <button
              onClick={onClearHistory}
              className="text-[11px] text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Vider
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {history.map(entry => (
              <div
                key={entry.id}
                className="group bg-white dark:bg-navy-800 border border-gray-200 dark:border-white/[.06] rounded-xl px-4 py-3 flex items-center gap-3 hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-all cursor-pointer"
                onClick={() => onLoadHistory(entry.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{entry.ao_excerpt}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                    {entry.company_nom} · {entry.provider} · {entry.tokens_utilises.toLocaleString('fr-FR')} tokens
                    <span className="ml-2">{new Date(entry.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteHistory(entry.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-all flex-shrink-0 p-1 rounded"
                  title="Supprimer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading ────────────────────────────────────────────────
function Loading({ provider, model }: { provider?: string; model?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-7">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border border-indigo-400/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-3 rounded-full border border-indigo-400/15 animate-ping" style={{ animationDuration: '2s', animationDelay: '.4s' }} />
        <div className="absolute inset-6 rounded-full border border-indigo-400/25 animate-ping" style={{ animationDuration: '2s', animationDelay: '.8s' }} />
        <div className="absolute inset-10 rounded-full bg-indigo-500/5 border border-indigo-400/30 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
        </div>
      </div>

      <div className="text-center">
        <p className="text-base font-semibold text-gray-800 dark:text-slate-200">Génération en cours…</p>
        {provider && model && (
          <p className="text-sm text-indigo-500 dark:text-indigo-400 mt-1 font-medium">{provider} · {model}</p>
        )}
        <div className="mt-3 flex flex-col gap-1 text-[11px] text-gray-400 dark:text-slate-600">
          <p>① Analyse stratégique de l'appel d'offres…</p>
          <p>② Rédaction des 8 sections en parallèle</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────
type Props = {
  state:           AppState;
  result:          GenerationResult | null;
  error:           string;
  company:         CompanyData;
  aoText:          string;
  onReset:         () => void;
  usage:           UsageData | null;
  ragStatus:       RagStatus | null;
  history:         HistorySummary[];
  onLoadHistory:   (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory:  () => void;
};

export default function RightPanel({ state, result, error, company, aoText, onReset, usage, ragStatus, history, onLoadHistory, onDeleteHistory, onClearHistory }: Props) {
  const wordRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'document' | 'brief'>('document');

  useEffect(() => {
    if (state === 'result' && result && wordRef.current) {
      setTab('document');
      wordRef.current.innerHTML = buildDocumentHTML(result, company, aoText);
    }
  }, [state, result, company, aoText]);

  function copyText() {
    const text = wordRef.current?.innerText ?? result?.texte_complet ?? '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadWord() {
    if (!result) return;
    const docStyles = `
      body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.65; color: #1a1a1a; }
      h1 { font-size: 1.35rem; font-weight: 700; color: #1e3a5f; }
      h2 { font-size: 1.1rem; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: .3rem; margin: 1.8rem 0 .6rem; }
      h3 { font-size: 1rem; font-weight: 600; color: #2c5282; margin: 1.2rem 0 .4rem; }
      p  { margin: 0 0 .75rem; line-height: 1.7; }
      ul, ol { padding-left: 1.4rem; margin: .4rem 0 .75rem; }
      li { margin-bottom: .3rem; line-height: 1.6; }
      strong { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin: .9rem 0; font-size: .875rem; }
      th { background: #1e3a5f; color: white; padding: .45rem .8rem; text-align: left; font-weight: 600; }
      td { border: 1px solid #d1d5db; padding: .4rem .8rem; vertical-align: top; }
      tr:nth-child(even) td { background: #f3f6fb; }
    `;
    const html = buildDocumentHTML(result, company, aoText);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${docStyles}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(company.nom || 'reponse').replace(/\s+/g, '_')}_ao.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPDF() {
    if (!result) return;
    const docStyles = `
      body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.65; color: #1a1a1a; margin: 0; background: white; }
      h2 { font-size: 1.1rem; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: .3rem; margin: 1.8rem 0 .6rem; }
      h3 { font-size: 1rem; font-weight: 600; color: #2c5282; margin: 1.2rem 0 .4rem; }
      p  { margin: 0 0 .75rem; line-height: 1.7; }
      ul, ol { padding-left: 1.4rem; margin: .4rem 0 .75rem; }
      li { margin-bottom: .3rem; }
      strong { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin: .9rem 0; }
      th { background: #1e3a5f; color: white; padding: .45rem .8rem; text-align: left; }
      td { border: 1px solid #d1d5db; padding: .4rem .8rem; }
      tr:nth-child(even) td { background: #f3f6fb; }
      @page { margin: 2cm 2.5cm; }
    `;
    const html = buildDocumentHTML(result, company, aoText);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${company.nom || 'Réponse AO'}</title><style>${docStyles}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  }

return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-navy-900">
      {state === 'idle'    && <Dashboard usage={usage} ragStatus={ragStatus} history={history} onLoadHistory={onLoadHistory} onDeleteHistory={onDeleteHistory} onClearHistory={onClearHistory} />}
      {state === 'loading' && <Loading provider={result?.provider_utilise} model={result?.model_utilise} />}

      {(state === 'result' || state === 'error') && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-white dark:bg-navy-900 border-b border-gray-200 dark:border-white/[.04]">
            {/* Onglets */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTab('document')}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  tab === 'document'
                    ? 'bg-indigo-50 dark:bg-indigo-500/[.10] border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-medium'
                    : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                }`}>
                Document
              </button>
              {result?.brief_strategique && (
                <button
                  onClick={() => setTab('brief')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    tab === 'brief'
                      ? 'bg-indigo-50 dark:bg-indigo-500/[.10] border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-medium'
                      : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                  }`}>
                  Brief stratégique
                </button>
              )}
              {result && (
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[.04] border border-gray-200 dark:border-white/[.08] text-gray-500 dark:text-slate-400">
                    {result.provider_utilise}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/[.08] border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    {result.tokens_utilises.toLocaleString('fr-FR')} tokens
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {tab === 'document' && (
                <>
                  <button onClick={downloadWord}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[.08] text-gray-500 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-white/[.02] transition-all">
                    ↓ Word
                  </button>
                  <button onClick={printPDF}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[.08] text-gray-500 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-white/[.02] transition-all">
                    ↓ PDF
                  </button>
                  <button onClick={copyText}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      copied
                        ? 'bg-indigo-50 dark:bg-indigo-500/[.10] border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                        : 'border-gray-200 dark:border-white/[.08] text-gray-500 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-white/[.02]'
                    }`}>
                    {copied ? '✓ Copié' : 'Copier'}
                  </button>
                </>
              )}
              <button onClick={onReset}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[.08] text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-white/[.14] hover:text-gray-700 dark:hover:text-slate-200 bg-white dark:bg-white/[.02] transition-all">
                ← Retour
              </button>
            </div>
          </div>

          {/* Contenu principal */}
          <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#080f1c] p-8 flex justify-center items-start">
            {state === 'error' ? (
              <div className="max-w-lg w-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/20 rounded-2xl p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-800 dark:text-red-300 font-semibold mb-2">Erreur de génération</p>
                <p className="text-gray-500 dark:text-red-400/80 text-sm whitespace-pre-wrap">{error}</p>
              </div>
            ) : (
              <>
                {/* Brief — toujours monté pour éviter les problèmes de ref, masqué si onglet document */}
                {result?.brief_strategique && (
                  <div className={`max-w-2xl w-full bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-white/[.06] p-8 ${tab !== 'brief' ? 'hidden' : ''}`}>
                    <div className="flex items-center gap-2 mb-5">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                      <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 uppercase tracking-widest">Brief stratégique</h2>
                    </div>
                    <div
                      className="word-body text-gray-800 dark:text-slate-200 prose dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: marked.parse(result.brief_strategique) as string }}
                    />
                  </div>
                )}
                {/* Document — toujours monté pour que wordRef reste valide */}
                <div
                  ref={wordRef}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  className={`word-body text-black w-[794px] max-w-full font-word focus:outline-none ${tab !== 'document' ? 'hidden' : ''}`}
                  style={{ fontFamily: 'Calibri, Segoe UI, Arial, sans-serif', fontSize: '11pt', lineHeight: '1.65' }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
