import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const FEATURES_CSS = `
.feat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 14px;
}
.feat-a { grid-column: 1; grid-row: 1; }
.feat-b { grid-column: 2; grid-row: 1; }
.feat-c { grid-column: 3; grid-row: 1 / 3; display: flex; flex-direction: column; }
.feat-d { grid-column: 1 / 3; grid-row: 2; }

.feat-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background:
    radial-gradient(120% 100% at 15% -10%, rgba(43,121,232,0.10), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 40%),
    var(--l-surface);
  border: 1px solid var(--l-border);
  border-radius: 18px;
  padding: 24px;
  display: flex; flex-direction: column; gap: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 1px 1px rgba(0,0,0,0.2),
    0 16px 40px -16px rgba(0,0,0,0.6);
  transition: border-color .25s, box-shadow .25s, transform .25s;
}
.feat-card:hover {
  border-color: var(--l-border-strong);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.09),
    0 1px 1px rgba(0,0,0,0.25),
    0 26px 56px -18px rgba(0,0,0,0.7);
  transform: translateY(-3px);
}

.feat-card-accent {
  background:
    radial-gradient(120% 100% at 15% -10%, rgba(43,121,232,0.16), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 40%),
    var(--l-surface-2);
  border: 1px solid var(--l-border-strong);
}

@media (max-width: 900px) {
  .feat-grid { grid-template-columns: 1fr 1fr; }
  .feat-a { grid-column: 1; grid-row: 1; }
  .feat-b { grid-column: 2; grid-row: 1; }
  .feat-c { grid-column: 1 / 3; grid-row: 2; }
  .feat-d { grid-column: 1 / 3; grid-row: 3; }
}
@media (max-width: 580px) {
  .feat-grid { grid-template-columns: 1fr; gap: 12px; }
  .feat-a, .feat-b, .feat-c, .feat-d { grid-column: 1 !important; grid-row: auto !important; }
  .feat-card { padding: 18px; border-radius: 14px; }
}
`;

/* ----- Mockups (toujours dark, tokens CSS) ----- */

function VeilleMockup() {
  const aos = [
    { ref: "AO-2026-114", secteur: "BTP",        nouveau: true },
    { ref: "AO-2026-112", secteur: "BTP",        nouveau: true },
    { ref: "AO-2026-108", secteur: "Ingénierie", nouveau: false },
  ];
  return (
    <div style={{
      background: "var(--l-mk-bg)", border: "1px solid var(--l-mk-border)",
      borderRadius: "var(--l-radius)", overflow: "hidden", fontSize: 10,
    }}>
      <div style={{
        background: "var(--l-mk-surf)", padding: "7px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--l-mk-border)",
      }}>
        <span style={{ color: "var(--l-text-dim)" }}>Secteur BTP</span>
        <span style={{
          display: "flex", alignItems: "center", gap: 5,
          color: "#22c55e", fontWeight: 700, fontSize: 8.5, textTransform: "uppercase" as const, letterSpacing: ".08em",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "blink 1.4s step-end infinite" }} />
          En direct
        </span>
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {aos.map(ao => (
          <div key={ao.ref} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 9px", borderRadius: "var(--l-radius)",
            background: ao.nouveau ? "var(--l-blue-a)" : "transparent",
          }}>
            <span style={{ color: "var(--l-text)", fontWeight: 600 }}>{ao.ref}</span>
            {ao.nouveau
              ? <span style={{ color: "var(--l-blue)", fontWeight: 700, fontSize: 8.5, textTransform: "uppercase" as const }}>Nouveau</span>
              : <span style={{ color: "var(--l-text-dim)", fontSize: 8.5 }}>{ao.secteur}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoNoGoMockup() {
  const criteres = [
    { label: "Budget compatible",       ok: true },
    { label: "Délai réalisable",        ok: true },
    { label: "Références suffisantes",  ok: true },
    { label: "Certification requise",   ok: false },
  ];
  return (
    <div style={{
      background: "var(--l-mk-bg)", border: "1px solid var(--l-mk-border)",
      borderRadius: "var(--l-radius)", overflow: "hidden", fontSize: 10,
    }}>
      <div style={{
        background: "var(--l-mk-surf)", padding: "7px 12px",
        borderBottom: "1px solid var(--l-mk-border)",
      }}>
        <span style={{ color: "var(--l-text-dim)" }}>AO-2026-114 · Verdict</span>
      </div>
      <div style={{ padding: "12px", display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
          background: "rgba(34,197,94,0.14)", border: "2px solid #22c55e",
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
        }}>
          <span style={{ color: "#22c55e", fontWeight: 800, fontSize: 12, lineHeight: 1 }}>GO</span>
          <span style={{ color: "#22c55e", fontSize: 7.5, marginTop: 1 }}>82/100</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {criteres.map(c => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{
                width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              }}>
                <span style={{ color: c.ok ? "#22c55e" : "#ef4444", fontWeight: 800, fontSize: 7.5 }}>
                  {c.ok ? "✓" : "✕"}
                </span>
              </span>
              <span style={{ color: "var(--l-text-muted)", fontSize: 9 }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocMockup() {
  const rows = [
    { label: "Objet du marché",      hit: true },
    { label: "Critères d'attribution", hit: true },
    { label: "Montant estimatif",    hit: true },
    { label: "Clauses techniques",   hit: false },
    { label: "Délai d'exécution",    hit: false },
    { label: "Garanties requises",   hit: false },
  ];
  return (
    <div style={{
      background: "var(--l-mk-bg)", border: "1px solid var(--l-mk-border)",
      borderRadius: "var(--l-radius)", overflow: "hidden", fontSize: 10,
    }}>
      <div style={{
        background: "var(--l-mk-surf)", padding: "7px 12px",
        display: "flex", gap: 6, alignItems: "center",
        borderBottom: "1px solid var(--l-mk-border)",
      }}>
        {["#ff5f57","#febc2e","#28c840"].map(c => (
          <div key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ color: "var(--l-text-dim)", marginLeft: 6 }}>DAO-2026-041.pdf</span>
      </div>
      <div style={{ padding: "12px", display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          {rows.map(r => (
            <div key={r.label} style={{
              marginBottom: 4, padding: "5px 8px",
              borderRadius: "var(--l-radius)",
              background: r.hit ? "var(--l-blue-a)" : "transparent",
              border: `1px solid ${r.hit ? "var(--l-blue-a)" : "transparent"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ color: r.hit ? "var(--l-text)" : "var(--l-text-dim)" }}>{r.label}</span>
              {r.hit && (
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--l-blue)" }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ width: 52, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{
            background: "var(--l-blue)", borderRadius: "var(--l-radius)",
            padding: "6px 8px", textAlign: "center",
          }}>
            <p style={{ margin: 0, color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1 }}>6</p>
            <p style={{ margin: "3px 0 0", color: "rgba(255,255,255,.6)", fontSize: 8 }}>Extraits</p>
          </div>
          <div style={{
            background: "var(--l-mk-surf)", border: "1px solid var(--l-mk-border)",
            borderRadius: "var(--l-radius)", padding: "6px 8px", textAlign: "center",
          }}>
            <p style={{ margin: 0, color: "#22c55e", fontWeight: 700, fontSize: 15, lineHeight: 1 }}>3s</p>
            <p style={{ margin: "3px 0 0", color: "var(--l-text-dim)", fontSize: 8 }}>Analyse</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WritingMockup() {
  const sections = [
    { title: "Présentation de la société", lines: 3, done: true },
    { title: "Méthodologie et approche",   lines: 2, done: true },
    { title: "Références similaires",      lines: 1, done: false },
  ];
  return (
    <div style={{
      background: "var(--l-mk-bg)", border: "1px solid var(--l-mk-border)",
      borderRadius: "var(--l-radius)", overflow: "hidden", fontSize: 10,
    }}>
      <div style={{
        background: "var(--l-mk-surf)", padding: "7px 12px",
        borderBottom: "1px solid var(--l-mk-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: "var(--l-text-dim)" }}>offre_technique.docx</span>
        <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 9 }}>Génération en cours...</span>
      </div>
      <div style={{ padding: "12px" }}>
        {sections.map(s => (
          <div key={s.title} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 3,
                background: s.done ? "var(--l-blue)" : "var(--l-mk-border)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {s.done && (
                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span style={{ color: s.done ? "var(--l-text)" : "var(--l-text-muted)", fontWeight: 600, fontSize: 9.5 }}>
                {s.title}
              </span>
            </div>
            <div style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
              {Array.from({ length: s.lines }).map((_, i) => (
                <div key={i} style={{
                  height: 5, borderRadius: 3,
                  background: "var(--l-mk-border)",
                  width: i === s.lines - 1 ? "55%" : "100%",
                  overflow: "hidden",
                }}>
                  {!s.done && i === 0 && (
                    <div style={{
                      height: "100%", width: "35%",
                      background: "var(--l-blue)", borderRadius: 3,
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Section principale ----- */

export default function FeaturesSection() {
  const { t } = useTranslation();

  useEffect(() => {
    const id = "features-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
    s.textContent = FEATURES_CSS;
  }, []);

  return (
    <section id="features" style={{ background: "var(--l-bg)", padding: "112px 32px 120px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>

        {/* Header centré */}
        <div className="animate-on-scroll" style={{ marginBottom: 64, textAlign: "center" }}>
          <h2 style={{
            fontSize: "clamp(2rem, 3.6vw, 3rem)",
            fontWeight: 700, lineHeight: 1.14, letterSpacing: "-0.025em",
            color: "var(--l-text)", margin: "0 auto", maxWidth: 620,
          }}>
            {t("landing.features.title")}
            <br />
            <span style={{ color: "var(--l-blue)" }}>{t("landing.features.titleBlue")}</span>
          </h2>
        </div>

        {/* Bento grid */}
        <div className="feat-grid animate-on-scroll">

          {/* A - Veille */}
          <div className="feat-a feat-card">
            <VeilleMockup />
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--l-text)" }}>
                {t("landing.features.veille.title")}
              </p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.68, color: "var(--l-text-muted)" }}>
                {t("landing.features.veille.desc")}
              </p>
            </div>
          </div>

          {/* B - Go/No-Go */}
          <div className="feat-b feat-card">
            <GoNoGoMockup />
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--l-text)" }}>
                {t("landing.features.gonogo.title")}
              </p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.68, color: "var(--l-text-muted)" }}>
                {t("landing.features.gonogo.desc")}
              </p>
            </div>
          </div>

          {/* C - Analyse du CPS (tall, accent) */}
          <div className="feat-c feat-card feat-card-accent">
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              <DocMockup />
              <div>
                <p style={{ margin: "0 0 6px", fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--l-text)" }}>
                  {t("landing.features.analyse.title")}
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.68, color: "var(--l-text-muted)" }}>
                  {t("landing.features.analyse.desc")}
                </p>
              </div>
            </div>
            <button
              style={{
                marginTop: "auto",
                background: "var(--l-blue)", border: "none", cursor: "pointer",
                padding: "12px 0", borderRadius: "var(--l-radius)",
                fontSize: 13, fontWeight: 600, color: "#fff", width: "100%",
                fontFamily: "inherit", transition: "filter .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.15)"}
              onMouseLeave={e => e.currentTarget.style.filter = ""}
            >
              {t("landing.features.cta")}
            </button>
          </div>

          {/* D - Rédaction (wide) */}
          <div className="feat-d feat-card">
            <WritingMockup />
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--l-text)" }}>
                {t("landing.features.gen.title")}
              </p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.68, color: "var(--l-text-muted)" }}>
                {t("landing.features.gen.desc")}
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
