// Tarifs -- refait le 2026-09-27, sur le modele des cartes de la grille
// d'offres de l'application (features/billing/components/PricingModal).
//
// - Prix et noms d'offre lus sur `GET /billing/plans` (route publique), avec
//   les valeurs connues en attendant la reponse : pas de saut de mise en page,
//   et plus de chiffres en dur qui divergent du backend.
// - Avantages : memes cles i18n que la grille de l'application.
// - Parcours d'achat inchange : connecte -> paiement CMI direct ; sinon
//   l'intention est memorisee et consommee apres inscription (main.tsx).
// - Annuel : affiche le tarif mensuel avec engagement annuel, « sur demande » :
//   le paiement en ligne ne gere que le mensuel (voir bugs-connus.md).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getToken, startCheckout, CHECKOUT_INTENT_KEY } from "../../../api";
import { fetchPlans } from "../../billing/api";

type Code = "starter" | "pro" | "enterprise";
type Prix = { label: string; mensuel: number; annuel: number };

const OFFRES: Code[] = ["starter", "pro", "enterprise"];
const RECOMMANDEE: Code = "pro";

// Valeurs du backend (app/billing/plans.py) au 2026-09-27, affichees tant que
// /billing/plans n'a pas repondu ou s'il est injoignable.
const PRIX_CONNUS: Record<Code, Prix> = {
  starter: { label: "Essentiel", mensuel: 490, annuel: 392 },
  pro: { label: "Pro", mensuel: 990, annuel: 792 },
  enterprise: { label: "Cabinet", mensuel: 2900, annuel: 2320 },
};

const AVANTAGES: Record<Code, string[]> = {
  starter: ["f_users_1", "f_50_ao", "f_export", "f_docs_50", "f_support_email"],
  pro: ["f_users_5", "f_ao_illimite", "f_export", "f_docs_200", "f_chat", "f_providers", "f_signatures", "f_support_priority"],
  enterprise: ["f_users_unlimited", "f_all_pro", "f_sso", "f_sla", "f_onboarding", "f_onprem"],
};

function Check() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden className="mt-[3px] shrink-0 text-l-teal">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingSection({ onEnterApp }: { onEnterApp: () => void }) {
  const { t } = useTranslation();
  const [annuel, setAnnuel] = useState(false);
  const [prix, setPrix] = useState<Record<Code, Prix>>(PRIX_CONNUS);
  const [enCours, setEnCours] = useState<Code | null>(null);

  useEffect(() => {
    let vivant = true;
    fetchPlans()
      .then((plans) => {
        if (!vivant) return;
        const maj = { ...PRIX_CONNUS };
        for (const code of OFFRES) {
          const p = plans[code];
          if (p) maj[code] = { label: p.label, mensuel: p.price_mad, annuel: p.price_mad_annual };
        }
        setPrix(maj);
      })
      .catch(() => { /* valeurs connues conservees */ });
    return () => { vivant = false; };
  }, []);

  async function choisir(code: Code) {
    if (getToken()) {
      setEnCours(code);
      try {
        const { redirect_url } = await startCheckout(code);
        window.location.href = redirect_url;
        return;
      } catch {
        // Paiement indisponible (CMI non configure...) : l'application affiche
        // l'erreur dans sa grille d'offres.
        setEnCours(null);
      }
    } else {
      localStorage.setItem(CHECKOUT_INTENT_KEY, code);
    }
    onEnterApp();
  }

  return (
    <section id="pricing" className="border-t border-l-border bg-l-bg px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1200px]">
        <div className="animate-on-scroll flex flex-col items-center gap-8 text-center">
          <div>
            <h2 className="m-0 text-[clamp(2.3rem,4.6vw,3.9rem)] font-extrabold leading-[1.04] tracking-[-.03em] text-l-text">
              {t("landing.pricingV2.title")}
              <br />
              <span className="text-[color:var(--l-blue-soft)]">{t("landing.pricingV2.titleBlue")}</span>
            </h2>
            <p className="m-0 mt-5 text-[17px] leading-[1.6] text-l-text-dim">{t("landing.pricingV2.subtitle")}</p>
          </div>

          <div role="radiogroup" className="flex shrink-0 rounded-[8px] border border-l-border bg-l-surface p-1">
            {[false, true].map((a) => (
              <button
                key={String(a)}
                role="radio"
                aria-checked={annuel === a}
                onClick={() => setAnnuel(a)}
                className={`h-10 cursor-pointer rounded-[6px] border-0 px-5 text-[15px] font-semibold transition-colors ${
                  annuel === a ? "bg-[var(--l-surface-3)] text-l-text" : "bg-transparent text-l-text-dim hover:text-l-text"
                }`}
              >
                {a ? t("landing.pricingV2.annual") : t("landing.pricingV2.monthly")}
              </button>
            ))}
          </div>
        </div>

        <div className="animate-on-scroll mt-12 grid gap-5 lg:grid-cols-3">
          {OFFRES.map((code) => {
            const p = prix[code];
            const reco = code === RECOMMANDEE;
            const montant = annuel ? p.annuel : p.mensuel;
            return (
              <article
                key={code}
                className={`relative flex flex-col rounded-[12px] border p-7 md:p-8 ${
                  reco ? "border-l-blue bg-l-surface-2" : "border-l-border bg-l-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[22px] font-bold tracking-[-.015em] text-l-text">{p.label}</h3>
                  {reco && (
                    <span className="rounded-[6px] bg-l-blue px-3 py-1 text-[14px] font-semibold text-white">
                      {t("landing.pricingV2.recommended")}
                    </span>
                  )}
                </div>

                <p className="m-0 mt-5 flex items-baseline gap-2">
                  <span className="text-[52px] font-extrabold leading-none tracking-[-.035em] tabular-nums text-l-text">
                    {montant.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-[16px] text-l-text-dim">{t("landing.pricingV2.perMonth")}</span>
                </p>
                <p className="m-0 mt-2 min-h-[22px] text-[14px] text-l-text-dim">
                  {annuel ? t("landing.pricingV2.annualNote") : ""}
                </p>

                <p className="m-0 mt-4 min-h-[52px] text-[16px] leading-[1.55] text-l-text-dim">
                  {t(`pricing.plans.${code}_tagline`)}
                </p>

                <ul className="m-0 mt-6 flex flex-1 list-none flex-col gap-3 border-t border-l-border p-0 pt-6">
                  {AVANTAGES[code].map((k) => (
                    <li key={k} className="flex items-start gap-3 text-[16px] leading-[1.45] text-l-text">
                      <Check />
                      {t(`pricing.plans.${k}`)}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => choisir(code)}
                  disabled={enCours !== null}
                  className={`mt-8 h-[52px] w-full cursor-pointer rounded-[8px] text-[16px] font-semibold transition-[filter,background-color] disabled:cursor-wait disabled:opacity-70 ${
                    reco
                      ? "border-0 bg-l-blue text-white hover:brightness-110"
                      : "border border-l-border-strong bg-[var(--l-surface-3)] text-l-text hover:border-l-blue"
                  }`}
                >
                  {enCours === code ? t("landing.pricingV2.redirecting") : t("landing.pricingV2.choose", { plan: p.label })}
                </button>
              </article>
            );
          })}
        </div>

        <p className="m-0 mt-6 text-[14px] text-l-text-dim">
          {t("pricing.footnote1")} · {t("pricing.footnote2")}
        </p>
      </div>
    </section>
  );
}
