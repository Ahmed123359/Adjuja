// Panneau de l'etape courante du mode accompagne.
//
// Le contenu change par etape, la structure ne change pas : ce que l'etape a
// produit, ce que l'utilisateur peut corriger, puis la porte de validation.
//
// L'etape Decision est la seule a avoir deux issues : valider (je soumissionne)
// ou abandonner. L'abandon n'est pas une erreur et n'est pas presente comme tel.

import { useState } from "react";
import { ErrorNotice } from "./ErrorNotice";
import { FitScoreForAo } from "./FitScore";
import { FicheAnalyse, SECTIONS_COMPREHENSION, SECTIONS_PREPARATION } from "./analyse/FicheAnalyse";
import { useTranslation } from "react-i18next";
import type { AoDocumentOut, AoResponse, AoStep, AoStepKey } from "../types";

const btn: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  borderRadius: 9,
  fontWeight: 600,
  fontSize: 13,
  padding: "10px 16px",
  transition: "opacity .15s",
};

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "var(--adj-ink-2)", letterSpacing: ".02em" }}>
        {titre}
      </p>
      {children}
    </div>
  );
}

/** Etape 1 : les fichiers, ranges par type, tels que la classification les a poses. */
function VueDocuments({ documents }: { documents: AoDocumentOut[] }) {
  const { t } = useTranslation();
  const sources = documents.filter((d) => d.dossier === "source");
  if (!sources.length) {
    return <p style={{ margin: 0, fontSize: 13, color: "var(--adj-ink-4)" }}>{t("pipeline.steps.documents.empty")}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sources.map((d) => (
        <div
          key={d.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 11px",
            borderRadius: 8,
            border: "1px solid var(--adj-hairline)",
            background: "var(--adj-panel-2)",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--adj-brand)", textTransform: "uppercase" }}>
            {d.doc_type}
          </span>
          <span
            style={{
              fontSize: 12.5,
              color: "var(--adj-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {d.nom_fichier}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StepPanel({
  ao,
  step,
  busy,
  onValidate,
  onAbandon,
  onRerun,
}: {
  ao: AoResponse;
  step: AoStep;
  busy: boolean;
  onValidate: (stepKey: AoStepKey) => void;
  onAbandon: () => void;
  onRerun: (stepKey: AoStepKey) => void;
}) {
  const { t } = useTranslation();
  const [confirmRerun, setConfirmRerun] = useState(false);

  const attend = step.statut === "attente_validation";
  const validee = step.statut === "validee";
  const enErreur = step.statut === "erreur";
  const nonApplicable = step.statut === "non_applicable";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--adj-4)",
        padding: "var(--adj-pad)",
        borderRadius: "var(--adj-round-l)",
        border: "1px solid var(--adj-hairline)",
        background: "var(--adj-panel)",
      }}
    >
      <div>
        <p style={{ margin: "0 0 3px", fontSize: "var(--adj-t-md)", fontWeight: 700, color: "var(--adj-ink)" }}>
          {t(`pipeline.steps.${step.step_key}.title`)}
        </p>
        <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
          {t(`pipeline.steps.${step.step_key}.help`)}
        </p>
      </div>

      {nonApplicable && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--adj-ink-4)" }}>
          {t("pipeline.steps.notApplicableReason")}
        </p>
      )}

      {enErreur && step.erreur_message && <ErrorNotice message={step.erreur_message} />}

      {!nonApplicable && (
        <Bloc titre={t("pipeline.steps.resultLabel")}>
          {step.step_key === "documents" && <VueDocuments documents={ao.documents} />}
          {/* Etape 2 : la fiche d'analyse lisible remplace l'ancien JSON brut
              (spec analyse-ao-enrichie, client.md). */}
          {step.step_key === "comprehension" && <FicheAnalyse analyse={ao.analyse_json} sections={SECTIONS_COMPREHENSION} />}
          {step.step_key === "decision" && <FitScoreForAo aoId={ao.id} />}
          {step.step_key === "preparation" && <FicheAnalyse analyse={ao.analyse_json} sections={SECTIONS_PREPARATION} />}
          {!["documents", "comprehension", "decision", "preparation"].includes(step.step_key) && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--adj-ink-4)" }}>
              {t(`pipeline.steps.${step.step_key}.placeholder`)}
            </p>
          )}
        </Bloc>
      )}

      {/* Porte de validation : rien ne s'enchaine tant qu'elle n'est pas franchie. */}
      {attend && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
          <button
            onClick={() => onValidate(step.step_key)}
            disabled={busy}
            style={{
              ...btn,
              background: "var(--adj-brand)",
              color: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {step.step_key === "decision"
              ? t("pipeline.steps.decision.go")
              : t("pipeline.steps.validate")}
          </button>

          {step.step_key === "decision" && (
            <button
              onClick={onAbandon}
              disabled={busy}
              style={{
                ...btn,
                background: "var(--adj-panel-2)",
                color: "var(--adj-ink-2)",
                border: "1px solid var(--adj-hairline)",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {t("pipeline.steps.decision.noGo")}
            </button>
          )}
        </div>
      )}

      {/* Retour en arriere : action destructive du travail deja valide, donc
          confirmation explicite disant ce qui sera a refaire. */}
      {(validee || enErreur) && (
        <div style={{ paddingTop: 2 }}>
          {confirmRerun ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--adj-hold)" }}>
                {t("pipeline.steps.rerunWarning")}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    setConfirmRerun(false);
                    onRerun(step.step_key);
                  }}
                  disabled={busy}
                  style={{
                    ...btn,
                    background: "var(--adj-hold-tint)",
                    color: "var(--adj-hold)",
                    border: "1px solid var(--adj-hold)",
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {t("pipeline.steps.rerunConfirm")}
                </button>
                <button
                  onClick={() => setConfirmRerun(false)}
                  style={{ ...btn, background: "var(--adj-panel-2)", color: "var(--adj-ink-2)" }}
                >
                  {t("pipeline.steps.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRerun(true)}
              disabled={busy}
              style={{
                ...btn,
                background: "transparent",
                color: "var(--adj-ink-2)",
                border: "1px solid var(--adj-hairline)",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {enErreur ? t("pipeline.steps.retry") : t("pipeline.steps.redo")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
