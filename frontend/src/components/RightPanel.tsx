import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import catGenerationUrl from "../assets/Cat Loading Generation.lottie?url";
import { marked } from "marked";
import type {
  GenerationResult,
  CompanyData,
  AppState,
  UsageData,
  RagStatus,
  HistorySummary,
  User,
} from "../types";
import { exportDocx } from "../api";
import AoPipelinePage from "../pages/AoPipelinePage"; // kept intact -- feature in progress
import ComingSoonAo from "../pages/ComingSoonAo";
import DashboardPage from "../pages/DashboardPage";
import VeilleHubPage from "../pages/VeilleHubPage";
import DocumentsTab from "./DocumentsTab";
import ParapheTab from "./ParapheTab";
import RemplissageTab from "./RemplissageTab";
import { useTheme } from "../hooks/useTheme";
import LanguageSelector from "./LanguageSelector";

// ── Helpers ─────────────────────────────────────────────────
function toRoman(n: number): string {
  const vals = [10, 9, 5, 4, 1];
  const syms = ["X", "IX", "V", "IV", "I"];
  let r = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      r += syms[i];
      n -= vals[i];
    }
  }
  return r;
}

// ── Document HTML builder ───────────────────────────────────
function buildDocumentHTML(
  result: GenerationResult,
  company: CompanyData,
  aoText: string,
  logoBase64: string = "",
): string {
  const now = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const aoLine =
    aoText
      .split("\n")
      .find((l) => l.trim().length > 10)
      ?.trim() ?? "Appel d'offres";

  const meta = [
    company.forme_juridique,
    company.rc ? `RC ${company.rc}` : null,
    company.ice ? `ICE ${company.ice}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const location = [company.adresse, company.ville].filter(Boolean).join(", ");
  const sections = result.sections?.length > 0 ? result.sections : null;
  const totalPages = sections ? sections.length + 2 : 2; // cover + TOC + sections

  // ABI Consulting palette
  const BLUE = "#1B3F6B";
  const TEAL = "#17A589";
  const LBLUE = "#D5E8F5";
  const BODY = "#1a1a2e";

  // Cover : hauteur fixe A4 simulée. Content pages : hauteur naturelle (pas de min-height)
  const coverCss = `background:white;padding:2.2cm 2.8cm 2cm;box-sizing:border-box;min-height:1060px;display:flex;flex-direction:column;position:relative;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);`;
  const pageCss = `background:white;padding:1.8cm 2.8cm 1.6cm;box-sizing:border-box;position:relative;box-shadow:0 2px 16px rgba(0,0,0,0.08);`;
  const hdrCss = `display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;border-bottom:2px solid ${LBLUE};margin-bottom:22px;`;
  const ftrCss = `margin-top:28px;padding-top:10px;border-top:1px solid ${LBLUE};display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#9CA3AF;`;
  const sep = '<div style="height:20px;"></div>';

  // Styles embarqués  appliqués en preview ET en export
  const embeddedStyles = `<style>
    .section-content { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.75; color: #1a1a2e; }
    .section-content p  { margin: 0 0 0.8rem; text-align: justify; }
    .section-content h2 { font-size: 10.5pt; font-weight: 700; color: ${BLUE}; border-left: 3px solid ${TEAL}; padding-left: 8px; margin: 1.3rem 0 0.5rem; }
    .section-content h3 { font-size: 10pt; font-weight: 700; color: ${TEAL}; margin: 1rem 0 0.4rem; }
    .section-content h4 { font-size: 10pt; font-weight: 700; color: #2471A3; font-style: italic; margin: 0.8rem 0 0.3rem; }
    .section-content ul, .section-content ol { padding-left: 1.4rem; margin: 0.3rem 0 0.8rem; }
    .section-content li { margin-bottom: 0.35rem; line-height: 1.65; }
    .section-content strong { font-weight: 700; color: ${BODY}; }
    .section-content em { font-style: italic; color: #444; }
    .section-content table { width: 100%; border-collapse: collapse; margin: 0.9rem 0; font-size: 9.5pt; }
    .section-content th { background: ${BLUE}; color: white; padding: 7px 10px; text-align: left; font-weight: 600; font-size: 9pt; letter-spacing: 0.01em; }
    .section-content td { border: 1px solid #d1d5db; padding: 6px 10px; vertical-align: top; }
    .section-content tr:nth-child(even) td { background: #F0F7FF; }
    .section-content hr { border: none; border-top: 1px solid ${LBLUE}; margin: 1rem 0; }
    .section-content blockquote { border-left: 3px solid ${TEAL}; padding-left: 12px; color: #555; font-style: italic; margin: 0.8rem 0; }
  </style>`;

  // Logo : uniquement base64 (jamais de chemin relatif qui pointe vers le backend)
  const abiMark = logoBase64
    ? `<img src="${logoBase64}" style="height:36px;width:auto;display:block;">`
    : `<span style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:800;color:${BLUE};letter-spacing:-0.02em;">ABI <span style="color:${TEAL};">Consulting</span></span>`;

  // Wave decorations (CSS shapes)
  const wavesTR = `
    <div style="position:absolute;top:-60px;right:-60px;width:260px;height:200px;border-radius:0 0 0 120%;background:${LBLUE};opacity:0.55;z-index:0;"></div>
    <div style="position:absolute;top:-30px;right:-30px;width:175px;height:135px;border-radius:0 0 0 120%;background:${LBLUE};opacity:0.4;z-index:0;"></div>`;
  const wavesBL = `
    <div style="position:absolute;bottom:-60px;left:-60px;width:260px;height:200px;border-radius:0 120% 0 0;background:${LBLUE};opacity:0.55;z-index:0;"></div>
    <div style="position:absolute;bottom:-30px;left:-30px;width:175px;height:135px;border-radius:0 120% 0 0;background:${LBLUE};opacity:0.4;z-index:0;"></div>`;

  // ── PAGE 1 : Couverture ──
  const coverPage = `
<div style="${coverCss}justify-content:space-between;">
  ${wavesTR}${wavesBL}
  <div style="position:relative;z-index:1;">${abiMark}</div>
  <div style="text-align:center;flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:1;padding:0.8cm 0;">
    <div style="font-size:22pt;font-weight:800;color:${BLUE};margin-bottom:0.5cm;line-height:1.2;">Réponse à l'Appel d'Offres</div>
    <div style="height:5px;background:${LBLUE};margin:0 auto 0.5cm;width:65%;border-radius:3px;"></div>
    <div style="font-size:12pt;font-weight:700;color:${BODY};line-height:1.55;max-width:480px;margin:0 auto 0.4cm;">${aoLine.slice(0, 130)}${aoLine.length > 130 ? "…" : ""}</div>
    <div style="height:5px;background:${LBLUE};margin:0.5cm auto 0;width:65%;border-radius:3px;"></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1;border-top:1px solid ${LBLUE};padding-top:14px;">
    <div>
      <div style="font-size:7.5pt;font-weight:700;color:${BLUE};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Réalisé par :</div>
      <div style="font-size:10pt;font-weight:700;color:${BODY};">${company.nom || "ABI Consulting"}</div>
      ${meta ? `<div style="font-size:7.5pt;color:#6B7280;margin-top:3px;">${meta}</div>` : ""}
      ${location ? `<div style="font-size:7.5pt;color:#6B7280;">${location}</div>` : ""}
    </div>
    <div style="text-align:right;">
      <div style="font-size:7.5pt;color:#9CA3AF;">${now}</div>
      <div style="font-size:7pt;color:#9CA3AF;margin-top:3px;">Document confidentiel</div>
    </div>
  </div>
</div>`;

  // ── PAGE 2 : Sommaire ──
  const tocPage = sections
    ? `
${sep}
<div style="${pageCss}">
  <div style="${hdrCss}">
    <span style="font-size:8pt;color:#6B7280;font-style:italic;">${aoLine.slice(0, 90)}${aoLine.length > 90 ? "…" : ""}</span>
    ${abiMark}
  </div>
  <div style="flex:1;">
    <div style="font-size:20pt;font-weight:800;color:${TEAL};margin-bottom:0.6cm;">Sommaire</div>
    ${sections
      .map(
        (s, i) => `
    <div style="display:flex;align-items:baseline;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #F0F7FF;">
      <div style="font-size:8.5pt;font-weight:700;color:${BLUE};min-width:24px;">${toRoman(i + 1)}.</div>
      <div style="font-size:10.5pt;font-weight:600;color:${BODY};flex:1;padding:0 8px;text-transform:uppercase;letter-spacing:0.02em;">${s.titre}</div>
      <div style="font-size:8.5pt;color:#9CA3AF;min-width:24px;text-align:right;">${i + 3}</div>
    </div>`,
      )
      .join("")}
  </div>
  <div style="${ftrCss}">
    <span style="color:${BLUE};font-weight:600;">${company.nom || "ABI Consulting"}</span>
    <span style="color:${TEAL};">Réponse à l'appel d'offres · ${now}</span>
    <span style="font-weight:600;">Page 2 / ${totalPages}</span>
  </div>
</div>`
    : "";

  // ── PAGES 3+ : Sections ──
  const sectionPages = sections
    ? sections
        .map(
          (s, i) => `
${sep}
<div style="${pageCss}">
  <div style="${hdrCss}">
    <span style="font-size:8pt;color:#6B7280;font-style:italic;">${aoLine.slice(0, 90)}${aoLine.length > 90 ? "…" : ""}</span>
    ${abiMark}
  </div>
  <div style="flex:1;">
    <div style="font-size:14pt;font-weight:800;color:${BLUE};margin-bottom:6px;">${toRoman(i + 1)}. ${s.titre.toUpperCase()}</div>
    <div style="height:3px;background:${TEAL};width:55px;border-radius:2px;margin-bottom:18px;"></div>
    <div class="section-content">${marked.parse(s.contenu)}</div>
  </div>
  <div style="${ftrCss}">
    <span style="color:${BLUE};font-weight:600;">${company.nom || "ABI Consulting"}</span>
    <span style="color:${TEAL};">Réponse à l'appel d'offres · ${now}</span>
    <span style="font-weight:600;">Page ${i + 3} / ${totalPages}</span>
  </div>
</div>`,
        )
        .join("")
    : `
${sep}
<div style="${pageCss}">
  <div style="${hdrCss}">
    <span style="font-size:8pt;color:#6B7280;font-style:italic;">${aoLine.slice(0, 90)}</span>
    ${abiMark}
  </div>
  <div style="flex:1;" class="section-content">${marked.parse(result.texte_complet)}</div>
  <div style="${ftrCss}">
    <span style="color:${BLUE};font-weight:600;">${company.nom || "ABI Consulting"}</span>
    <span style="color:${TEAL};">Réponse à l'appel d'offres · ${now}</span>
    <span style="font-weight:600;">Page 2 / 2</span>
  </div>
</div>`;

  return embeddedStyles + coverPage + tocPage + sectionPages;
}

// ── Content top bar ──────────────────────────────────────────
function ContentTopBar({ mainTab, onOpenSidebar }: { mainTab: "offres" | "marches" | "outils" | "veille"; onOpenSidebar?: () => void }) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 58, padding: '0 24px', background: 'var(--l-card)',
      borderBottom: '1px solid var(--l-card-border)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onOpenSidebar && (
          <button onClick={onOpenSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-sub)', padding: 6, display: 'flex', borderRadius: 7, transition: 'color .15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--l-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--l-sub)'}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        )}
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--l-text)', letterSpacing: '-0.02em' }}>
          {t(`app.topbar.${mainTab}`)}
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={toggle} title={theme === 'dark' ? t('app.nav.lightMode') : t('app.nav.darkMode')}
          style={{ background: 'none', border: '1px solid var(--l-card-border)', cursor: 'pointer', color: 'var(--l-sub)', padding: '7px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', transition: 'border-color .15s, color .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--l-blue)'; e.currentTarget.style.color = 'var(--l-blue)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--l-card-border)'; e.currentTarget.style.color = 'var(--l-sub)'; }}
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          )}
        </button>
        <LanguageSelector />
      </div>
    </header>
  );
}

// ── Dashboard (idle state) ──────────────────────────────────
function Dashboard({
  usage,
  ragStatus,
  history,
  onLoadHistory,
  onDeleteHistory,
  onClearHistory,
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
      label: "Réponses générées",
      value: String(usage?.total_appels ?? 0),
      sub:
        usage && usage.max_appels > 0
          ? `sur ${usage.max_appels} disponibles`
          : "cette session",
      icon: (
        <svg
          className="h-4 w-4 text-accent-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      label: "Tokens utilisés",
      value: usage
        ? usage.total_tokens > 999
          ? `${(usage.total_tokens / 1000).toFixed(1)}k`
          : String(usage.total_tokens)
        : "0",
      sub:
        usage && usage.max_tokens_cumul > 0
          ? `sur ${(usage.max_tokens_cumul / 1000).toFixed(0)}k max`
          : "cette session",
      icon: (
        <svg
          className="h-4 w-4 text-accent-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
        </svg>
      ),
    },
    {
      label: "Base documentaire",
      value: ragStatus?.ready ? String(ragStatus.chunk_count) : "",
      sub: ragStatus?.ready ? "chunks indexés" : "RAG non configuré",
      icon: (
        <svg
          className="h-4 w-4 text-accent-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
    },
  ];

  const steps = [
    {
      n: "01",
      title: "Déposez votre AO",
      desc: "Fichier .txt, .pdf ou texte libre",
    },
    {
      n: "02",
      title: "Choisissez le modèle",
      desc: "Claude, GPT-4 ou Mistral",
    },
    {
      n: "03",
      title: "Profil entreprise",
      desc: "Vos références et expertises",
    },
    {
      n: "04",
      title: "Générez",
      desc: "9 appels LLM spécialisés en parallèle",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-4 space-y-4">
        {/* Hero */}
        <div className="space-y-1 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Prêt à remporter votre prochain marché ?
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Remplissez le formulaire à gauche et générez une réponse
            professionnelle en quelques secondes.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {statCards.map(({ label, value, sub, icon }) => (
            <div
              key={label}
              className="border border-border rounded-xl bg-card p-3 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in min-w-0"
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight line-clamp-2">
                  {label}
                </span>
                <div className="h-6 w-6 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                  {icon}
                </div>
              </div>
              <p className="text-xl font-bold text-foreground tracking-tight truncate">
                {value}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {sub}
              </p>
            </div>
          ))}
        </div>

        {/* CTA card */}
        <div className="gradient-cta rounded-2xl p-5 shadow-elevated relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,hsl(280_60%_65%_/_0.3),transparent_60%)]" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-foreground/15 text-primary-foreground text-[10px] font-semibold uppercase tracking-wider mb-2">
                <svg
                  className="h-2.5 w-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 3l14 9-14 9V3z"
                  />
                </svg>
                Démarrer
              </span>
              <h2 className="text-lg font-bold text-primary-foreground mb-1">
                Commencer une réponse AO
              </h2>
              <p className="text-sm text-primary-foreground/80 max-w-lg">
                Déposez votre AO à gauche, puis cliquez sur{" "}
                <strong className="text-primary-foreground">
                  Générer la réponse
                </strong>
                .
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-primary-foreground/70 flex-shrink-0">
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                9 sections en parallèle
              </span>
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Format Word éditable
              </span>
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                ⌘ Entrée pour lancer
              </span>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Comment ça fonctionne
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {steps.map(({ n, title, desc }) => (
              <div
                key={n}
                className="flex flex-col gap-1.5 p-3 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all group"
              >
                <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {title}
                  </p>
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
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
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
                      <p className="text-sm font-semibold text-foreground truncate pr-4">
                        {entry.ao_excerpt}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                          </svg>
                          {entry.company_nom}
                        </span>
                        <span>·</span>
                        <span>{entry.provider}</span>
                        <span>·</span>
                        <span>
                          {entry.tokens_utilises.toLocaleString("fr-FR")} tokens
                        </span>
                        <span>·</span>
                        <span>
                          {new Date(entry.created_at).toLocaleDateString(
                            "fr-FR",
                            {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteHistory(entry.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
                        title="Supprimer"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      <svg
                        className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m9 18 6-6-6-6"
                        />
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
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <DotLottieReact
        src={catGenerationUrl}
        loop
        autoplay
        style={{ width: 420, height: 420, marginBottom: "-60px" }}
      />
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">
          Génération en cours…
        </p>
        {provider && model && (
          <p className="text-sm text-primary mt-1 font-medium">
            {provider} · {model}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page Outils ─────────────────────────────────────────────
export type Outil = "signatures" | "paraphe" | "remplissage";

const OUTILS_NAV: { id: Outil; label: string; desc: string; icon: string }[] = [
  {
    id: "signatures",
    label: "Signature & Cachet",
    desc: "Signer avec signature et cachet personnalisés",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
  {
    id: "paraphe",
    label: "Paraphe",
    desc: "Parapher toutes les pages d'un document",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  },
  {
    id: "remplissage",
    label: "Remplissage automatique",
    desc: "Remplir acte d'engagement et bordereau",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
];

// Panneau gauche Outils  rendu dans App.tsx au même niveau que LeftPanel
export function OutilsLeftPanel({
  section,
  onSectionChange,
  onGoLanding,
}: {
  section: Outil;
  onSectionChange: (s: Outil) => void;
  onGoLanding?: () => void;
}) {
  const active = OUTILS_NAV.find((o) => o.id === section)!;

  return (
    <aside className="w-[320px] min-w-[320px] h-screen border-r border-border bg-card flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="h-14 flex-shrink-0 px-4 border-b border-border flex items-center">
        <button
          onClick={onGoLanding}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <span className="font-display font-bold text-foreground text-lg tracking-tight">
            ADJUJA
          </span>
        </button>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Outils disponibles
          </p>
          <div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
            {OUTILS_NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all ${
                  section === item.id
                    ? "bg-primary/8 text-primary"
                    : "text-foreground hover:bg-muted/50"
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    section === item.id ? "bg-primary/15" : "bg-muted"
                  }`}
                >
                  <svg
                    className={`h-4 w-4 ${section === item.id ? "text-primary" : "text-muted-foreground"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={item.icon}
                    />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm font-medium leading-tight ${section === item.id ? "text-primary" : "text-foreground"}`}
                  >
                    {item.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.desc}
                  </span>
                </div>
                {section === item.id && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer  outil actif */}
      <div className="px-3 py-4 border-t border-border flex-shrink-0">
        <div className="w-full rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <svg
              className="h-4 w-4 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={active.icon}
              />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {active.label}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Outil actif
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// Contenu seul (rendu dans RightPanel)
function OutilsContent({
  section,
  onSectionChange,
}: {
  section: Outil;
  onSectionChange?: (s: Outil) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Nav mobile horizontale (desktop : panneau gauche) */}
      {onSectionChange && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '12px 16px 0',
            overflowX: 'auto',
            flexShrink: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {OUTILS_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 10,
                border: `1px solid ${section === item.id ? 'var(--l-blue)' : 'var(--l-card-border)'}`,
                background: section === item.id ? 'color-mix(in srgb, var(--l-blue) 10%, transparent)' : 'var(--l-card)',
                color: section === item.id ? 'var(--l-blue)' : 'var(--l-sub)',
                fontSize: 13,
                fontWeight: section === item.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all .15s',
                whiteSpace: 'nowrap',
              }}
            >
              <svg
                width="14" height="14" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}
                style={{ flexShrink: 0 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        {section === "signatures"  && <DocumentsTab />}
        {section === "paraphe"     && <ParapheTab />}
        {section === "remplissage" && <RemplissageTab />}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
type Props = {
  state: AppState;
  result: GenerationResult | null;
  error: string;
  company: CompanyData;
  aoText: string;
  onReset: () => void;
  usage: UsageData | null;
  ragStatus: RagStatus | null;
  history: HistorySummary[];
  onLoadHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
  apiStatus: "online" | "offline" | "connecting";
  ragLoading: boolean;
  onReindex: () => void;
  onResetUsage: () => void;
  user: User;
  onLogout: () => void;
  mainTab: "offres" | "marches" | "outils" | "veille";
  onMainTabChange: (tab: "offres" | "marches" | "outils" | "veille") => void;
  outilSection: Outil;
  onOutilSectionChange?: (s: Outil) => void;
  onOpenSidebar?: () => void;
};

export default function RightPanel({
  state,
  result,
  error,
  company,
  aoText,
  onReset,
  usage,
  ragStatus,
  history,
  onLoadHistory,
  onDeleteHistory,
  onClearHistory,
  apiStatus,
  ragLoading,
  onReindex,
  onResetUsage,
  user,
  onLogout,
  mainTab,
  onMainTabChange,
  outilSection,
  onOutilSectionChange,
  onOpenSidebar,
}: Props) {
  const wordRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [tab, setTab] = useState<"document" | "brief">("document");
  const [docFile, setDocFile] = useState<"reponse" | "equipe" | "references">(
    "reponse",
  );
  const [logoBase64, setLogoBase64] = useState<string>("");

  // Load logo once at mount
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      setLogoBase64(canvas.toDataURL("image/png"));
    };
    img.src = "/logo_abi.png";
  }, []);

  useEffect(() => {
    if (state === "result" && result && wordRef.current) {
      setTab("document");
      setDocFile("reponse");
      wordRef.current.innerHTML = buildDocumentHTML(
        result,
        company,
        aoText,
        logoBase64,
      );
    }
  }, [state, result, company, aoText, logoBase64]);

  function copyText() {
    const text = wordRef.current?.innerText ?? result?.texte_complet ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function downloadWord() {
    if (!result) return;
    try {
      const blob = await exportDocx(result, company.nom || "", aoText);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(company.nom || "reponse").replace(/\s+/g, "_")}_ao.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setWordError("Erreur lors de la génération du fichier Word.");
      setTimeout(() => setWordError(null), 4000);
    }
  }

  function printPDF() {
    if (!result) return;
    const html = buildDocumentHTML(result, company, aoText, logoBase64);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${company.nom || "Réponse AO"}</title><style>body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.65;color:#1a1a2e;margin:0;background:white;}@page{margin:2cm 2.5cm;}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 400);
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Top bar  always visible */}
      <ContentTopBar mainTab={mainTab} onOpenSidebar={onOpenSidebar} />

      {/* Pipeline AO tab -- coming soon screen (AoPipelinePage conservé, non supprimé) */}
      {mainTab === "marches" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <ComingSoonAo />
        </div>
      )}

      {/* Veille tab (Marches publics + Bons de commande) */}
      {mainTab === "veille" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <VeilleHubPage />
        </div>
      )}

      {/* Outils tab  contenu seul (panneau gauche rendu dans App.tsx sur desktop) */}
      {mainTab === "outils" && (
        <OutilsContent section={outilSection} onSectionChange={onOutilSectionChange} />
      )}

      {/* Dashboard / Génération tab */}
      {mainTab === "offres" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {state === "idle" && (
            <DashboardPage />
          )}

          {state === "loading" && (
            <Loading
              provider={result?.provider_utilise}
              model={result?.model_utilise}
            />
          )}

          {(state === "result" || state === "error") && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-card border-b border-border">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTab("document")}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      tab === "document"
                        ? "bg-accent border-primary/30 text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Document
                  </button>
                  {result?.brief_strategique && (
                    <button
                      onClick={() => setTab("brief")}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        tab === "brief"
                          ? "bg-accent border-primary/30 text-primary font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
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
                        {result.tokens_utilises.toLocaleString("fr-FR")} tokens
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {tab === "document" && (
                    <>
                      {wordError && (
                        <span style={{ fontSize: 11, color: '#dc2626', alignSelf: 'center' }}>{wordError}</span>
                      )}
                      <button
                        onClick={downloadWord}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/30 hover:text-primary bg-card transition-all"
                      >
                        ↓ Word
                      </button>
                      <button
                        onClick={printPDF}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-primary/30 hover:text-primary bg-card transition-all"
                      >
                        ↓ PDF
                      </button>
                      <button
                        onClick={copyText}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                          copied
                            ? "bg-accent border-primary/30 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary bg-card"
                        }`}
                      >
                        {copied ? "✓ Copié" : "Copier"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={onReset}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground bg-card transition-all"
                  >
                    ← Retour
                  </button>
                </div>
              </div>

              {/* Sub-navbar (document files)  visible only on document tab */}
              {tab === "document" && state !== "error" && (
                <div className="flex-shrink-0 flex items-center gap-1 px-5 py-2 border-b border-border bg-background">
                  {(
                    [
                      { id: "reponse", label: "Réponse" },
                      { id: "equipe", label: "Équipe" },
                      { id: "references", label: "Références" },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setDocFile(id)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all ${
                        docFile === id
                          ? "bg-accent text-primary font-semibold border border-primary/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                      }`}
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Result content */}
              <div className="flex-1 overflow-y-auto bg-background p-8 flex justify-center items-start">
                {state === "error" ? (
                  <div className="max-w-lg w-full bg-card border border-destructive/20 rounded-2xl p-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-5 h-5 text-destructive"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                    <p className="text-foreground font-semibold mb-2">
                      Erreur de génération
                    </p>
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {error}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Brief tab */}
                    {result?.brief_strategique && (
                      <div
                        className={`max-w-2xl w-full bg-card rounded-2xl border border-border p-8 ${tab !== "brief" ? "hidden" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-5">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <h2 className="text-sm font-semibold text-foreground uppercase tracking-widest">
                            Brief stratégique
                          </h2>
                        </div>
                        <div
                          className="word-body text-foreground prose max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(
                              result.brief_strategique,
                            ) as string,
                          }}
                        />
                      </div>
                    )}

                    {/* Document tab  Réponse */}
                    <div
                      ref={wordRef}
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck
                      className={`word-body text-black w-[794px] max-w-full focus:outline-none ${tab !== "document" || docFile !== "reponse" ? "hidden" : ""}`}
                      style={{
                        fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
                        fontSize: "11pt",
                        lineHeight: "1.65",
                      }}
                    />

                    {/* Document tab  Équipe */}
                    {tab === "document" && docFile === "equipe" && (
                      <div className="max-w-2xl w-full bg-card rounded-2xl border border-border p-10 text-center">
                        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
                          <svg
                            className="h-5 w-5 text-accent-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          Fichier Équipe
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cette section sera générée prochainement présentation
                          des profils mobilisés sur le marché.
                        </p>
                      </div>
                    )}

                    {/* Document tab  Références */}
                    {tab === "document" && docFile === "references" && (
                      <div className="max-w-2xl w-full bg-card rounded-2xl border border-border p-10 text-center">
                        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
                          <svg
                            className="h-5 w-5 text-accent-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          Fichier Références
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cette section sera générée prochainement tableau des
                          missions similaires réalisées.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* fin mainTab === 'offres' */}
    </div>
  );
}
