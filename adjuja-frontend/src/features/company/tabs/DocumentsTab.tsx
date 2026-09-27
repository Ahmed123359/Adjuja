// Documents permanents -- repris sur le socle visuel le 2026-09-27.
//
// Un panneau par type de piece, sur la grille de fractions, chacun avec son
// propre bouton « Ajouter ». Avant : un panneau d'envoi en tete (liste
// deroulante native + bouton), puis sept sections empilees en pleine largeur,
// dont la plupart ne disaient que « Aucun document ». Choisir le type puis
// remonter pour envoyer est remplace par : aller au type, ajouter.
//
// Un PDF s'ouvre dans l'apercu commun de l'application ; les autres formats
// (image, .docx) s'ouvrent dans un nouvel onglet.

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Eye, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { fetchCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument } from "../api";
import type { CompanyDocument } from "../../../types";
import { Card, CardAction } from "../../../shared/ui/Card";
import { useApercuDocument } from "../../../shared/ui/DocumentPreviewModal";
import { ErrorLine, LoadingBlock } from "../ui";

// Valeurs stockees en base (`company_documents.doc_type`) : ne pas renommer.
const COMPANY_DOC_TYPES = [
  "pouvoir_gerance",
  "attestation_fiscale",
  "attestation_cnas",
  "attestation_casnos",
  "reference_realisation",
  "diplome",
  "autre",
] as const;

const estPdf = (nom: string) => /\.pdf$/i.test(nom);

const iconButton: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, borderRadius: "var(--adj-round-s)",
  border: "none", background: "transparent", color: "var(--adj-ink-3)",
  cursor: "pointer", textDecoration: "none", flexShrink: 0,
};

export function DocumentsTab() {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typeCible = useRef<string>(COMPANY_DOC_TYPES[0]);
  const { ouvrirUrl, modale } = useApercuDocument();

  const load = () =>
    fetchCompanyDocuments()
      .then(setDocs)
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const choisirFichier = (type: string) => {
    typeCible.current = type;
    fileRef.current?.click();
  };

  const handleUpload = async (file: File) => {
    const type = typeCible.current;
    setUploadingType(type);
    setError(null);
    try {
      await uploadCompanyDocument(file, type);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("dashboard.docs.uploadError"));
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompanyDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("dashboard.docs.deleteError"));
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-4)" }}>
      <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
        {t("dashboard.docs.hint")}
      </p>
      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="adj-grid">
        {COMPANY_DOC_TYPES.map((type, i) => {
          const typeDocs = docs.filter((d) => d.doc_type === type);
          const enCours = uploadingType === type;
          return (
            <Card
              key={type}
              title={t(`dashboard.docs.types.${type}`)}
              count={typeDocs.length}
              // 7 types sur une grille de 4 : le dernier prend une moitie pour
              // fermer la 2e rangee (1/4 + 1/4 + 1/2) au lieu d'y laisser un trou.
              className={i === COMPANY_DOC_TYPES.length - 1 ? "adj-1-2" : "adj-1-4"}
              action={
                <CardAction onClick={() => !uploadingType && choisirFichier(type)}>
                  {enCours ? (
                    <span style={{
                      width: 13, height: 13, borderRadius: "50%",
                      border: "2px solid currentColor", borderTopColor: "transparent",
                      animation: "spin .7s linear infinite",
                    }} />
                  ) : <Plus size={15} strokeWidth={2.4} />}
                  {t("dashboard.docs.add")}
                </CardAction>
              }
            >
              {typeDocs.length === 0 ? (
                <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
                  {t("dashboard.docs.empty")}
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  {typeDocs.map((doc) => (
                    <li
                      key={doc.id}
                      className="adj-row"
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--adj-3)",
                        padding: "8px 0",
                        borderTop: "1px solid var(--adj-hairline)",
                      }}
                    >
                      <FileText size={18} strokeWidth={1.8} style={{ color: "var(--adj-brand)", flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          title={doc.nom_fichier}
                          style={{
                            margin: 0, fontSize: "var(--adj-t-sm)", fontWeight: 500, color: "var(--adj-ink)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {doc.nom_fichier}
                        </p>
                        {doc.date_validite && (
                          <p style={{ margin: "2px 0 0", fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
                            {t("dashboard.docs.validUntil", { date: doc.date_validite })}
                          </p>
                        )}
                      </div>
                      {doc.file_url && (estPdf(doc.nom_fichier) ? (
                        <button
                          type="button"
                          onClick={() => ouvrirUrl(doc.file_url!, doc.nom_fichier)}
                          title={t("dashboard.docs.preview")}
                          aria-label={t("dashboard.docs.preview")}
                          className="adj-focusable"
                          style={iconButton}
                        >
                          <Eye size={17} />
                        </button>
                      ) : (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("dashboard.docs.open")}
                          aria-label={t("dashboard.docs.open")}
                          className="adj-focusable"
                          style={iconButton}
                        >
                          <ExternalLink size={17} />
                        </a>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        title={t("dashboard.docs.delete")}
                        aria-label={t("dashboard.docs.delete")}
                        className="adj-focusable"
                        style={{ ...iconButton, color: "var(--adj-neg)" }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.png,.jpg,.jpeg"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      {modale}
    </div>
  );
}
