// Mise en page partagee des 3 pages legales (mentions, CGU, confidentialite)
// -- refaite le 2026-09-27, troisieme version.
//
// Deuxieme version (sommaire lateral + articles a filets) rejetee : mise en
// page de documentation generique. Choix de l'utilisateur : la page prend la
// forme d'un document officiel, comme ceux que le produit prepare. Onglets de
// classeur attaches a la feuille, en-tete (logo, reference, version), articles
// « Article 1, Article 2 », et en pied « Fait a Temara, le ... » avec le cachet.
//
// Forcee en sombre (.landing-dark) comme le reste du site public : les tokens
// --l-* racine suivent le theme systeme, ce qui rendait la page claire chez un
// visiteur en mode clair.

import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LandingNav from "../../landing/components/LandingNav";
import LandingFooter from "../../landing/components/LandingFooter";
import Cachet from "../../landing/components/Cachet";

type Section = { heading: string; paragraphs: string[]; list?: string[]; anchor?: string };

type Props = {
  title: string;
  updated: string;
  sections: Section[];
};

const PAGES = [
  { to: "/mentions-legales", cle: "legal.mentions.title",        ref: "ADJ-ML" },
  { to: "/cgu",              cle: "legal.cgu.title",             ref: "ADJ-CGU" },
  { to: "/confidentialite",  cle: "legal.confidentialite.title", ref: "ADJ-CONF" },
];

const ancre = (s: Section, i: number) => s.anchor ?? `article-${i + 1}`;

export default function LegalPageLayout({ title, updated, sections }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reference = PAGES.find((p) => p.to === pathname)?.ref ?? "ADJ";
  const email = t("landing.footer.contactEmailValue");

  return (
    <div className="landing-dark relative min-h-screen overflow-hidden bg-l-bg text-l-text">
      <LandingNav onEnterApp={() => navigate("/login")} onGoRegister={() => navigate("/register")} />

      {/* Halo de marque derriere la feuille, comme les coins du heros. */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-220px] h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[#2B79E8] opacity-[0.14] blur-[140px]" />

      <main className="relative mx-auto max-w-[1000px] px-4 pb-20 pt-[112px] sm:px-6 md:pt-[128px]">

        {/* Onglets de classeur : l'onglet courant se soude a la feuille. */}
        <nav aria-label={t("legal.docsNav")} className="flex gap-1.5 overflow-x-auto pl-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:pl-6">
          {PAGES.map((p) => (
            <NavLink
              key={p.to}
              to={p.to}
              className={({ isActive }) =>
                `relative -mb-px shrink-0 whitespace-nowrap rounded-t-[10px] border px-4 py-3 text-[15px] font-semibold no-underline transition-colors sm:px-5 ${
                  isActive
                    ? "z-[1] border-l-border-strong border-b-transparent bg-l-surface text-white"
                    : "border-transparent bg-white/[0.03] text-l-text-dim hover:bg-white/[0.06] hover:text-white"
                }`
              }
            >
              {t(p.cle)}
            </NavLink>
          ))}
        </nav>

        <article className="rounded-[12px] border border-l-border-strong bg-l-surface shadow-[0_40px_120px_rgba(0,0,0,0.5)]">
          <div className="px-6 py-10 sm:px-12 md:px-16 md:py-14">

            {/* En-tete */}
            <header className="flex flex-col gap-5 border-b-[3px] border-double border-l-border-strong pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3.5">
                <img src="/logo-adjuja-mark.png" alt="" className="h-12 w-12 rounded-[12px]" />
                <div>
                  <p className="m-0 text-[24px] font-extrabold leading-none tracking-[-.03em] text-white">Adjuja</p>
                  <p className="m-0 mt-1.5 text-[14px] text-l-text-dim">{t("landing.footer.contactAddressValue")} · {email}</p>
                </div>
              </div>
              <dl className="m-0 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[14px] sm:text-right">
                <dt className="text-l-text-dim">{t("legal.reference")}</dt>
                <dd className="m-0 font-semibold tabular-nums text-white">{reference}</dd>
                <dt className="text-l-text-dim">{t("legal.versionLabel")}</dt>
                <dd className="m-0 font-semibold text-white">{updated}</dd>
              </dl>
            </header>

            {/* Titre du document */}
            <div className="py-12 text-center md:py-14">
              <h1 className="m-0 text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[1.05] tracking-[-.03em] text-white">{title}</h1>
              <p className="m-0 mt-4 text-[16px] text-l-text-dim">{t("legal.updated", { date: updated })}</p>
            </div>

            {/* Sommaire, dans la feuille comme en tete d'un contrat */}
            <nav aria-label={t("legal.toc")} className="rounded-[10px] border border-l-border bg-white/[0.02] px-6 py-6 md:px-8">
              <p className="m-0 text-[16px] font-bold text-white">{t("legal.toc")}</p>
              <ol className="m-0 mt-4 grid list-none gap-x-10 gap-y-2.5 p-0 md:grid-cols-2">
                {sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#${ancre(s, i)}`} className="flex gap-3 text-[15px] leading-[1.45] text-[#C6D0E3] no-underline transition-colors hover:text-white">
                      <span className="w-[4.6rem] shrink-0 font-semibold text-[color:var(--l-blue-soft)]">{t("legal.article", { n: i + 1 })}</span>
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {/* Articles */}
            <div className="mt-12">
              {sections.map((s, i) => (
                <section key={s.heading} id={ancre(s, i)} className="scroll-mt-[96px] pb-10 last:pb-0">
                  <p className="m-0 text-[15px] font-bold text-[color:var(--l-blue-soft)]">{t("legal.article", { n: i + 1 })}</p>
                  <h2 className="m-0 mt-1.5 text-[23px] font-bold leading-[1.3] tracking-[-.015em] text-white">{s.heading}</h2>
                  <div className="mt-4 flex flex-col gap-3.5">
                    {s.paragraphs.map((p, pi) => (
                      <p key={pi} className="m-0 text-[17px] leading-[1.75] text-[#C6D0E3]">{p}</p>
                    ))}
                    {s.list && (
                      <ul className="m-0 flex flex-col gap-2 pl-5">
                        {s.list.map((li, li_i) => (
                          <li key={li_i} className="text-[17px] leading-[1.7] text-[#C6D0E3] marker:text-[color:var(--l-blue-soft)]">{li}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* Pied du document : lieu, date, cachet */}
            <footer className="mt-14 flex flex-col items-end border-t border-l-border pt-10">
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="m-0 text-[16px] text-[#C6D0E3]">{t("legal.madeAt", { date: updated })}</p>
                  <p className="m-0 mt-1.5 text-[17px] font-bold text-white">{t("legal.signedFor")}</p>
                </div>
                <Cachet texte={t("legal.stampText")} taille={104} />
              </div>
            </footer>
          </div>
        </article>

        {/* Sous la feuille : une question, retour a l'accueil */}
        <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-[12px] border border-l-border bg-l-surface-2 px-7 py-6 sm:flex-row sm:items-center">
          <div>
            <p className="m-0 text-[19px] font-bold text-white">{t("legal.ctaTitle")}</p>
            <p className="m-0 mt-1 max-w-[520px] text-[15px] leading-[1.6] text-l-text-dim">{t("legal.ctaSubtitle")}</p>
          </div>
          <a
            href={`mailto:${email}`}
            className="inline-flex h-12 shrink-0 items-center rounded-[8px] bg-l-blue px-6 text-[15px] font-semibold text-white no-underline transition-[filter] hover:brightness-110"
          >
            {t("legal.ctaButton")}
          </a>
        </div>

        <Link to="/" className="mt-8 inline-flex items-center gap-2 text-[15px] font-semibold text-[color:var(--l-blue-soft)] no-underline hover:text-white">
          <span aria-hidden>←</span> {t("legal.backToSite")}
        </Link>
      </main>

      <LandingFooter onEnterApp={() => navigate("/login")} onGoRegister={() => navigate("/register")} />
    </div>
  );
}
