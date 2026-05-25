import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";

const ANIM_CSS = `
@keyframes ao-fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ao-bar-fill { from { width: 0%; } }
.ao-fade-1 { animation: ao-fade-up .55s cubic-bezier(.22,1,.36,1) .05s both; }
.ao-fade-2 { animation: ao-fade-up .55s cubic-bezier(.22,1,.36,1) .18s both; }
.ao-fade-3 { animation: ao-fade-up .55s cubic-bezier(.22,1,.36,1) .30s both; }
.ao-fade-4 { animation: ao-fade-up .65s cubic-bezier(.22,1,.36,1) .45s both; }
.ao-bar    { animation: ao-bar-fill 1.1s cubic-bezier(.22,1,.36,1) both; }
`;

function AppMockup() {
  const rows = [
    { ref: "AO-2025-001", acheteur: "Ministère de la Santé",    statut: "Terminé",       pct: 100, color: "#22c55e" },
    { ref: "AO-2025-002", acheteur: "Commune de Casablanca",    statut: "En traitement", pct: 68,  color: "var(--l-blue)" },
    { ref: "AO-2025-003", acheteur: "ONCF",                     statut: "En analyse",    pct: 25,  color: "#f59e0b" },
    { ref: "AO-2025-004", acheteur: "Min. des Travaux Publics", statut: "Brouillon",     pct: 0,   color: "var(--l-dim)" },
  ];
  return (
    <div style={{ background: "var(--l-mk-bg)", border: "1px solid var(--l-mk-border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--l-card-shadow)" }}>
      <div style={{ background: "var(--l-mk-surf)", padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--l-mk-border)" }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "var(--l-mk-bg)", border: "1px solid var(--l-mk-border)", borderRadius: 5, padding: "3px 14px", fontSize: 10, color: "var(--l-sub)" }}>app.adjuja.ma</div>
        </div>
      </div>
      <div style={{ background: "var(--l-mk-bg)", borderBottom: "1px solid var(--l-mk-border)", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 42 }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 18 }} />
        <div style={{ display: "flex", gap: 2 }}>
          {["Tableau de bord","Appels d'offres","Outils"].map((l, i) => (
            <div key={l} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: i === 1 ? "var(--l-blue)" : "transparent", color: i === 1 ? "#fff" : "var(--l-sub)" }}>{l}</div>
          ))}
        </div>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--l-blue)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>HL</div>
      </div>
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
          {[["12","Total AOs"],["3","En cours"],["8","Terminés"],["1","Erreurs"]].map(([v,l]) => (
            <div key={l} style={{ background: "var(--l-mk-surf)", border: "1px solid var(--l-mk-border)", borderRadius: 7, padding: "10px 12px" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "var(--l-text)", margin: 0, lineHeight: 1 }}>{v}</p>
              <p style={{ fontSize: 9, color: "var(--l-sub)", margin: "4px 0 0" }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ border: "1px solid var(--l-mk-border)", borderRadius: 7, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ background: "var(--l-mk-surf)", padding: "7px 12px", display: "grid", gridTemplateColumns: "1fr 1.5fr 100px 80px", gap: 8 }}>
            {["Référence","Acheteur","Statut","Avancement"].map(h => (
              <p key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--l-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: 0 }}>{h}</p>
            ))}
          </div>
          {rows.map((row, i) => (
            <div key={row.ref} style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1.5fr 100px 80px", gap: 8, alignItems: "center", borderTop: "1px solid var(--l-mk-border)", background: i % 2 === 0 ? "var(--l-mk-bg)" : "transparent" }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "var(--l-text)", margin: 0 }}>{row.ref}</p>
              <p style={{ fontSize: 10, color: "var(--l-sub)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.acheteur}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                <p style={{ fontSize: 9, color: row.color, margin: 0 }}>{row.statut}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ flex: 1, height: 3, background: "var(--l-mk-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div className="ao-bar" style={{ height: "100%", width: `${row.pct}%`, background: row.color, borderRadius: 2, animationDelay: `${0.9 + i * 0.12}s` }} />
                </div>
                <p style={{ fontSize: 9, color: "var(--l-sub)", margin: 0, flexShrink: 0, minWidth: 18 }}>{row.pct}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HeroSection({ onEnterApp, onGoRegister }: { onEnterApp: () => void; onGoRegister: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const dark = theme === "dark";

  useEffect(() => {
    const id = "ao-hero-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
    s.textContent = ANIM_CSS;
  }, []);

  return (
    <section style={{ position: "relative", overflow: "hidden", background: dark ? "#05090F" : "#FFFFFF" }}>
      {/* Background pattern */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: dark
          ? `repeating-linear-gradient(-55deg,transparent,transparent 80px,rgba(30,136,229,0.035) 80px,rgba(30,136,229,0.035) 81px),repeating-linear-gradient(55deg,transparent,transparent 80px,rgba(30,136,229,0.035) 80px,rgba(30,136,229,0.035) 81px)`
          : `repeating-linear-gradient(-55deg,transparent,transparent 80px,rgba(21,101,192,0.03) 80px,rgba(21,101,192,0.03) 81px),repeating-linear-gradient(55deg,transparent,transparent 80px,rgba(21,101,192,0.03) 80px,rgba(21,101,192,0.03) 81px)`,
      }} />
      {/* Glow */}
      <div style={{ position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)", width: 700, height: 480, background: dark ? "radial-gradient(ellipse at top, rgba(30,136,229,0.18) 0%, transparent 65%)" : "radial-gradient(ellipse at top, rgba(21,101,192,0.10) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px 96px", position: "relative", zIndex: 1 }}>

        {/* Heading */}
        <div className="ao-fade-2" style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{
            fontSize: "clamp(2rem, 4.2vw, 3.2rem)",
            fontWeight: 700, lineHeight: 1.15,
            letterSpacing: "-0.025em",
            color: dark ? "#EEF4FF" : "#0D1B3E",
            margin: 0,
          }}>
            {t("landing.hero.line1")}
            <br />
            <span style={{ color: "var(--l-blue)" }}>{t("landing.hero.line2")}</span>
          </h1>
        </div>

        {/* Subtitle */}
        <div className="ao-fade-3">
          <p style={{ fontSize: "clamp(14px, 1.4vw, 16px)", lineHeight: 1.7, color: dark ? "rgba(238,244,255,0.58)" : "var(--l-sub)", textAlign: "center", maxWidth: 480, margin: "0 auto 40px", fontWeight: 400 }}>
            {t("hero.subtitle")}
          </p>
        </div>

        {/* CTAs */}
        <div className="ao-fade-3" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 72, flexWrap: "wrap" }}>
          <button
            onClick={onEnterApp}
            style={{ background: "var(--l-blue)", border: "none", cursor: "pointer", padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(21,101,192,0.32)", transition: "opacity .15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = ".84"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            {t("hero.cta")}
          </button>
          <button
            onClick={onGoRegister}
            style={{ background: dark ? "rgba(255,255,255,0.06)" : "transparent", border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : "rgba(13,27,62,0.18)"}`, cursor: "pointer", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 500, color: dark ? "rgba(238,244,255,0.85)" : "#0D1B3E", fontFamily: "inherit", transition: "border-color .15s, background .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--l-blue)"; e.currentTarget.style.color = "var(--l-blue)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.14)" : "rgba(13,27,62,0.18)"; e.currentTarget.style.color = dark ? "rgba(238,244,255,0.85)" : "#0D1B3E"; }}
          >
            {t("landing.hero.demo")} &nbsp;→
          </button>
        </div>

        {/* Mockup */}
        <div className="ao-fade-4" style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ position: "absolute", bottom: -24, left: "50%", transform: "translateX(-50%)", width: "55%", height: 60, background: "radial-gradient(ellipse, var(--l-blue-glow) 0%, transparent 70%)", filter: "blur(28px)", pointerEvents: "none" }} />
          <AppMockup />
        </div>
      </div>
    </section>
  );
}
