// Generation -- repris sur le socle visuel le 2026-09-27 : panneau du socle au
// lieu de SectionCard, texte a 16px.

import { useTranslation } from "react-i18next";
import { Card } from "../../../shared/ui/Card";

export function GenerationTab() {
  const { t } = useTranslation();
  return (
    <div className="adj-grid">
      <Card title={t("dashboard.generation.title")} className="adj-1-2">
        <p style={{ margin: 0, fontSize: "var(--adj-t-base)", color: "var(--adj-ink-2)", lineHeight: 1.65 }}>
          {t("dashboard.generation.desc")}
        </p>
      </Card>
    </div>
  );
}
