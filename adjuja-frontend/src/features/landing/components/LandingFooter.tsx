// Pied de page du site public -- refait le 2026-09-27, deuxieme passe.
//
// Premiere passe jugee « trop classique ». Quatre etages :
//  1. un bandeau de cloture (inscription ; la FAQ juste au-dessus porte deja
//     le contact) sur des orbites animees qui reprennent la Terre et la lune
//     du heros : le site s'ouvre et se ferme sur la meme image ;
//  2. identite et contact a gauche, trois colonnes a droite ;
//  3. le mot-symbole « Adjuja » en tres grand, balaye par un reflet ;
//  4. la ligne de copyright.
// Remplace aussi, a la premiere passe, un fetch() direct dans le composant,
// des messages en dur et une feuille de style injectee.

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { subscribeNewsletter } from "../api";
import Orbites from "./Orbites";

function Colonne({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[16px] font-bold text-white">{titre}</p>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

/* Couleur pleine, pas le gris attenue des textes secondaires : dans une
   colonne de liens, chaque ligne est une action et doit se lire nettement. */
const lien = "w-fit whitespace-nowrap text-[16px] font-medium text-[#C6D0E3] no-underline transition-colors hover:text-white";

function Icone({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="shrink-0 text-[color:var(--l-blue-soft)]">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONE_MAIL = "M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z";
const ICONE_TEL = "M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z";
const ICONE_LIEU = "M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z";

export default function LandingFooter({
  onEnterApp,
  onGoRegister,
}: {
  onEnterApp: () => void;
  onGoRegister: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [erreur, setErreur] = useState("");

  async function inscrire(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEtat("loading");
    try {
      await subscribeNewsletter(email.trim());
      setEtat("ok");
      setEmail("");
    } catch (err) {
      setEtat("error");
      setErreur(err instanceof Error ? err.message : t("landing.footer.subscribeError"));
    }
  }

  const PRODUIT = [
    { href: "/#features",     label: t("nav.features") },
    { href: "/#how-it-works", label: t("nav.howItWorks") },
    { href: "/#pricing",      label: t("nav.pricing") },
    { href: "/#faq",          label: t("nav.faq") },
  ];
  const LEGAL = [
    { to: "/mentions-legales", label: t("legal.mentions.title") },
    { to: "/cgu",              label: t("legal.cgu.title") },
    { to: "/confidentialite",  label: t("legal.confidentialite.title") },
  ];
  const mail = t("landing.footer.contactEmailValue");
  const tel = t("landing.footer.contactPhoneValue");

  return (
    <footer className="overflow-hidden border-t border-l-border bg-l-bg">

      {/* 1. Bandeau de cloture */}
      <div className="relative px-5 py-24 md:px-10 md:py-32">
        <Orbites />
        <div className="relative mx-auto max-w-[860px] text-center">
          <h2 className="m-0 text-[clamp(2.2rem,4.4vw,3.6rem)] font-extrabold leading-[1.06] tracking-[-.03em] text-l-text">
            {t("landing.footer.ctaTitle")}
          </h2>
          <p className="m-0 mx-auto mt-5 max-w-[600px] text-[clamp(1.05rem,1.3vw,1.2rem)] leading-[1.6] text-l-text-dim">
            {t("landing.footer.ctaText")}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={onGoRegister}
              className="h-[54px] cursor-pointer rounded-[8px] border-0 bg-l-blue px-8 text-[16px] font-semibold text-white transition-[filter,transform] hover:-translate-y-px hover:brightness-110"
            >
              {t("landing.hero.cta")}
            </button>
            <button
              onClick={onEnterApp}
              className="h-[54px] cursor-pointer rounded-[8px] border border-white/25 bg-white/[0.04] px-8 text-[16px] font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-white/[0.08]"
            >
              {t("nav.access")}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Identite, contact, colonnes */}
      <div className="border-t border-l-border">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-16 md:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <Link to="/" className="inline-flex items-center gap-3 no-underline">
              <img src="/logo-adjuja-mark.png" alt="" className="block h-12 w-12 rounded-[12px]" />
              <span className="text-[28px] font-extrabold leading-none tracking-[-.03em] text-l-text">Adjuja</span>
            </Link>
            <p className="m-0 mt-6 max-w-[460px] text-[17px] leading-[1.65] text-[#C6D0E3]">
              {t("landing.footer.tagline")}
            </p>
            <address className="mt-8 flex flex-col gap-3.5 not-italic">
              <a href={`mailto:${mail}`} className="flex w-fit items-center gap-3 text-[16px] font-semibold text-l-text no-underline transition-colors hover:text-[color:var(--l-blue-soft)]">
                <Icone d={ICONE_MAIL} />{mail}
              </a>
              <a href={`tel:${tel.replace(/[^+\d]/g, "")}`} className="flex w-fit items-center gap-3 text-[16px] font-semibold text-l-text no-underline transition-colors hover:text-[color:var(--l-blue-soft)]">
                <Icone d={ICONE_TEL} />{tel}
              </a>
              <span className="flex items-center gap-3 text-[16px] font-medium text-[#C6D0E3]">
                <Icone d={ICONE_LIEU} />{t("landing.footer.contactAddressValue")}
              </span>
            </address>
          </div>

          {/* Colonnes de liens a la largeur de leur contenu, la lettre prend le reste. */}
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[auto_auto_minmax(0,1fr)] md:gap-14">
            <Colonne titre={t("landing.footer.productTitle")}>
              {PRODUIT.map((l) => <a key={l.href} href={l.href} className={lien}>{l.label}</a>)}
            </Colonne>

            <Colonne titre={t("landing.footer.legalTitle")}>
              {LEGAL.map((l) => <Link key={l.to} to={l.to} className={lien}>{l.label}</Link>)}
            </Colonne>

            <Colonne titre={t("landing.footer.newsletterTitle")}>
              <p className="m-0 text-[16px] leading-[1.6] text-[#C6D0E3]">{t("landing.footer.newsletterText")}</p>
              <form onSubmit={inscrire} className="flex flex-col gap-2.5">
                <input
                  type="email"
                  required
                  aria-label={t("landing.footer.emailPlaceholder")}
                  placeholder={t("landing.footer.emailPlaceholder")}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (etat !== "loading") setEtat("idle"); }}
                  className="h-12 min-w-0 rounded-[8px] border border-l-border-strong bg-l-surface px-4 text-[15px] text-l-text outline-none transition-colors placeholder:text-l-text-dim focus:border-[color:var(--l-blue)]"
                />
                <button
                  type="submit"
                  disabled={etat === "loading"}
                  className="h-12 cursor-pointer rounded-[8px] border-0 bg-l-blue px-5 text-[15px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
                >
                  {etat === "loading" ? t("landing.footer.subscribing") : t("landing.footer.subscribe")}
                </button>
              </form>
              <p aria-live="polite" className={`m-0 min-h-[22px] text-[14px] font-medium ${etat === "error" ? "text-[color:var(--l-neg)]" : "text-[color:var(--l-pos)]"}`}>
                {etat === "ok" && t("landing.footer.subscribeOk")}
                {etat === "error" && erreur}
              </p>
            </Colonne>
          </div>
        </div>
      </div>

      {/* 3. Mot-symbole geant, balaye par un reflet (.l-wordmark, index.css).
          background-clip: text ne peint que dans la boite de la ligne : sans le
          retrait bas, le crochet des « j » tombait dehors et ils se lisaient
          « i » (constate le 2026-09-27). */}
      <div aria-hidden className="select-none border-t border-l-border px-5 pt-6 md:px-10">
        <p className="l-wordmark m-0 pb-[0.26em] text-center text-[clamp(5.5rem,23vw,21rem)] font-extrabold leading-none tracking-[-.05em]">
          Adjuja
        </p>
      </div>

      {/* 4. Copyright */}
      <div className="border-t border-l-border">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-4 px-5 py-6 sm:flex-row md:px-10">
          <p className="m-0 text-[14px] text-l-text-dim">{t("landing.footer.copyright")}</p>
          <a
            href="https://www.continuium.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 no-underline opacity-85 transition-opacity hover:opacity-100"
          >
            <span className="text-[14px] font-medium text-l-text-dim">{t("landing.footer.madeBy")}</span>
            <img src="/continuium-light.png" alt="Continuum" className="h-8 w-auto object-contain" />
          </a>
        </div>
      </div>
    </footer>
  );
}
