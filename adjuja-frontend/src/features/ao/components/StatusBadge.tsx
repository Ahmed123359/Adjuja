// Decoupe depuis pages/AoPipelinePage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useTranslation } from "react-i18next";

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
  // Refus explicite a l'etape Decision du mode accompagne : ce n'est pas un
  // echec, donc un traitement neutre et non le rouge de l'erreur.
  abandonne: {
    bg: "var(--l-input-bg)",
    color: "var(--l-sub)",
    border: "var(--l-card-border)",
  },
};

export function StatusBadge({ statut }: { statut: string }) {
  const { t } = useTranslation();
  const s = STATUT_BADGE[statut] ?? STATUT_BADGE.brouillon;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 20,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {t(`pipeline.status.${statut}`) ?? statut}
    </span>
  );
}
