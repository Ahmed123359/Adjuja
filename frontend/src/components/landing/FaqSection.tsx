import { useState } from "react";
import { useTranslation } from "react-i18next";

type Item = { q: string; a: string };
type Category = { key: string; label: string; items: Item[] };

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function PlusMinus({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M5 12h14" />
      {!open && <path d="M12 5v14" />}
    </svg>
  );
}

export default function FaqSection() {
  const { t } = useTranslation();
  const categories = t("landing.faq.categories", { returnObjects: true }) as Category[];
  const [activeCat, setActiveCat] = useState(0);
  const [openItem, setOpenItem] = useState(0);

  const active = categories[activeCat];

  return (
    <section id="faq" style={{ background: "var(--l-bg)", padding: "112px 32px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        <div className="animate-on-scroll" style={{ marginBottom: 48, textAlign: "center" }}>
          <h2 style={{
            fontSize: "clamp(2rem, 3.6vw, 3rem)",
            fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.025em",
            color: "var(--l-text)", margin: "0 auto", maxWidth: 640,
          }}>
            {t("landing.faq.title")}
          </h2>
          <p style={{
            fontSize: 15, lineHeight: 1.7, color: "var(--l-text-muted)",
            margin: "16px auto 0", maxWidth: 560,
          }}>
            {t("landing.faq.subtitle")}
          </p>
        </div>

        <div
          className="animate-on-scroll"
          style={{
            position: "relative",
            isolation: "isolate",
            overflow: "hidden",
            borderRadius: 28,
            padding: "clamp(20px,3vw,40px)",
            background:
              "radial-gradient(70% 60% at 8% 0%, rgba(43,121,232,0.14), transparent 60%)," +
              "radial-gradient(60% 55% at 100% 100%, rgba(27,201,168,0.12), transparent 60%)," +
              "var(--l-surface)",
            border: "1px solid var(--l-border)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 60px -24px rgba(0,0,0,0.6)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">

            {/* Categories */}
            <div className="flex flex-col gap-2">
              {categories.map((cat, i) => {
                const isActive = i === activeCat;
                return (
                  <button
                    key={cat.key}
                    onClick={() => { setActiveCat(i); setOpenItem(0); }}
                    className="flex items-center justify-between gap-3 rounded-[14px] px-5 py-4 text-left cursor-pointer border-0 transition-colors"
                    style={{
                      background: isActive ? "var(--l-surface-2)" : "transparent",
                      border: isActive ? "1px solid var(--l-border-strong)" : "1px solid transparent",
                      color: isActive ? "var(--l-text)" : "var(--l-text-muted)",
                      fontFamily: "inherit", fontSize: 15, fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {cat.label}
                    <span style={{ color: isActive ? "var(--l-blue)" : "var(--l-text-dim)" }}>
                      <ChevronRight />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Questions */}
            <div className="flex flex-col gap-3">
              {active.items.map((item, i) => {
                const isOpen = openItem === i;
                return (
                  <div
                    key={item.q}
                    style={{
                      borderRadius: 14,
                      background: isOpen ? "var(--l-surface-2)" : "transparent",
                      border: `1px solid ${isOpen ? "var(--l-border-strong)" : "var(--l-border)"}`,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => setOpenItem(isOpen ? -1 : i)}
                      className="flex w-full items-center justify-between gap-4 cursor-pointer border-0 bg-none text-left"
                      style={{ padding: "18px 20px", fontFamily: "inherit" }}
                    >
                      <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--l-text)" }}>
                        {item.q}
                      </span>
                      <span style={{ color: "var(--l-text-dim)" }}>
                        <PlusMinus open={isOpen} />
                      </span>
                    </button>
                    {isOpen && (
                      <p style={{
                        margin: 0, padding: "0 20px 20px",
                        fontSize: 13.5, lineHeight: 1.7, color: "var(--l-text-muted)",
                      }}>
                        {item.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
