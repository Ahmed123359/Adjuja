// Ce que fait le produit -- refait le 2026-09-27.
//
// Remplace la grille de quatre cartes (« Un copilote complet ») : titre trop
// petit, formules generiques, et du CSS injecte a l'execution. Ici, les quatre
// moments d'un appel d'offres a gauche ; a droite, l'ecran correspondant tel
// qu'il existe dans l'application (veille, score de compatibilite, dossier,
// signature). Les donnees affichees sont des exemples, pas des statistiques.
//
// La liste et l'ecran ont la meme hauteur fixe sur grand ecran (retour du
// 2026-09-27 : l'ecran « Decider » depassait de loin la liste et les autres
// ecrans). Chaque ecran remplit cette hauteur et se termine par un pied commun.

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Moment = { key: string; title: string; desc: string };
type Row = { acheteur: string; objet: string; echeance: string; budget: string };
type Factor = { label: string; score: number; note: string };
type Doc = { nom: string; etat: string };
type Screens = {
  veilleTitle: string; veilleCount: string; rows: Row[]; veilleFooter: string;
  decisionTitle: string; decisionBase: string; eligible: string; factors: Factor[]; decisionGap: string;
  prepTitle: string; docs: Doc[]; prepFooter: string;
  signTitle: string; sign: string[]; signFooter: string;
};

function couleur(score: number): string {
  if (score >= 70) return "bg-[var(--l-pos)]";
  if (score >= 40) return "bg-[var(--l-hold)]";
  return "bg-[var(--l-neg)]";
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden className={`shrink-0 ${className}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* Pied commun des ecrans : colle en bas, il aligne les quatre ecrans. */
function Pied({ children, className = "text-l-text-dim" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mt-auto border-t border-l-border bg-l-surface-2 px-6 py-4 text-[14px] font-semibold ${className}`}>
      {children}
    </div>
  );
}

function Veille({ s }: { s: Screens }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b border-l-border px-6 py-4">
        <span className="text-[16px] font-semibold text-l-text">{s.veilleTitle}</span>
        <span className="text-[14px] font-semibold text-[color:var(--l-blue-soft)]">{s.veilleCount}</span>
      </div>
      <ul className="m-0 list-none p-0">
        {s.rows.map((r, i) => (
          <li key={r.objet} className={`grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-6 py-4 ${i ? "border-t border-l-border" : ""}`}>
            <span className="text-[15px] font-semibold text-l-text">{r.acheteur}</span>
            <span className="text-right text-[15px] font-semibold tabular-nums text-l-text">{r.budget}</span>
            <span className="text-[15px] leading-[1.45] text-l-text-dim">{r.objet}</span>
            <span className={`text-right text-[14px] font-semibold ${i === 0 ? "text-[color:var(--l-hold)]" : "text-l-text-dim"}`}>{r.echeance}</span>
          </li>
        ))}
      </ul>
      <Pied>{s.veilleFooter}</Pied>
    </div>
  );
}

function Decision({ s }: { s: Screens }) {
  // Memes poids que le fit score de l'application (qualifications 30,
  // capacite 20, references 20, equipe 15, conformite 10) : l'exemple
  // affiche le calcul reel, pas une moyenne simple.
  const POIDS = [30, 20, 20, 15, 10];
  const total = s.factors.reduce((a, _, i) => a + (POIDS[i] ?? 0), 0);
  const score = Math.round(s.factors.reduce((a, f, i) => a + f.score * (POIDS[i] ?? 0), 0) / total);
  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 pt-5">
        {/* Le score porte l'ecran : c'est la reponse a « j'y vais ou pas ? ». */}
        <div className="flex items-end justify-between gap-4 border-b border-l-border pb-4">
          <div>
            <p className="m-0 text-[15px] font-semibold text-l-text-dim">{s.decisionTitle}</p>
            <p className="m-0 mt-2 flex items-baseline gap-2">
              <span className="text-[72px] font-extrabold leading-[0.9] tracking-[-.04em] tabular-nums text-[color:var(--l-pos)]">{score}</span>
              <span className="text-[18px] font-semibold text-l-text-dim">/ 100</span>
            </p>
          </div>
          <span className="mb-1 shrink-0 rounded-[6px] bg-[color-mix(in_srgb,var(--l-pos)_16%,transparent)] px-3 py-1.5 text-[15px] font-bold text-[color:var(--l-pos)]">
            {s.eligible}
          </span>
        </div>
        <p className="m-0 mt-3 text-[14px] text-l-text-dim">{s.decisionBase}</p>

        {/* Une ligne par critere : le detail de ce qui manque passe dans le
            pied, sinon l'ecran double de hauteur. */}
        <ul className="m-0 mt-2 list-none p-0 pb-3">
          {s.factors.map((f) => (
            <li key={f.label} className="grid grid-cols-[minmax(0,13rem)_1fr_2.5rem] items-center gap-4 py-2" title={f.note}>
              <span className="truncate text-[15px] font-semibold text-l-text">{f.label}</span>
              <span className="h-[6px] overflow-hidden rounded-full bg-[var(--l-surface-3)]">
                <span className={`block h-full rounded-full ${couleur(f.score)}`} style={{ width: `${f.score}%` }} />
              </span>
              <span className="text-right text-[15px] font-semibold tabular-nums text-l-text">{f.score}</span>
            </li>
          ))}
        </ul>
      </div>
      <Pied className="text-[color:var(--l-hold)]">{s.decisionGap}</Pied>
    </div>
  );
}

function Preparation({ s }: { s: Screens }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-l-border px-6 py-4 text-[16px] font-semibold text-l-text">{s.prepTitle}</div>
      <ul className="m-0 list-none p-0">
        {s.docs.map((d, i) => {
          const fait = i < s.docs.length - 1;
          return (
            <li key={d.nom} className={`flex items-center justify-between gap-4 px-6 py-4 ${i ? "border-t border-l-border" : ""}`}>
              <span className="flex items-center gap-3 text-[15px] font-semibold text-l-text">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="shrink-0 text-l-text-dim">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {d.nom}
              </span>
              <span className={`flex items-center gap-1.5 text-[14px] font-semibold ${fait ? "text-[color:var(--l-pos)]" : "text-[color:var(--l-hold)]"}`}>
                {fait ? <Check /> : <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--l-hold)]" aria-hidden />}
                {d.etat}
              </span>
            </li>
          );
        })}
      </ul>
      <Pied>{s.prepFooter}</Pied>
    </div>
  );
}

function Signature({ s }: { s: Screens }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-l-border px-6 py-4 text-[16px] font-semibold text-l-text">{s.signTitle}</div>
      <ul className="m-0 list-none p-0">
        {s.sign.map((ligne, i) => {
          const dernier = i === s.sign.length - 1;
          return (
            <li
              key={ligne}
              className={`flex items-center gap-3 px-6 py-4 text-[15px] font-semibold ${i ? "border-t border-l-border" : ""} ${dernier ? "bg-[color-mix(in_srgb,var(--l-blue)_12%,transparent)] text-[color:var(--l-blue-soft)]" : "text-l-text"}`}
            >
              <Check className={dernier ? "text-[color:var(--l-blue-soft)]" : "text-[color:var(--l-pos)]"} />
              {ligne}
            </li>
          );
        })}
      </ul>
      <Pied className="text-[color:var(--l-pos)]">{s.signFooter}</Pied>
    </div>
  );
}

const ECRANS = [Veille, Decision, Preparation, Signature];

export default function FeaturesSection() {
  const { t } = useTranslation();
  const moments = t("landing.product.moments", { returnObjects: true }) as Moment[];
  const screens = t("landing.product.screens", { returnObjects: true }) as Screens;
  const [actif, setActif] = useState(0);
  const Ecran = ECRANS[actif] ?? Veille;

  return (
    <section id="features" className="bg-l-bg px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1200px]">
        <div className="animate-on-scroll mx-auto max-w-[880px] text-center">
          <h2 className="m-0 text-[clamp(2.3rem,4.6vw,3.9rem)] font-extrabold leading-[1.04] tracking-[-.03em] text-l-text">
            {t("landing.product.title")}
          </h2>
          <p className="m-0 mx-auto mt-5 max-w-[640px] text-[clamp(1.05rem,1.3vw,1.2rem)] leading-[1.6] text-l-text-dim">
            {t("landing.product.subtitle")}
          </p>
        </div>

        <div className="animate-on-scroll mt-12 grid gap-8 lg:mt-16 lg:h-[500px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          {/* Le moment choisi prend la hauteur restante : la liste finit au
              meme niveau que l'ecran, quel que soit le moment. */}
          <ol role="tablist" aria-label={t("landing.product.title")} className="m-0 flex list-none flex-col p-0">
            {moments.map((m, i) => {
              const choisi = i === actif;
              return (
                <li key={m.key} className={`flex border-t border-l-border last:border-b ${choisi ? "lg:flex-1" : ""}`}>
                  <button
                    role="tab"
                    aria-selected={choisi}
                    onClick={() => setActif(i)}
                    className="flex w-full cursor-pointer items-start gap-5 rounded-[8px] border-0 bg-transparent py-6 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--l-blue)]"
                  >
                    <span className={`pt-1 text-[15px] font-semibold tabular-nums ${choisi ? "text-[color:var(--l-blue-soft)]" : "text-l-text-dim"}`}>
                      0{i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[22px] font-bold tracking-[-.01em] transition-colors ${choisi ? "text-l-text" : "text-l-text-dim hover:text-l-text"}`}>
                        {m.title}
                      </span>
                      {choisi && (
                        <span className="mt-2 block animate-fade-in text-[16px] leading-[1.6] text-l-text-dim">{m.desc}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div
            role="tabpanel"
            className="flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-l-border-strong bg-l-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between border-b border-l-border bg-l-surface-2 px-6 py-3">
              <span className="text-[14px] font-semibold text-l-text">Adjuja</span>
              <span className="text-[14px] text-l-text-dim">{moments[actif]?.title}</span>
            </div>
            <div key={actif} className="flex min-h-0 flex-1 animate-fade-in flex-col">
              <Ecran s={screens} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
