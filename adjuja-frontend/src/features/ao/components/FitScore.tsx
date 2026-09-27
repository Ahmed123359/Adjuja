// Score de compatibilite AO / entreprise -- 2026-09-27.
// Spec : context/feature-spec/fit-score/client.md.
//
// Remplace le bloc Go/No-Go (panneau de veille, etape « Decision ») :
//   1. la barriere d'eligibilite, AU-DESSUS du score, jamais a sa place ;
//   2. le score /100 et la base sur laquelle il est calcule ;
//   3. une ligne par facteur : poids, score, justification, action ;
//      un facteur que l'AO n'exige pas est affiche en retrait « Non exige ».

import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Ban } from "lucide-react";
import { useRessource } from "../../../shared/lib/cache";
import { ouvrirReglages, type OngletReglages } from "../../../shared/lib/navigation";
import { fetchFitScore } from "../api";
import type { FitAction, FitFacteur, FitScore as FitScoreData } from "../types";

const ONGLET: Record<FitAction["cible"], OngletReglages> = {
  profil: "profile",
  documents: "documents",
  equipe: "equipe",
};

function couleurScore(score: number): string {
  if (score >= 70) return "var(--adj-pos)";
  if (score >= 40) return "var(--adj-hold)";
  return "var(--adj-neg)";
}

function Barriere({ data }: { data: FitScoreData }) {
  const { t } = useTranslation();
  if (data.eligibilite === "eligible") return null;
  const bloque = data.eligibilite === "non_eligible";
  const couleur = bloque ? "var(--adj-neg)" : "var(--adj-hold)";
  return (
    <div
      role={bloque ? "alert" : undefined}
      style={{
        display: "flex", gap: 12, alignItems: "flex-start",
        padding: "12px 14px", borderRadius: "var(--adj-round-m)",
        background: bloque ? "var(--adj-neg-tint)" : "var(--adj-hold-tint)",
      }}
    >
      {bloque
        ? <Ban size={18} style={{ color: couleur, flexShrink: 0, marginTop: 1 }} />
        : <AlertTriangle size={18} style={{ color: couleur, flexShrink: 0, marginTop: 1 }} />}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", fontWeight: 700, color: couleur }}>
          {t(`fitScore.eligibilite.${data.eligibilite}`)}
        </p>
        {bloque && (
          <ul style={{ margin: "6px 0 0", padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 4 }}>
            {data.bloquants.map((b, i) => (
              <li key={i} style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-2)", lineHeight: 1.45 }}>{b}</li>
            ))}
          </ul>
        )}
        {!bloque && (
          <p style={{ margin: "4px 0 0", fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-2)", lineHeight: 1.45 }}>
            {t("fitScore.aVerifierDesc")}
          </p>
        )}
      </div>
    </div>
  );
}

function LigneFacteur({ f }: { f: FitFacteur }) {
  const { t } = useTranslation();
  const action = f.action;
  return (
    <li style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "12px 0", borderTop: "1px solid var(--adj-hairline)",
      opacity: f.exige ? 1 : 0.6,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: "var(--adj-t-sm)", fontWeight: 600, color: "var(--adj-ink)" }}>
          {t(`fitScore.facteurs.${f.code}`)}
          <span style={{ fontWeight: 400, color: "var(--adj-ink-3)" }}> · {f.poids} %</span>
          {f.exige && f.confiance === "faible" && (
            <span style={{ marginLeft: 8, fontSize: "var(--adj-t-xs)", fontWeight: 500, color: "var(--adj-ink-3)" }}>
              {t("fitScore.estimation")}
            </span>
          )}
        </span>
        <span className="adj-fig" style={{
          flexShrink: 0, fontSize: "var(--adj-t-sm)", fontWeight: 700,
          color: f.score === null ? "var(--adj-ink-3)" : couleurScore(f.score),
        }}>
          {f.score === null ? t("fitScore.nonExige") : `${f.score} / 100`}
        </span>
      </div>

      {f.score !== null && (
        <div aria-hidden style={{ height: 6, borderRadius: 3, background: "var(--adj-panel-2)", overflow: "hidden" }}>
          <div style={{ width: `${f.score}%`, height: "100%", borderRadius: 3, background: couleurScore(f.score) }} />
        </div>
      )}

      <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-2)", lineHeight: 1.45 }}>
        {f.justification}
      </p>

      {action && (
        <button
          type="button"
          className="adj-focusable"
          onClick={() => ouvrirReglages({ onglet: ONGLET[action.cible], champ: action.champ })}
          style={{
            alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 0", border: "none", background: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: "var(--adj-t-xs)", fontWeight: 600, color: "var(--adj-brand)",
          }}
        >
          {t(`fitScore.actions.${action.champ ?? action.cible}`, { defaultValue: t(`fitScore.actions.${action.cible}`) })}
          <ArrowRight size={14} />
        </button>
      )}
    </li>
  );
}

/** Affichage d'un fit score deja calcule. */
export function FitScore({ data }: { data: FitScoreData }) {
  const { t } = useTranslation();
  const exiges = data.facteurs.filter((f) => f.exige).length;
  // Exiges d'abord, dans l'ordre des poids ; les non exiges en fin de liste.
  const facteurs = [...data.facteurs].sort((a, b) => Number(b.exige) - Number(a.exige) || b.poids - a.poids);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-4)" }}>
      <Barriere data={data} />

      {data.score === null ? (
        <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)" }}>
          {t("fitScore.aucuneExigence")}
        </p>
      ) : (
        <div>
          <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="adj-fig" style={{
              fontSize: "var(--adj-t-num)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em",
              color: couleurScore(data.score),
            }}>
              {data.score}
            </span>
            <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>/ 100</span>
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
            {t("fitScore.base", { count: exiges })}
          </p>
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {facteurs.map((f) => <LigneFacteur key={f.code} f={f} />)}
      </ul>

      {data.methode_references === "mots_cles" && data.facteurs.some((f) => f.code === "references" && f.exige) && (
        <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", lineHeight: 1.45 }}>
          {t("fitScore.motsCles")}
        </p>
      )}
      {data.avertissements.length > 0 && (
        <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 4 }}>
          {data.avertissements.map((a, i) => (
            <li key={i} style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", lineHeight: 1.45 }}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Etape « Decision » du mode accompagne : charge le score de l'AO du pipeline. */
export function FitScoreForAo({ aoId }: { aoId: string }) {
  const { t } = useTranslation();
  const { data, loading, erreur } = useRessource<FitScoreData>(`ao:fit:${aoId}`, () => fetchFitScore(aoId));
  if (loading) {
    return <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>{t("fitScore.chargement")}</p>;
  }
  if (erreur || !data) {
    return <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>{erreur?.message ?? t("fitScore.indisponible")}</p>;
  }
  return <FitScore data={data} />;
}
