import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------ */
/* Card 1 -- Veille                                                     */
/* ------------------------------------------------------------------ */

function CardVeille() {
  const aos = [
    { ref: "AO-2026-114", acheteur: "Commune urbaine de Kénitra", secteur: "BTP", nouveau: true  },
    { ref: "AO-2026-112", acheteur: "ONEE - Branche Eau",         secteur: "BTP", nouveau: true  },
    { ref: "AO-2026-108", acheteur: "Région Rabat-Salé-Kénitra",  secteur: "Ingénierie", nouveau: false },
  ];

  return (
    <div
      className="w-full rounded-[14px] overflow-hidden"
      style={{
        background: "rgba(8,12,27,0.9)",
        border: "1px solid rgba(43,121,232,0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
      >
        <span className="text-[12px] font-medium" style={{ color: "var(--l-text-muted)" }}>
          Veille · secteur BTP
        </span>
        <span
          className="flex items-center gap-[6px] text-[10px] font-bold uppercase tracking-[.14em]"
          style={{ color: "var(--l-teal)", textShadow: "0 0 12px rgba(27,201,168,0.6)" }}
        >
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: "var(--l-teal)", boxShadow: "0 0 6px rgba(27,201,168,0.9)", animation: "blink 1.4s step-end infinite" }}
          />
          En direct
        </span>
      </div>

      <div className="px-6 pt-4 pb-5 flex flex-col gap-[10px]">
        {aos.map(ao => (
          <div
            key={ao.ref}
            className="flex items-center gap-4 rounded-[10px] px-4 py-3"
            style={{
              background: ao.nouveau ? "rgba(43,121,232,0.08)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${ao.nouveau ? "rgba(43,121,232,0.22)" : "rgba(255,255,255,0.05)"}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[8px] mb-[3px]">
                <span className="text-[13px] font-semibold" style={{ color: "#EEF4FF" }}>{ao.ref}</span>
                {ao.nouveau && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-[.08em] px-[6px] py-[2px] rounded-full"
                    style={{ color: "var(--l-blue)", background: "rgba(43,121,232,0.15)" }}
                  >
                    Nouveau
                  </span>
                )}
              </div>
              <span
                className="block text-[12px] overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ color: "var(--l-text-muted)" }}
              >
                {ao.acheteur}
              </span>
            </div>
            <span
              className="shrink-0 text-[10px] font-semibold px-[8px] py-[3px] rounded-full"
              style={{ color: "var(--l-teal)", background: "rgba(27,201,168,0.12)" }}
            >
              {ao.secteur}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 2 -- Analyse DAO                                                */
/* ------------------------------------------------------------------ */

function CardAnalyse() {
  const lines = [
    { w: "92%", lit: false },
    { w: "78%", lit: true  },
    { w: "85%", lit: false },
    { w: "60%", lit: true  },
    { w: "88%", lit: false },
    { w: "72%", lit: false },
  ];

  const stats = [
    { value: "2.4M", unit: "MAD",   label: "Budget estimatif"    },
    { value: "90",   unit: "jours", label: "Délai d'exécution"   },
    { value: "60",   unit: "%",     label: "Pondération qualité" },
  ];

  return (
    <div
      className="w-full rounded-[14px] overflow-hidden"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1px 1fr",
        background: "rgba(8,12,27,0.9)",
        border: "1px solid rgba(43,121,232,0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Gauche -- document abstrait */}
      <div className="p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--l-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-[12px] font-medium tracking-wide" style={{ color: "var(--l-text-muted)" }}>
            DAO-2026-041.pdf
          </span>
          <span
            className="ml-auto text-[10px] font-bold uppercase tracking-[.14em]"
            style={{ color: "var(--l-teal)", textShadow: "0 0 12px rgba(27,201,168,0.6)" }}
          >
            Analyse
          </span>
        </div>

        <div className="flex flex-col gap-[8px] flex-1">
          {lines.map((l, i) => (
            <div
              key={i}
              className="h-[6px] rounded-full"
              style={{
                width: l.w,
                background: l.lit ? "var(--l-blue)" : "rgba(255,255,255,0.06)",
                boxShadow: l.lit ? "0 0 10px rgba(43,121,232,0.55)" : "none",
              }}
            />
          ))}
        </div>

        <div
          className="mt-5 pt-4 flex items-center gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="w-[8px] h-[8px] rounded-full"
            style={{ background: "var(--l-teal)", boxShadow: "0 0 8px rgba(27,201,168,0.7)" }}
          />
          <span className="text-[12px]" style={{ color: "var(--l-text-muted)" }}>
            3 criteres mis en evidence
          </span>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Droite -- grands chiffres */}
      <div className="p-6 flex flex-col gap-5">
        <span
          className="text-[10px] font-bold uppercase tracking-[.16em]"
          style={{ color: "var(--l-teal)", textShadow: "0 0 14px rgba(27,201,168,0.5)" }}
        >
          Intelligence extraite
        </span>
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-[4px]">
            <span className="text-[12px]" style={{ color: "var(--l-text-muted)" }}>{s.label}</span>
            <div className="flex items-baseline gap-[8px]">
              <span
                className="font-black leading-none tracking-[-0.04em]"
                style={{
                  fontSize: "clamp(1.8rem,3vw,2.6rem)",
                  /* color: fallback visible si background-clip:text n'est pas applique
                     (sinon WebkitTextFillColor:transparent rend le texte invisible, pas
                     juste peu contraste -- constat audit B5 "chiffres presque invisibles") */
                  color: "#fff",
                  background: "linear-gradient(135deg,#fff 30%,var(--l-teal) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {s.value}
              </span>
              <span className="text-[14px] font-medium" style={{ color: "var(--l-text-muted)" }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 3 -- Génération                                                  */
/* ------------------------------------------------------------------ */

function CardGeneration() {
  const sections = [
    { title: "Présentation de la société", lines: ["92%", "76%"], done: true,  active: false },
    { title: "Méthodologie et approche",   lines: ["88%"],         done: true,  active: false },
    { title: "Références similaires",      lines: ["50%"],         done: false, active: true  },
  ];

  return (
    <div
      className="w-full rounded-[14px] overflow-hidden"
      style={{
        background: "rgba(8,12,27,0.9)",
        border: "1px solid rgba(43,121,232,0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
      >
        <span className="text-[12px] font-medium" style={{ color: "var(--l-text-muted)" }}>
          offre_technique.docx
        </span>
        <div className="flex items-center gap-[8px]">
          <div
            className="w-[7px] h-[7px] rounded-full"
            style={{ background: "var(--l-teal)", boxShadow: "0 0 8px rgba(27,201,168,0.8)", animation: "pulse 2s infinite" }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-[.14em]"
            style={{ color: "var(--l-teal)", textShadow: "0 0 12px rgba(27,201,168,0.5)" }}
          >
            Génération en cours
          </span>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-4">
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0"
                style={{
                  background: sec.done ? "var(--l-blue)" : "transparent",
                  border: sec.done ? "none" : "1.5px solid rgba(255,255,255,0.12)",
                  boxShadow: sec.done ? "0 0 10px rgba(43,121,232,0.5)" : "none",
                }}
              >
                {sec.done && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2.2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span
                className="text-[15px] font-semibold tracking-[-0.01em]"
                style={{
                  color: sec.done
                    ? "rgba(168,196,232,0.55)"
                    : sec.active
                    ? "#EEF4FF"
                    : "rgba(168,196,232,0.3)",
                }}
              >
                {sec.title}
              </span>
              {sec.done && (
                <span
                  className="ml-auto text-[11px] font-bold"
                  style={{ color: "var(--l-teal)", textShadow: "0 0 10px rgba(27,201,168,0.5)" }}
                >
                  100%
                </span>
              )}
              {sec.active && (
                <span
                  className="ml-auto text-[11px] font-bold"
                  style={{ color: "var(--l-blue)", textShadow: "0 0 10px rgba(43,121,232,0.5)" }}
                >
                  En cours
                </span>
              )}
            </div>

            <div className="pl-[30px] flex flex-col gap-[7px]">
              {sec.lines.map((w, li) => (
                <div
                  key={li}
                  className="h-[5px] rounded-full relative overflow-hidden"
                  style={{ width: w, background: "rgba(255,255,255,0.06)" }}
                >
                  {sec.active && li === 0 && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: "46%",
                        background: "var(--l-blue)",
                        boxShadow: "0 0 8px rgba(43,121,232,0.8)",
                      }}
                    />
                  )}
                </div>
              ))}
              {sec.active && (
                <div className="flex items-center gap-[7px] mt-[2px]">
                  <div
                    className="w-[2px] h-[14px] rounded-sm"
                    style={{
                      background: "var(--l-blue)",
                      boxShadow: "0 0 6px rgba(43,121,232,0.9)",
                      animation: "blink 1.1s step-end infinite",
                    }}
                  />
                  <span className="text-[11px]" style={{ color: "rgba(168,196,232,0.4)" }}>
                    en cours de redaction...
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section principale                                                    */
/* ------------------------------------------------------------------ */

export default function HowItWorksSection() {
  const { t } = useTranslation();

  const steps = [
    { num: "01", title: t("landing.how.t1Title"), desc: t("landing.how.t1Desc"), card: <CardVeille /> },
    { num: "02", title: t("landing.how.t2Title"), desc: t("landing.how.t2Desc"), card: <CardAnalyse /> },
    { num: "03", title: t("landing.how.t3Title"), desc: t("landing.how.t3Desc"), card: <CardGeneration /> },
  ];

  return (
    <section id="how-it-works" className="relative bg-[#090D1C] rounded-t-[32px] -mt-8">

      {/* Halo d'ambiance derriere les cartes */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 70% 40% at 50% 30%, rgba(43,121,232,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col gap-20 max-sm:gap-12 py-24 max-sm:py-14">
        {steps.map((step, i) => (
          <div
            key={i}
            className="animate-on-scroll mx-auto w-[min(1140px,96vw)] rounded-[22px] p-[1.5px]"
            style={{
              background: "linear-gradient(135deg,rgba(50,72,206,0.7) 0%,rgba(43,121,232,0.55) 50%,rgba(27,201,168,0.55) 100%)",
              boxShadow: "0 0 60px rgba(43,121,232,0.18), 0 40px 100px rgba(0,0,0,0.7)",
            }}
          >
            <div
              className="rounded-[21px] max-sm:px-5 max-sm:pt-5 max-sm:pb-6"
              style={{
                background: "#090D1E",
                padding: "clamp(18px,2.2vw,28px) clamp(20px,4vw,44px) clamp(20px,2.2vw,28px)",
              }}
            >
              {/* Chrome bar */}
              <div className="flex items-center gap-[8px] mb-5 max-sm:mb-4">
                <div className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                <div className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                <div className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                <span
                  className="ml-auto text-[10px] font-bold tracking-[.16em] uppercase"
                  style={{ color: "rgba(168,196,232,0.35)" }}
                >
                  Etape {step.num} / 03
                </span>
              </div>

              {/* Badge + titre */}
              <div className="flex items-center gap-4 mb-3">
                <div
                  className="flex shrink-0 items-center justify-center rounded-[16px] max-sm:rounded-[12px]"
                  style={{
                    width: "clamp(40px,4.5vw,52px)",
                    height: "clamp(40px,4.5vw,52px)",
                    background: "linear-gradient(135deg,var(--l-indigo),var(--l-blue))",
                    boxShadow: "0 0 32px rgba(43,121,232,0.55), 0 8px 24px rgba(43,121,232,0.35)",
                  }}
                >
                  <span
                    className="font-black tracking-[-0.02em] text-white"
                    style={{ fontSize: "clamp(1.05rem,1.8vw,1.4rem)" }}
                  >
                    {step.num}
                  </span>
                </div>
                <h2
                  className="font-bold tracking-[-0.03em] leading-[1.15] m-0"
                  style={{
                    fontSize: "clamp(1.2rem,2vw,1.6rem)",
                    color: "#EEF4FF",
                  }}
                >
                  {step.title}
                </h2>
              </div>

              <p
                className="mt-0 mb-4 max-w-[720px] max-sm:mb-4"
                style={{
                  fontSize: "clamp(12.5px,1.2vw,14px)",
                  lineHeight: 1.6,
                  color: "rgba(168,196,232,0.65)",
                }}
              >
                {step.desc}
              </p>

              {step.card}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
