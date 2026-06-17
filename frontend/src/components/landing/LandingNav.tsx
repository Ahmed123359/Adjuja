import { useEffect, useState } from "react";
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

  function scrollTo(id: string) {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  const NAV = [
    { id: "features",     label: t("nav.features") },
    { id: "how-it-works", label: t("nav.howItWorks") },
    { id: "pricing",      label: t("nav.pricing") },
  ];

  return (
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
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex shrink-0 cursor-pointer items-center gap-[10px] border-0 bg-none p-0"
        >
          <img src="/logo-adjuja.png" alt="ADJUJA" className="block h-12 w-auto" />
        </button>

        {/* Nav links */}
        <nav className="hidden flex-1 items-center justify-center gap-[2px] sm:flex">
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="cursor-pointer rounded-[var(--l-radius)] border-0 bg-none px-4 py-[7px] text-[13.5px] font-medium tracking-[-.005em] text-[rgba(220,232,250,0.78)] transition-colors hover:text-white"
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSelector />
          </div>
          <button
            onClick={onGoRegister}
            className="hidden cursor-pointer rounded-[var(--l-radius)] border border-white/[0.16] bg-transparent px-[18px] py-[7px] text-[13px] font-medium text-[rgba(220,232,250,0.8)] transition-colors hover:border-white/30 hover:text-white sm:block"
          >
            {t("nav.signup")}
          </button>
          <button
            onClick={onEnterApp}
            className="cursor-pointer rounded-[var(--l-radius)] border-0 bg-l-blue px-[22px] py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            {t("nav.access")}
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

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-white/[0.07] bg-[#080B1C] px-8 py-5 sm:hidden">
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="block w-full cursor-pointer border-0 border-b border-white/[0.07] bg-none py-[11px] text-left text-[15px] text-[rgba(220,232,250,0.78)]"
            >
              {label}
            </button>
          ))}
          <div className="flex gap-2 pt-4">
            <button
              onClick={onGoRegister}
              className="flex-1 cursor-pointer rounded-[var(--l-radius)] border border-white/[0.16] bg-transparent py-[7px] text-[13px] font-medium text-[rgba(220,232,250,0.8)]"
            >
              {t("nav.signup")}
            </button>
            <button
              onClick={onEnterApp}
              className="flex-1 cursor-pointer rounded-[var(--l-radius)] border-0 bg-l-blue py-2 text-[13px] font-semibold text-white"
            >
              {t("nav.access")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
