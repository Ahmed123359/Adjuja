import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSelector from "../LanguageSelector";

interface Props { onEnterApp: () => void; onGoRegister: () => void; }

export default function LandingNav({ onEnterApp, onGoRegister }: Props) {
  const { t } = useTranslation();
  const [scrolled, setScrolled]    = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
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

  function scrollTo(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
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
        "fixed inset-x-0 top-0 z-[100] h-16 border-b transition-colors duration-200",
        scrolled
          ? "border-white/[0.07] bg-[#080B1C]/90 backdrop-blur-xl"
          : "border-transparent bg-[#080B1C]/55 backdrop-blur-md",
      ].join(" ")}
    >
      <div className="mx-auto flex h-full max-w-[1120px] items-center gap-2 px-8">
        {/* Logo */}
        <Link
          to="/"
          className="flex shrink-0 cursor-pointer items-center gap-[10px] no-underline"
        >
          <img src="/logo-adjuja.png" alt="ADJUJA" className="block h-12 w-auto" />
        </Link>

        {/* Nav links */}
        <nav className="hidden flex-1 items-center justify-center gap-[2px] sm:flex">
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={e => scrollTo(e, id)}
              className="cursor-pointer rounded-[var(--l-radius)] border-0 bg-none px-4 py-[7px] text-[13.5px] font-medium tracking-[-.005em] text-[rgba(220,232,250,0.78)] no-underline transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSelector />
          </div>
          <button
            onClick={onEnterApp}
            className="hidden cursor-pointer border-0 bg-none px-[10px] py-[7px] text-[13px] font-medium text-[rgba(220,232,250,0.72)] transition-colors hover:text-white sm:block"
          >
            {t("nav.access")}
          </button>
          <button
            onClick={onGoRegister}
            className="cursor-pointer rounded-[var(--l-radius)] border-0 bg-l-blue px-[22px] py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            {t("nav.signup")}
          </button>
          {/* Hamburger mobile */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="flex cursor-pointer items-center border-0 bg-none p-1 text-[rgba(220,232,250,0.78)] sm:hidden"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>

    {/* Mobile menu  rendu via portail directement sur document.body : `header` a un
        backdrop-filter (backdrop-blur-xl/md), qui etablit un containing block pour ses
        descendants position:fixed. Un enfant fixed a l'interieur de header se retrouve
        donc positionne/decoupe par rapport a header (haut 64px) et pas par rapport au
        viewport -- c'est ce qui produisait l'ecran "transparent" avec le hero visible en
        dessous. Le portail sort completement de cet arbre. */}
    {createPortal(
      <div
        className="flex flex-col sm:hidden"
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 2147483647,
          backgroundColor: "#080B1C",
          opacity: mobileOpen ? 1 : 0,
          transform: mobileOpen ? "translateY(0)" : "translateY(-12px)",
          pointerEvents: mobileOpen ? "auto" : "none",
          visibility: mobileOpen ? "visible" : "hidden",
          transition: "opacity 300ms ease-out, transform 300ms ease-out, visibility 300ms",
        }}
      >

        <div className="flex h-16 shrink-0 items-center justify-between px-6">
          <Link to="/" onClick={() => setMobileOpen(false)} className="block">
            <img src="/logo-adjuja.png" alt="ADJUJA" className="block h-11 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label={t("nav.close")}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.06] text-white"
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex flex-col overflow-y-auto px-6 pt-2">
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={e => scrollTo(e, id)}
              className="cursor-pointer border-0 border-b border-white/[0.08] bg-none py-4 text-left text-[16px] font-bold tracking-[-0.01em] text-white no-underline"
            >
              {label}
            </a>
          ))}
          {LEGAL_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className="cursor-pointer border-0 border-b border-white/[0.08] bg-none py-4 text-left text-[16px] font-bold tracking-[-0.01em] text-white no-underline"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-4 px-6 pb-8">
          <button
            onClick={() => { setMobileOpen(false); onEnterApp(); }}
            className="cursor-pointer border-0 bg-none text-[14px] font-semibold text-white/70"
          >
            {t("nav.access")}
          </button>
          <button
            onClick={() => { setMobileOpen(false); onGoRegister(); }}
            className="cursor-pointer rounded-2xl border-0 bg-white px-10 py-[14px] text-[15px] font-bold text-[#0A0F1E]"
          >
            {t("nav.signup")}
          </button>
        </div>

      </div>,
      document.body
    )}
    </>
  );
}
