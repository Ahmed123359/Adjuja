// Fiche d'analyse d'un AO : un seul composant pour la veille, le detail d'un AO
// en mode express et les etapes du mode accompagne.
// Spec : context/feature-spec/analyse-ao-enrichie/client.md.

import { Fragment, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { AnalyseAo } from "../../types";
import { ListeRisques } from "./ListeRisques";
import { MatriceRisques, type FiltreCase } from "./MatriceRisques";
import {
  SectionBudget, SectionClauses, SectionContexte, SectionJalons, SectionPieces, SectionQuestions, TitreSection,
} from "./Sections";

export type SectionFiche = "contexte" | "risques" | "jalons" | "questions" | "clauses" | "budget" | "pieces";

/** Ordre et contenu par ecran (client.md, « Ou la fiche apparait »). */
export const SECTIONS_VEILLE: SectionFiche[] = ["risques", "jalons", "questions", "clauses", "budget"];
export const SECTIONS_EXPRESS: SectionFiche[] = ["risques", "contexte", "jalons", "questions", "clauses", "budget"];
export const SECTIONS_COMPREHENSION: SectionFiche[] = ["contexte", "risques", "clauses"];
export const SECTIONS_PREPARATION: SectionFiche[] = ["jalons", "questions", "pieces"];

function Avertissements({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const meta = analyse._analyse_meta;
  const lignes: string[] = [];
  const cps = meta?.cps;
  if (meta?.partielle) {
    lignes.push(
      cps?.articles_total
        ? t("analyse.meta.articles", { gardes: cps.articles_gardes ?? 0, total: cps.articles_total })
        : t("analyse.meta.partielle"),
    );
  }
  for (const type of meta?.sans_texte ?? []) {
    lignes.push(t("analyse.meta.sansTexte", { document: type.toUpperCase() }));
  }
  if (!lignes.length) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--adj-round-m)", background: "var(--adj-hold-tint)" }}>
      <AlertTriangle size={17} style={{ color: "var(--adj-hold)", flexShrink: 0, marginTop: 2 }} />
      <div>
        {lignes.map((l) => (
          <p key={l} style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-2)", lineHeight: 1.5 }}>{l}</p>
        ))}
      </div>
    </div>
  );
}

function BlocRisques({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const [filtre, setFiltre] = useState<FiltreCase>(null);
  // Analyse anterieure au chantier : pas de matrice vide trompeuse.
  if (!("risques" in analyse)) {
    return <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>{t("analyse.risques.anterieure")}</p>;
  }
  const risques = analyse.risques ?? [];
  if (!risques.length) {
    return (
      <div>
        <TitreSection>{t("analyse.risques.titre")}</TitreSection>
        <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)" }}>{t("analyse.risques.aucun")}</p>
      </div>
    );
  }
  return (
    <div>
      <TitreSection>{t("analyse.risques.titre")}</TitreSection>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <MatriceRisques risques={risques} filtre={filtre} onFiltre={setFiltre} />
        <ListeRisques risques={risques} filtre={filtre} />
      </div>
    </div>
  );
}

export function FicheAnalyse({ analyse, sections }: { analyse: AnalyseAo | null | undefined; sections: SectionFiche[] }) {
  const { t } = useTranslation();
  if (!analyse || !Object.keys(analyse).some((k) => !k.startsWith("_"))) {
    return <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>{t("analyse.vide")}</p>;
  }

  const rendu: Record<SectionFiche, ReactElement> = {
    contexte: <SectionContexte analyse={analyse} />,
    risques: <BlocRisques analyse={analyse} />,
    jalons: <SectionJalons jalons={analyse.jalons} />,
    questions: <SectionQuestions analyse={analyse} />,
    clauses: <SectionClauses analyse={analyse} />,
    budget: <SectionBudget analyse={analyse} />,
    pieces: <SectionPieces analyse={analyse} />,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
      <Avertissements analyse={analyse} />
      {/* Fragment : une section vide ne rend rien et ne cree pas d'espace. */}
      {sections.map((s) => <Fragment key={s}>{rendu[s]}</Fragment>)}
    </div>
  );
}
