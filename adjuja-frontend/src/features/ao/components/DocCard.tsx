// Decoupe depuis pages/AoPipelinePage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState } from "react";
import { Eye } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import { DocumentPreview } from "./DocumentPreview";
import { useTranslation } from "react-i18next";
import { getAoDocumentDownloadUrl } from "../api";
import type { AoDocumentOut } from "../types";

export function DocCard({
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
            bg: "var(--adj-panel-2)",
            color: "var(--adj-ink-2)",
            border: "var(--adj-hairline)",
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
  /** L'URL presignee n'est demandee qu'a l'ouverture : elle n'est valable que
   *  quinze minutes, la reclamer au rendu de la liste la ferait expirer avant
   *  le premier clic. */
  const [apercu, setApercu] = useState<"ferme" | "chargement" | "ouvert">("ferme");
  const [urlApercu, setUrlApercu] = useState<string | null>(null);

  const pdf = allVariants.find(
    (v) => v.nom_fichier.toLowerCase().endsWith(".pdf") && v.minio_key,
  );

  async function ouvrirApercu() {
    if (!pdf) return;
    setApercu("chargement");
    try {
      setUrlApercu(await getAoDocumentDownloadUrl(aoId, pdf.id));
      setApercu("ouvert");
    } catch {
      // L'echec est porte par le composant d'apercu, qui explique la cause.
      setUrlApercu(null);
      setApercu("ouvert");
    }
  }

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
        border: "1px solid var(--adj-hairline)",
        background: "var(--adj-panel)",
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
          stroke="var(--adj-ink-4)"
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
              color: "var(--adj-ink)",
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
              color: "var(--adj-ink-4)",
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
        {allVariants.some(v => v.nom_fichier.toLowerCase().endsWith(".pdf") && v.minio_key) && (
          <button
            onClick={ouvrirApercu}
            disabled={apercu === "chargement"}
            className="adj-focusable adj-anim"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600,
              padding: "4px 10px", borderRadius: "var(--adj-round-s)",
              background: "var(--adj-panel)", color: "var(--adj-ink-2)",
              border: "1px solid var(--adj-hairline)",
              cursor: apercu === "chargement" ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--adj-brand)"; e.currentTarget.style.color = "var(--adj-brand)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--adj-hairline)"; e.currentTarget.style.color = "var(--adj-ink-2)"; }}
          >
            <Eye size={13} strokeWidth={1.9} />
            {t("pipeline.preview.open")}
          </button>
        )}

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
                    downloading === v.id ? "var(--adj-ink-4)" : "var(--adj-brand)",
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

      <Modal
        open={apercu === "ouvert"}
        onClose={() => { setApercu("ferme"); setUrlApercu(null); }}
        title={label}
        subtitle={pdf?.nom_fichier}
        width={1120}
      >
        <DocumentPreview url={urlApercu} nomFichier={pdf?.nom_fichier ?? "document.pdf"} />
      </Modal>
    </div>
  );
}
