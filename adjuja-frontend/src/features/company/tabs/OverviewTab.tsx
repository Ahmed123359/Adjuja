// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchAos } from "../../ao/api";
import type { AoSummary, ProfileCheck } from "../../../types";
import { SectionCard } from "../components/SectionCard";
import { StatCard } from "../components/StatCard";
import { SubscriptionCard } from "../components/SubscriptionCard";
import { Field } from "../components/Field";

const STATUT_BADGE: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  brouillon: {
    bg: "var(--l-input-bg)",
    color: "var(--l-sub)",
    border: "var(--l-card-border)",
  },
  en_analyse: {
    bg: "rgba(30,136,229,0.10)",
    color: "#1E88E5",
    border: "rgba(30,136,229,0.25)",
  },
  en_traitement: {
    bg: "rgba(245,158,11,0.10)",
    color: "#d97706",
    border: "rgba(245,158,11,0.25)",
  },
  termine: {
    bg: "rgba(34,197,94,0.10)",
    color: "#16a34a",
    border: "rgba(34,197,94,0.25)",
  },
  erreur: {
    bg: "rgba(220,38,38,0.07)",
    color: "#dc2626",
    border: "rgba(220,38,38,0.20)",
  },
};

export function OverviewTab({ profileCheck }: { profileCheck: ProfileCheck | null }) {
  const { t } = useTranslation();
  const [aos, setAos] = useState<AoSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAos()
      .then(setAos)
      .finally(() => setLoading(false));
  }, []);

  const total = aos.length;
  const enCours = aos.filter((a) =>
    ["en_analyse", "en_traitement"].includes(a.statut),
  ).length;
  const termines = aos.filter((a) => a.statut === "termine").length;
  const erreurs = aos.filter((a) => a.statut === "erreur").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {profileCheck && !profileCheck.complet && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#d97706"
            strokeWidth={2}
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <p
              style={{
                margin: "0 0 2px",
                fontSize: 13,
                fontWeight: 600,
                color: "#d97706",
              }}
            >
              {t("dashboard.overview.profileWarning")}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#b45309" }}>
              {profileCheck.message ||
                t("dashboard.overview.profileWarningDesc")}
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard
          label={t("dashboard.overview.total")}
          value={total}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <StatCard
          label={t("dashboard.overview.inProgress")}
          value={enCours}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label={t("dashboard.overview.completed")}
          value={termines}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label={t("dashboard.overview.errors")}
          value={erreurs}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          }
        />
      </div>

      {/* Masquee temporairement : CMI pas encore configure en prod, le bouton
          "Upgrade" menerait a un echec de checkout (503 "CMI non configure"). */}
      {/* <SubscriptionCard /> */}

      <SectionCard title={t("dashboard.overview.recentTitle")}>
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "24px 0",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "2px solid var(--l-card-border)",
                borderTopColor: "var(--l-blue)",
                animation: "spin 1s linear infinite",
              }}
            />
          </div>
        ) : !aos.length ? (
          <p
            style={{
              textAlign: "center",
              padding: "24px 0",
              fontSize: 13,
              color: "var(--l-dim)",
              margin: 0,
            }}
          >
            {t("dashboard.overview.noAos")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {aos.slice(0, 8).map((ao, i) => {
              const badge = STATUT_BADGE[ao.statut] ?? STATUT_BADGE.brouillon;
              return (
                <div
                  key={ao.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 0",
                    borderTop:
                      i > 0 ? "1px solid var(--l-card-border)" : "none",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: "0 0 2px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--l-text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {ao.reference || t("pipeline.detail.noRef")}
                    </p>
                    {ao.acheteur && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: "var(--l-sub)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ao.acheteur}
                      </p>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexShrink: 0,
                      marginLeft: 12,
                    }}
                  >
                    {["en_analyse", "en_traitement"].includes(ao.statut) && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--l-dim)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {ao.pipeline_pct}%
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {t(`pipeline.status.${ao.statut}`) ?? ao.statut}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────

/** Doit rester un composant au niveau module (pas defini a l'interieur de
 * ProfileTab) -- sinon une nouvelle fonction Field est recreee a chaque
 * re-render (chaque frappe), React la traite comme un type de composant
 * different et remonte l'input, ce qui fait perdre le focus a chaque
 * caractere tape. */
