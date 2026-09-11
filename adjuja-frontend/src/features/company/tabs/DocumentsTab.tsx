// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { fetchCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument } from "../api";
import type { CompanyDocument } from "../../../types";
import { SectionCard } from "../components/SectionCard";
import { Spinner } from "../components/Spinner";

const COMPANY_DOC_TYPES: { value: string; label: string }[] = [
  { value: "pouvoir_gerance", label: "Pouvoir de gérance" },
  { value: "attestation_fiscale", label: "Attestation fiscale" },
  { value: "attestation_cnas", label: "Attestation CNAS" },
  { value: "attestation_casnos", label: "Attestation CASNOS" },
  { value: "reference_realisation", label: "Référence de réalisation" },
  { value: "diplome", label: "Diplôme" },
  { value: "autre", label: "Autre" },
];

export function DocumentsTab() {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selType, setSelType] = useState(COMPANY_DOC_TYPES[0].value);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetchCompanyDocuments()
      .then(setDocs)
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await uploadCompanyDocument(file, selType);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompanyDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur suppression");
    }
  };

  if (loading) return <Spinner />;

  const grouped = COMPANY_DOC_TYPES.reduce<Record<string, CompanyDocument[]>>(
    (acc, t) => {
      acc[t.value] = docs.filter((d) => d.doc_type === t.value);
      return acc;
    },
    {},
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Upload */}
      <SectionCard title="Ajouter un document">
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={selType}
            onChange={(e) => setSelType(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 7,
              border: "1px solid var(--l-card-border)",
              background: "var(--l-input-bg)",
              color: "var(--l-text)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            {COMPANY_DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: "var(--l-blue)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {uploading ? "Upload..." : "Choisir un fichier"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            style={{ display: "none" }}
            onChange={(e) =>
              e.target.files?.[0] && handleUpload(e.target.files[0])
            }
          />
        </div>
        {error && (
          <p style={{ color: "#dc2626", fontSize: 12, margin: "8px 0 0" }}>
            {error}
          </p>
        )}
      </SectionCard>

      {/* Liste par type */}
      {COMPANY_DOC_TYPES.map(({ value, label }) => {
        const typeDocs = grouped[value] ?? [];
        return (
          <SectionCard key={value} title={label}>
            {typeDocs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--l-dim)" }}>
                Aucun document
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {typeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--l-card-border)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--l-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {doc.nom_fichier}
                      </p>
                      {doc.date_validite && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 11,
                            color: "var(--l-dim)",
                          }}
                        >
                          Valide jusqu'au {doc.date_validite}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    >
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 12,
                            color: "var(--l-blue)",
                            textDecoration: "none",
                          }}
                        >
                          Voir
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#dc2626",
                          fontSize: 12,
                          padding: 0,
                          fontFamily: "inherit",
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

// ── Equipe / CVs ────────────────────────────────────────────
