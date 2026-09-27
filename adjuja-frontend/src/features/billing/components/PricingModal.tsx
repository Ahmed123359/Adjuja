// Changement d'offre dans l'application -- refait le 2026-09-27.
//
// L'ancienne version affichait 79 EUR / 249 EUR (la page publique et le backend
// facturent 490 / 990 MAD), renvoyait vers un lien Stripe et un rendez-vous
// Calendly alors que le paiement passe par CMI, et n'etait atteignable que
// depuis le formulaire de generation, lui-meme inatteignable.
//
// Maintenant :
//   - prix et noms d'offre lus sur `GET /billing/plans`, la source de verite
//     (`app/billing/plans.py`) : ils ne peuvent plus diverger ;
//   - listes d'avantages reprises des memes cles i18n que la page publique ;
//   - l'offre actuelle est signalee, chaque offre superieure lance le paiement
//     CMI (`startCheckout`), une erreur (CMI non configure, 503) s'affiche.
// Seul le tarif mensuel est propose : le paiement ne prend qu'un code d'offre,
// il n'y a pas d'engagement annuel a la souscription.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import { Button } from "../../../shared/ui/Button";
import { useRessource } from "../../../shared/lib/cache";
import { fetchPlans, getSubscription, startCheckout } from "../api";
import type { PlanCode, PlanInfo, Subscription } from "../types";

const OFFRES: PlanCode[] = ["starter", "pro", "enterprise"];
const RECOMMANDEE: PlanCode = "pro";

/** Avantages par offre : les memes cles que la page publique (PricingSection). */
const AVANTAGES: Record<string, string[]> = {
  starter: ["f_users_1", "f_50_ao", "f_export", "f_docs_50", "f_support_email"],
  pro: ["f_users_5", "f_ao_illimite", "f_export", "f_docs_200", "f_chat", "f_providers", "f_signatures", "f_support_priority"],
  enterprise: ["f_users_unlimited", "f_all_pro", "f_sso", "f_sla", "f_onboarding", "f_onprem"],
};

type Props = {
  onClose: () => void;
  /** "limit" : ouverte parce que la limite de l'offre est atteinte. */
  reason?: "limit" | "upgrade";
};

export default function PricingModal({ onClose, reason = "upgrade" }: Props) {
  const { t } = useTranslation();
  const { data: plans, erreur: erreurPlans } = useRessource<Record<string, PlanInfo>>("billing:plans", fetchPlans, 10 * 60_000);
  const { data: sub } = useRessource<Subscription>("billing:subscription", getSubscription);
  const [enCours, setEnCours] = useState<PlanCode | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const actuelle = sub?.plan_code ?? "free";
  const prixActuel = plans?.[actuelle]?.price_mad ?? 0;

  async function choisir(code: PlanCode) {
    setErreur(null);
    setEnCours(code);
    try {
      const { redirect_url } = await startCheckout(code);
      window.location.href = redirect_url;
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : t("billing.modal.checkoutError"));
      setEnCours(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={reason === "limit" ? t("billing.modal.titleLimit") : t("billing.modal.title")}
      subtitle={t("billing.modal.subtitle")}
      width={1080}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-5)" }}>
        {erreurPlans && (
          <p role="alert" style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-neg)" }}>
            {t("billing.modal.loadError")}
          </p>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "var(--adj-4)",
        }}>
          {OFFRES.map((code) => {
            const plan = plans?.[code];
            const estActuelle = actuelle === code;
            const inferieure = !!plan && plan.price_mad < prixActuel;
            const recommandee = code === RECOMMANDEE && !estActuelle;
            return (
              <section
                key={code}
                aria-label={plan?.label ?? code}
                style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", gap: "var(--adj-4)",
                  padding: "var(--adj-pad)",
                  borderRadius: "var(--adj-round-l)",
                  border: `1px solid ${recommandee ? "var(--adj-brand)" : estActuelle ? "var(--adj-pos)" : "var(--adj-hairline)"}`,
                  background: recommandee ? "var(--adj-brand-tint)" : "var(--adj-panel)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: "var(--adj-t-md)", fontWeight: 700, color: "var(--adj-ink)", letterSpacing: "-0.015em" }}>
                    {plan?.label ?? "…"}
                  </h3>
                  {(estActuelle || recommandee) && (
                    <span style={{
                      padding: "3px 10px", borderRadius: "var(--adj-round-s)",
                      fontSize: "var(--adj-t-xs)", fontWeight: 600, whiteSpace: "nowrap",
                      background: estActuelle ? "var(--adj-pos-tint)" : "var(--adj-brand)",
                      color: estActuelle ? "var(--adj-pos)" : "var(--adj-on-brand)",
                    }}>
                      {estActuelle ? t("billing.modal.current") : t("billing.modal.recommended")}
                    </span>
                  )}
                </div>

                <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="adj-fig" style={{ fontSize: "var(--adj-t-num)", fontWeight: 800, color: "var(--adj-ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {plan ? plan.price_mad.toLocaleString("fr-FR") : "—"}
                  </span>
                  <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
                    {t("billing.modal.perMonth")}
                  </span>
                </p>

                <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", lineHeight: 1.5, minHeight: "3em" }}>
                  {t(`pricing.plans.${code}_tagline`)}
                </p>

                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {AVANTAGES[code].map((k) => (
                    <li key={k} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)", lineHeight: 1.4 }}>
                      <Check size={17} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1, color: "var(--adj-brand)" }} />
                      {t(`pricing.plans.${k}`)}
                    </li>
                  ))}
                </ul>

                <Button
                  block
                  variant={recommandee ? "primary" : "secondary"}
                  disabled={!plan || estActuelle || inferieure || enCours !== null}
                  loading={enCours === code}
                  onClick={() => choisir(code)}
                >
                  {estActuelle
                    ? t("billing.modal.current")
                    : inferieure
                      ? t("billing.modal.included")
                      : enCours === code
                        ? t("billing.modal.redirecting")
                        : t("billing.modal.choose", { plan: plan?.label ?? "" })}
                </Button>
              </section>
            );
          })}
        </div>

        {erreur && (
          <p role="alert" style={{
            margin: 0, padding: "12px 16px", borderRadius: "var(--adj-round-m)",
            background: "var(--adj-neg-tint)", color: "var(--adj-neg)", fontSize: "var(--adj-t-sm)",
          }}>
            {erreur}
          </p>
        )}

        <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", textAlign: "center" }}>
          {t("billing.modal.secure")}
        </p>
      </div>
    </Modal>
  );
}
