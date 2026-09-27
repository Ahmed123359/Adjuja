// Confidentialite -- refait le 2026-09-27 (deuxieme version).
//
// Les engagements sont presentes comme un document : une charte, avec son
// titre, ses six engagements en deux colonnes, et un pied « Pour Adjuja »
// portant un cachet. Elle occupe toute la largeur de la section (retour du
// 2026-09-27 : trop etroite) et passe a trois colonnes sur grand ecran. Le cachet n'est pas un ornement gratuit : apposer
// signature et cachet est l'un des gestes du produit.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Cachet from "./Cachet";

type Item = { title: string; desc: string };

export default function TrustSection() {
  const { t } = useTranslation();
  const items = t("landing.trust.items", { returnObjects: true }) as Item[];

  return (
    <section id="confiance" className="border-t border-l-border bg-l-bg px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1320px]">
        <div className="animate-on-scroll mx-auto max-w-[860px] text-center">
          <h2 className="m-0 text-[clamp(2.2rem,4.2vw,3.5rem)] font-extrabold leading-[1.06] tracking-[-.03em] text-l-text">
            {t("landing.trustV2.title")}
          </h2>
          <p className="m-0 mx-auto mt-5 max-w-[660px] text-[17px] leading-[1.6] text-l-text-dim">
            {t("landing.trustV2.subtitle")}
          </p>
        </div>

        <article className="animate-on-scroll mt-12 overflow-hidden rounded-[12px] border border-l-border-strong bg-l-surface">
          <header className="border-b border-l-border px-7 py-6 text-center md:px-10">
            <h3 className="m-0 text-[22px] font-bold tracking-[-.015em] text-l-text">{t("landing.trustV2.docTitle")}</h3>
            <p className="m-0 mt-1 text-[15px] text-l-text-dim">{t("landing.trustV2.docSub")}</p>
          </header>

          {/* Les filets sont l'espace d'un pixel entre cases, fond du filet
              dessous : justes a une, deux ou trois colonnes sans calcul. */}
          <ol className="m-0 grid list-none gap-px bg-[var(--l-border)] p-0 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, i) => (
              <li
                key={item.title}
                className="flex gap-5 bg-l-surface px-7 py-8 md:px-10"
              >
                <span className="w-7 shrink-0 text-[26px] font-extrabold leading-none tabular-nums text-[color:var(--l-blue-soft)]">
                  {i + 1}
                </span>
                <div>
                  <h4 className="m-0 text-[19px] font-bold tracking-[-.01em] text-l-text">{item.title}</h4>
                  <p className="m-0 mt-2 text-[16px] leading-[1.6] text-l-text-dim">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <footer className="flex flex-col items-center gap-6 border-t border-l-border px-7 py-7 md:flex-row md:justify-between md:px-10">
            <Link
              to="/confidentialite"
              className="inline-flex items-center gap-2 text-[16px] font-semibold text-[color:var(--l-blue-soft)] no-underline transition-colors hover:text-l-text"
            >
              {t("landing.trust.readMore")} <span aria-hidden>→</span>
            </Link>
            <div className="flex items-center gap-5">
              <span className="text-[16px] font-semibold text-l-text">{t("landing.trustV2.signedBy")}</span>
              <Cachet texte={t("landing.trustV2.stampText")} />
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
}
