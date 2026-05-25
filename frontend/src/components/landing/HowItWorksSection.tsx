import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";

const HOW_CSS = `
.how-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
@media (max-width: 820px) { .how-grid { grid-template-columns: 1fr; gap: 40px; } }
`;

/* Mockups are always dark  they sit inside a dark card regardless of page theme */
function MockupAnalyse() {
  return (
    <div
      style={{
        background: "#0C1829",
        border: "1px solid #1A2E4A",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: "#0A1422",
          padding: "8px 14px",
          borderBottom: "1px solid #1A2E4A",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#3D5278" }}>DCE-ONCF-2025.pdf</span>
        <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 10 }}>
          Analyse complète
        </span>
      </div>
      {[
        { label: "Objet du marché", hit: true },
        { label: "Critères d'attribution", hit: true },
        { label: "Montant estimatif", hit: true },
        { label: "Clauses techniques", hit: false },
        { label: "Délai d'exécution", hit: false },
      ].map((r) => (
        <div
          key={r.label}
          style={{
            padding: "9px 14px",
            borderBottom: "1px solid #1A2E4A",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: r.hit ? "rgba(30,136,229,0.08)" : "transparent",
          }}
        >
          <span style={{ color: r.hit ? "#EEF4FF" : "#3D5278" }}>
            {r.label}
          </span>
          {r.hit && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--l-blue)",
                }}
              />
              <span
                style={{ color: "var(--l-blue)", fontSize: 9, fontWeight: 600 }}
              >
                Extrait
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MockupGeneration() {
  return (
    <div
      style={{
        background: "#0C1829",
        border: "1px solid #1A2E4A",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: "#0A1422",
          padding: "8px 14px",
          borderBottom: "1px solid #1A2E4A",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#3D5278" }}>memoire_technique.docx</span>
        <span style={{ color: "var(--l-blue)", fontWeight: 600, fontSize: 10 }}>
          72% généré
        </span>
      </div>
      {[
        { title: "Présentation de la société", pct: 100 },
        { title: "Méthodologie et approche", pct: 100 },
        { title: "Références similaires", pct: 72 },
        { title: "Plan qualité", pct: 30 },
      ].map((s) => (
        <div
          key={s.title}
          style={{ padding: "9px 14px", borderBottom: "1px solid #1A2E4A" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ color: s.pct === 100 ? "#EEF4FF" : "#7B93BC" }}>
              {s.title}
            </span>
            <span
              style={{
                color: s.pct === 100 ? "#22c55e" : "var(--l-blue)",
                fontSize: 10,
              }}
            >
              {s.pct}%
            </span>
          </div>
          <div
            style={{
              height: 3,
              background: "#1A2E4A",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${s.pct}%`,
                background: s.pct === 100 ? "#22c55e" : "var(--l-blue)",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MockupExport() {
  return (
    <div
      style={{
        background: "#0C1829",
        border: "1px solid #1A2E4A",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: "#0A1422",
          padding: "8px 14px",
          borderBottom: "1px solid #1A2E4A",
        }}
      >
        <span style={{ color: "#3D5278" }}>
          AO-2025-041 Export et soumission
        </span>
      </div>
      <div style={{ padding: "14px" }}>
        {[
          { label: "Mémoire technique", size: "2.4 MB" },
          { label: "Offre financière", size: "0.8 MB" },
          { label: "Pièces admin.", size: "1.1 MB" },
        ].map((f) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 7,
              marginBottom: 6,
              background: "#0A1422",
              border: "1px solid #1A2E4A",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "rgba(30,136,229,0.15)",
                border: "1px solid rgba(30,136,229,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--l-blue)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: "#EEF4FF", fontWeight: 500 }}>
                {f.label}
              </p>
              <p style={{ margin: 0, color: "#3D5278", fontSize: 9 }}>
                {f.size}
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 10 10" fill="none">
              <path
                d="M1.5 5l2.5 2.5 4.5-5"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
        <div
          style={{
            marginTop: 10,
            background: "var(--l-blue)",
            borderRadius: 8,
            padding: "10px 0",
            textAlign: "center",
          }}
        >
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 12 }}>
            Soumettre le dossier →
          </span>
        </div>
      </div>
    </div>
  );
}

function MockupPerf() {
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin"];
  const vals = [2, 4, 3, 6, 5, 8];
  return (
    <div
      style={{
        background: "#0C1829",
        border: "1px solid #1A2E4A",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 11,
      }}
    >
      <div
        style={{
          background: "#0A1422",
          padding: "8px 14px",
          borderBottom: "1px solid #1A2E4A",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#3D5278" }}>Performances 2025</span>
        <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 10 }}>
          +42% vs 2024
        </span>
      </div>
      <div style={{ padding: "14px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            ["26", "AOs gagnés"],
            ["89%", "Taux succès"],
            ["1.8j", "Délai moyen"],
          ].map(([v, l]) => (
            <div
              key={l}
              style={{
                background: "#0A1422",
                border: "1px solid #1A2E4A",
                borderRadius: 7,
                padding: "8px 10px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#EEF4FF",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {v}
              </p>
              <p style={{ margin: "3px 0 0", color: "#3D5278", fontSize: 9 }}>
                {l}
              </p>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            height: 50,
          }}
        >
          {months.map((m, i) => (
            <div
              key={m}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${(vals[i] / 8) * 40}px`,
                  background: i === 5 ? "var(--l-blue)" : "#1A2E4A",
                  borderRadius: "3px 3px 0 0",
                }}
              />
              <span style={{ color: "#3D5278", fontSize: 8 }}>{m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HowItWorksSection() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = "how-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) {
      s = document.createElement("style");
      s.id = id;
      document.head.appendChild(s);
    }
    s.textContent = HOW_CSS;
  }, []);

  const FEATURES = [
    {
      key: "analyse",
      title: t("landing.how.t1Title"),
      desc: t("landing.how.t1Desc"),
    },
    {
      key: "generation",
      title: t("landing.how.t2Title"),
      desc: t("landing.how.t2Desc"),
    },
    {
      key: "export",
      title: t("landing.how.t3Title"),
      desc: t("landing.how.t3Desc"),
    },
    {
      key: "perf",
      title: t("landing.how.t4Title"),
      desc: t("landing.how.t4Desc"),
    },
  ];

  const mockups: Record<string, React.ReactNode> = {
    analyse: <MockupAnalyse />,
    generation: <MockupGeneration />,
    export: <MockupExport />,
    perf: <MockupPerf />,
  };

  return (
    <section
      id="how-it-works"
      style={{ background: "var(--l-bg)", padding: "100px 24px 120px" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="how-grid">
          {/* Left */}
          <div>
            <h2
              style={{
                fontSize: "clamp(1.7rem, 3vw, 2.5rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                color: "var(--l-text)",
                margin: "0 0 40px",
              }}
            >
              {t("landing.how.title")}
              <br />
              <span style={{ color: "var(--l-blue)" }}>
                {t("landing.how.titleBlue")}
              </span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {FEATURES.map((f, i) => (
                <button
                  key={f.key}
                  onClick={() => setActive(i)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "16px 0 16px 20px",
                    borderLeft: `2px solid ${i === active ? "var(--l-blue)" : "var(--l-card-border)"}`,
                    transition: "border-color .2s",
                    fontFamily: "inherit",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 15,
                      fontWeight: 600,
                      color: i === active ? "var(--l-text)" : "var(--l-sub)",
                      transition: "color .2s",
                    }}
                  >
                    {f.title}
                  </p>
                  {i === active && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13.5,
                        lineHeight: 1.65,
                        color: "var(--l-sub)",
                      }}
                    >
                      {f.desc}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right  always dark card */}
          <div>
            <div
              style={{
                background: "#080F1C",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 20,
                padding: "28px",
                boxShadow: dark
                  ? "0 0 80px var(--l-blue-glow), 0 32px 80px rgba(0,0,0,0.6)"
                  : "0 20px 60px rgba(13,27,62,0.15)",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -40,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "70%",
                  height: 80,
                  background:
                    "radial-gradient(ellipse, var(--l-blue-glow) 0%, transparent 70%)",
                  filter: "blur(24px)",
                  pointerEvents: "none",
                }}
              />
              {mockups[FEATURES[active].key]}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
