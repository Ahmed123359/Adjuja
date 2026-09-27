// Barre de navigation du site public -- refaite le 2026-09-27.
//
// Alignee sur la largeur des sections (1320px), textes a 16px en couleur
// pleine (un blanc a 70 % d'opacite se fondait dans le fond et paraissait
// flou). Logo : logo-adjuja-mark.png, rogne au bord ; logo-adjuja.png porte
// 44 % de marge transparente et rendait le sigle minuscule. Le lien de la section a l'ecran est mis en
// avant pendant le defilement. Partagee avec les pages legales : sur ces pages
// les ancres n'existent pas, un clic renvoie donc a l'accueil sur la section.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface Props { onEnterApp: () => void; onGoRegister: () => void; }

const SECTIONS = ["features", "how-it-works", "pricing", "faq"] as const;

/** Bascule FR / EN en deux boutons : deux langues ne justifient pas un menu. */
function Langues({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const courante = i18n.language?.startsWith("en") ? "en" : "fr";
  return (
    <div className={`flex items-center rounded-[8px] border border-white/15 p-[3px] ${className}`}>
      {(["fr", "en"] as const).map((code) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          aria-pressed={courante === code}
          className={`h-8 cursor-pointer rounded-[6px] border-0 px-2.5 text-[14px] font-semibold uppercase transition-colors ${
            courante === code ? "bg-white/[0.12] text-white" : "bg-transparent text-white/60 hover:text-white"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export default function LandingNav({ onEnterApp, onGoRegister }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive]         = useState<string | null>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  /* Section a l'ecran : celle qui traverse une bande etroite au tiers haut de
     la fenetre. Rien a observer sur les pages legales. */
  useEffect(() => {
    const cibles = SECTIONS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!cibles.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    cibles.forEach((el) => obs.observe(el));
    const retourEnHaut = () => { if (window.scrollY < window.innerHeight * 0.5) setActive(null); };
    window.addEventListener("scroll", retourEnHaut, { passive: true });
    return () => { obs.disconnect(); window.removeEventListener("scroll", retourEnHaut); };
  }, []);

  /* Verrouille le scroll de la page pendant que le panneau mobile est ouvert -- sans ça,
     le fond continue de defiler derriere l'overlay et peut se melanger visuellement avec
     lui selon l'outil de capture/rendu. */
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  function goTo(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
    else navigate(`/#${id}`);
  }

  const NAV = [
    { id: "features",     label: t("nav.features") },
    { id: "how-it-works", label: t("nav.howItWorks") },
    { id: "pricing",      label: t("nav.pricing") },
    { id: "faq",          label: t("nav.faq") },
  ];

  const LEGAL_LINKS = [
    { to: "/mentions-legales", label: t("legal.mentions.title") },
    { to: "/cgu",               label: t("legal.cgu.title") },
    { to: "/confidentialite",   label: t("legal.confidentialite.title") },
  ];

  return (
    <>
    <header
      className={[
        "fixed inset-x-0 top-0 z-[100] h-[72px] border-b transition-colors duration-200",
        scrolled
          ? "border-white/[0.08] bg-[#080B1C]/90 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-full max-w-[1320px] items-center gap-6 px-5 md:px-10">
        <Link to="/" className="flex shrink-0 items-center gap-3 no-underline">
          <img src="/logo-adjuja-mark.png" alt="" className="block h-10 w-10 rounded-[10px]" />
          <span className="text-[25px] font-extrabold leading-none tracking-[-.03em] text-white">Adjuja</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV.map(({ id, label }) => {
            const courant = active === id;
            return (
              <a
                key={id}
                href={`/#${id}`}
                onClick={(e) => goTo(e, id)}
                aria-current={courant ? "true" : undefined}
                className={`relative px-4 py-2 text-[16px] font-semibold no-underline transition-colors ${
                  courant ? "text-white" : "text-[#C6D0E3] hover:text-white"
                }`}
              >
                {label}
                <span
                  aria-hidden
                  className={`absolute inset-x-4 -bottom-[3px] h-[2px] rounded-full bg-l-blue transition-opacity ${courant ? "opacity-100" : "opacity-0"}`}
                />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <Langues className="hidden lg:flex" />
          <button
            onClick={onEnterApp}
            className="hidden cursor-pointer border-0 bg-transparent px-2 py-2 text-[16px] font-semibold text-[#C6D0E3] transition-colors hover:text-white sm:block"
          >
            {t("nav.access")}
          </button>
          <button
            onClick={onGoRegister}
            className="hidden h-11 cursor-pointer rounded-[8px] border-0 bg-l-blue px-5 text-[15px] font-semibold text-white transition-[filter] hover:brightness-110 sm:block"
          >
            {t("landing.hero.cta")}
          </button>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={t("nav.menu")}
            aria-expanded={mobileOpen}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[8px] border border-white/15 bg-transparent text-white lg:hidden"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    {/* Mobile menu  rendu via portail directement sur document.body : `header` a un
        backdrop-filter (backdrop-blur-xl), qui etablit un containing block pour ses
        descendants position:fixed. Un enfant fixed a l'interieur de header se retrouve
        donc positionne/decoupe par rapport a header et pas par rapport au viewport --
        c'est ce qui produisait l'ecran "transparent" avec le hero visible en dessous.
        Le portail sort completement de cet arbre. */}
    {createPortal(
      <div
        className={`landing-dark fixed inset-0 z-[2147483647] flex flex-col bg-[#080B1C] transition-[opacity,transform,visibility] duration-300 ease-out lg:hidden ${
          mobileOpen ? "visible translate-y-0 opacity-100" : "pointer-events-none invisible -translate-y-3 opacity-0"
        }`}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between px-5">
          <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 no-underline">
            <img src="/logo-adjuja-mark.png" alt="" className="block h-10 w-10 rounded-[10px]" />
            <span className="text-[25px] font-extrabold leading-none tracking-[-.03em] text-white">Adjuja</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label={t("nav.close")}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[8px] border border-white/15 bg-transparent text-white"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-col overflow-y-auto px-5 pt-2">
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              href={`/#${id}`}
              onClick={(e) => goTo(e, id)}
              className="border-b border-white/[0.08] py-5 text-[22px] font-bold tracking-[-0.01em] text-white no-underline"
            >
              {label}
            </a>
          ))}
          <div className="flex flex-col gap-1 pt-5">
            {LEGAL_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className="py-2 text-[16px] font-medium text-white/65 no-underline"
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="flex-1" />

        <div className="flex flex-col gap-3 px-5 pb-8">
          <Langues className="self-start" />
          <button
            onClick={() => { setMobileOpen(false); onGoRegister(); }}
            className="h-[52px] cursor-pointer rounded-[8px] border-0 bg-l-blue text-[16px] font-semibold text-white"
          >
            {t("landing.hero.cta")}
          </button>
          <button
            onClick={() => { setMobileOpen(false); onEnterApp(); }}
            className="h-[52px] cursor-pointer rounded-[8px] border border-white/20 bg-transparent text-[16px] font-semibold text-white"
          >
            {t("nav.access")}
          </button>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
