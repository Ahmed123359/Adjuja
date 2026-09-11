// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchStaffCvs, createStaffCv, updateStaffCv, deleteStaffCv,
  uploadCvPdf, extractCvFromPdf,
} from "../api";
import type { StaffCv, StaffCvForm } from "../../../types";
import { SectionCard } from "../components/SectionCard";
import { Spinner } from "../components/Spinner";

const EMPTY_CV: StaffCvForm = {
  nom: "", prenom: "", poste: "", specialite: "", diplome: "",
  annees_experience: 0, actif: true, details: null,
};

type EquipeMode = "list" | "extracting" | "confirm" | "edit";

export function EquipeTab() {
  const [cvs, setCvs]               = useState<StaffCv[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mode, setMode]             = useState<EquipeMode>("list");
  const [form, setForm]             = useState<StaffCvForm>(EMPTY_CV);
  const [editId, setEditId]         = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const addRef  = useRef<HTMLInputElement>(null);
  const pdfRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () => fetchStaffCvs().then(setCvs).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleNewUpload = async (file: File) => {
    setMode("extracting"); setError(null);
    try {
      const result = await extractCvFromPdf(file);
      setForm({
        nom: result.nom, prenom: result.prenom, poste: result.poste,
        specialite: result.specialite, diplome: result.diplome,
        annees_experience: result.annees_experience, actif: true, details: null,
      });
      setPendingPdf(result.tmp_pdf_bytes_b64);
      setEditId(null);
      setMode("confirm");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur extraction");
      setMode("list");
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const created = await createStaffCv(form);
      if (pendingPdf) {
        const bytes = Uint8Array.from(atob(pendingPdf), c => c.charCodeAt(0));
        const pdfFile = new File([bytes], "cv.pdf", { type: "application/pdf" });
        await uploadCvPdf(created.id, pdfFile);
      }
      await load();
      setMode("list"); setForm(EMPTY_CV); setPendingPdf(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur enregistrement");
    } finally { setSaving(false); }
  };

  const handleEdit = (cv: StaffCv) => {
    setEditId(cv.id);
    setForm({ nom: cv.nom, prenom: cv.prenom, poste: cv.poste, specialite: cv.specialite,
      diplome: cv.diplome, annees_experience: cv.annees_experience, actif: cv.actif, details: cv.details });
    setMode("edit");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editId) return;
    setSaving(true); setError(null);
    try {
      const updated = await updateStaffCv(editId, form);
      setCvs(prev => prev.map(c => c.id === editId ? updated : c));
      setMode("list"); setEditId(null); setForm(EMPTY_CV);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteStaffCv(id); setCvs(prev => prev.filter(c => c.id !== id)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur suppression"); }
  };

  const handleReplacePdf = async (cvId: string, file: File) => {
    try {
      const updated = await uploadCvPdf(cvId, file);
      setCvs(prev => prev.map(c => c.id === cvId ? updated : c));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur upload PDF"); }
  };

  const fi = (key: keyof StaffCvForm, label: string, half?: boolean, type = "text") => (
    <div style={{ gridColumn: half ? undefined : '1 / -1' }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 4 }}>{label}</label>
      <input type={type} value={String(form[key] ?? "")}
        onChange={e => setForm(prev => ({ ...prev, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)', color: 'var(--l-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
    </div>
  );

  const cancel = () => { setMode("list"); setEditId(null); setForm(EMPTY_CV); setPendingPdf(null); setError(null); };

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {mode === "list" && (
        <>
          <button onClick={() => addRef.current?.click()}
            style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--l-blue)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Ajouter un CV (PDF)
          </button>
          <input ref={addRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleNewUpload(e.target.files[0])} />
        </>
      )}

      {mode === "extracting" && (
        <SectionCard title="Analyse du CV en cours...">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--l-card-border)', borderTopColor: 'var(--l-blue)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--l-sub)' }}>L'IA extrait les informations du CV...</p>
          </div>
        </SectionCard>
      )}

      {(mode === "confirm" || mode === "edit") && (
        <SectionCard title={mode === "confirm" ? "Vérifier les informations extraites" : "Modifier le membre"}>
          {mode === "confirm" && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#16a34a' }}>
                Informations extraites automatiquement  vérifiez et corrigez si nécessaire.
              </p>
            </div>
          )}
          <form onSubmit={mode === "confirm" ? handleConfirm : handleSaveEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              {fi("nom",               "Nom *",               true)}
              {fi("prenom",            "Prénom *",            true)}
              {fi("poste",             "Poste *")}
              {fi("specialite",        "Spécialité",          true)}
              {fi("diplome",           "Diplôme",             true)}
              {fi("annees_experience", "Années d'expérience", false, "number")}
            </div>
            {error && <p style={{ color: '#dc2626', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" disabled={saving || !form.nom || !form.poste}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button type="button" onClick={cancel}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--l-card-border)', background: 'transparent', color: 'var(--l-sub)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {mode === "list" && (
        cvs.length === 0 ? (
          <SectionCard title="Equipe">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--l-dim)' }}>
              Aucun membre dans le pool. Uploadez un CV PDF  les informations seront extraites automatiquement.
            </p>
          </SectionCard>
        ) : (
          <SectionCard title={`Equipe (${cvs.length} membre${cvs.length > 1 ? 's' : ''})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {cvs.map((cv, i) => (
                <div key={cv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: i > 0 ? '1px solid var(--l-card-border)' : 'none' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: cv.actif ? 'var(--l-text)' : 'var(--l-dim)' }}>
                      {cv.nom} {cv.prenom}
                      {!cv.actif && <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706' }}>Inactif</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--l-sub)' }}>
                      {cv.poste}{cv.specialite ? `  ${cv.specialite}` : ''}{cv.annees_experience ? `  ${cv.annees_experience} ans` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12, alignItems: 'center' }}>
                    {cv.cv_url ? (
                      <a href={cv.cv_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--l-blue)', textDecoration: 'none' }}>PDF</a>
                    ) : (
                      <>
                        <button onClick={() => pdfRefs.current[cv.id]?.click()}
                          style={{ fontSize: 12, color: 'var(--l-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                          + PDF
                        </button>
                        <input ref={el => { pdfRefs.current[cv.id] = el; }} type="file" accept=".pdf" style={{ display: 'none' }}
                          onChange={e => e.target.files?.[0] && handleReplacePdf(cv.id, e.target.files[0])} />
                      </>
                    )}
                    <button onClick={() => handleEdit(cv)}
                      style={{ fontSize: 12, color: 'var(--l-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Modifier
                    </button>
                    <button onClick={() => handleDelete(cv.id)}
                      style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )
      )}

      {error && mode === "list" && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────
