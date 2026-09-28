// Equipe proposee pour un AO (etape 4 Preparation du mode accompagne) : un
// role exige par le CPS, le CV retenu, ou « a pourvoir ».
// Donnees : GET /staff-cvs/ao/{id}/team, alimente par task_match_team.

import { useTranslation } from "react-i18next";
import { useRessource } from "../../../shared/lib/cache";
import { fetchAoTeam } from "../../company/api";
import { TitreSection } from "./analyse/Sections";

export function EquipeProposee({ aoId }: { aoId: string }) {
  const { t } = useTranslation();
  const { data: equipe } = useRessource(`ao:equipe:${aoId}`, () => fetchAoTeam(aoId));
  if (!equipe?.length) return null;

  return (
    <div>
      <TitreSection>{t("pipeline.equipe.titre")}</TitreSection>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {equipe.map((m, i) => {
          const cv = m.cv;
          const aPourvoir = !cv || m.warning;
          return (
            <li
              key={m.id}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center",
                padding: "10px 0", borderTop: i ? "1px solid var(--adj-hairline)" : "none",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", fontWeight: 600, color: "var(--adj-ink)" }}>{m.role_dans_offre}</p>
                <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
                  {cv
                    ? [`${cv.prenom} ${cv.nom}`.trim(), cv.poste, cv.annees_experience ? t("analyse.contexte.experience", { count: cv.annees_experience }) : null]
                        .filter(Boolean).join(" · ")
                    : t("pipeline.equipe.aucunCv")}
                </p>
              </div>
              {aPourvoir && (
                <span style={{ padding: "2px 8px", borderRadius: "var(--adj-round-s)", background: "var(--adj-hold-tint)", color: "var(--adj-hold)", fontSize: "var(--adj-t-xs)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {t("pipeline.equipe.aPourvoir")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
