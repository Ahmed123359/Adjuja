// Page pipeline Appel d'offres : liste, creation, detail.
// Les composants vivent dans ./components/ depuis le 2026-09-12.

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createAo, fetchAos, deleteAo } from "./api";
import type { AoSummary } from "./types";
import { StatusBadge } from "./components/StatusBadge";
import { ProgressBar } from "./components/ProgressBar";
import { AoDetailView } from "./components/AoDetailView";

type View = "list" | "create" | "detail";

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
