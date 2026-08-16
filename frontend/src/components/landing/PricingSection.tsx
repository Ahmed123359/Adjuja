import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getToken, startCheckout, CHECKOUT_INTENT_KEY } from "../../api";

/* ------------------------------------------------------------------ */
/* Sub-components                                                        */
/* ------------------------------------------------------------------ */

function TierIcon({ color }: { color: string }) {
  return (
    <div
      className="w-[86px] h-[86px] rounded-full flex items-center justify-center shrink-0"
      style={{
        background: "rgba(6, 11, 24, 0.9)",
        border: `1.5px solid ${color}A0`,
        boxShadow: `0 0 32px ${color}55`,
      }}
    >
      <svg width="40" height="40" viewBox="0 0 72 72" fill="none">
        <path
          d="M36 5l27 15.5v31L36 67 9 51.5v-31L36 5z"
          stroke={color} strokeWidth="1.6" fill={color + "22"}
        />
        <path
          d="M36 26l11 6.5v13L36 52l-11-6.5v-13L36 26z"
          stroke={color} strokeWidth="1.6" fill="none"
        />
        <path
          d="M36 26v13M25 32.5l11 6.5 11-6.5"
          stroke={color} strokeWidth="1.6" strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function TierBadge({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold tracking-[.03em] mt-5 self-center border"
      style={{ color, borderColor: color + "A0", background: color + "2A" }}
    >
      {label}
    </div>
  );
}

function Check({ color = "#1BC9A8" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
      <circle cx="9" cy="9" r="9" fill={color + "22"} />
      <path
        d="M5.5 9l2.5 2.5 4.5-5"
        stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

interface PricingCardProps {
  icon: ReactNode;
  badge: ReactNode;
  price: ReactNode;
  tagline: string;
  features: string[];
  checkColor: string;
  cta?: ReactNode;
  featured?: boolean;
}

function PricingCard({
  icon, badge, price, tagline, features, checkColor, cta, featured,
}: PricingCardProps) {
  return (
    <div
      className="relative rounded-[20px] flex flex-col items-center text-center border pt-20 pb-10 px-10 transition-transform duration-200 hover:-translate-y-1"
      style={{
        borderColor: checkColor + (featured ? "70" : "3D"),
        background: featured
          ? `linear-gradient(160deg, ${checkColor}1C 0%, rgba(255,255,255,0.03) 60%), var(--l-surface)`
          : `linear-gradient(160deg, ${checkColor}10 0%, rgba(255,255,255,0.025) 60%), var(--l-surface)`,
        boxShadow: featured
          ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 1px rgba(0,0,0,0.25), 0 32px 64px -20px ${checkColor}45, 0 20px 48px -18px rgba(0,0,0,0.7)`
          : `inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 1px rgba(0,0,0,0.2), 0 20px 48px -18px rgba(0,0,0,0.6)`,
      }}
    >
      <div className="absolute -top-[43px] left-1/2 -translate-x-1/2">
        {icon}
      </div>
      {badge}
      <div className="mt-4 mb-2">{price}</div>
      <p className="mt-0 mb-8 text-[15px] leading-[1.6] text-[rgba(220,232,250,0.75)]">
        {tagline}
      </p>
      <div className="w-full text-left flex-1">
        {features.map(f => (
          <div
            key={f}
            className="flex items-center gap-3 py-3 border-b border-white/[0.07] last:border-b-0 text-[15px] text-white"
          >
            <Check color={checkColor} />{f}
          </div>
        ))}
      </div>
      {cta}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main section                                                          */
/* ------------------------------------------------------------------ */

export default function PricingSection({ onEnterApp }: { onEnterApp: () => void }) {
  const { t } = useTranslation();
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  /** Standard SaaS pattern : le clic sur "Commencer" mène droit au checkout, pas juste
   * à l'app. Connecté -> redirection immédiate vers CMI. Pas connecté -> l'intention est
   * mémorisée et consommée juste après login/register (voir main.tsx::handleAuthSuccess),
   * pour ne jamais perdre "je voulais ce plan" en route vers l'inscription. Les trois plans
   * (Essentiel, Pro, Cabinet) sont désormais self-serve, plus de "Sur devis" -- voir
   * context/feature-specs/01-billing-subscriptions/api.md, révision suite audit B2. */
  async function handlePlanCheckout(planCode: string) {
    if (getToken()) {
      setCheckoutLoading(planCode);
      try {
        const { redirect_url } = await startCheckout(planCode);
        window.location.href = redirect_url;
        return;
      } catch {
        // CMI pas configuré ou autre échec : on n'affiche pas d'erreur ici (page publique,
        // pas de système de toast), on laisse l'utilisateur atterrir dans l'app où la
        // carte Abonnement explique l'erreur et propose de réessayer.
        setCheckoutLoading(null);
      }
    } else {
      localStorage.setItem(CHECKOUT_INTENT_KEY, planCode);
    }
    onEnterApp();
  }

  const starterFeats = [
    t("pricing.plans.f_users_1"),
    t("pricing.plans.f_50_ao"),
    t("pricing.plans.f_export"),
    t("pricing.plans.f_docs_50"),
    t("pricing.plans.f_support_email"),
  ];

  const proFeats = [
    t("pricing.plans.f_users_5"),
    t("pricing.plans.f_ao_illimite"),
    t("pricing.plans.f_export"),
    t("pricing.plans.f_docs_200"),
    t("pricing.plans.f_chat"),
    t("pricing.plans.f_providers"),
    t("pricing.plans.f_signatures"),
    t("pricing.plans.f_support_priority"),
  ];

  const enterpriseFeats = [
    t("pricing.plans.f_users_unlimited"),
    "Tout du plan Pro inclus",
    t("pricing.plans.f_sso"),
    t("pricing.plans.f_sla"),
    t("pricing.plans.f_onboarding"),
    "Déploiement on-premise",
  ];

  const ghostBtn = "w-full py-[13px] rounded-lg text-[15px] font-semibold cursor-pointer border border-white/[0.1] transition-all mt-7 tracking-[.01em] hover:brightness-110 bg-white/[0.06] text-[rgba(200,220,255,0.75)] focus:outline-none";

  return (
    <section id="pricing" className="relative overflow-hidden py-[120px] px-8 pb-[140px] bg-[#090D1C] -mt-px">

      {/* Ambient sphere balls */}
      <div className="absolute rounded-full pointer-events-none" style={{
        width: 380, height: 380, top: -100, left: -100,
        background: "radial-gradient(circle at 35% 32%, rgba(50,72,206,0.45) 0%, rgba(30,55,160,0.2) 40%, transparent 70%)",
        filter: "blur(6px)",
      }} />
      <div className="absolute rounded-full pointer-events-none" style={{
        width: 280, height: 280, top: "20%", right: -70,
        background: "radial-gradient(circle at 38% 30%, rgba(27,201,168,0.4) 0%, rgba(10,120,100,0.18) 45%, transparent 70%)",
        filter: "blur(6px)",
      }} />
      <div className="absolute rounded-full pointer-events-none" style={{
        width: 220, height: 220, bottom: 60, left: "10%",
        background: "radial-gradient(circle at 38% 32%, rgba(43,121,232,0.4) 0%, rgba(20,60,140,0.18) 45%, transparent 70%)",
        filter: "blur(6px)",
      }} />
      <div className="absolute rounded-full pointer-events-none" style={{
        width: 170, height: 170, bottom: 40, right: "16%",
        background: "radial-gradient(circle at 36% 30%, rgba(50,72,206,0.35) 0%, transparent 65%)",
        filter: "blur(6px)",
      }} />

      <div className="animate-on-scroll relative z-[2] max-w-[1280px] mx-auto">

        {/* Header */}
        <div className="text-center mb-[52px]">
          <h2 className="text-[clamp(1.9rem,3.5vw,2.8rem)] font-bold tracking-[-0.03em] leading-[1.15] text-[#EEF4FF] mt-0 mb-7">
            {t("pricing.title")}
          </h2>
          <div className="flex justify-center">
            <div className="flex bg-white/[0.05] border border-white/[0.08] rounded-lg p-[3px] gap-[3px]">
              <button
                onClick={() => setAnnual(false)}
                className={`px-5 py-[7px] rounded-md text-[12px] font-semibold tracking-[.04em] border-0 cursor-pointer transition-all focus:outline-none ${!annual ? "bg-white/[0.09] text-[rgba(220,235,255,0.9)]" : "bg-transparent text-[color:var(--l-dim)]"}`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-5 py-[7px] rounded-md text-[12px] font-semibold tracking-[.04em] border-0 cursor-pointer transition-all focus:outline-none ${annual ? "bg-white/[0.09] text-[rgba(220,235,255,0.9)]" : "bg-transparent text-[color:var(--l-dim)]"}`}
              >
                Annuel
              </button>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr_1fr] gap-6 items-start mt-[52px]">

          <PricingCard
            icon={<TierIcon color="#1BC9A8" />}
            badge={<TierBadge label={t("pricing.plans.starter_name")} color="#1BC9A8" />}
            price={
              <div className="flex items-baseline gap-[5px]">
                <span className="font-display text-[2.8rem] font-extrabold leading-none text-[#EEF4FF] tracking-[-0.04em]">
                  {annual ? "392" : "490"}
                </span>
                <span className="text-[13px] text-[color:var(--l-dim)]">MAD / mois</span>
              </div>
            }
            tagline={t("pricing.plans.starter_tagline")}
            features={starterFeats}
            checkColor="#1BC9A8"
          />

          <PricingCard
            featured
            icon={<TierIcon color="#3248CE" />}
            badge={<TierBadge label={t("pricing.plans.pro_name")} color="#3248CE" />}
            price={
              <div className="flex items-baseline gap-[5px]">
                <span className="font-display text-[2.4rem] font-extrabold leading-none tracking-[-0.03em] bg-gradient-to-br from-[#3248CE] to-[#2B79E8] bg-clip-text text-transparent">
                  {annual ? "792" : "990"}
                </span>
                <span className="text-[13px] text-[color:var(--l-dim)]">MAD / mois</span>
              </div>
            }
            tagline={t("pricing.plans.pro_tagline")}
            features={proFeats}
            checkColor="#3248CE"
          />

          <PricingCard
            icon={<TierIcon color="#2B79E8" />}
            badge={<TierBadge label={t("pricing.plans.enterprise_name")} color="#2B79E8" />}
            price={
              <div className="flex items-baseline gap-[5px]">
                <span className="font-display text-[2rem] font-extrabold leading-none tracking-[-0.03em] text-[#EEF4FF]">
                  {annual ? "2320" : "2900"}
                </span>
                <span className="text-[13px] text-[color:var(--l-dim)]">MAD / mois</span>
              </div>
            }
            tagline={t("pricing.plans.enterprise_tagline")}
            features={enterpriseFeats}
            checkColor="#2B79E8"
          />

        </div>

        <p className="mt-9 mb-2 text-[13px] font-medium text-[#EEF4FF] text-center">
          {t("pricing.dayAnchor")}
        </p>

        <p className="mt-0 mb-0 text-[11.5px] text-[color:var(--l-dim)] text-center">
          {t("pricing.footnote2")}
        </p>

      </div>
    </section>
  );
}
