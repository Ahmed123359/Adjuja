import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import LandingNav from "../landing/LandingNav";
import LandingFooter from "../landing/LandingFooter";

type Section = { heading: string; paragraphs: string[]; list?: string[]; anchor?: string };

type Props = {
  title: string;
  updated: string;
  sections: Section[];
};

const BADGE_COLORS = ["#2B79E8", "#1BC9A8", "#3248CE", "#22c55e", "#a855f7", "#f59e0b"];

const LEGAL_CSS = `
.legal-masonry {
  columns: 1;
  column-gap: 20px;
}
@media (min-width: 768px) {
  .legal-masonry { columns: 2; }
}

.legal-card {
  position: relative;
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  margin-bottom: 20px;
  background:
    radial-gradient(120% 100% at 15% -10%, rgba(43,121,232,0.10), transparent 55%),
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
.legal-card:hover {
  border-color: var(--l-border-strong);
  transform: translateY(-2px);
}
`;

function SectionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/** Mise en page partagee des 3 pages legales (mentions, CGU, confidentialite). Forcee en
 * dark (.landing-dark) comme le reste du site de marque -- les tokens --l-* racine
 * s'adaptent au theme systeme, ce qui rendait cette page claire chez un visiteur en
 * light mode alors que tout le reste d'ADJUJA est sombre. Cartes avec le meme relief
 * (ombre en couches + degrade + halo) que FeaturesSection/TrustSection pour rester
 * coherent avec le reste du site. Retour par historique (navigate(-1)), pas un
 * <Link to="/"> qui pousserait toujours vers l'accueil meme venant d'ailleurs. */
export default function LegalPageLayout({ title, updated, sections }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useScrollReveal();

  useEffect(() => {
    const id = "legal-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
    s.textContent = LEGAL_CSS;
  }, []);

  return (
    <div className="landing-dark min-h-screen" style={{ background: "var(--l-bg)", color: "var(--l-text)" }}>
      <LandingNav onEnterApp={() => navigate("/login")} onGoRegister={() => navigate("/register")} />

      <div className="max-w-[980px] mx-auto px-6 pb-14" style={{ paddingTop: "calc(64px + 40px)" }}>

        <button
          onClick={() => navigate(-1)}
          aria-label={t("legal.backHome")}
          className="mb-8 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-0"
          style={{ background: "var(--l-surface-2)", color: "var(--l-text)" }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-bold tracking-[-0.02em] m-0 mb-2 text-center">{title}</h1>
        <p className="text-[13px] m-0 mb-12 text-center" style={{ color: "var(--l-dim)" }}>
          {t("legal.updated", { date: updated })}
        </p>

        <div className="legal-masonry">
          {sections.map((s, i) => (
            <div key={s.heading} id={s.anchor} className="legal-card p-6">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
                  style={{ background: `${BADGE_COLORS[i % BADGE_COLORS.length]}22`, color: BADGE_COLORS[i % BADGE_COLORS.length] }}
                >
                  <SectionIcon />
                </div>
                <div>
                  <h2 className="m-0 mb-2 text-[16px] font-bold tracking-[-0.01em]" style={{ color: "var(--l-text)" }}>
                    {s.heading}
                  </h2>
                  {s.paragraphs.map((p, pi) => (
                    <p key={pi} className="m-0 mb-2 text-[13.5px] leading-[1.65] last:mb-0" style={{ color: "var(--l-text-muted)" }}>
                      {p}
                    </p>
                  ))}
                  {s.list && (
                    <ul className="m-0 mt-2 pl-4 flex flex-col gap-1.5">
                      {s.list.map((li, li_i) => (
                        <li key={li_i} className="text-[13.5px] leading-[1.6]" style={{ color: "var(--l-text-muted)" }}>{li}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="legal-card mt-14 p-10 text-center">
          <h2 className="m-0 mb-3 text-[1.4rem] font-bold tracking-[-0.02em]" style={{ color: "var(--l-text)" }}>
            {t("legal.ctaTitle")}
          </h2>
          <p className="m-0 mb-6 text-[14px]" style={{ color: "var(--l-text-muted)" }}>
            {t("legal.ctaSubtitle")}
          </p>
          <a
            href="mailto:contact@adjuja.com"
            className="inline-block rounded-[12px] px-7 py-3 text-[14px] font-semibold no-underline"
            style={{ background: "var(--l-blue)", color: "#fff" }}
          >
            {t("legal.ctaButton")}
          </a>
        </div>

      </div>

      <LandingFooter onEnterApp={() => navigate("/login")} />
    </div>
  );
}
