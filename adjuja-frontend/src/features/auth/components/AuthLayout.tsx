import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

function GoCard() {
  return (
    <div
      className="absolute w-[290px] rounded-[20px] p-6"
      style={{
        top: "10%", right: "4%", transform: "rotate(-3deg)",
        background: "rgba(10,14,30,0.92)", border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 32px 64px -20px rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
      }}
    >
      <p className="m-0 mb-4 text-[12px] font-medium" style={{ color: "rgba(238,244,255,0.5)" }}>AO-2026-114 · Verdict</p>
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full"
          style={{ background: "rgba(34,197,94,0.16)", border: "2.5px solid #22c55e" }}
        >
          <span style={{ color: "#22c55e", fontWeight: 800, fontSize: 17, lineHeight: 1 }}>GO</span>
          <span style={{ color: "#22c55e", fontSize: 10, marginTop: 2 }}>82/100</span>
        </div>
        <div className="flex flex-col gap-[10px]">
          {["Budget compatible", "Délai réalisable"].map(l => (
            <div key={l} className="flex items-center gap-[8px]">
              <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "rgba(34,197,94,0.18)" }}>
                <span style={{ color: "#22c55e", fontWeight: 800, fontSize: 9 }}>✓</span>
              </span>
              <span style={{ color: "rgba(238,244,255,0.75)", fontSize: 12.5 }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecuriteCard() {
  return (
    <div
      className="absolute w-[260px] rounded-[20px] p-6"
      style={{
        top: "10%", left: "2%", transform: "rotate(-2deg)",
        background: "rgba(10,14,30,0.92)", border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 32px 64px -20px rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: "rgba(43,121,232,0.16)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B79E8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold" style={{ color: "#EEF4FF" }}>Données confidentielles</span>
      </div>
      <div className="flex flex-col gap-[9px]">
        {["Cloisonnement total", "Conformité loi 09-08"].map(l => (
          <div key={l} className="flex items-center gap-[8px]">
            <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "rgba(43,121,232,0.18)" }}>
              <span style={{ color: "#2B79E8", fontWeight: 800, fontSize: 9 }}>✓</span>
            </span>
            <span style={{ color: "rgba(238,244,255,0.75)", fontSize: 12.5 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RedactionCard() {
  const sections = [
    { title: "Présentation de la société", done: true },
    { title: "Méthodologie et approche", done: false },
  ];
  return (
    <div
      className="absolute w-[280px] rounded-[20px] p-6"
      style={{
        bottom: "5%", right: "2%", transform: "rotate(2deg)",
        background: "rgba(10,14,30,0.92)", border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 32px 64px -20px rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] font-medium" style={{ color: "rgba(238,244,255,0.5)" }}>offre_technique.docx</span>
        <span className="text-[11px] font-bold" style={{ color: "#22c55e" }}>68%</span>
      </div>
      <div className="flex flex-col gap-[12px]">
        {sections.map(s => (
          <div key={s.title} className="flex items-center gap-[10px]">
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
              style={{ background: s.done ? "#2B79E8" : "rgba(255,255,255,0.12)" }}
            >
              {s.done && <span style={{ color: "#fff", fontWeight: 800, fontSize: 9 }}>✓</span>}
            </span>
            <span style={{ color: s.done ? "rgba(238,244,255,0.85)" : "rgba(238,244,255,0.45)", fontSize: 12.5 }}>{s.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatPill({ static: isStatic }: { static?: boolean }) {
  return (
    <div
      className={isStatic ? "flex items-center gap-[10px] rounded-full px-5 py-[12px]" : "absolute flex items-center gap-[10px] rounded-full px-5 py-[12px]"}
      style={{
        ...(isStatic ? {} : { top: "2%", left: "6%", transform: "rotate(-2deg)" }),
        background: "rgba(10,14,30,0.92)", border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 20px 40px -16px rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ color: "#1BC9A8", fontWeight: 800, fontSize: 17 }}>656</span>
      <span style={{ color: "rgba(238,244,255,0.6)", fontSize: 12.5 }}>AOs surveillés</span>
    </div>
  );
}

function VeilleCard() {
  return (
    <div
      className="absolute w-[270px] rounded-[20px] p-6"
      style={{
        bottom: "16%", left: "0%", transform: "rotate(2.5deg)",
        background: "rgba(10,14,30,0.92)", border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 32px 64px -20px rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] font-medium" style={{ color: "rgba(238,244,255,0.5)" }}>Secteur BTP</span>
        <span className="flex items-center gap-[5px] text-[10px] font-bold uppercase" style={{ color: "#1BC9A8" }}>
          <span className="h-[6px] w-[6px] rounded-full" style={{ background: "#1BC9A8" }} />
          En direct
        </span>
      </div>
      {[{ ref: "AO-2026-114", tag: "Nouveau" }].map(a => (
        <div key={a.ref} className="flex items-center justify-between rounded-[10px] px-[12px] py-[10px]" style={{ background: "rgba(43,121,232,0.12)" }}>
          <span style={{ color: "#EEF4FF", fontWeight: 600, fontSize: 13 }}>{a.ref}</span>
          <span style={{ color: "#2B79E8", fontWeight: 700, fontSize: 10.5 }}>{a.tag}</span>
        </div>
      ))}
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden" style={{ background: "var(--l-bg-alt)" }}>

      {/* Left  form. Pleine largeur jusqu'a lg : en dessous, le panneau de droite
          (cartes flottantes a largeur fixe) n'a pas la place de respirer sans se
          chevaucher, donc on ne bascule en split-screen qu'a partir de lg (1024px). */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-8 lg:w-[46%]">
        <div className="w-full max-w-[400px]">
          {children}
        </div>
      </div>

      {/* Right  showcase, cache en dessous de lg */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[54%]"
        style={{ background: "#080B1C" }}
      >
        {/* Grille subtile, comme un plan technique */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 40%, transparent 90%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 40%, transparent 90%)",
          }}
        />

        <div className="pointer-events-none absolute -left-24 -top-24 h-[380px] w-[380px] rounded-full opacity-25 blur-[120px]" style={{ background: "#3248CE" }} />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-[380px] w-[380px] rounded-full opacity-20 blur-[120px]" style={{ background: "#1BC9A8" }} />

        <div className="relative z-[2] flex w-full flex-col justify-between p-12">
          <div className="self-start">
            <StatPill static />
          </div>

          <div className="relative flex-1">
            {/* Halo central derriere le logo */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(43,121,232,0.3) 0%, rgba(27,201,168,0.13) 55%, transparent 75%)",
                filter: "blur(24px)",
              }}
            />
            <img
              src="/logo-adjuja.png"
              alt="ADJUJA"
              className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-auto -translate-x-1/2 -translate-y-1/2"
              style={{ filter: "drop-shadow(0 0 60px rgba(43,121,232,0.6))" }}
            />

            <GoCard />
            <SecuriteCard />
            <VeilleCard />
            <RedactionCard />
          </div>

          <div>
            <h2 className="m-0 max-w-[420px] text-[1.9rem] font-bold leading-[1.2] tracking-[-0.02em] text-white">
              {t("auth.showcase.title")}
            </h2>
            <p className="m-0 mt-3 max-w-[420px] text-[14px] leading-[1.7]" style={{ color: "rgba(238,244,255,0.65)" }}>
              {t("auth.showcase.subtitle")}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
