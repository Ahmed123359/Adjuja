// Choix du regime de traitement, au lancement du pipeline.
//
// Express en premier : c'est le defaut et le chemin rapide, il ne change pas.
// Accompagne en second, avec ce qu'il apporte reellement : voir et corriger a
// chaque etape.
//
// Pas de badge "Nouveau", pas de pilule, pas de bouton degrade (ui-context.md,
// Rejected Patterns).

import { useTranslation } from "react-i18next";
import { useIsMobile } from "../../../hooks/useIsMobile";
import type { AoMode } from "../types";

function Carte({
  titre,
  description,
  bouton,
  onClick,
  disabled,
  primaire,
}: {
  titre: string;
  description: string;
  bouton: string;
  onClick: () => void;
  disabled: boolean;
  primaire: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${primaire ? "var(--l-blue)" : "var(--l-card-border)"}`,
        background: "var(--l-card)",
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--l-text)" }}>{titre}</p>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--l-sub)" }}>{description}</p>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          border: primaire ? "none" : "1px solid var(--l-card-border)",
          borderRadius: 9,
          padding: "11px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          background: primaire ? "var(--l-blue)" : "var(--l-input-bg)",
          color: primaire ? "#fff" : "var(--l-text)",
          opacity: disabled ? 0.6 : 1,
          transition: "opacity .15s",
        }}
      >
        {bouton}
      </button>
    </div>
  );
}

export function ModeChoice({
  onStart,
  starting,
}: {
  onStart: (mode: AoMode) => void;
  starting: boolean;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--l-sub)" }}>{t("pipeline.mode.intro")}</p>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
        <Carte
          primaire
          titre={t("pipeline.mode.express.title")}
          description={t("pipeline.mode.express.desc")}
          bouton={starting ? t("pipeline.detail.starting") : t("pipeline.mode.express.cta")}
          onClick={() => onStart("express")}
          disabled={starting}
        />
        <Carte
          primaire={false}
          titre={t("pipeline.mode.accompagne.title")}
          description={t("pipeline.mode.accompagne.desc")}
          bouton={starting ? t("pipeline.detail.starting") : t("pipeline.mode.accompagne.cta")}
          onClick={() => onStart("accompagne")}
          disabled={starting}
        />
      </div>
    </div>
  );
}
