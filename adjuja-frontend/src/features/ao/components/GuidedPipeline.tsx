// Parcours accompagne : assemble le stepper, le panneau d'etape et l'assistance IA.
//
// Monte uniquement quand l'AO est en mode accompagne. En mode express, GET /steps
// renvoie une liste vide et AoDetailView affiche l'ecran de progression habituel.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { abandonAo, rerunAoStep, validateAoStep } from "../api";
import type { AoResponse, AoStepKey } from "../types";
import { useStepPolling } from "../hooks/useStepPolling";
import { StepList } from "./StepList";
import { StepPanel } from "./StepPanel";
import { StepAssistant } from "./StepAssistant";

export function GuidedPipeline({
  ao,
  onAoChanged,
}: {
  ao: AoResponse;
  onAoChanged: () => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { steps, loading, resume } = useStepPolling(ao.id, true);

  const [selected, setSelected] = useState<AoStepKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** L'etape qui demande une action, sinon celle qui tourne, sinon la derniere validee. */
  const focusKey = useMemo<AoStepKey | null>(() => {
    const attente = steps.find((s) => s.statut === "attente_validation");
    if (attente) return attente.step_key;
    const enErreur = steps.find((s) => s.statut === "erreur");
    if (enErreur) return enErreur.step_key;
    const enCours = steps.find((s) => s.statut === "en_cours");
    if (enCours) return enCours.step_key;
    const validees = steps.filter((s) => s.statut === "validee");
    return validees.length ? validees[validees.length - 1].step_key : null;
  }, [steps]);

  // Suivre l'avancement tant que l'utilisateur n'a pas choisi une autre etape.
  useEffect(() => {
    setSelected((prev) => (prev === null ? focusKey : prev));
  }, [focusKey]);

  const activeKey = selected ?? focusKey;
  const activeStep = steps.find((s) => s.step_key === activeKey) ?? null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("pipeline.steps.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  const handleValidate = (stepKey: AoStepKey) =>
    run(async () => {
      const fresh = await validateAoStep(ao.id, stepKey);
      resume(fresh);
      setSelected(null); // repartir sur l'etape qui demande une action
      onAoChanged();
    });

  const handleRerun = (stepKey: AoStepKey) =>
    run(async () => {
      const fresh = await rerunAoStep(ao.id, stepKey);
      resume(fresh);
      setSelected(null);
      onAoChanged();
    });

  const handleAbandon = () =>
    run(async () => {
      await abandonAo(ao.id);
      onAoChanged();
    });

  if (loading && !steps.length) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--l-dim)" }}>{t("pipeline.steps.loading")}</p>
    );
  }
  if (!steps.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div
          style={{
            padding: "11px 14px",
            borderRadius: 9,
            background: "var(--l-error-bg)",
            border: "1px solid var(--l-error-border)",
            color: "var(--l-error)",
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div style={{ width: isMobile ? "100%" : 210, flexShrink: 0 }}>
          <StepList steps={steps} activeKey={activeKey} onSelect={setSelected} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {activeStep && (
            <StepPanel
              ao={ao}
              step={activeStep}
              busy={busy}
              onValidate={handleValidate}
              onAbandon={handleAbandon}
              onRerun={handleRerun}
            />
          )}
          {activeStep && <StepAssistant aoId={ao.id} stepKey={activeStep.step_key} />}
        </div>
      </div>
    </div>
  );
}
