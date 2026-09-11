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
import type { AoResponse, AoDocumentOut } from "../types";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import { DossierSection } from "./DossierSection";

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

  const isRunning = ao
    ? ["en_analyse", "en_traitement"].includes(ao.statut)
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

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      await startAoPipeline(aoId);
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
            border: "2px solid var(--l-card-border)",
            borderTopColor: "var(--l-blue)",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );

  const isPipelineRunning = ["en_analyse", "en_traitement"].includes(ao.statut);
  const isPipelineDone = ao.statut === "termine";
  const canStart = ao.statut === "brouillon" || ao.statut === "erreur";
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
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 24px",
          borderBottom: "1px solid var(--l-card-border)",
          flexShrink: 0,
          background: "var(--l-card)",
        }}
      >
        <button
          onClick={onBack}
          style={{
            ...btnBase,
            padding: "7px",
            background: "var(--l-input-bg)",
            color: "var(--l-sub)",
            display: "flex",
            fontWeight: 500,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--l-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--l-sub)")}
        >
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: "0 0 1px",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--l-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {ao.reference || t("pipeline.detail.noRef")}
          </p>
          {ao.acheteur && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--l-sub)" }}>
              {ao.acheteur}
            </p>
          )}
        </div>
        <StatusBadge statut={ao.statut} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {isPipelineRunning && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                ...btnBase,
                padding: "7px 12px",
                fontSize: 12,
                background: "rgba(245,158,11,0.10)",
                color: "#d97706",
                border: "1px solid rgba(245,158,11,0.25)",
                cursor: cancelling ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (!cancelling) e.currentTarget.style.opacity = ".8";
              }}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {cancelling
                ? t("pipeline.detail.cancelling")
                : t("pipeline.detail.cancelBtn")}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              ...btnBase,
              padding: "7px",
              background: "var(--l-input-bg)",
              color: "var(--l-dim)",
              border: "1px solid var(--l-card-border)",
              display: "flex",
              alignItems: "center",
              cursor: deleting ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!deleting) {
                e.currentTarget.style.color = "#dc2626";
                e.currentTarget.style.background = "rgba(220,38,38,0.06)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--l-dim)";
              e.currentTarget.style.background = "var(--l-input-bg)";
            }}
            title={t("pipeline.detail.deleteBtn")}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div
          style={{
            maxWidth: 896,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Progress */}
          {(isPipelineRunning || isPipelineDone) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "var(--l-card)",
                border: "1px solid var(--l-card-border)",
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
                <span style={{ fontSize: 13, color: "var(--l-sub)" }}>
                  {t("pipeline.detail.progress")}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--l-text)",
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

          {/* Error */}
          {ao.erreur_message && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(220,38,38,0.07)",
                border: "1px solid rgba(220,38,38,0.2)",
                color: "#dc2626",
                fontSize: 13,
              }}
            >
              {ao.erreur_message}
            </div>
          )}

          {/* Upload zone */}
          {!isPipelineRunning && !isPipelineDone && (
            <div
              style={{
                border: `2px dashed ${dragOver ? "var(--l-blue)" : "var(--l-card-border)"}`,
                borderRadius: 14,
                padding: "36px 24px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "var(--l-blue-a)" : "var(--l-input-bg)",
                transition: "border-color .15s, background .15s",
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
                      border: "2px solid var(--l-card-border)",
                      borderTopColor: "var(--l-blue)",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <p style={{ margin: 0, fontSize: 13, color: "var(--l-sub)" }}>
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
                    stroke="var(--l-dim)"
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
                      color: "var(--l-text)",
                    }}
                  >
                    {t("pipeline.detail.uploadZone")}
                  </p>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 12,
                      color: "var(--l-sub)",
                    }}
                  >
                    {t("pipeline.detail.uploadHint")}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--l-blue)",
                    }}
                  >
                    {t("pipeline.detail.uploadClick")}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Source docs */}
          {docsByDossier["source"]?.length > 0 && (
            <DossierSection
              title={t("pipeline.dossiers.source")}
              docs={docsByDossier["source"]}
              aoId={aoId}
            />
          )}

          {/* Start button */}
          {canStart && hasSourceDocs && (
            <button
              onClick={handleStart}
              disabled={starting}
              style={{
                ...btnBase,
                width: "100%",
                padding: "13px",
                background: starting ? "var(--l-dim)" : "var(--l-blue)",
                color: "#fff",
                fontSize: 14,
                cursor: starting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!starting) e.currentTarget.style.opacity = ".85";
              }}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {starting ? (
                <>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  {t("pipeline.detail.starting")}
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                    />
                  </svg>
                  {t("pipeline.detail.startBtn")}
                </>
              )}
            </button>
          )}

          {canStart && !hasSourceDocs && (
            <p
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "var(--l-dim)",
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
            padding: "12px 24px",
            borderTop: "1px solid var(--l-card-border)",
            flexShrink: 0,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
