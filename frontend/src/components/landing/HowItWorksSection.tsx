import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/* Card 1 -- Analyse DCE                                                */
/* ------------------------------------------------------------------ */

function CardAnalyse() {
  const lines = [
    { w: "92%", lit: false },
    { w: "78%", lit: true  },
    { w: "85%", lit: false },
    { w: "60%", lit: true  },
    { w: "88%", lit: false },
    { w: "72%", lit: false },
    { w: "95%", lit: true  },
    { w: "55%", lit: false },
    { w: "80%", lit: false },
    { w: "66%", lit: false },
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
      <div className="p-9 flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--l-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-[12px] font-medium tracking-wide" style={{ color: "var(--l-text-muted)" }}>
            DCE-ONCF-2025.pdf
          </span>
          <span
            className="ml-auto text-[10px] font-bold uppercase tracking-[.14em]"
            style={{ color: "var(--l-teal)", textShadow: "0 0 12px rgba(27,201,168,0.6)" }}
          >
            Analyse
          </span>
        </div>

        <div className="flex flex-col gap-[10px] flex-1">
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
          className="mt-8 pt-6 flex items-center gap-2"
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
      <div className="p-9 flex flex-col gap-9">
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
                  fontSize: "clamp(2.6rem,4.5vw,4rem)",
                  background: "linear-gradient(135deg,#fff 30%,var(--l-teal) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {s.value}
              </span>
              <span className="text-[16px] font-medium" style={{ color: "var(--l-text-muted)" }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 2 -- Génération                                                  */
/* ------------------------------------------------------------------ */

function CardGeneration() {
  const sections = [
    { title: "Présentation de la société", lines: ["92%", "76%", "62%"], done: true,  active: false },
    { title: "Méthodologie et approche",   lines: ["88%", "68%"],        done: true,  active: false },
    { title: "Références similaires",      lines: ["50%"],               done: false, active: true  },
    { title: "Plan qualité",               lines: ["80%", "55%"],        done: false, active: false },
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
        className="px-9 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
      >
        <span className="text-[12px] font-medium" style={{ color: "var(--l-text-muted)" }}>
          memoire_technique.docx
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

      <div className="p-9 flex flex-col gap-9">
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="flex items-center gap-3 mb-4">
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

            <div className="pl-[30px] flex flex-col gap-[10px]">
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
/* Card 3 -- Export                                                      */
/* ------------------------------------------------------------------ */

function CardExport() {
  const files = [
    { label: "Note méthodologique",   size: "2.4 MB", done: true  },
    { label: "Acte d'engagement",     size: "0.6 MB", done: true  },
    { label: "Déclaration d'honneur", size: "0.4 MB", done: true  },
    { label: "CPS paraphé",           size: "1.8 MB", done: true  },
    { label: "Bordereau des prix",    size: "0.8 MB", done: false },
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
        className="px-9 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
      >
        <span className="text-[12px] font-medium" style={{ color: "var(--l-text-muted)" }}>
          AO-2025-041 · Dossier final
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[.14em]"
          style={{ color: "#22c55e", textShadow: "0 0 12px rgba(34,197,94,0.6)" }}
        >
          Prêt a soumettre
        </span>
      </div>

      <div className="px-9 pt-7 pb-8 flex flex-col gap-[15px]">
        {files.map((f) => (
          <div key={f.label} className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-[9px] flex items-center justify-center shrink-0"
              style={{
                background: f.done ? "rgba(43,121,232,0.15)" : "rgba(255,255,255,0.03)",
                border: f.done ? "none" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: f.done ? "0 0 12px rgba(43,121,232,0.2)" : "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={f.done ? "var(--l-blue)" : "rgba(168,196,232,0.3)"}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <span
              className="flex-1 text-[14px] font-medium"
              style={{ color: f.done ? "#EEF4FF" : "rgba(168,196,232,0.3)" }}
            >
              {f.label}
            </span>
            <span className="text-[12px]" style={{ color: "var(--l-text-muted)" }}>{f.size}</span>
            {f.done ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="rgba(34,197,94,0.12)" />
                <path d="M6 10.2l2.5 2.5 5.5-6"
                  stroke="#22c55e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-[.08em]"
                style={{ color: "rgba(168,196,232,0.3)" }}>
                En attente
              </span>
            )}
          </div>
        ))}

        <div className="mt-4 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            className="w-full py-[16px] rounded-[10px] flex items-center justify-center gap-[11px] cursor-pointer border-0 font-bold text-[15px] text-white tracking-[-0.01em]"
            style={{
              background: "linear-gradient(135deg,var(--l-indigo),var(--l-blue))",
              boxShadow: "0 8px 36px rgba(43,121,232,0.45), 0 0 0 1px rgba(43,121,232,0.3)",
            }}
          >
            Télécharger le dossier complet
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24"
              stroke="white" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section principale                                                    */
/* ------------------------------------------------------------------ */

export default function HowItWorksSection() {
  const { t } = useTranslation();
  const outerRef = useRef<HTMLElement>(null);
  const pinRef   = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const cards = cardsRef.current;
    if (!cards.length || !outerRef.current || !pinRef.current) return;

    gsap.set(cards[0], { opacity: 1, scale: 1 });
    cards.slice(1).forEach(c => gsap.set(c, { opacity: 0, scale: 0.97 }));

    const tl = gsap.timeline();

    cards.forEach((card, i) => {
      tl.to({}, { duration: 2.5, onComplete: () => setActive(i) });
      if (i < cards.length - 1) {
        tl.to(card,         { opacity: 0, scale: 0.97, duration: 1.6, ease: "power2.inOut" }, ">");
        tl.to(cards[i + 1], { opacity: 1, scale: 1,    duration: 1.6, ease: "power2.inOut" }, "<");
      }
    });

    tl.to({}, { duration: 1 });

    ScrollTrigger.create({
      trigger: outerRef.current,
      start: "top top",
      end: "+=700vh",
      pin: pinRef.current,
      pinSpacing: true,
      scrub: 1.8,
      animation: tl,
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  }, []);

  const steps = [
    { num: "01", title: t("landing.how.t1Title"), desc: t("landing.how.t1Desc"), card: <CardAnalyse /> },
    { num: "02", title: t("landing.how.t2Title"), desc: t("landing.how.t2Desc"), card: <CardGeneration /> },
    { num: "03", title: t("landing.how.t3Title"), desc: t("landing.how.t3Desc"), card: <CardExport /> },
  ];

  return (
    <section ref={outerRef} id="how-it-works" className="relative bg-[#090D1C] rounded-t-[32px] -mt-8">
      <div ref={pinRef} className="relative h-screen overflow-hidden flex items-center justify-center">

        {/* Halo d'ambiance derriere les cartes */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 70% 55% at 50% 52%, rgba(43,121,232,0.1) 0%, transparent 70%)",
          }}
        />

        {steps.map((step, i) => (
          <div
            key={i}
            ref={el => { if (el) cardsRef.current[i] = el; }}
            className="absolute w-[min(1320px,96vw)] rounded-[22px] p-[1.5px]"
            style={{
              background: "linear-gradient(135deg,rgba(50,72,206,0.7) 0%,rgba(43,121,232,0.55) 50%,rgba(27,201,168,0.55) 100%)",
              boxShadow: "0 0 60px rgba(43,121,232,0.18), 0 40px 100px rgba(0,0,0,0.7)",
              zIndex: i + 1,
            }}
          >
            <div
              className="rounded-[21px] overflow-hidden max-sm:px-5 max-sm:pt-5 max-sm:pb-6"
              style={{
                background: "#090D1E",
                padding: "clamp(24px,3vw,44px) clamp(20px,4vw,56px) clamp(28px,3vw,48px)",
              }}
            >
              {/* Chrome bar */}
              <div className="flex items-center gap-[8px] mb-10 max-sm:mb-6">
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
              <div className="flex items-center gap-5 mb-5">
                <div
                  className="flex shrink-0 items-center justify-center rounded-[16px] max-sm:rounded-[12px]"
                  style={{
                    width: "clamp(52px,6vw,72px)",
                    height: "clamp(52px,6vw,72px)",
                    background: "linear-gradient(135deg,var(--l-indigo),var(--l-blue))",
                    boxShadow: "0 0 32px rgba(43,121,232,0.55), 0 8px 24px rgba(43,121,232,0.35)",
                  }}
                >
                  <span
                    className="font-black tracking-[-0.02em] text-white"
                    style={{ fontSize: "clamp(1.3rem,2.5vw,1.8rem)" }}
                  >
                    {step.num}
                  </span>
                </div>
                <h2
                  className="font-bold tracking-[-0.03em] leading-[1.15] m-0"
                  style={{
                    fontSize: "clamp(1.4rem,2.6vw,2.1rem)",
                    color: "#EEF4FF",
                  }}
                >
                  {step.title}
                </h2>
              </div>

              <p
                className="mt-0 mb-9 max-w-[720px] max-sm:mb-5"
                style={{
                  fontSize: "clamp(13px,1.4vw,15.5px)",
                  lineHeight: 1.8,
                  color: "rgba(168,196,232,0.65)",
                }}
              >
                {step.desc}
              </p>

              {step.card}
            </div>
          </div>
        ))}

        {/* Points de progression */}
        <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-[10px]">
          {steps.map((s, i) => (
            <div
              key={s.num}
              className="h-[5px] rounded-full transition-all duration-400"
              style={{
                width: i === active ? 32 : 6,
                background: i === active
                  ? "linear-gradient(90deg,var(--l-indigo),var(--l-teal))"
                  : "rgba(168,196,232,0.2)",
                boxShadow: i === active ? "0 0 10px rgba(43,121,232,0.6)" : "none",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
