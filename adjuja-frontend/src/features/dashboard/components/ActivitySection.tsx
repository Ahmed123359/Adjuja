// Blocs d'activité : avertissement de profil, appels d'offres récents, veille,
// abonnement.
//
// Détails qui évitent le rendu générique :
//   - le tableau des AO a des colonnes alignées et des lignes cliquables, avec
//     la référence en chiffres tabulaires : on compare d'une ligne à l'autre ;
//   - un statut est un carré de couleur et un mot, pas une pastille arrondie ;
//   - la veille affiche son chiffre dans une phrase, pas dans une boîte ;
//   - une jauge d'abonnement n'apparaît que s'il existe un vrai plafond, sinon
//     elle mentirait sur la consommation.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRessource } from "../../../shared/lib/cache";
import { fetchAos } from "../../ao/api";
import { getSubscription } from "../../billing/api";
import PricingModal from "../../billing/components/PricingModal";
import { fetchScrapedAos } from "../../veille/api";
import type { AoSummary, ProfileCheck, Subscription } from "../../../types";
import { Card, CardAction } from "../../../shared/ui/Card";

const STATUT_COULEUR: Record<string, string> = {
  brouillon: "var(--adj-ink-4)", en_attente: "var(--adj-ink-4)", en_analyse: "var(--adj-brand)",
  en_traitement: "var(--adj-hold)", termine: "var(--adj-pos)", erreur: "var(--adj-neg)",
  abandonne: "var(--adj-ink-4)",
};

/* ------------------------------------------------------------------ */

export function ProfileWarning({ check, onFix }: { check: ProfileCheck | null; onFix?: () => void }) {
  const { t } = useTranslation();
  if (!check || check.complet) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "var(--adj-4)", flexWrap: "wrap",
      padding: "var(--adj-3) var(--adj-4)",
      background: "var(--adj-panel)",
      border: "1px solid var(--adj-hairline)",
      borderRadius: "var(--adj-round-l)",
      boxShadow: "var(--adj-lift-1)",
    }}>
      <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)", minWidth: 0 }}>
        <strong style={{ color: "var(--adj-ink)", fontWeight: 600 }}>
          {t("dashboard.overview.profileWarning")}.
        </strong>{" "}
        {check.message || t("dashboard.overview.profileWarningDesc")}
      </span>
      {onFix && <CardAction onClick={onFix}>{t("dashboard.home.activity.completeProfile")}</CardAction>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "0 var(--adj-pad) 11px",
  fontSize: "var(--adj-t-xs)",
  fontWeight: "var(--adj-w-semi)" as never,
  color: "var(--adj-ink-3)",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--adj-hairline)",
};

const td: React.CSSProperties = {
  padding: "14px var(--adj-pad)",
  fontSize: "var(--adj-t-sm)",
  color: "var(--adj-ink-2)",
  verticalAlign: "middle",
};

export function AoTableCard({ onOpenAo, span }: { onOpenAo?: () => void; span?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-GB" : "fr-FR";
  const { data, loading } = useRessource("ao:list", fetchAos);
  const aos: AoSummary[] | null = loading ? null : (data ?? []);

  return (
    <Card
      className={span}
      title={t("dashboard.home.activity.recent")}
      count={aos?.length}
      action={onOpenAo && <CardAction onClick={onOpenAo}>{t("dashboard.home.activity.seeAll")} {"→"}</CardAction>}
      flush
    >
      {aos && aos.length === 0 && (
        <p style={{ margin: 0, padding: "var(--adj-6) var(--adj-pad)", fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
          {t("dashboard.overview.noAos")}
        </p>
      )}

      {aos && aos.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>{t("dashboard.home.table.reference")}</th>
                <th style={th}>{t("dashboard.home.table.object")}</th>
                <th style={th}>{t("dashboard.home.table.status")}</th>
                <th style={{ ...th, textAlign: "right" }}>{t("dashboard.home.table.due")}</th>
              </tr>
            </thead>
            <tbody>
              {aos.slice(0, 7).map((ao, i) => (
                <tr
                  key={ao.id}
                  onClick={onOpenAo}
                  style={{
                    cursor: onOpenAo ? "pointer" : "default",
                    borderTop: i === 0 ? "none" : "1px solid var(--adj-hairline)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--adj-panel-3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{
                    ...td, color: "var(--adj-ink)", whiteSpace: "nowrap",
                    fontWeight: "var(--adj-w-semi)" as never,
                    fontFeatureSettings: "var(--adj-num)" as never,
                  }}>
                    {ao.reference || t("pipeline.detail.noRef")}
                  </td>
                  <td style={{ ...td, width: "100%", maxWidth: 0 }}>
                    <span title={ao.objet} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ao.objet || "-"}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span aria-hidden style={{
                        width: 7, height: 7, borderRadius: 2,
                        background: STATUT_COULEUR[ao.statut] ?? "var(--adj-ink-4)",
                      }} />
                      {t(`pipeline.status.${ao.statut}`, { defaultValue: ao.statut })}
                    </span>
                  </td>
                  <td style={{
                    ...td, textAlign: "right", whiteSpace: "nowrap",
                    fontFeatureSettings: "var(--adj-num)" as never,
                    color: ao.date_limite ? "var(--adj-ink-2)" : "var(--adj-ink-4)",
                  }}>
                    {ao.date_limite
                      ? new Date(`${ao.date_limite.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, {
                          day: "numeric", month: "short",
                        })
                      : t("dashboard.home.activity.noDate")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function VeilleCard({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslation();
  const { data: veille } = useRessource("veille:counts", () => {
    // Service distinct : s'il est indisponible, la carte disparaît au lieu de
    // casser le tableau de bord.
    const filtres = {
      status: "all" as const, search: "", categorie: "", mode_passation: "",
      region: "", date_limite_from: "", secteur_codes: [], page: 1,
    };
    return Promise.all([
      fetchScrapedAos(filtres, 1),
      fetchScrapedAos({ ...filtres, status: "new" as const }, 1),
    ]).then(([tous, neufs]) => ({ total: tous.total, nouveaux: neufs.total }));
  });

  if (!veille) return null;

  return (
    <Card
      title={t("dashboard.overview.veilleTitle")}
      action={onOpen && <CardAction onClick={onOpen}>{t("dashboard.home.activity.open")} {"→"}</CardAction>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-3)" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: "var(--adj-2)", flexWrap: "wrap" }}>
          <span style={{
            fontSize: "var(--adj-t-num)",
            fontWeight: "var(--adj-w-black)" as never, lineHeight: 1,
            color: "var(--adj-ink)", letterSpacing: "-0.03em",
            fontFeatureSettings: "var(--adj-num)" as never,
          }}>
            {veille.nouveaux}
          </span>
          <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
            {t("dashboard.home.activity.veilleNew")}
          </span>
        </span>

        <span style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
          {t("dashboard.home.activity.veilleOf", { total: veille.total })}
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t } = useTranslation();
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const couleur = pct === null ? "var(--adj-brand)"
    : pct >= 90 ? "var(--adj-neg)" : pct >= 70 ? "var(--adj-hold)" : "var(--adj-brand)";

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 9,
      padding: "var(--adj-4)",
      background: "var(--adj-panel-2)",
      borderRadius: "var(--adj-round-m)",
    }}>
      <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>{label}</span>

      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontSize: "var(--adj-t-lg)",
          fontWeight: "var(--adj-w-black)" as never, lineHeight: 1,
          letterSpacing: "-0.03em", color: "var(--adj-ink)",
          fontFeatureSettings: "var(--adj-num)" as never,
        }}>
          {used}
        </span>
        <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-4)" }}>
          / {limit ?? t("dashboard.home.unlimited")}
        </span>
      </span>

      {/* Sans plafond, aucune jauge : une barre pleine laisserait croire a une
          consommation maximale. */}
      {pct !== null && (
        <span aria-hidden style={{ height: 6, borderRadius: 999, background: "var(--adj-panel)", display: "block", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.max(pct, 2)}%`, background: couleur, borderRadius: 999 }} />
        </span>
      )}
    </div>
  );
}

export function PlanCard() {
  const { t } = useTranslation();
  // Seul point d'entree permanent vers le changement d'offre (2026-09-27) :
  // avant, la grille ne s'ouvrait que depuis un formulaire inatteignable.
  const [offres, setOffres] = useState(false);
  const { data: sub } = useRessource<Subscription>("billing:subscription", getSubscription);
  if (!sub) return null;

  const actif = sub.status === "active";

  return (
    <Card
      title={t("dashboard.overview.planTitle")}
      subtitle={t(`billing.status.${sub.status}`, { defaultValue: sub.status })}
      footer={
        <CardAction onClick={() => setOffres(true)}>{t("billing.modal.changePlan")}</CardAction>
      }
      action={
        <span style={{
          padding: "5px 11px", borderRadius: "var(--adj-round-s)",
          background: actif ? "var(--adj-pos-tint)" : "var(--adj-hold-tint)",
          color: actif ? "var(--adj-pos)" : "var(--adj-hold)",
          fontSize: "var(--adj-t-xs)", fontWeight: "var(--adj-w-semi)" as never,
          textTransform: "capitalize", whiteSpace: "nowrap",
        }}>
          {sub.plan_code}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-3)" }}>
        <Usage
          label={t("dashboard.home.activity.aoThisMonth")}
          used={sub.usage.ao_per_month.used}
          limit={sub.usage.ao_per_month.limit}
        />
        <Usage
          label={t("dashboard.home.activity.documents")}
          used={sub.usage.documents.used}
          limit={sub.usage.documents.limit}
        />
      </div>
      {offres && <PricingModal onClose={() => setOffres(false)} />}
    </Card>
  );
}
