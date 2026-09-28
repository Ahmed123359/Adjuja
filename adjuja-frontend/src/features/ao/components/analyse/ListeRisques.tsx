// Liste des risques, dans l'ordre du serveur (gravite puis type), filtrable par
// une case de la matrice. Spec : context/feature-spec/analyse-ao-enrichie/client.md.

import { useTranslation } from "react-i18next";
import type { Risque } from "../../types";
import { STYLE_GRAVITE } from "./gravite";
import type { FiltreCase } from "./MatriceRisques";

export function ListeRisques({ risques, filtre }: { risques: Risque[]; filtre: FiltreCase }) {
  const { t } = useTranslation();
  const visibles = filtre
    ? risques.filter((r) => r.probabilite === filtre.probabilite && r.impact === filtre.impact)
    : risques;

  if (!risques.length) return null;

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
      {visibles.map((r, i) => {
        const style = STYLE_GRAVITE[r.gravite];
        return (
          <li
            key={`${r.type}-${i}`}
            style={{
              display: "flex", flexDirection: "column", gap: 8,
              padding: "14px 0",
              borderTop: i ? "1px solid var(--adj-hairline)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "3px 8px", borderRadius: "var(--adj-round-s)",
                  background: style.fond, color: style.texte,
                  fontSize: "var(--adj-t-xs)", fontWeight: 700,
                }}
              >
                {t(`analyse.gravite.nom.${r.gravite}`)}
              </span>
              <span style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
                {t(`analyse.typeRisque.${r.type}`)}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: "var(--adj-t-base)", fontWeight: 700, color: "var(--adj-ink)", lineHeight: 1.35 }}>
              {r.titre}
            </p>

            {r.clause && <Citation texte={r.clause} reference={r.reference} />}

            {r.conseil && (
              <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--adj-ink)" }}>{t("analyse.risques.aFaire")}</strong> {r.conseil}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Citation du document, sur fond creux (pas de lisere lateral : rejete, ui-context.md). */
export function Citation({ texte, reference }: { texte: string; reference?: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: "var(--adj-round-s)", background: "var(--adj-panel-2)" }}>
      <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)", lineHeight: 1.5, fontStyle: "italic" }}>
        « {texte} »
      </p>
      {reference && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>{reference}</p>
      )}
    </div>
  );
}
