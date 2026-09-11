// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useTranslation } from "react-i18next";
import { SectionCard } from "../components/SectionCard";

export function GenerationTab() {
  const { t } = useTranslation();
  return (
    <SectionCard title={t("dashboard.generation.title")}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--l-sub)",
          lineHeight: 1.7,
        }}
      >
        {t("dashboard.generation.desc")}
      </p>
    </SectionCard>
  );
}

// ── Dashboard principal ───────────────────────────────────
