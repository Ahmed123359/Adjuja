// Mise en page des ecrans d'authentification -- refaite le 2026-09-27.
//
// Remplace le panneau de cartes flottantes inclinees (GO 82/100, « 656 AOs
// surveilles » fige alors que la veille en compte plus du double, textes en dur
// a 12px, pastilles en pilule) par l'identite du site public : les orbites du
// pied de page, l'ecran de compatibilite de la section produit (memes donnees
// d'exemple, memes poids que le fit score) et la bande des acheteurs. Forcee en
// sombre (.landing-dark) : les champs passaient en blanc chez un visiteur en
// theme clair.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Orbites from "../../landing/components/Orbites";
import BuyersMarquee from "../../landing/components/BuyersMarquee";

type Factor = { label: string; score: number; note: string };
type Screens = { decisionTitle: string; decisionBase: string; eligible: string; factors: Factor[] };

// Memes poids que le fit score de l'application (qualifications 30,
// capacite 20, references 20, equipe 15, conformite 10).
const POIDS = [30, 20, 20, 15, 10];

function couleur(score: number): string {
  if (score >= 70) return "bg-[var(--l-pos)]";
  if (score >= 40) return "bg-[var(--l-hold)]";
  return "bg-[var(--l-neg)]";
}

/** Ecran « Decider » de l'application, en carte. Les barres se remplissent a
 *  l'arrivee sur la page. */
function CarteScore() {
  const { t } = useTranslation();
  const s = t("landing.product.screens", { returnObjects: true }) as Screens;
  const [rempli, setRempli] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setRempli(true), 250); return () => window.clearTimeout(id); }, []);

  const total = s.factors.reduce((a, _, i) => a + (POIDS[i] ?? 0), 0);
  const score = Math.round(s.factors.reduce((a, f, i) => a + f.score * (POIDS[i] ?? 0), 0) / total);

  return (
    <div className="w-full max-w-[460px] overflow-hidden rounded-[12px] border border-l-border-strong bg-[#0D1326]/90 shadow-[0_40px_100px_rgba(0,0,0,0.55)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-l-border bg-white/[0.03] px-6 py-3">
        <span className="text-[14px] font-semibold text-white">Adjuja</span>
        <span className="text-[14px] text-white/55">{t("landing.product.moments.1.title")}</span>
      </div>
      <div className="px-6 pb-6 pt-5">
        <div className="flex items-end justify-between gap-4 border-b border-l-border pb-4">
          <div>
            <p className="m-0 text-[15px] font-semibold text-[#C6D0E3]">{s.decisionTitle}</p>
            <p className="m-0 mt-2 flex items-baseline gap-2">
              <span className="text-[64px] font-extrabold leading-[0.9] tracking-[-.04em] tabular-nums text-[color:var(--l-pos)]">{score}</span>
              <span className="text-[17px] font-semibold text-white/55">/ 100</span>
            </p>
          </div>
          <span className="mb-1 shrink-0 rounded-[6px] bg-[color-mix(in_srgb,var(--l-pos)_16%,transparent)] px-3 py-1.5 text-[15px] font-bold text-[color:var(--l-pos)]">
            {s.eligible}
          </span>
        </div>
        <ul className="m-0 mt-3 list-none p-0">
          {s.factors.map((f, i) => (
            <li key={f.label} className="grid grid-cols-[minmax(0,11.5rem)_1fr_2.25rem] items-center gap-4 py-2">
              <span className="truncate text-[14px] font-semibold text-white">{f.label}</span>
              <span className="h-[6px] overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className={`block h-full rounded-full ${couleur(f.score)} transition-[width] duration-700 ease-out`}
                  style={{ width: rempli ? `${f.score}%` : "0%", transitionDelay: `${i * 90}ms` }}
                />
              </span>
              <span className="text-right text-[14px] font-semibold tabular-nums text-white">{f.score}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="landing-dark min-h-[100svh] bg-l-bg text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">

      {/* Formulaire */}
      <div className="flex min-h-[100svh] flex-col px-5 py-5 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src="/logo-adjuja-mark.png" alt="" className="h-10 w-10 rounded-[10px]" />
            <span className="text-[24px] font-extrabold leading-none tracking-[-.03em] text-white">Adjuja</span>
          </Link>
          <Link to="/" className="text-[15px] font-semibold text-[#C6D0E3] no-underline transition-colors hover:text-white">
            <span aria-hidden>←</span> {t("auth.common.backToSite")}
          </Link>
        </div>

        <main className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[440px]">{children}</div>
        </main>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[14px] text-white/50">
          <span>{t("landing.footer.copyright")}</span>
          <Link to="/cgu" className="text-white/60 no-underline hover:text-white">{t("legal.cgu.title")}</Link>
          <Link to="/confidentialite" className="text-white/60 no-underline hover:text-white">{t("legal.confidentialite.title")}</Link>
        </div>
      </div>

      {/* Panneau de marque, masque sous lg : le formulaire passe avant tout. */}
      <aside aria-hidden className="hidden p-3 lg:block">
        <div className="sticky top-3 flex h-[calc(100svh-24px)] min-h-[640px] flex-col overflow-hidden rounded-[20px] border border-l-border bg-[radial-gradient(120%_80%_at_50%_0%,#12205A_0%,#0A1030_45%,#070A1A_100%)]">
          <div className="relative flex-1">
            <Orbites />
            <div className="relative flex h-full flex-col items-center justify-center gap-10 px-10 pt-12">
              <p className="m-0 max-w-[520px] text-center text-[clamp(1.7rem,2.4vw,2.4rem)] font-extrabold leading-[1.1] tracking-[-.03em] text-white">
                {t("landing.hero.titleLine1")}{" "}
                <span className="text-[color:var(--l-blue-soft)]">{t("landing.hero.titleHighlight")}</span>
              </p>
              <CarteScore />
            </div>
          </div>
          <div className="relative border-t border-white/10 pb-7 pt-6">
            <BuyersMarquee compact />
          </div>
        </div>
      </aside>
    </div>
  );
}
