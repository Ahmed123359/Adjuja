// Decoupe depuis pages/AoPipelinePage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.
// Reste volumineux (plus de 650 lignes) : le decouper davantage serait une
// reecriture, pas un deplacement. A traiter dans l'etape de factorisation.

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchAo,
  uploadAoDocuments,
  startAoPipeline,
  fetchAoStatus,
  deleteAo,
  cancelAoPipeline,
} from "../api";
import type { AoMode, AoResponse, AoDocumentOut } from "../types";
import { GuidedPipeline } from "./GuidedPipeline";
import { ModeChoice } from "./ModeChoice";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { AoDetailHeader } from "./AoDetailHeader";
import { ErrorNotice } from "./ErrorNotice";
import { ProgressBar } from "./ProgressBar";
import { DossierSection } from "./DossierSection";
import { FicheAnalyse, SECTIONS_EXPRESS } from "./analyse/FicheAnalyse";

export function AoDetailView({ aoId, onBack }: { aoId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [ao, setAo] = useState<AoResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef    = useRef<number | null>(null);
  const pollCountRef  = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchAo(aoId);
      setAo(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur chargement.");
    }
  }, [aoId]);

  useEffect(() => {
    load();
  }, [load]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const scheduleNextPoll = useCallback(() => {
    // Backoff adaptatif : 3s → 5s → 8s → max 12s
    const delays = [3000, 5000, 8000, 12000];
    const delay = delays[Math.min(pollCountRef.current, delays.length - 1)];
    pollCountRef.current += 1;

    pollingRef.current = window.setTimeout(async () => {
      try {
        const status = await fetchAoStatus(aoId);
        setAo((prev) =>
          prev
            ? { ...prev, statut: status.statut, pipeline_pct: status.pipeline_pct, erreur_message: status.erreur_message }
            : prev,
        );
        if (status.statut === "termine" || status.statut === "erreur") {
          stopPolling();
          await load();
        } else {
          scheduleNextPoll();
        }
      } catch {
        scheduleNextPoll();
      }
    }, delay);
  }, [aoId, load, stopPolling]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollCountRef.current = 0;
    scheduleNextPoll();
  }, [scheduleNextPoll]);

  const isGuided = (ao?.mode ?? "express") === "accompagne";

  // En mode accompagne, c'est useStepPolling qui interroge le serveur : lui
  // s'arrete des qu'une etape attend une validation humaine, alors que ce
  // polling-ci ne s'arrete que sur termine/erreur et tournerait des heures.
  const isRunning = ao
    ? !isGuided && ["en_analyse", "en_traitement"].includes(ao.statut)
    : false;

  useEffect(() => {
    if (isRunning) {
      startPolling();
    } else {
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const handleFiles = async (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      setError(t("pipeline.detail.pdfOnly"));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadAoDocuments(aoId, pdfs);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleStart = async (mode: AoMode = "express") => {
    setStarting(true);
    setError(null);
    try {
      await startAoPipeline(aoId, mode);
      if (mode === "accompagne") {
        // Le parcours se recharge depuis la base : on relit l'AO plutot que de
        // deviner son etat, GuidedPipeline prend ensuite le relais.
        await load();
        return;
      }
      setAo((prev) =>
        prev ? { ...prev, statut: "en_analyse", pipeline_pct: 0 } : prev,
      );
      startPolling();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur démarrage.");
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    setConfirmModal({ message: t("pipeline.detail.cancelConfirm"), onConfirm: async () => {
    setConfirmModal(null);
    setCancelling(true);
    setError(null);
    try {
      stopPolling();
      const status = await cancelAoPipeline(aoId);
      setAo((prev) =>
        prev
          ? {
              ...prev,
              statut: status.statut,
              pipeline_pct: 0,
              erreur_message: status.erreur_message,
            }
          : prev,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur annulation.");
    } finally {
      setCancelling(false);
    }
  } });
  };

  const handleDelete = () => {
    setConfirmModal({ message: t("pipeline.detail.deleteConfirmDetail"), onConfirm: async () => {
      setConfirmModal(null);
      setDeleting(true);
      setError(null);
      try {
        await deleteAo(aoId);
        onBack();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erreur suppression.");
        setDeleting(false);
      }
    }});
  };

  if (!ao)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2px solid var(--adj-hairline)",
            borderTopColor: "var(--adj-brand)",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );

  const isPipelineRunning =
    !isGuided && ["en_analyse", "en_traitement"].includes(ao.statut);
  const isPipelineDone = ao.statut === "termine";
  // Un AO abandonne a l'etape Decision n'est pas relancable d'un clic : il faut
  // passer par la reprise de l'etape, sinon on repartirait de zero en silence.
  const canStart =
    !isGuided && (ao.statut === "brouillon" || ao.statut === "erreur");
  const hasSourceDocs =
    ao.documents.filter((d) => d.dossier === "source").length > 0;
  const docsByDossier = (ao.documents ?? []).reduce<
    Record<string, AoDocumentOut[]>
  >((acc, d) => {
    (acc[d.dossier] ??= []).push(d);
    return acc;
  }, {});

  const btnBase: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    transition: "opacity .15s",
    borderRadius: 9,
    fontWeight: 600,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minWidth: 0,
        overflowX: "hidden",
      }}
    >
      <AoDetailHeader
        ao={ao}
        onBack={onBack}
        onDelete={() => setConfirmModal({
          message: t("pipeline.detail.deleteConfirmDetail"),
          onConfirm: async () => {
            setConfirmModal(null);
            setDeleting(true);
            try {
              await deleteAo(aoId);
              onBack();
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Erreur suppression.");
            } finally {
              setDeleting(false);
            }
          },
        })}
      />

      <div className="adj-app-bg adj-scroll adj-pad-x" style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", padding: "var(--adj-5) var(--adj-6) var(--adj-10)" }}>
        <div
          style={{
            maxWidth: "var(--adj-max)",
            margin: "0 auto",
            width: "100%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Parcours accompagne : remplace la barre de progression, c'est le
              stepper qui porte l'etat quand ce regime est actif. */}
          {isGuided && <GuidedPipeline ao={ao} onAoChanged={load} />}

          {/* Progress */}
          {(isPipelineRunning || isPipelineDone) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "var(--adj-panel)",
                border: "1px solid var(--adj-hairline)",
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--adj-ink-2)" }}>
                  {t("pipeline.detail.progress")}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--adj-ink)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {ao.pipeline_pct}%
                </span>
              </div>
              <ProgressBar pct={ao.pipeline_pct} />
              {isPipelineRunning && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#1E88E5",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#1E88E5",
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  {t("pipeline.detail.running")}
                </p>
              )}
            </div>
          )}

          {/* En mode accompagne, l'etape en erreur porte deja le message dans
              son panneau : le repeter ici affichait deux fois le meme texte, ce
              qui laissait croire a deux problemes. */}
          {ao.erreur_message && !isGuided && <ErrorNotice message={ao.erreur_message} />}

          {/* Mode express : l'analyse du CPS/RC n'etait affichee nulle part
              (spec analyse-ao-enrichie, client.md). En mode accompagne, elle vit
              dans les etapes Comprehension et Preparation. */}
          {!isGuided && ao.analyse_json && (
            <section style={{
              display: "flex", flexDirection: "column", gap: "var(--adj-4)",
              padding: "var(--adj-pad)",
              background: "var(--adj-panel)",
              border: "1px solid var(--adj-hairline)",
              borderRadius: "var(--adj-round-l)",
              minWidth: 0,
            }}>
              <h2 style={{ margin: 0, fontSize: "var(--adj-t-md)", fontWeight: 700, color: "var(--adj-ink)" }}>
                {t("analyse.titreDossier")}
              </h2>
              <FicheAnalyse analyse={ao.analyse_json} sections={SECTIONS_EXPRESS} />
            </section>
          )}

          {/* Zone de depot et documents sources : un seul panneau titre.
              Separes, ils se lisaient comme deux sujets sans rapport. */}
          {(!isPipelineRunning && !isPipelineDone) || docsByDossier["source"]?.length > 0 ? (
          <section style={{
            display: "flex", flexDirection: "column", gap: "var(--adj-4)",
            padding: "var(--adj-pad)",
            background: "var(--adj-panel)",
            border: "1px solid var(--adj-hairline)",
            borderRadius: "var(--adj-round-l)",
            minWidth: 0,
          }}>
            <div>
              <h2 style={{
                margin: 0, fontSize: "var(--adj-t-md)", fontWeight: 600,
                color: "var(--adj-ink)", letterSpacing: "-0.015em",
              }}>
                {t("pipeline.dossiers.source")}
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
                {t("pipeline.detail.uploadHint")}
              </p>
            </div>

          {!isPipelineRunning && !isPipelineDone && (
            <div
              style={{
                border: `1.5px dashed ${dragOver ? "var(--adj-brand)" : "var(--adj-edge)"}`,
                borderRadius: "var(--adj-round-m)",
                padding: "var(--adj-6) var(--adj-4)",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "var(--adj-brand-tint)" : "var(--adj-panel-2)",
                transition: "border-color .15s, background .15s",
                minWidth: 0,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                style={{ display: "none" }}
                onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
              />
              {uploading ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "2px solid var(--adj-hairline)",
                      borderTopColor: "var(--adj-brand)",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <p style={{ margin: 0, fontSize: 13, color: "var(--adj-ink-2)" }}>
                    {t("pipeline.detail.uploading")}
                  </p>
                </div>
              ) : (
                <>
                  <svg
                    style={{ margin: "0 auto 12px", display: "block" }}
                    width="28"
                    height="28"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="var(--adj-ink-4)"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--adj-ink)",
                    }}
                  >
                    {t("pipeline.detail.uploadZone")}
                  </p>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 12,
                      color: "var(--adj-ink-2)",
                    }}
                  >
                    {t("pipeline.detail.uploadHint")}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--adj-brand)",
                    }}
                  >
                    {t("pipeline.detail.uploadClick")}
                  </p>
                </>
              )}
            </div>
          )}

          {docsByDossier["source"]?.length > 0 && (
            <DossierSection
              docs={docsByDossier["source"]}
              aoId={aoId}
            />
          )}
          </section>
          ) : null}

          {/* Choix du regime de traitement (client.md) */}
          {canStart && hasSourceDocs && (
            <ModeChoice onStart={handleStart} starting={starting} />
          )}

          {canStart && !hasSourceDocs && (
            <p
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "var(--adj-ink-4)",
                padding: "8px 0",
              }}
            >
              {t("pipeline.detail.waitDocs")}
            </p>
          )}

          {/* Results */}
          {isPipelineDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#16a34a"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span
                  style={{ fontSize: 14, fontWeight: 700, color: "#16a34a" }}
                >
                  {t("pipeline.detail.done")}
                </span>
              </div>
              {(
                ["technique", "financier", "administratif", "output"] as const
              ).map((dossier) =>
                docsByDossier[dossier]?.length > 0 ? (
                  <DossierSection
                    key={dossier}
                    title={t(`pipeline.dossiers.${dossier}`)}
                    docs={docsByDossier[dossier]}
                    aoId={aoId}
                  />
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "var(--adj-3) var(--adj-6)",
            borderTop: "1px solid var(--adj-hairline)",
            flexShrink: 0,
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-neg)" }}>{error}</p>
        </div>
      )}

      <Modal
        open={confirmModal !== null}
        onClose={() => setConfirmModal(null)}
        title={t("pipeline.list.delete")}
        subtitle={ao.reference || undefined}
        width={460}
      >
        <p style={{
          margin: "0 0 var(--adj-5)", fontSize: "var(--adj-t-sm)",
          color: "var(--adj-ink-2)", lineHeight: 1.6,
        }}>
          {confirmModal?.message}
        </p>
        <div style={{ display: "flex", gap: "var(--adj-2)" }}>
          <Button
            variant="danger" size="md"
            loading={deleting || cancelling}
            onClick={() => confirmModal?.onConfirm()}
          >
            {t("pipeline.detail.confirm")}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setConfirmModal(null)}>
            {t("dashboard.home.task.cancel")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
