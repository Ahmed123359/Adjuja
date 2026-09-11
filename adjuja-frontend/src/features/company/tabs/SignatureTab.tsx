// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchCompanyProfile, uploadSignature, uploadCachet, deleteSignature,
  deleteCachet, uploadLuEtAccepte, deleteLuEtAccepte,
  uploadTemplateNoteMetho, deleteTemplateNoteMetho,
} from "../api";
import type { CompanyProfile } from "../../../types";
import { SectionCard } from "../components/SectionCard";
import { Spinner } from "../components/Spinner";

export function SignatureTab() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<"signature" | "cachet" | "lu_et_accepte" | null>(null);
  const [deleting, setDeleting] = useState<"signature" | "cachet" | "lu_et_accepte" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const cacRef = useRef<HTMLInputElement>(null);
  const leaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCompanyProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (type: "signature" | "cachet" | "lu_et_accepte", file: File) => {
    setUploading(type);
    setError(null);
    try {
      const updated =
        type === "signature" ? await uploadSignature(file)
        : type === "cachet"  ? await uploadCachet(file)
        : await uploadLuEtAccepte(file);
      setProfile(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (type: "signature" | "cachet" | "lu_et_accepte") => {
    setDeleting(type);
    setError(null);
    try {
      const updated =
        type === "signature" ? await deleteSignature()
        : type === "cachet"  ? await deleteCachet()
        : await deleteLuEtAccepte();
      setProfile(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur suppression");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <Spinner />;

  const imgStyle: React.CSSProperties = {
    width: 160,
    height: 80,
    objectFit: "contain",
    border: "1px solid var(--l-card-border)",
    borderRadius: 8,
    background: "var(--l-input-bg)",
    padding: 8,
  };
  const placeholderStyle: React.CSSProperties = {
    ...imgStyle,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--l-dim)",
    fontSize: 12,
  };
  const btnOutlineStyle: React.CSSProperties = {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid var(--l-blue)",
    background: "transparent",
    color: "var(--l-blue)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const btnDangerStyle: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid rgba(220,38,38,0.5)",
    background: "transparent",
    color: "#dc2626",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionCard title="Paraphe du gérant">
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {profile?.signature_url ? (
            <img src={profile.signature_url} alt="Signature" style={imgStyle} />
          ) : (
            <div style={placeholderStyle as React.CSSProperties}>Aucune signature</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--l-sub)" }}>
              Petite signature apposée sur chaque page du CPS et RC uniquement
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => sigRef.current?.click()}
                disabled={uploading === "signature" || deleting === "signature"}
                style={btnOutlineStyle}
              >
                {uploading === "signature" ? "Upload..." : profile?.signature_url ? "Remplacer" : "Uploader"}
              </button>
              {profile?.signature_url && (
                <button
                  onClick={() => handleDelete("signature")}
                  disabled={deleting === "signature" || uploading === "signature"}
                  style={btnDangerStyle}
                >
                  {deleting === "signature" ? "..." : "Supprimer"}
                </button>
              )}
            </div>
            <input ref={sigRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUpload("signature", e.target.files[0])} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cachet de l'entreprise">
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {profile?.cachet_url ? (
            <img src={profile.cachet_url} alt="Cachet" style={{ ...imgStyle, width: 100, height: 100 }} />
          ) : (
            <div style={{ ...placeholderStyle, width: 100, height: 100 } as React.CSSProperties}>Aucun cachet</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--l-sub)" }}>
              Image PNG ou JPEG apposée avec la signature sur la dernière page
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => cacRef.current?.click()}
                disabled={uploading === "cachet" || deleting === "cachet"}
                style={btnOutlineStyle}
              >
                {uploading === "cachet" ? "Upload..." : profile?.cachet_url ? "Remplacer" : "Uploader"}
              </button>
              {profile?.cachet_url && (
                <button
                  onClick={() => handleDelete("cachet")}
                  disabled={deleting === "cachet" || uploading === "cachet"}
                  style={btnDangerStyle}
                >
                  {deleting === "cachet" ? "..." : "Supprimer"}
                </button>
              )}
            </div>
            <input ref={cacRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUpload("cachet", e.target.files[0])} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Lu et accepté (optionnel)">
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 9, background: 'rgba(30,136,229,0.07)', border: '1px solid rgba(30,136,229,0.2)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--l-sub)', lineHeight: 1.6 }}>
            Image manuscrite apposée en bas de chaque page du CPS et RC. Si absente, le texte "Lu et accepté" est généré automatiquement.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {profile?.lu_et_accepte_url ? (
            <img src={profile.lu_et_accepte_url} alt="Lu et accepté" style={imgStyle} />
          ) : (
            <div style={placeholderStyle as React.CSSProperties}>Aucune image</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => leaRef.current?.click()}
                disabled={uploading === "lu_et_accepte" || deleting === "lu_et_accepte"}
                style={btnOutlineStyle}
              >
                {uploading === "lu_et_accepte" ? "Upload..." : profile?.lu_et_accepte_url ? "Remplacer" : "Uploader"}
              </button>
              {profile?.lu_et_accepte_url && (
                <button
                  onClick={() => handleDelete("lu_et_accepte")}
                  disabled={deleting === "lu_et_accepte" || uploading === "lu_et_accepte"}
                  style={btnDangerStyle}
                >
                  {deleting === "lu_et_accepte" ? "..." : "Supprimer"}
                </button>
              )}
            </div>
            <input ref={leaRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUpload("lu_et_accepte", e.target.files[0])} />
          </div>
        </div>
      </SectionCard>

      {/* Template note méthodologique */}
      <SectionCard title="Template note méthodologique (optionnel)">
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: 'rgba(30,136,229,0.07)', border: '1px solid rgba(30,136,229,0.2)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--l-sub)', lineHeight: 1.6 }}>
            Uploadez votre template DOCX pour que chaque note méthodologique hérite de votre charte graphique
            (logo, couleurs, polices, header, footer). Sans template, un design standard est utilisé.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--l-dim)' }}>
            Le template doit être un fichier .docx avec vos styles Word configurés (Heading 1/2, Normal).
            Le contenu du corps sera remplacé par le texte généré.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {profile?.template_note_metho_minio_key ? (
              <span style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Template configuré
              </span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--l-dim)' }}>Aucun template  design par défaut utilisé</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <TemplateUploadButton profile={profile} setProfile={setProfile} setError={setError} />
            {profile?.template_note_metho_minio_key && (
              <>
                {profile.template_note_metho_url && (
                  <a href={profile.template_note_metho_url} download
                    style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'transparent', color: 'var(--l-sub)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    Télécharger
                  </a>
                )}
                <TemplateDeleteButton profile={profile} setProfile={setProfile} setError={setError} />
              </>
            )}
          </div>
        </div>
      </SectionCard>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

function TemplateUploadButton({ profile, setProfile, setError }: {
  profile: CompanyProfile | null;
  setProfile: (p: CompanyProfile) => void;
  setError: (e: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = async (file: File) => {
    setUploading(true); setError(null);
    try { setProfile(await uploadTemplateNoteMetho(file)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur upload"); }
    finally { setUploading(false); }
  };
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={uploading}
        style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--l-blue)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
        {uploading ? "Upload..." : profile?.template_note_metho_minio_key ? "Remplacer" : "Uploader .docx"}
      </button>
      <input ref={ref} type="file" accept=".docx" style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handle(e.target.files[0])} />
    </>
  );
}

function TemplateDeleteButton({ profile, setProfile, setError }: {
  profile: CompanyProfile | null;
  setProfile: (p: CompanyProfile) => void;
  setError: (e: string | null) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const handle = async () => {
    setDeleting(true); setError(null);
    try { setProfile(await deleteTemplateNoteMetho()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur suppression"); }
    finally { setDeleting(false); }
  };
  return (
    <button onClick={handle} disabled={deleting}
      style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(220,38,38,0.3)', background: 'transparent', color: '#dc2626', fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
      {deleting ? "..." : "Supprimer"}
    </button>
  );
}

// ── Documents permanents ────────────────────────────────────
