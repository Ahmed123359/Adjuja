// Comment ca marche -- refait le 2026-09-27.
//
// Les trois etapes etaient trois grandes cartes empilees, une par ecran, avec
// beaucoup de vide autour. Ici elles tiennent sur une rangee, dans un seul
// cadre separe par des filets, et chacune dit ce que l'utilisateur obtient et
// combien de temps cela prend : c'est ce qu'on veut savoir avant de s'engager.

import { useTranslation } from "react-i18next";

type Step = { title: string; desc: string; output: string; time: string };

export default function HowItWorksSection() {
  const { t } = useTranslation();
  const steps = t("landing.how.steps", { returnObjects: true }) as Step[];

  return (
    <section id="how-it-works" className="border-t border-l-border bg-l-bg px-5 py-20 md:px-10 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="animate-on-scroll m-0 mx-auto max-w-[1000px] text-center text-[clamp(2.3rem,4.6vw,3.9rem)] font-extrabold leading-[1.04] tracking-[-.03em] text-l-text">
          {t("landing.how.title")}
          <br />
          <span className="text-[color:var(--l-blue-soft)]">{t("landing.how.titleBlue")}</span>
        </h2>

        <ol className="animate-on-scroll m-0 mt-12 grid list-none divide-y divide-l-border overflow-hidden rounded-[12px] border border-l-border bg-l-surface p-0 md:mt-14 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col p-7 md:p-8">
              <span className="text-[52px] font-extrabold leading-none tracking-[-.04em] tabular-nums text-[color:var(--l-blue-soft)]">
                0{i + 1}
              </span>
              <h3 className="m-0 mt-6 text-[22px] font-bold leading-[1.25] tracking-[-.015em] text-l-text">{s.title}</h3>
              <p className="m-0 mt-3 text-[16px] leading-[1.6] text-l-text-dim">{s.desc}</p>

              <div className="mt-auto pt-7">
                <div className="border-t border-l-border pt-5">
                  <p className="m-0 text-[14px] font-semibold text-l-text-dim">{t("landing.how.outputLabel")}</p>
                  <p className="m-0 mt-1 text-[16px] font-semibold text-l-text">{s.output}</p>
                  <p className="m-0 mt-3 flex items-center gap-2 text-[14px] font-medium text-l-teal">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <circle cx="12" cy="12" r="9" />
                      <path strokeLinecap="round" d="M12 7v5l3 2" />
                    </svg>
                    {s.time}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
