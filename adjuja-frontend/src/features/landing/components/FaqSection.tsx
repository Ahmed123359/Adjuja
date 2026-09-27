// Questions frequentes -- refait le 2026-09-27 (troisieme version).
//
// La grille de fiches a deux colonnes etait jugee generique, et ses fiches de
// hauteurs inegales laissaient des trous. Ici un carrousel : fiches de meme
// hauteur, trois visibles sur grand ecran, deux sur tablette, une sur mobile
// (la suivante depasse pour inviter a glisser). Fleches et barre segmentee en
// dessous : la section est paginee a toutes les tailles, sans accordeon (refuse
// plus tot) et sans reprendre le « liste a gauche, ecran a droite » de la
// section produit. Le defilement est natif (scroll-snap) : le glisser au doigt
// et le clavier fonctionnent sans code.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Item = { q: string; a: string };
type Category = { key: string; label: string; items: Item[] };

function Fleche({ sens, disabled, onClick, label }: { sens: -1 | 1; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-l-border-strong bg-l-surface text-l-text transition-colors hover:border-[color:var(--l-blue)] disabled:cursor-default disabled:opacity-35 disabled:hover:border-l-border-strong"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={sens < 0 ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

export default function FaqSection() {
  const { t } = useTranslation();
  const categories = t("landing.faq.categories", { returnObjects: true }) as Category[];
  const questions = categories.flatMap((c) => c.items.map((it) => ({ ...it, categorie: c.label })));

  const piste = useRef<HTMLDivElement>(null);
  const [premier, setPremier] = useState(0);   // premiere fiche visible
  const [visibles, setVisibles] = useState(3); // fiches visibles d'un coup

  /* Position lue sur le defilement reel : elle reste juste apres un glisser au
     doigt, une molette ou un redimensionnement. */
  const mesurer = useCallback(() => {
    const el = piste.current;
    const fiche = el?.firstElementChild as HTMLElement | null;
    if (!el || !fiche) return;
    const pas = fiche.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    setPremier(Math.round(el.scrollLeft / pas));
    setVisibles(Math.max(1, Math.floor((el.clientWidth + 1) / pas)));
  }, []);

  useEffect(() => {
    const el = piste.current;
    if (!el) return;
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer]);

  function allerA(i: number) {
    const el = piste.current;
    const cible = el?.children[Math.max(0, Math.min(i, questions.length - 1))] as HTMLElement | undefined;
    if (el && cible) el.scrollTo({ left: cible.offsetLeft, behavior: "smooth" });
  }

  const dernierDebut = Math.max(0, questions.length - visibles);
  const fin = Math.min(premier + visibles, questions.length);

  return (
    <section id="faq" className="border-t border-l-border bg-l-bg px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1320px]">
        <div className="animate-on-scroll mx-auto max-w-[760px] text-center">
          <h2 className="m-0 text-[clamp(2.2rem,4.2vw,3.5rem)] font-extrabold leading-[1.06] tracking-[-.03em] text-l-text">
            {t("landing.faqV2.title")}
          </h2>
          <p className="m-0 mt-4 text-[17px] leading-[1.6] text-l-text-dim">{t("landing.faqV2.subtitle")}</p>
        </div>

        <div className="animate-on-scroll mt-12 md:mt-14">
          <div
            ref={piste}
            onScroll={mesurer}
            tabIndex={0}
            role="region"
            aria-label={t("landing.faqV2.title")}
            className="relative flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-1 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {questions.map((item, i) => (
              <article
                key={item.q}
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${questions.length}`}
                className="flex shrink-0 basis-[86%] snap-start flex-col rounded-[12px] border border-l-border bg-l-surface p-7 transition-colors hover:border-l-border-strong sm:basis-[calc((100%-20px)/2)] md:p-8 xl:basis-[calc((100%-40px)/3)]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[40px] font-extrabold leading-none tracking-[-.04em] tabular-nums text-[color:var(--l-blue-soft)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[14px] font-semibold text-l-text-dim">{item.categorie}</span>
                </div>
                <h3 className="m-0 mt-7 text-[21px] font-bold leading-[1.35] tracking-[-.015em] text-white">{item.q}</h3>
                <p className="m-0 mt-4 text-[16px] leading-[1.7] text-[#C6D0E3]">{item.a}</p>
              </article>
            ))}
          </div>

          {/* Pagination : un segment par question, les visibles en bleu. */}
          <div className="mt-8 flex items-center justify-center gap-5">
            <Fleche sens={-1} disabled={premier <= 0} onClick={() => allerA(premier - visibles)} label={t("landing.faqV2.prev")} />
            <div className="flex w-full max-w-[320px] gap-1.5">
              {questions.map((item, i) => (
                <button
                  key={item.q}
                  onClick={() => allerA(Math.min(i, dernierDebut))}
                  aria-label={`${t("landing.faqV2.goTo")} ${i + 1}`}
                  className="group h-6 flex-1 cursor-pointer border-0 bg-transparent p-0"
                >
                  <span
                    className={`block h-[4px] rounded-full transition-colors duration-300 ${
                      i >= premier && i < fin ? "bg-l-blue" : "bg-[var(--l-surface-3)] group-hover:bg-l-border-strong"
                    }`}
                  />
                </button>
              ))}
            </div>
            <Fleche sens={1} disabled={premier >= dernierDebut} onClick={() => allerA(premier + visibles)} label={t("landing.faqV2.next")} />
          </div>
          <p aria-live="polite" className="m-0 mt-3 text-center text-[14px] font-semibold tabular-nums text-l-text-dim">
            {visibles > 1 ? `${premier + 1}–${fin}` : premier + 1} / {questions.length}
          </p>
        </div>

        <div className="animate-on-scroll mt-12 flex flex-col items-center gap-6 rounded-[12px] border border-l-border-strong bg-l-surface-2 px-7 py-8 text-center md:flex-row md:justify-between md:px-10 md:text-left">
          <div>
            <p className="m-0 text-[22px] font-bold tracking-[-.015em] text-l-text">{t("landing.faqV2.contactTitle")}</p>
            <p className="m-0 mt-2 text-[16px] leading-[1.6] text-l-text-dim">{t("landing.faqV2.contactText")}</p>
          </div>
          <a
            href={`mailto:${t("landing.footer.contactEmailValue")}`}
            className="inline-flex h-[52px] shrink-0 items-center rounded-[8px] bg-l-blue px-7 text-[16px] font-semibold text-white no-underline transition-[filter] hover:brightness-110"
          >
            {t("landing.faqV2.contactCta")}
          </a>
        </div>
      </div>
    </section>
  );
}
