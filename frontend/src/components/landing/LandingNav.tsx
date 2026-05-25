import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "../LanguageSelector";
import { useTheme } from "../../hooks/useTheme";

interface Props { onEnterApp: () => void; onGoRegister: () => void; }

export default function LandingNav({ onEnterApp, onGoRegister }: Props) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [scrolled, setScrolled]   = useState(false);
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
    { id: "features",     label: t("nav.features")   },
    { id: "how-it-works", label: t("nav.howItWorks") },
    { id: "pricing",      label: t("nav.pricing")    },
  ];

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, height: 64,
      background: scrolled ? "var(--l-nav-bg)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid var(--l-card-border)" : "1px solid transparent",
      transition: "background .2s, border-color .2s",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", gap: 20 }}>

        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ background: "var(--l-card)", border: "1.5px solid var(--l-card-border)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}>
          <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 26, width: "auto", display: "block" }} />
        </button>

        <nav style={{ flex: 1, display: "flex", justifyContent: "center" }} className="ln-desktop">
          <div style={{ display: "flex", gap: 2, background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: "1px solid var(--l-card-border)", borderRadius: 10, padding: 4 }}>
            {NAV.map(({ id, label }) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "7px 18px", borderRadius: 7, fontSize: 13.5, fontWeight: 500, color: "var(--l-sub)", fontFamily: "inherit", transition: "color .12s, background .12s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--l-text)"; e.currentTarget.style.background = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--l-sub)"; e.currentTarget.style.background = "none"; }}
              >{label}</button>
            ))}
          </div>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <div className="ln-desktop"><LanguageSelector /></div>

          <button onClick={toggle} title={dark ? "Mode clair" : "Mode sombre"} style={{ background: "none", border: "1px solid var(--l-card-border)", cursor: "pointer", borderRadius: 7, padding: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l-sub)", transition: "border-color .12s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--l-blue)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--l-card-border)"}
          >
            {dark
              ? <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            }
          </button>

          <button onClick={onGoRegister} className="ln-desktop" style={{ background: "none", border: "1px solid var(--l-card-border)", cursor: "pointer", padding: "7px 16px", borderRadius: 7, fontSize: 13, fontWeight: 500, color: "var(--l-text)", fontFamily: "inherit", transition: "border-color .12s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--l-blue)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--l-card-border)"}
          >{t("nav.signup")}</button>

          <button onClick={onEnterApp} style={{ background: "var(--l-blue)", border: "none", cursor: "pointer", padding: "7px 18px", borderRadius: 7, fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "inherit", transition: "opacity .12s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = ".82"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >{t("nav.access")}</button>

          <button className="ln-mobile" onClick={() => setMobileOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--l-sub)", padding: 4, display: "none" }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div style={{ background: "var(--l-card)", borderTop: "1px solid var(--l-card-border)", padding: "8px 24px 16px" }}>
          {NAV.map(({ id, label }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "10px 0", fontSize: 14, color: "var(--l-sub)", fontFamily: "inherit", borderBottom: "1px solid var(--l-card-border)" }}>{label}</button>
          ))}
          <div style={{ paddingTop: 12 }}>
            <button onClick={onEnterApp} style={{ background: "var(--l-blue)", border: "none", cursor: "pointer", padding: "8px 18px", borderRadius: 7, fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "inherit" }}>{t("nav.access")}</button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 680px) { .ln-desktop { display: none !important; } .ln-mobile { display: flex !important; } }
        @media (min-width: 681px) { .ln-mobile { display: none !important; } }
      `}</style>
    </header>
  );
}
