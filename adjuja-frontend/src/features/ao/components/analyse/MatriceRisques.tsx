// Matrice de risque 3 x 3 : probabilite (lignes, forte en haut) x impact
// (colonnes, fort a droite). Chaque case compte ses risques ; la cliquer filtre
// la liste. Spec : context/feature-spec/analyse-ao-enrichie/client.md.

import { useTranslation } from "react-i18next";
import type { Impact, Probabilite, Risque } from "../../types";
import { GRAVITES, IMPACTS, PROBABILITES, STYLE_GRAVITE, graviteCase } from "./gravite";

export type FiltreCase = { probabilite: Probabilite; impact: Impact } | null;

export function MatriceRisques({
  risques,
  filtre,
  onFiltre,
}: {
  risques: Risque[];
  filtre: FiltreCase;
  onFiltre: (f: FiltreCase) => void;
}) {
  const { t } = useTranslation();
  const compte = (p: Probabilite, i: Impact) =>
    risques.filter((r) => r.probabilite === p && r.impact === i).length;

  const parGravite = GRAVITES.map((g) => ({ g, n: risques.filter((r) => r.gravite === g).length }))
    .filter(({ n }) => n > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)" }}>
        {parGravite.length
          ? t("analyse.matrice.resume", {
              detail: parGravite.map(({ g, n }) => t(`analyse.gravite.compte.${g}`, { count: n })).join(", "),
              total: risques.length,
            })
          : t("analyse.risques.aucun")}
      </p>

      <div
        role="grid"
        aria-label={t("analyse.matrice.titre")}
        style={{ display: "grid", gridTemplateColumns: "auto repeat(3, minmax(64px, 1fr))", gap: 6, alignItems: "stretch" }}
      >
        <span />
        {IMPACTS.map((i) => (
          <span key={i} role="columnheader" style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", textAlign: "center" }}>
            {t(`analyse.impact.${i}`)}
          </span>
        ))}

        {PROBABILITES.map((p) => (
          <div key={p} role="row" style={{ display: "contents" }}>
            <span role="rowheader" style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", alignSelf: "center", paddingRight: 6, whiteSpace: "nowrap" }}>
              {t(`analyse.probabilite.${p}`)}
            </span>
            {IMPACTS.map((i) => {
              const n = compte(p, i);
              const gravite = graviteCase(p, i);
              const style = STYLE_GRAVITE[gravite];
              const choisie = filtre?.probabilite === p && filtre?.impact === i;
              return (
                <button
                  key={i}
                  role="gridcell"
                  type="button"
                  disabled={n === 0}
                  aria-pressed={choisie}
                  aria-label={t("analyse.matrice.case", { count: n, gravite: t(`analyse.gravite.nom.${gravite}`) })}
                  onClick={() => onFiltre(choisie ? null : { probabilite: p, impact: i })}
                  style={{
                    minHeight: 64,
                    border: choisie ? "2px solid var(--adj-ink)" : "2px solid transparent",
                    borderRadius: "var(--adj-round-s)",
                    background: style.fond,
                    // Un zero reste lisible (ui-context.md) : couleur secondaire, pas d'opacite.
                    color: n === 0 ? "var(--adj-ink-3)" : style.texte,
                    fontSize: "var(--adj-t-md)",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    cursor: n === 0 ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {GRAVITES.map((g) => (
          <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-2)" }}>
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: STYLE_GRAVITE[g].fond, border: "1px solid var(--adj-hairline)" }} />
            {t(`analyse.gravite.nom.${g}`)}
          </span>
        ))}
        <span style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
          {t("analyse.matrice.axes")}
        </span>
      </div>
    </div>
  );
}
