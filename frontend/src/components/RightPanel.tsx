import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import type { GenerationResult, CompanyData, AppState, UsageData, RagStatus, HistorySummary, User } from '../types';

// ── Helpers ─────────────────────────────────────────────────
function toRoman(n: number): string {
  const vals = [10, 9, 5, 4, 1];
  const syms = ['X', 'IX', 'V', 'IV', 'I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) { while (n >= vals[i]) { r += syms[i]; n -= vals[i]; } }
  return r;
}

// ── Document HTML builder ───────────────────────────────────
function buildDocumentHTML(result: GenerationResult, company: CompanyData, aoText: string): string {
  const now    = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const aoLine = aoText.split('\n').find(l => l.trim().length > 10)?.trim() ?? "Appel d'offres";

  const meta = [
    company.forme_juridique,
    company.rc   ? `RC ${company.rc}`   : null,
    company.ice  ? `ICE ${company.ice}` : null,
  ].filter(Boolean).join('  ·  ');

  const location = [company.adresse, company.ville].filter(Boolean).join(', ');
  const sections   = result.sections?.length > 0 ? result.sections : null;
  const totalPages = sections ? sections.length + 2 : 2; // cover + TOC + sections

  // ABI Consulting palette
  const BLUE  = '#1B3F6B';
  const TEAL  = '#17A589';
  const LBLUE = '#D5E8F5';
  const BODY  = '#1a1a2e';

  const pageCss  = `background:white;padding:2.2cm 2.8cm 2cm;box-sizing:border-box;min-height:1060px;display:flex;flex-direction:column;position:relative;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);`;
  const hdrCss   = `display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;border-bottom:2px solid ${LBLUE};margin-bottom:22px;`;
  const ftrCss   = `margin-top:auto;padding-top:10px;border-top:1px solid ${LBLUE};display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#9CA3AF;`;
  const sep      = '<div style="height:20px;"></div>';

  // ABI logo mark (CSS-only circle)
  const abiMark = `<div style="display:inline-flex;align-items:center;gap:5px;">
    <div style="width:26px;height:26px;border-radius:50%;border:2px solid ${BLUE};display:flex;align-items:center;justify-content:center;font-size:5.5pt;font-weight:900;color:${BLUE};">/BI</div>
    <div style="line-height:1.1;"><div style="font-size:8pt;font-weight:800;color:${BLUE};letter-spacing:0.05em;">ABI</div><div style="font-size:6pt;color:#6B7280;letter-spacing:0.05em;">CONSULTING</div></div>
  </div>`;

  // Wave decorations (CSS shapes)
  const wavesTR = `
    <div style="position:absolute;top:-60px;right:-60px;width:260px;height:200px;border-radius:0 0 0 120%;background:${LBLUE};opacity:0.55;z-index:0;"></div>
    <div style="position:absolute;top:-30px;right:-30px;width:175px;height:135px;border-radius:0 0 0 120%;background:${LBLUE};opacity:0.4;z-index:0;"></div>`;
  const wavesBL = `
    <div style="position:absolute;bottom:-60px;left:-60px;width:260px;height:200px;border-radius:0 120% 0 0;background:${LBLUE};opacity:0.55;z-index:0;"></div>
    <div style="position:absolute;bottom:-30px;left:-30px;width:175px;height:135px;border-radius:0 120% 0 0;background:${LBLUE};opacity:0.4;z-index:0;"></div>`;

  // ── PAGE 1 : Couverture ──
  const coverPage = `
<div style="${pageCss}justify-content:space-between;">
  ${wavesTR}${wavesBL}
  <div style="position:relative;z-index:1;">${abiMark}</div>
  <div style="text-align:center;flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:1;padding:0.8cm 0;">
    <div style="font-size:22pt;font-weight:800;color:${BLUE};margin-bottom:0.5cm;line-height:1.2;">Réponse à l'Appel d'Offres</div>
    <div style="height:5px;background:${LBLUE};margin:0 auto 0.5cm;width:65%;border-radius:3px;"></div>
    <div style="font-size:12pt;font-weight:700;color:${BODY};line-height:1.55;max-width:480px;margin:0 auto 0.4cm;">${aoLine.slice(0,130)}${aoLine.length > 130 ? '…' : ''}</div>
    <div style="height:5px;background:${LBLUE};margin:0.5cm auto 0;width:65%;border-radius:3px;"></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1;border-top:1px solid ${LBLUE};padding-top:14px;">
    <div>
      <div style="font-size:7.5pt;font-weight:700;color:${BLUE};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Réalisé par :</div>
      <div style="font-size:10pt;font-weight:700;color:${BODY};">${company.nom || 'ABI Consulting'}</div>
      ${meta     ? `<div style="font-size:7.5pt;color:#6B7280;margin-top:3px;">${meta}</div>` : ''}
      ${location ? `<div style="font-size:7.5pt;color:#6B7280;">${location}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:7.5pt;color:#9CA3AF;">${now}</div>
      <div style="font-size:7pt;color:#9CA3AF;margin-top:3px;">Document confidentiel</div>
    </div>
  </div>
</div>`;

  // ── PAGE 2 : Sommaire ──
  const tocPage = sections ? `
${sep}
<div style="${pageCss}">
  <div style="${hdrCss}">
    <span style="font-size:8pt;color:#6B7280;font-style:italic;">${aoLine.slice(0,90)}${aoLine.length > 90 ? '…' : ''}</span>
    ${abiMark}
  </div>
  <div style="flex:1;">
    <div style="font-size:20pt;font-weight:800;color:${TEAL};margin-bottom:0.6cm;">Sommaire</div>
    ${sections.map((s, i) => `
    <div style="display:flex;align-items:baseline;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #F0F7FF;">
      <div style="font-size:8.5pt;font-weight:700;color:${BLUE};min-width:24px;">${toRoman(i+1)}.</div>
      <div style="font-size:10.5pt;font-weight:600;color:${BODY};flex:1;padding:0 8px;text-transform:uppercase;letter-spacing:0.02em;">${s.titre}</div>
      <div style="font-size:8.5pt;color:#9CA3AF;min-width:24px;text-align:right;">${i+3}</div>
    </div>`).join('')}
  </div>
  <div style="${ftrCss}">
    <span style="color:${BLUE};font-weight:600;">${company.nom || 'ABI Consulting'}</span>
    <span style="color:${TEAL};">Réponse à l'appel d'offres · ${now}</span>
    <span style="font-weight:600;">Page 2 / ${totalPages}</span>
  </div>
</div>` : '';

  // ── PAGES 3+ : Sections ──
  const sectionPages = sections
    ? sections.map((s, i) => `
${sep}
<div style="${pageCss}">
  <div style="${hdrCss}">
    <span style="font-size:8pt;color:#6B7280;font-style:italic;">${aoLine.slice(0,90)}${aoLine.length > 90 ? '…' : ''}</span>
    ${abiMark}
  </div>
  <div style="flex:1;">
    <div style="font-size:14pt;font-weight:800;color:${BLUE};margin-bottom:6px;">${toRoman(i+1)}. ${s.titre.toUpperCase()}</div>
    <div style="height:3px;background:${TEAL};width:55px;border-radius:2px;margin-bottom:18px;"></div>
    <div class="section-content">${marked.parse(s.contenu)}</div>
  </div>
  <div style="${ftrCss}">
    <span style="color:${BLUE};font-weight:600;">${company.nom || 'ABI Consulting'}</span>
    <span style="color:${TEAL};">Réponse à l'appel d'offres · ${now}</span>
    <span style="font-weight:600;">Page ${i+3} / ${totalPages}</span>
  </div>
</div>`).join('')
    : `
${sep}
<div style="${pageCss}">
  <div style="${hdrCss}">
    <span style="font-size:8pt;color:#6B7280;font-style:italic;">${aoLine.slice(0,90)}</span>
    ${abiMark}
  </div>
  <div style="flex:1;" class="section-content">${marked.parse(result.texte_complet)}</div>
  <div style="${ftrCss}">
    <span style="color:${BLUE};font-weight:600;">${company.nom || 'ABI Consulting'}</span>
    <span style="color:${TEAL};">Réponse à l'appel d'offres · ${now}</span>
    <span style="font-weight:600;">Page 2 / 2</span>
  </div>
</div>`;

  return coverPage + tocPage + sectionPages;
}

// ── Top bar ─────────────────────────────────────────────────
function TopBar({
  usage, ragStatus, ragLoading, onReindex, onResetUsage, apiStatus, user, onLogout,
}: {
  usage: UsageData | null;
  ragStatus: RagStatus | null;
  ragLoading: boolean;
  onReindex: () => void;
  onResetUsage: () => void;
  apiStatus: 'online' | 'offline' | 'connecting';
  user: User;
  onLogout: () => void;
}) {
  const statusColor = { online: 'bg-emerald-500', offline: 'bg-red-500', connecting: 'bg-amber-400 animate-pulse' }[apiStatus];
  const statusLabel = { online: 'Connecté', offline: 'Hors ligne', connecting: 'Connexion…' }[apiStatus];

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3 flex-shrink-0">
      <div className="flex items-center justify-between">

        {/* Left: usage */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {usage !== null ? (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border font-mono">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
                </svg>
                tokens{' '}
                <strong className="text-foreground">
                  {usage.total_tokens.toLocaleString('fr-FR')} / {usage.max_tokens_cumul > 0 ? usage.max_tokens_cumul.toLocaleString('fr-FR') : '∞'}
                </strong>
                <button
                  onClick={onResetUsage}
                  title="Remettre à zéro"
                  className="ml-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border font-mono">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                appels{' '}
                <strong className="text-foreground">
                  {usage.total_appels} / {usage.max_appels > 0 ? usage.max_appels : '∞'}
                </strong>
              </span>
            </>
          ) : null}
        </div>

        {/* Right: RAG + status + user */}
        <div className="flex items-center gap-3">
          {ragStatus !== null && (
            <button
              onClick={onReindex}
              disabled={ragLoading || !ragStatus.etl_available}
              title={ragStatus.etl_available ? `RAG ${ragStatus.ready ? `actif · ${ragStatus.chunk_count} chunks` : 'vide'} — Réindexer` : 'Service ETL non disponible'}
              className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              <svg className={`h-3 w-3 ${ragLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              RAG{ragStatus.ready ? ` · ${ragStatus.chunk_count}` : ''}
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border">
            <div className={`h-2 w-2 rounded-full ${statusColor}`} />
            <span className="text-xs font-medium text-foreground">{statusLabel}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border">
            <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-primary-foreground font-bold">
                {user.prenom?.[0]?.toUpperCase()}{user.nom?.[0]?.toUpperCase() ?? ''}
              </span>
            </div>
            <span className="text-xs font-medium text-foreground">{user.prenom} {user.nom}</span>
            <button
              onClick={onLogout}
              title="Se déconnecter"
              className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Dashboard (idle state) ──────────────────────────────────
function Dashboard({
  usage, ragStatus, history, onLoadHistory, onDeleteHistory, onClearHistory,
}: {
  usage: UsageData | null;
  ragStatus: RagStatus | null;
  history: HistorySummary[];
  onLoadHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}) {
  const statCards = [
    {
      label: 'Réponses générées',
      value: String(usage?.total_appels ?? 0),
      sub:   usage && usage.max_appels > 0 ? `sur ${usage.max_appels} disponibles` : 'cette session',
      icon: (
        <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: 'Tokens utilisés',
      value: usage ? (usage.total_tokens > 999 ? `${(usage.total_tokens / 1000).toFixed(1)}k` : String(usage.total_tokens)) : '0',
      sub:   usage && usage.max_tokens_cumul > 0 ? `sur ${(usage.max_tokens_cumul / 1000).toFixed(0)}k max` : 'cette session',
      icon: (
        <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
        </svg>
      ),
    },
    {
      label: 'Base documentaire',
      value: ragStatus?.ready ? String(ragStatus.chunk_count) : '—',
      sub:   ragStatus?.ready ? 'chunks indexés' : 'RAG non configuré',
      icon: (
        <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-10">

        {/* Hero */}
        <div className="space-y-2 animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Prêt à remporter votre prochain marché ?
          </h1>
          <p className="text-base text-muted-foreground max-w-xl">
            Remplissez le formulaire à gauche et générez une réponse professionnelle en quelques secondes.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          {statCards.map(({ label, value, sub, icon }) => (
            <div key={label} className="border border-border rounded-xl bg-card p-5 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">{icon}</div>
              </div>
              <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* CTA card */}
        <div className="gradient-cta rounded-2xl p-8 shadow-elevated relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,hsl(280_60%_65%_/_0.3),transparent_60%)]" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-foreground/15 text-primary-foreground text-xs font-semibold uppercase tracking-wider mb-4">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
              </svg>
              Démarrer
            </span>
            <h2 className="text-2xl font-bold text-primary-foreground mb-2">
              Commencer une réponse AO
            </h2>
            <p className="text-sm text-primary-foreground/80 max-w-lg mb-5">
              Déposez votre appel d'offres dans le panneau gauche, sélectionnez votre LLM et cliquez sur{' '}
              <strong className="text-primary-foreground">Générer la réponse</strong>.
            </p>
            <div className="flex items-center gap-6 text-xs text-primary-foreground/70">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                9 sections générées en parallèle
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Format Word éditable
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ⌘ Entrée pour lancer
              </span>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Comment ça fonctionne
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {steps.map(({ n, title, desc }) => (
              <div
                key={n}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all group"
              >
                <div className="h-8 w-8 min-w-[2rem] rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                  {n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Historique des générations
              </h3>
              <button
                onClick={onClearHistory}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Vider
              </button>
            </div>
            <div className="space-y-2">
              {history.map((entry, i) => (
                <div
                  key={entry.id}
                  className="group border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all cursor-pointer animate-slide-in"
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => onLoadHistory(entry.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate pr-4">{entry.ao_excerpt}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {entry.company_nom}
                        </span>
                        <span>·</span>
                        <span>{entry.provider}</span>
                        <span>·</span>
                        <span>{entry.tokens_utilises.toLocaleString('fr-FR')} tokens</span>
                        <span>·</span>
                        <span>{new Date(entry.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteHistory(entry.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
                        title="Supprimer"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <svg className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading ─────────────────────────────────────────────────
function Loading({ provider, model }: { provider?: string; model?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-7">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-3 rounded-full border border-primary/15 animate-ping" style={{ animationDuration: '2s', animationDelay: '.4s' }} />
        <div className="absolute inset-6 rounded-full border border-primary/25 animate-ping" style={{ animationDuration: '2s', animationDelay: '.8s' }} />
        <div className="absolute inset-10 rounded-full bg-accent border border-primary/30 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">Génération en cours…</p>
        {provider && model && (
          <p className="text-sm text-primary mt-1 font-medium">{provider} · {model}</p>
        )}
        <div className="mt-3 flex flex-col gap-1 text-[11px] text-muted-foreground">
          <p>① Analyse stratégique de l'appel d'offres…</p>
          <p>② Rédaction des 8 sections en parallèle</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
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
  apiStatus:       'online' | 'offline' | 'connecting';
  ragLoading:      boolean;
  onReindex:       () => void;
  onResetUsage:    () => void;
  user:            User;
  onLogout:        () => void;
};

export default function RightPanel({
  state, result, error, company, aoText, onReset,
  usage, ragStatus, history, onLoadHistory, onDeleteHistory, onClearHistory,
  apiStatus, ragLoading, onReindex, onResetUsage, user, onLogout,
}: Props) {
  const wordRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'document' | 'brief'>('document');
  const [docFile, setDocFile] = useState<'reponse' | 'equipe' | 'references'>('reponse');

  useEffect(() => {
    if (state === 'result' && result && wordRef.current) {
      setTab('document');
      setDocFile('reponse');
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
      body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.65; color: #1a1a2e; }
      .section-content h2 { font-size: 1.05rem; font-weight: 700; color: #1B3F6B; border-bottom: 2px solid #17A589; padding-bottom: .3rem; margin: 1.4rem 0 .6rem; }
      .section-content h3 { font-size: 1rem; font-weight: 700; color: #17A589; font-style: italic; margin: 1rem 0 .4rem; }
      .section-content h4 { font-size: .95rem; font-weight: 700; color: #2471A3; font-style: italic; margin: .8rem 0 .3rem; }
      .section-content p  { margin: 0 0 .75rem; line-height: 1.7; text-align: justify; }
      .section-content ul, .section-content ol { padding-left: 1.4rem; margin: .4rem 0 .75rem; }
      .section-content li { margin-bottom: .3rem; line-height: 1.6; }
      .section-content strong { font-weight: 700; color: #1B3F6B; }
      .section-content table { width: 100%; border-collapse: collapse; margin: .9rem 0; font-size: .875rem; }
      .section-content th { background: #1B3F6B; color: white; padding: .45rem .8rem; text-align: left; font-weight: 600; }
      .section-content td { border: 1px solid #d1d5db; padding: .4rem .8rem; vertical-align: top; }
      .section-content tr:nth-child(even) td { background: #F0F7FF; }
      .section-content hr { border: none; border-top: 1px solid #D5E8F5; margin: 1rem 0; }
    `;
    const html = buildDocumentHTML(result, company, aoText);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${docStyles}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${(company.nom || 'reponse').replace(/\s+/g, '_')}_ao.doc`;
    a.click(); URL.revokeObjectURL(url);
  }

  function printPDF() {
    if (!result) return;
    const docStyles = `
      body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.65; color: #1a1a2e; margin: 0; background: white; }
      .section-content h2 { font-size: 1.05rem; font-weight: 700; color: #1B3F6B; border-bottom: 2px solid #17A589; padding-bottom: .3rem; margin: 1.4rem 0 .6rem; }
      .section-content h3 { font-size: 1rem; font-weight: 700; color: #17A589; font-style: italic; margin: 1rem 0 .4rem; }
      .section-content h4 { font-size: .95rem; font-weight: 700; color: #2471A3; font-style: italic; margin: .8rem 0 .3rem; }
      .section-content p  { margin: 0 0 .75rem; line-height: 1.7; text-align: justify; }
      .section-content ul, .section-content ol { padding-left: 1.4rem; margin: .4rem 0 .75rem; }
      .section-content li { margin-bottom: .3rem; line-height: 1.6; }
      .section-content strong { font-weight: 700; color: #1B3F6B; }
      .section-content table { width: 100%; border-collapse: collapse; margin: .9rem 0; }
      .section-content th { background: #1B3F6B; color: white; padding: .45rem .8rem; text-align: left; }
      .section-content td { border: 1px solid #d1d5db; padding: .4rem .8rem; }
      .section-content tr:nth-child(even) td { background: #F0F7FF; }
      .section-content hr { border: none; border-top: 1px solid #D5E8F5; margin: 1rem 0; }
      @page { margin: 2cm 2.5cm; }
    `;
    const html = buildDocumentHTML(result, company, aoText);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${company.nom || 'Réponse AO'}</title><style>${docStyles}</style></head><body>${html}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Top bar — always visible */}
      <TopBar
        usage={usage}
        ragStatus={ragStatus}
        ragLoading={ragLoading}
        onReindex={onReindex}
        onResetUsage={onResetUsage}
        apiStatus={apiStatus}
        user={user}
        onLogout={onLogout}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {state === 'idle' && (
          <Dashboard
            usage={usage}
            ragStatus={ragStatus}
            history={history}
            onLoadHistory={onLoadHistory}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
          />
        )}

        {state === 'loading' && <Loading provider={result?.provider_utilise} model={result?.model_utilise} />}

        {(state === 'result' || state === 'error') && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-card border-b border-border">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTab('document')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    tab === 'document'
                      ? 'bg-accent border-primary/30 text-primary font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Document
                </button>
                {result?.brief_strategique && (
                  <button
                    onClick={() => setTab('brief')}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      tab === 'brief'
                        ? 'bg-accent border-primary/30 text-primary font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Brief stratégique
                  </button>
                )}
                {result && (
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                      {result.provider_utilise}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent border border-primary/20 text-primary">
                      {result.tokens_utilises.toLocaleString('fr-FR')} tokens
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {tab === 'document' && (
                  <>
                    <button onClick={downloadWord} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/30 hover:text-primary bg-card transition-all">
                      ↓ Word
                    </button>
                    <button onClick={printPDF} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/30 hover:text-primary bg-card transition-all">
                      ↓ PDF
                    </button>
                    <button onClick={copyText} className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      copied ? 'bg-accent border-primary/30 text-primary' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary bg-card'
                    }`}>
                      {copied ? '✓ Copié' : 'Copier'}
                    </button>
                  </>
                )}
                <button onClick={onReset} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground bg-card transition-all">
                  ← Retour
                </button>
              </div>
            </div>

            {/* Sub-navbar (document files) — visible only on document tab */}
            {tab === 'document' && state !== 'error' && (
              <div className="flex-shrink-0 flex items-center gap-1 px-5 py-2 border-b border-border bg-background">
                {([
                  { id: 'reponse',     label: 'Réponse' },
                  { id: 'equipe',      label: 'Équipe' },
                  { id: 'references',  label: 'Références' },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setDocFile(id)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all ${
                      docFile === id
                        ? 'bg-accent text-primary font-semibold border border-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                    }`}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Result content */}
            <div className="flex-1 overflow-y-auto bg-background p-8 flex justify-center items-start">
              {state === 'error' ? (
                <div className="max-w-lg w-full bg-card border border-destructive/20 rounded-2xl p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-foreground font-semibold mb-2">Erreur de génération</p>
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">{error}</p>
                </div>
              ) : (
                <>
                  {/* Brief tab */}
                  {result?.brief_strategique && (
                    <div className={`max-w-2xl w-full bg-card rounded-2xl border border-border p-8 ${tab !== 'brief' ? 'hidden' : ''}`}>
                      <div className="flex items-center gap-2 mb-5">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">Brief stratégique</h2>
                      </div>
                      <div
                        className="word-body text-foreground prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: marked.parse(result.brief_strategique) as string }}
                      />
                    </div>
                  )}

                  {/* Document tab — Réponse */}
                  <div
                    ref={wordRef}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck
                    className={`word-body text-black w-[794px] max-w-full focus:outline-none ${tab !== 'document' || docFile !== 'reponse' ? 'hidden' : ''}`}
                    style={{ fontFamily: 'Calibri, Segoe UI, Arial, sans-serif', fontSize: '11pt', lineHeight: '1.65' }}
                  />

                  {/* Document tab — Équipe */}
                  {tab === 'document' && docFile === 'equipe' && (
                    <div className="max-w-2xl w-full bg-card rounded-2xl border border-border p-10 text-center">
                      <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
                        <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-foreground mb-1">Fichier Équipe</p>
                      <p className="text-xs text-muted-foreground">Cette section sera générée prochainement — présentation des profils mobilisés sur le marché.</p>
                    </div>
                  )}

                  {/* Document tab — Références */}
                  {tab === 'document' && docFile === 'references' && (
                    <div className="max-w-2xl w-full bg-card rounded-2xl border border-border p-10 text-center">
                      <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
                        <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-foreground mb-1">Fichier Références</p>
                      <p className="text-xs text-muted-foreground">Cette section sera générée prochainement — tableau des missions similaires réalisées.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
