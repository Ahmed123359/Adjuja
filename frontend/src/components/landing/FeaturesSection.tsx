import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

const FEATURES_CSS = `
.features-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: auto auto; gap: 14px; }
.feat-a { grid-column: 1; grid-row: 1; }
.feat-b { grid-column: 2; grid-row: 1; }
.feat-c { grid-column: 3; grid-row: 1 / 3; }
.feat-d { grid-column: 1 / 3; grid-row: 2; }
@media (max-width: 900px) {
  .features-grid { grid-template-columns: 1fr 1fr; grid-template-rows: auto; }
  .feat-a { grid-column: 1; grid-row: 1; }
  .feat-b { grid-column: 2; grid-row: 1; }
  .feat-c { grid-column: 1 / 3; grid-row: 2; }
  .feat-d { grid-column: 1 / 3; grid-row: 3; }
}
@media (max-width: 580px) {
  .features-grid { grid-template-columns: 1fr; }
  .feat-a, .feat-b, .feat-c, .feat-d { grid-column: 1 !important; grid-row: auto !important; }
}
`;

function DocMockup() {
  const rows = [
    { label: "Objet du marché", hit: true },
    { label: "Critères d'attribution", hit: true },
    { label: "Montant estimatif", hit: true },
    { label: "Clauses techniques", hit: false },
    { label: "Délai d'exécution", hit: false },
    { label: "Garanties requises", hit: false },
  ];
  return (
    <div
      style={{
        background: "var(--l-mk-bg)",
        border: "1px solid var(--l-mk-border)",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 10,
      }}
    >
      <div
        style={{
          background: "var(--l-mk-surf)",
          padding: "7px 12px",
          display: "flex",
          gap: 6,
          alignItems: "center",
          borderBottom: "1px solid var(--l-mk-border)",
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div
            key={c}
            style={{ width: 7, height: 7, borderRadius: "50%", background: c }}
          />
        ))}
        <span style={{ color: "var(--l-dim)", marginLeft: 6 }}>
          DCE-ONCF-2025.pdf
        </span>
      </div>
      <div style={{ padding: "12px", display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          {rows.map((r) => (
            <div
              key={r.label}
              style={{
                marginBottom: 4,
                padding: "5px 8px",
                borderRadius: 5,
                background: r.hit ? "var(--l-blue-a)" : "transparent",
                border: r.hit
                  ? "1px solid var(--l-blue-a)"
                  : "1px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: r.hit ? "var(--l-text)" : "var(--l-dim)" }}>
                {r.label}
              </span>
              {r.hit && (
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--l-blue)",
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            width: 52,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <div
            style={{
              background: "var(--l-blue)",
              borderRadius: 6,
              padding: "6px 8px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              6
            </p>
            <p
              style={{
                margin: "3px 0 0",
                color: "rgba(255,255,255,.65)",
                fontSize: 8,
              }}
            >
              Extraits
            </p>
          </div>
          <div
            style={{
              background: "var(--l-mk-surf)",
              border: "1px solid var(--l-mk-border)",
              borderRadius: 6,
              padding: "6px 8px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#22c55e",
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              3s
            </p>
            <p
              style={{ margin: "3px 0 0", color: "var(--l-dim)", fontSize: 8 }}
            >
              Analyse
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WritingMockup() {
  const sections = [
    { title: "Présentation de la société", lines: 3, done: true },
    { title: "Méthodologie et approche", lines: 2, done: true },
    { title: "Références similaires", lines: 1, done: false },
  ];
  return (
    <div
      style={{
        background: "var(--l-mk-bg)",
        border: "1px solid var(--l-mk-border)",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 10,
      }}
    >
      <div
        style={{
          background: "var(--l-mk-surf)",
          padding: "7px 12px",
          borderBottom: "1px solid var(--l-mk-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "var(--l-dim)" }}>memoire_technique.docx</span>
        <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 9 }}>
          Génération en cours...
        </span>
      </div>
      <div style={{ padding: "12px" }}>
        {sections.map((s) => (
          <div key={s.title} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 5,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: s.done ? "var(--l-blue)" : "var(--l-mk-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {s.done && (
                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M1.5 5l2.5 2.5 4.5-5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span
                style={{
                  color: s.done ? "var(--l-text)" : "var(--l-sub)",
                  fontWeight: 600,
                  fontSize: 9.5,
                }}
              >
                {s.title}
              </span>
            </div>
            <div
              style={{
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {Array.from({ length: s.lines }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 5,
                    borderRadius: 3,
                    background: "var(--l-mk-border)",
                    width: i === s.lines - 1 ? "55%" : "100%",
                    overflow: "hidden",
                  }}
                >
                  {!s.done && i === 0 && (
                    <div
                      style={{
                        height: "100%",
                        width: "35%",
                        background: "var(--l-blue)",
                        borderRadius: 3,
                      }}
                    />
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

function AOTableMockup() {
  const rows = [
    { ref: "AO-2025-041", acheteur: "ONCF", statut: "Gagné", color: "#22c55e" },
    {
      ref: "AO-2025-038",
      acheteur: "Ministère Santé",
      statut: "En cours",
      color: "var(--l-blue)",
    },
    {
      ref: "AO-2025-035",
      acheteur: "Marsa Maroc",
      statut: "En cours",
      color: "var(--l-blue)",
    },
    {
      ref: "AO-2025-032",
      acheteur: "OCP Group",
      statut: "Soumis",
      color: "#f59e0b",
    },
    {
      ref: "AO-2025-029",
      acheteur: "Commune Rabat",
      statut: "Gagné",
      color: "#22c55e",
    },
  ];
  return (
    <div
      style={{
        background: "var(--l-mk-bg)",
        border: "1px solid var(--l-mk-border)",
        borderRadius: 10,
        overflow: "hidden",
        fontSize: 10,
      }}
    >
      <div
        style={{
          background: "var(--l-mk-surf)",
          padding: "7px 12px",
          borderBottom: "1px solid var(--l-mk-border)",
          display: "flex",
          gap: 12,
        }}
      >
        {["Référence", "Acheteur", "Statut"].map((h) => (
          <span
            key={h}
            style={{
              color: "var(--l-dim)",
              fontWeight: 600,
              fontSize: 9,
              textTransform: "uppercase" as const,
              letterSpacing: ".05em",
              flex: h === "Acheteur" ? 1 : ("none" as any),
              minWidth: h === "Référence" ? 72 : h === "Statut" ? 58 : "auto",
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.ref}
          style={{
            padding: "6px 12px",
            borderBottom:
              i < rows.length - 1 ? "1px solid var(--l-mk-border)" : "none",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--l-sub)", minWidth: 72 }}>{r.ref}</span>
          <span
            style={{
              color: "var(--l-text)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }}
          >
            {r.acheteur}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              minWidth: 58,
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: r.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: r.color }}>{r.statut}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineMockup() {
  const steps = [
    { label: "DCE reçu", done: true, active: false },
    { label: "Analyse", done: true, active: false },
    { label: "Rédaction", done: false, active: true },
    { label: "Validation", done: false, active: false },
    { label: "Soumis", done: false, active: false },
  ];
  return (
    <div
      style={{
        background: "var(--l-mk-bg)",
        border: "1px solid var(--l-mk-border)",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                flex: 1,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: s.done
                    ? "var(--l-blue)"
                    : s.active
                      ? "var(--l-blue-a)"
                      : "var(--l-mk-surf)",
                  border: s.active
                    ? "2px solid var(--l-blue)"
                    : s.done
                      ? "none"
                      : "1.5px solid var(--l-mk-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {s.done ? (
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M1.5 5l2.5 2.5 4.5-5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: s.active
                        ? "var(--l-blue)"
                        : "var(--l-mk-border)",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: s.active
                    ? "var(--l-blue)"
                    : s.done
                      ? "var(--l-sub)"
                      : "var(--l-dim)",
                  textAlign: "center",
                  fontWeight: s.active ? 600 : 400,
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  height: 1.5,
                  flex: 0.4,
                  background: s.done ? "var(--l-blue)" : "var(--l-mk-border)",
                  marginTop: 14,
                  borderRadius: 1,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          padding: "9px 11px",
          background: "var(--l-blue-a)",
          border: "1px solid var(--l-blue-a)",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <span
            style={{ color: "var(--l-text)", fontSize: 10, fontWeight: 500 }}
          >
            AO-2025-041 Rédaction mémoire
          </span>
          <span
            style={{ color: "var(--l-blue)", fontSize: 10, fontWeight: 600 }}
          >
            68%
          </span>
        </div>
        <div
          style={{
            height: 4,
            background: "var(--l-mk-border)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "68%",
              background: "var(--l-blue)",
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  const { t } = useTranslation();

  useEffect(() => {
    const id = "features-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) {
      s = document.createElement("style");
      s.id = id;
      document.head.appendChild(s);
    }
    s.textContent = FEATURES_CSS;
  }, []);

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "var(--l-card)",
    border: "1px solid var(--l-card-border)",
    borderRadius: 16,
    padding: "22px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    ...extra,
  });

  return (
    <section
      id="features"
      style={{ background: "var(--l-bg-alt)", padding: "100px 24px 120px" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "clamp(1.7rem, 3vw, 2.4rem)",
            fontWeight: 700,
            lineHeight: 1.18,
            textAlign: "center",
            letterSpacing: "-0.02em",
            color: "var(--l-text)",
            margin: "0 0 56px",
          }}
        >
          {t("landing.features.title")}
          <br />
          <span style={{ color: "var(--l-blue)" }}>
            {t("landing.features.titleBlue")}
          </span>
        </h2>

        <div className="features-grid">
          <div className="feat-a" style={card()}>
            <DocMockup />
            <div>
              <p
                style={{
                  margin: "0 0 5px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--l-text)",
                }}
              >
                {t("landing.features.analyse.title")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--l-sub)",
                }}
              >
                {t("landing.features.analyse.desc")}
              </p>
            </div>
          </div>

          <div className="feat-b" style={card()}>
            <WritingMockup />
            <div>
              <p
                style={{
                  margin: "0 0 5px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--l-text)",
                }}
              >
                {t("landing.features.gen.title")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--l-sub)",
                }}
              >
                {t("landing.features.gen.desc")}
              </p>
            </div>
          </div>

          <div
            className="feat-c"
            style={card({ justifyContent: "space-between" })}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                flex: 1,
              }}
            >
              <AOTableMockup />
              <div>
                <p
                  style={{
                    margin: "0 0 5px",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--l-text)",
                  }}
                >
                  {t("landing.features.suivi.title")}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    color: "var(--l-sub)",
                  }}
                >
                  {t("landing.features.suivi.desc")}
                </p>
              </div>
            </div>
            <button
              style={{
                marginTop: 12,
                background: "var(--l-blue)",
                border: "none",
                cursor: "pointer",
                padding: "13px 0",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                width: "100%",
                fontFamily: "inherit",
                transition: "opacity .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = ".82")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {t("landing.features.cta")}
            </button>
          </div>

          <div className="feat-d" style={card()}>
            <PipelineMockup />
            <div>
              <p
                style={{
                  margin: "0 0 5px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--l-text)",
                }}
              >
                {t("landing.features.pipeline.title")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--l-sub)",
                }}
              >
                {t("landing.features.pipeline.desc")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
