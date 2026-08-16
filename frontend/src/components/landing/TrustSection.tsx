import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const TRUST_CSS = `
.trust-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background:
    radial-gradient(120% 100% at 15% -10%, rgba(27,201,168,0.10), transparent 55%),
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 40%),
    var(--l-surface);
  border: 1px solid var(--l-border);
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 1px 1px rgba(0,0,0,0.2),
    0 16px 40px -16px rgba(0,0,0,0.6);
  transition: border-color .25s, box-shadow .25s, transform .25s;
}
.trust-card:hover {
  border-color: var(--l-border-strong);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.09),
    0 1px 1px rgba(0,0,0,0.25),
    0 24px 50px -18px rgba(0,0,0,0.7);
  transform: translateY(-3px);
}
`;

function TrustIcon({ shape, tint, children }: { shape: "circle" | "square"; tint: "teal" | "blue"; children: React.ReactNode }) {
  const bg = tint === "teal" ? "rgba(27,201,168,0.14)" : "rgba(43,121,232,0.14)";
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center ${shape === "circle" ? "rounded-full" : "rounded-[12px]"}`}
      style={{ background: bg }}
    >
      {children}
    </div>
  );
}

const ICONS = [
  <path key="1" d="M9 12l2 2 4-4m5-4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3 8 3z" />,
  <path key="2" d="M12 3l8 4v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z" />,
  <path key="3" d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0" />,
  <path key="4" d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4zM6 21v-2a6 6 0 0112 0v2" />,
  <path key="5" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m-9 0v13a2 2 0 002 2h6a2 2 0 002-2V6" />,
  <path key="6" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
];

export default function TrustSection() {
  const { t } = useTranslation();
  const items = t("landing.trust.items", { returnObjects: true }) as { title: string; desc: string }[];

  useEffect(() => {
    const id = "trust-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
    s.textContent = TRUST_CSS;
  }, []);

  return (
    <section id="confiance" className="relative" style={{ background: "var(--l-bg)", padding: "112px 32px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>

        <div className="animate-on-scroll" style={{ marginBottom: 56, textAlign: "center" }}>
          <h2 style={{
            fontSize: "clamp(2rem, 3.6vw, 3rem)",
            fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.025em",
            color: "var(--l-text)", margin: "0 auto", maxWidth: 620,
          }}>
            {t("landing.trust.title")}
          </h2>
          <p style={{
            fontSize: 15, lineHeight: 1.7, color: "var(--l-text-muted)",
            margin: "16px auto 0", maxWidth: 560,
          }}>
            {t("landing.trust.subtitle")}
          </p>
        </div>

        <div className="animate-on-scroll grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={item.title} className="trust-card flex gap-4 p-6">
              <TrustIcon shape={i % 2 === 0 ? "circle" : "square"} tint={i % 2 === 0 ? "teal" : "blue"}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={i % 2 === 0 ? "var(--l-teal)" : "var(--l-blue)"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[i % ICONS.length]}
                </svg>
              </TrustIcon>
              <div>
                <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--l-text)" }}>
                  {item.title}
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--l-text-muted)" }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
