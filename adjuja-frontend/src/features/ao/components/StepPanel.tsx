// Panneau de l'etape courante du mode accompagne.
//
// Le contenu change par etape, la structure ne change pas : ce que l'etape a
// produit, ce que l'utilisateur peut corriger, puis la porte de validation.
//
// L'etape Decision est la seule a avoir deux issues : valider (je soumissionne)
// ou abandonner. L'abandon n'est pas une erreur et n'est pas presente comme tel.

import { useState } from "react";
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
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "var(--l-sub)", letterSpacing: ".02em" }}>
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
    return <p style={{ margin: 0, fontSize: 13, color: "var(--l-dim)" }}>{t("pipeline.steps.documents.empty")}</p>;
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
            border: "1px solid var(--l-card-border)",
            background: "var(--l-input-bg)",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--l-blue)", textTransform: "uppercase" }}>
            {d.doc_type}
          </span>
          <span
            style={{
              fontSize: 12.5,
              color: "var(--l-text)",
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

/** Etape 2 : l'analyse extraite du CPS et du RC, telle qu'elle sera utilisee ensuite. */
function VueComprehension({ analyse }: { analyse: Record<string, unknown> | null }) {
  const { t } = useTranslation();
  if (!analyse || !Object.keys(analyse).length) {
    return <p style={{ margin: 0, fontSize: 13, color: "var(--l-dim)" }}>{t("pipeline.steps.comprehension.empty")}</p>;
  }
  // Les cles prefixees `_` sont des metadonnees d'analyse (ex. `_analyse_meta` :
  // lots lus, caracteres tronques), pas des champs du marche a relire.
  const champs = Object.entries(analyse).filter(
    ([k, v]) => !k.startsWith("_") && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {champs.map(([cle, valeur]) => (
        <div key={cle}>
          <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 600, color: "var(--l-sub)" }}>{cle}</p>
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "var(--l-text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {typeof valeur === "object" ? JSON.stringify(valeur, null, 2) : String(valeur)}
          </p>
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
        gap: 18,
        padding: 18,
        borderRadius: 12,
        border: "1px solid var(--l-card-border)",
        background: "var(--l-card)",
      }}
    >
      <div>
        <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 700, color: "var(--l-text)" }}>
          {t(`pipeline.steps.${step.step_key}.title`)}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--l-sub)" }}>
          {t(`pipeline.steps.${step.step_key}.help`)}
        </p>
      </div>

      {nonApplicable && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--l-dim)" }}>
          {t("pipeline.steps.notApplicableReason")}
        </p>
      )}

      {enErreur && step.erreur_message && (
        <div
          style={{
            padding: "11px 14px",
            borderRadius: 9,
            background: "var(--l-error-bg)",
            border: "1px solid var(--l-error-border)",
            color: "var(--l-error)",
            fontSize: 12.5,
            wordBreak: "break-word",
          }}
        >
          {step.erreur_message}
        </div>
      )}

      {!nonApplicable && (
        <Bloc titre={t("pipeline.steps.resultLabel")}>
          {step.step_key === "documents" && <VueDocuments documents={ao.documents} />}
          {step.step_key === "comprehension" && <VueComprehension analyse={ao.analyse_json} />}
          {step.step_key !== "documents" && step.step_key !== "comprehension" && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--l-dim)" }}>
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
              background: "var(--l-blue)",
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
                background: "var(--l-input-bg)",
                color: "var(--l-sub)",
                border: "1px solid var(--l-card-border)",
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
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--l-warn)" }}>
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
                    background: "var(--l-warn-bg)",
                    color: "var(--l-warn)",
                    border: "1px solid var(--l-warn-border)",
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {t("pipeline.steps.rerunConfirm")}
                </button>
                <button
                  onClick={() => setConfirmRerun(false)}
                  style={{ ...btn, background: "var(--l-input-bg)", color: "var(--l-sub)" }}
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
                color: "var(--l-sub)",
                border: "1px solid var(--l-card-border)",
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
