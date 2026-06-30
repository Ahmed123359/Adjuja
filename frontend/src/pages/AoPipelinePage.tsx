import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  createAo,
  fetchAos,
  fetchAo,
  uploadAoDocuments,
  startAoPipeline,
  fetchAoStatus,
  getAoDocumentDownloadUrl,
  deleteAo,
  cancelAoPipeline,
} from "../api";
import type { AoSummary, AoResponse, AoDocumentOut } from "../types";

type View = "list" | "create" | "detail";

const STATUT_BADGE: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  brouillon: {
    bg: "var(--l-input-bg)",
    color: "var(--l-sub)",
    border: "var(--l-card-border)",
  },
  en_analyse: {
    bg: "rgba(30,136,229,0.10)",
    color: "#1E88E5",
    border: "rgba(30,136,229,0.25)",
  },
  en_traitement: {
    bg: "rgba(245,158,11,0.10)",
    color: "#d97706",
    border: "rgba(245,158,11,0.25)",
  },
  termine: {
    bg: "rgba(34,197,94,0.10)",
    color: "#16a34a",
    border: "rgba(34,197,94,0.25)",
  },
  erreur: {
    bg: "rgba(220,38,38,0.07)",
    color: "#dc2626",
    border: "rgba(220,38,38,0.20)",
  },
};

function StatusBadge({ statut }: { statut: string }) {
  const { t } = useTranslation();
  const s = STATUT_BADGE[statut] ?? STATUT_BADGE.brouillon;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 20,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {t(`pipeline.status.${statut}`) ?? statut}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        background: "var(--l-input-bg)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 3,
          background: "linear-gradient(90deg, var(--l-blue), #22c55e)",
          width: `${pct}%`,
          transition: "width .7s ease",
        }}
      />
    </div>
  );
}

function DocCard({
  doc,
  aoId,
  variants,
}: {
  doc: AoDocumentOut;
  aoId: string;
  variants?: AoDocumentOut[];
}) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState<string | null>(null);
  const label =
    t(`pipeline.docTypes.${doc.doc_type}`) !==
    `pipeline.docTypes.${doc.doc_type}`
      ? t(`pipeline.docTypes.${doc.doc_type}`)
      : doc.doc_type;
  const statusInfo =
    doc.statut === "traite"
      ? {
          label: t("pipeline.docStatus.traite"),
          bg: "rgba(34,197,94,0.10)",
          color: "#16a34a",
          border: "rgba(34,197,94,0.25)",
        }
      : doc.statut === "erreur"
        ? {
            label: t("pipeline.docStatus.erreur"),
            bg: "rgba(220,38,38,0.07)",
            color: "#dc2626",
            border: "rgba(220,38,38,0.20)",
          }
        : {
            label: t("pipeline.docStatus.pending"),
            bg: "var(--l-input-bg)",
            color: "var(--l-sub)",
            border: "var(--l-card-border)",
          };

  const handleDownload = async (d: AoDocumentOut) => {
    setDownloading(d.id);
    try {
      const url = await getAoDocumentDownloadUrl(aoId, d.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    } finally {
      setDownloading(null);
    }
  };

  const allVariants = variants ?? [doc];
  const ext = (d: AoDocumentOut) =>
    d.nom_fichier.split(".").pop()?.toUpperCase() ?? "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 14px",
        borderRadius: 10,
        border: "1px solid var(--l-card-border)",
        background: "var(--l-card)",
        gap: 12,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
      >
        <svg
          width="14"
          height="14"
          fill="none"
          viewBox="0 0 24 24"
          stroke="var(--l-dim)"
          strokeWidth={1.5}
          style={{ flexShrink: 0 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: "0 0 1px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--l-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "var(--l-dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {doc.nom_fichier}
          </p>
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 20,
            background: statusInfo.bg,
            color: statusInfo.color,
            border: `1px solid ${statusInfo.border}`,
          }}
        >
          {statusInfo.label}
        </span>
        {allVariants.map(
          (v) =>
            v.statut === "traite" && (
              <button
                key={v.id}
                onClick={() => handleDownload(v)}
                disabled={downloading === v.id}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 7,
                  background:
                    downloading === v.id ? "var(--l-dim)" : "var(--l-blue)",
                  color: "#fff",
                  border: "none",
                  cursor: downloading === v.id ? "not-allowed" : "pointer",
                  transition: "opacity .15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (downloading !== v.id)
                    e.currentTarget.style.opacity = ".82";
                }}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {downloading === v.id ? "..." : `↓ ${ext(v)}`}
              </button>
            ),
        )}
      </div>
    </div>
  );
}

function DossierSection({
  title,
  docs,
  aoId,
}: {
  title: string;
  docs: AoDocumentOut[];
  aoId: string;
}) {
  if (!docs.length) return null;

  // Grouper par doc_type uniquement pour les docs remplis/générés (pdf+docx du même doc).
  // Les uploads sont des fichiers distincts même si même doc_type  clé unique par id.
  const groups = docs.reduce<Record<string, AoDocumentOut[]>>((acc, d) => {
    const key = d.origine === "upload" ? `upload__${d.id}` : d.doc_type;
    (acc[key] ??= []).push(d);
    return acc;
  }, {});

  // Représentant principal de chaque groupe (pdf ou premier disponible)
  const representatives = Object.values(groups).map(
    (grp) => grp.find((d) => d.nom_fichier.endsWith(".pdf")) ?? grp[0],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".07em",
          color: "var(--l-dim)",
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {representatives.map((rep) => (
          <DocCard
            key={rep.id}
            doc={rep}
            aoId={aoId}
            variants={groups[rep.doc_type]}
          />
        ))}
      </div>
    </div>
  );
}

// ── Detail ────────────────────────────────────────────────
function AoDetailView({ aoId, onBack }: { aoId: string; onBack: () => void }) {
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
  const pollingRef = useRef<number | null>(null);

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

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = window.setInterval(async () => {
      try {
        const status = await fetchAoStatus(aoId);
        setAo((prev) =>
          prev
            ? {
                ...prev,
                statut: status.statut,
                pipeline_pct: status.pipeline_pct,
                erreur_message: status.erreur_message,
              }
            : prev,
        );
        if (status.statut === "termine" || status.statut === "erreur") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          await load();
        }
      } catch {
        /* ignore */
      }
    }, 2000);
  }, [aoId, load]);

  const isRunning = ao
    ? ["en_analyse", "en_traitement"].includes(ao.statut)
    : false;

  useEffect(() => {
    if (isRunning) {
      startPolling();
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
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
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
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
export default function AoPipelinePage() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("list");
  const [aos, setAos] = useState<AoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ reference: "", acheteur: "", objet: "" });
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const loadAos = useCallback(async () => {
    setLoading(true);
    try {
      setAos(await fetchAos());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAos();
  }, [loadAos]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const ao = await createAo(form);
      await loadAos();
      setSelectedId(ao.id);
      setView("detail");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur création.");
    } finally {
      setLoading(false);
    }
  };

  const btnBase: React.CSSProperties = {
    border: "none",
    cursor: "pointer",
    transition: "opacity .15s",
    borderRadius: 9,
    fontWeight: 600,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 13px",
    borderRadius: 9,
    border: "1px solid var(--l-card-border)",
    background: "var(--l-input-bg)",
    color: "var(--l-text)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color .15s",
  };

  if (view === "detail" && selectedId) {
    return (
      <AoDetailView
        aoId={selectedId}
        onBack={() => {
          setView("list");
          loadAos();
        }}
      />
    );
  }

  if (view === "create") {
    return (
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "28px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => setView("list")}
            style={{
              ...btnBase,
              padding: "7px",
              background: "var(--l-input-bg)",
              color: "var(--l-sub)",
              display: "flex",
              fontWeight: 500,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--l-text)")
            }
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
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: "var(--l-text)",
            }}
          >
            {t("pipeline.newForm.title")}
          </h2>
        </div>

        <div
          style={{
            background: "var(--l-card)",
            border: "1px solid var(--l-card-border)",
            borderRadius: 16,
            padding: "24px",
          }}
        >
          <form
            onSubmit={handleCreate}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {(
              [
                {
                  field: "reference",
                  labelKey: "pipeline.newForm.reference",
                  phKey: "pipeline.newForm.referencePlaceholder",
                },
                {
                  field: "acheteur",
                  labelKey: "pipeline.newForm.buyer",
                  phKey: "pipeline.newForm.buyerPlaceholder",
                },
                {
                  field: "objet",
                  labelKey: "pipeline.newForm.subject",
                  phKey: "pipeline.newForm.subjectPlaceholder",
                },
              ] as const
            ).map(({ field, labelKey, phKey }) => (
              <div key={field}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--l-sub)",
                    marginBottom: 6,
                  }}
                >
                  {t(labelKey)}
                </label>
                <input
                  value={form[field]}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, [field]: e.target.value }))
                  }
                  placeholder={t(phKey)}
                  style={inputStyle}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "var(--l-blue)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--l-card-border)")
                  }
                />
              </div>
            ))}
            {error && (
              <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                ...btnBase,
                padding: "12px",
                background: loading ? "var(--l-dim)" : "var(--l-blue)",
                color: "#fff",
                fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.opacity = ".85";
              }}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {loading ? t("pipeline.creating") : t("pipeline.create")}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
          padding: "12px 24px",
          borderBottom: "1px solid var(--l-card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexShrink: 0,
          background: "var(--l-card)",
        }}
      >
        <button
          onClick={() => {
            setView("create");
            setError(null);
          }}
          style={{
            ...btnBase,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 16px",
            background: "var(--l-blue)",
            color: "#fff",
            fontSize: 13,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          {t("pipeline.new")}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", width: "100%" }}>
          {loading && !aos.length ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 160,
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
          ) : !aos.length ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "64px 24px",
                gap: 12,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "var(--l-blue-a)",
                  border: "1px solid var(--l-card-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="var(--l-blue)"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--l-text)",
                }}
              >
                {t("pipeline.noAos")}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--l-sub)" }}>
                {t("pipeline.noAosDesc")}
              </p>
              <button
                onClick={() => setView("create")}
                style={{
                  ...btnBase,
                  marginTop: 4,
                  padding: "10px 20px",
                  background: "var(--l-blue)",
                  color: "#fff",
                  fontSize: 13,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {t("pipeline.createFirst")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {aos.map((ao) => (
                <div
                  key={ao.id}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "stretch",
                    gap: 0,
                    minWidth: 0,
                  }}
                >
                  <button
                    onClick={() => {
                      setSelectedId(ao.id);
                      setView("detail");
                    }}
                    style={{
                      ...btnBase,
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      padding: "14px 18px",
                      background: "var(--l-card)",
                      border: "1px solid var(--l-card-border)",
                      borderRight: "none",
                      borderRadius: "10px 0 0 10px",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--l-blue)";
                      e.currentTarget.style.background = "var(--l-blue-a)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--l-card-border)";
                      e.currentTarget.style.background = "var(--l-card)";
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        style={{
                          margin: "0 0 3px",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--l-text)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ao.reference || t("pipeline.detail.noRef")}
                      </p>
                      {ao.acheteur && (
                        <p
                          style={{
                            margin: "0 0 2px",
                            fontSize: 12,
                            color: "var(--l-sub)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {ao.acheteur}
                        </p>
                      )}
                      {ao.objet && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: "var(--l-dim)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {ao.objet}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      <StatusBadge statut={ao.statut} />
                      {["en_analyse", "en_traitement"].includes(ao.statut) && (
                        <div style={{ width: 80 }}>
                          <ProgressBar pct={ao.pipeline_pct} />
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setConfirmModal({ message: t("pipeline.deleteConfirm"), onConfirm: async () => {
                          setConfirmModal(null);
                          try {
                            await deleteAo(ao.id);
                            await loadAos();
                          } catch {}
                        }});
                    }}
                    style={{
                      ...btnBase,
                      padding: "0 14px",
                      background: "var(--l-card)",
                      border: "1px solid var(--l-card-border)",
                      borderRadius: "0 10px 10px 0",
                      color: "var(--l-dim)",
                      display: "flex",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#dc2626";
                      e.currentTarget.style.background = "rgba(220,38,38,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--l-dim)";
                      e.currentTarget.style.background = "var(--l-card)";
                    }}
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
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ConfirmModal  remplace window.confirm() */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmModal(null)}>
          <div style={{
            background: 'var(--l-card)', border: '1px solid var(--l-card-border)',
            borderRadius: 14, padding: '24px 28px', maxWidth: 400, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--l-text)', lineHeight: 1.6 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmModal(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--l-card-border)', background: 'transparent', color: 'var(--l-sub)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
              <button onClick={() => confirmModal.onConfirm()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
