// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getSubscription, startCheckout } from "../../billing/api";
import type { PlanCode, Subscription } from "../../../types";
import { SectionCard } from "./SectionCard";

const PLAN_LABEL_KEY: Record<PlanCode, string> = {
  free: "dashboard.billing.planFree",
  starter: "dashboard.billing.planStarter",
  pro: "dashboard.billing.planPro",
  enterprise: "dashboard.billing.planEnterprise",
};

const STATUS_LABEL_KEY: Record<Subscription["status"], string> = {
  active: "dashboard.billing.statusActive",
  past_due: "dashboard.billing.statusPastDue",
  canceled: "dashboard.billing.statusCanceled",
  trialing: "dashboard.billing.statusTrialing",
};

const STATUS_COLOR: Record<Subscription["status"], string> = {
  active: "#16a34a",
  past_due: "#d97706",
  canceled: "var(--l-dim)",
  trialing: "var(--l-blue)",
};

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div
      style={{
        height: 5,
        borderRadius: 3,
        background: "var(--l-input-bg)",
        overflow: "hidden",
      }}
    >
      {limit !== null && (
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 3,
            background: pct >= 100 ? "#dc2626" : "var(--l-blue)",
            transition: "width .2s",
          }}
        />
      )}
    </div>
  );
}

export function SubscriptionCard() {
  const { t } = useTranslation();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubscription()
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade() {
    setError(null);
    setCheckoutLoading(true);
    try {
      const { redirect_url } = await startCheckout("starter");
      window.location.href = redirect_url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("dashboard.billing.upgradeError"));
      setCheckoutLoading(false);
    }
  }

  if (loading || !sub) return null;

  return (
    <SectionCard title={t("dashboard.billing.title")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--l-text)" }}>
              {t(PLAN_LABEL_KEY[sub.plan_code])}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 999,
                background: `${STATUS_COLOR[sub.status]}1a`,
                color: STATUS_COLOR[sub.status],
              }}
            >
              {t(STATUS_LABEL_KEY[sub.status])}
            </span>
          </div>
          {sub.plan_code === "free" && (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={checkoutLoading}
              style={{
                padding: "8px 18px",
                borderRadius: 9,
                border: "none",
                background: checkoutLoading ? "var(--l-dim)" : "var(--l-blue)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: checkoutLoading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {checkoutLoading ? t("dashboard.billing.upgradeLoading") : t("dashboard.billing.upgradeButton")}
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--l-sub)" }}>
              {sub.usage.ao_per_month.limit === null
                ? t("dashboard.billing.usageAoUnlimited", { used: sub.usage.ao_per_month.used })
                : t("dashboard.billing.usageAo", { used: sub.usage.ao_per_month.used, limit: sub.usage.ao_per_month.limit })}
            </span>
            <UsageBar used={sub.usage.ao_per_month.used} limit={sub.usage.ao_per_month.limit} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--l-sub)" }}>
              {sub.usage.documents.limit === null
                ? t("dashboard.billing.usageDocsUnlimited", { used: sub.usage.documents.used })
                : t("dashboard.billing.usageDocs", { used: sub.usage.documents.used, limit: sub.usage.documents.limit })}
            </span>
            <UsageBar used={sub.usage.documents.used} limit={sub.usage.documents.limit} />
          </div>
        </div>

        {sub.current_period_end && (
          <span style={{ fontSize: 11.5, color: "var(--l-dim)" }}>
            {t("dashboard.billing.periodEnd", { date: new Date(sub.current_period_end).toLocaleDateString() })}
          </span>
        )}

        {error && <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{error}</p>}
      </div>
    </SectionCard>
  );
}

// ── Overview ────────────────────────────────────────────────
