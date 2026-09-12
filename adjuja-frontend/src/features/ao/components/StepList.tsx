// Stepper du mode accompagne : la colonne d'etapes a gauche sur desktop,
// une barre horizontale scrollable en haut sur mobile.
//
// Une etape non_applicable est AFFICHEE, grisee, avec sa raison : masquer une
// etape rendrait le parcours incomprehensible (pourquoi 5 etapes et pas 7 ?).

import { useTranslation } from "react-i18next";
import { useIsMobile } from "../../../hooks/useIsMobile";
import type { AoStep, AoStepKey, AoStepStatut } from "../types";

/** Couleur portee par chaque statut, via les tokens du projet.
 *  Teal (--l-teal) est deja le token de succes : c'est l'etape validee. */
const STATUT_STYLE: Record<AoStepStatut, { color: string; bg: string; border: string }> = {
  a_faire: {
    color: "var(--l-dim)",
    bg: "transparent",
    border: "var(--l-card-border)",
  },
  en_cours: {
    color: "var(--l-info)",
    bg: "var(--l-info-bg)",
    border: "var(--l-info-border)",
  },
  attente_validation: {
    color: "var(--l-warn)",
    bg: "var(--l-warn-bg)",
    border: "var(--l-warn-border)",
  },
  validee: {
    color: "var(--l-success)",
    bg: "var(--l-success-bg)",
    border: "var(--l-success-border)",
  },
  non_applicable: {
    color: "var(--l-dim)",
    bg: "transparent",
    border: "var(--l-card-border)",
  },
  erreur: {
    color: "var(--l-error)",
    bg: "var(--l-error-bg)",
    border: "var(--l-error-border)",
  },
};

function StepIcon({ statut, order }: { statut: AoStepStatut; order: number }) {
  const s = STATUT_STYLE[statut];
  const common: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    border: `1.5px solid ${s.border}`,
    color: s.color,
    background: s.bg,
  };

  if (statut === "validee") {
    return (
      <span style={common}>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    );
  }
  if (statut === "en_cours") {
    return (
      <span style={{ ...common, position: "relative" }}>
        <span
          style={{
            position: "absolute",
            inset: -1.5,
            borderRadius: "50%",
            border: "1.5px solid transparent",
            borderTopColor: s.color,
            animation: "spin 1s linear infinite",
          }}
        />
        {order}
      </span>
    );
  }
  if (statut === "non_applicable") {
    return (
      <span style={{ ...common, opacity: 0.5 }}>
        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }
  return <span style={common}>{order}</span>;
}

export function StepList({
  steps,
  activeKey,
  onSelect,
}: {
  steps: AoStep[];
  activeKey: AoStepKey | null;
  onSelect: (key: AoStepKey) => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const rows = steps.map((step) => {
    const s = STATUT_STYLE[step.statut];
    const selectable = step.statut !== "a_faire" && step.statut !== "non_applicable";
    const active = step.step_key === activeKey;

    return (
      <button
        key={step.step_key}
        onClick={() => selectable && onSelect(step.step_key)}
        disabled={!selectable}
        title={
          step.statut === "non_applicable"
            ? t("pipeline.steps.notApplicableReason")
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: isMobile ? "8px 12px" : "9px 11px",
          borderRadius: 9,
          border: `1px solid ${active ? s.border : "transparent"}`,
          background: active ? s.bg : "transparent",
          cursor: selectable ? "pointer" : "default",
          textAlign: "left",
          width: isMobile ? "auto" : "100%",
          minWidth: isMobile ? 160 : undefined,
          flexShrink: 0,
          opacity: step.statut === "non_applicable" ? 0.55 : 1,
          transition: "background .15s, border-color .15s",
        }}
      >
        <StepIcon statut={step.statut} order={step.step_order} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "block",
              fontSize: 12.5,
              fontWeight: active ? 700 : 600,
              color: step.statut === "a_faire" ? "var(--l-dim)" : "var(--l-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {t(`pipeline.steps.${step.step_key}.title`)}
          </span>
          <span style={{ display: "block", fontSize: 10.5, color: s.color, marginTop: 1 }}>
            {t(`pipeline.steps.statut.${step.statut}`)}
          </span>
        </span>
      </button>
    );
  });

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "4px 0 8px",
          borderBottom: "1px solid var(--l-card-border)",
        }}
      >
        {rows}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 8,
        borderRadius: 12,
        border: "1px solid var(--l-card-border)",
        background: "var(--l-card)",
      }}
    >
      {rows}
    </div>
  );
}
