// Equipe / CVs -- repris sur le socle visuel le 2026-09-27.
//
// Les membres deviennent des panneaux sur la grille de fractions (quatre de
// front sur grand ecran) au lieu de lignes etirees sur toute la largeur, ou le
// nom restait a gauche et les actions a 1500px de lui. Le formulaire de
// verification / modification prend une demi-largeur, avec les champs du socle.
//
// Le parcours n'a pas change : import d'un PDF -> extraction -> verification
// -> enregistrement (le PDF est rattache au membre cree).

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Eye, FileUp, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import {
  fetchStaffCvs, createStaffCv, updateStaffCv, deleteStaffCv,
  uploadCvPdf, extractCvFromPdf,
} from "../api";
import type { StaffCv, StaffCvForm } from "../../../types";
import { Card } from "../../../shared/ui/Card";
import { Button } from "../../../shared/ui/Button";
import { useApercuDocument } from "../../../shared/ui/DocumentPreviewModal";
import { ErrorLine, FieldGrid, LoadingBlock, TextField, type Fraction } from "../ui";

const EMPTY_CV: StaffCvForm = {
  nom: "", prenom: "", poste: "", specialite: "", diplome: "",
  annees_experience: 0, actif: true, details: null,
};

type EquipeMode = "list" | "extracting" | "confirm" | "edit";

const rowAction: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 34, padding: "0 10px", borderRadius: "var(--adj-round-s)",
  border: "none", background: "transparent", cursor: "pointer",
  fontFamily: "inherit", fontSize: "var(--adj-t-xs)", fontWeight: 600,
  color: "var(--adj-ink-2)", textDecoration: "none",
};

export function EquipeTab() {
  const { t } = useTranslation();
  const [cvs, setCvs]               = useState<StaffCv[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mode, setMode]             = useState<EquipeMode>("list");
  const [form, setForm]             = useState<StaffCvForm>(EMPTY_CV);
  const [editId, setEditId]         = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [survolDepot, setSurvolDepot] = useState(false);
  const addRef  = useRef<HTMLInputElement>(null);
  const pdfRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { ouvrirUrl, modale } = useApercuDocument();

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
      setError(e instanceof Error ? e.message : t("dashboard.team.extractError"));
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
      setError(e instanceof Error ? e.message : t("dashboard.team.saveError"));
    } finally { setSaving(false); }
  };

  const handleEdit = (cv: StaffCv) => {
    setEditId(cv.id);
    setForm({ nom: cv.nom, prenom: cv.prenom, poste: cv.poste, specialite: cv.specialite,
      diplome: cv.diplome, annees_experience: cv.annees_experience, actif: cv.actif, details: cv.details });
    setError(null);
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
      setError(e instanceof Error ? e.message : t("dashboard.team.saveError"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteStaffCv(id); setCvs(prev => prev.filter(c => c.id !== id)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : t("dashboard.team.deleteError")); }
  };

  const handleReplacePdf = async (cvId: string, file: File) => {
    try {
      const updated = await uploadCvPdf(cvId, file);
      setCvs(prev => prev.map(c => c.id === cvId ? updated : c));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t("dashboard.team.uploadError")); }
  };

  const cancel = () => { setMode("list"); setEditId(null); setForm(EMPTY_CV); setPendingPdf(null); setError(null); };

  const champ = (key: keyof StaffCvForm, opts: { required?: boolean; span?: Fraction; type?: string } = {}) => (
    <TextField
      id={`membre-${key}`}
      label={t(`dashboard.team.fields.${key}`)}
      required={opts.required}
      span={opts.span}
      type={opts.type}
      value={String(form[key] ?? "")}
      onChange={(v) => setForm(prev => ({ ...prev, [key]: opts.type === "number" ? Number(v) : v }))}
    />
  );

  if (loading) return <LoadingBlock />;

  const enFormulaire = mode === "confirm" || mode === "edit";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-4)" }}>
      {/* En-tete : ce que contient l'onglet, et l'action qui l'alimente */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: "var(--adj-3) var(--adj-5)",
      }}>
        <div style={{ minWidth: 0, flex: "1 1 360px" }}>
          <p style={{ margin: 0, fontSize: "var(--adj-t-md)", fontWeight: 600, color: "var(--adj-ink)", letterSpacing: "-0.015em" }}>
            {cvs.length === 0 ? t("dashboard.team.title") : t("dashboard.team.members", { count: cvs.length })}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
            {t("dashboard.team.hint")}
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={17} strokeWidth={2.3} />}
          disabled={mode !== "list"}
          onClick={() => addRef.current?.click()}
        >
          {t("dashboard.team.add")}
        </Button>
        <input ref={addRef} type="file" accept=".pdf" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleNewUpload(f); e.target.value = ""; }} />
      </div>

      {error && mode === "list" && <ErrorLine>{error}</ErrorLine>}

      <div className="adj-grid">
        {mode === "extracting" && (
          <Card title={t("dashboard.team.extracting")} className="adj-1-2">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--adj-3)" }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                border: "2px solid var(--adj-hairline)", borderTopColor: "var(--adj-brand)",
                animation: "spin 1s linear infinite",
              }} />
              <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
                {t("dashboard.team.extractingDesc")}
              </p>
            </div>
          </Card>
        )}

        {enFormulaire && (
          <Card
            title={mode === "confirm" ? t("dashboard.team.confirmTitle") : t("dashboard.team.editTitle")}
            subtitle={mode === "confirm" ? t("dashboard.team.extractedNote") : undefined}
            className="adj-1-2"
          >
            <form onSubmit={mode === "confirm" ? handleConfirm : handleSaveEdit}
              style={{ display: "flex", flexDirection: "column", gap: "var(--adj-5)" }}>
              <FieldGrid>
                {champ("nom", { required: true, span: "1-2" })}
                {champ("prenom", { span: "1-2" })}
                {champ("poste", { required: true, span: "3-4" })}
                {champ("annees_experience", { type: "number", span: "1-4" })}
                {champ("specialite", { span: "1-2" })}
                {champ("diplome", { span: "1-2" })}
              </FieldGrid>
              {error && <ErrorLine>{error}</ErrorLine>}
              <div style={{ display: "flex", gap: "var(--adj-2)" }}>
                <Button type="submit" variant="primary" loading={saving} disabled={!form.nom || !form.poste}>
                  {saving ? t("dashboard.team.saving") : t("dashboard.team.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={cancel}>
                  {t("dashboard.team.cancel")}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {cvs.length === 0 && mode === "list" && (
          <div
            className="adj-1-1 adj-focusable"
            role="button"
            tabIndex={0}
            onClick={() => addRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setSurvolDepot(true); }}
            onDragLeave={() => setSurvolDepot(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvolDepot(false);
              const f = Array.from(e.dataTransfer.files).find((x) => /\.pdf$/i.test(x.name));
              if (f) handleNewUpload(f);
            }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "var(--adj-4)", minHeight: 340, padding: "var(--adj-10) var(--adj-6)",
              textAlign: "center", cursor: "pointer",
              borderRadius: "var(--adj-round-l)",
              border: `2px dashed ${survolDepot ? "var(--adj-brand)" : "var(--adj-edge)"}`,
              background: survolDepot ? "var(--adj-brand-tint)" : "var(--adj-panel)",
              transition: "border-color .15s, background .15s",
            }}
          >
            <span aria-hidden style={{
              width: 64, height: 64, borderRadius: "var(--adj-round-l)",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--adj-brand-tint)", color: "var(--adj-brand)",
            }}>
              <FileUp size={30} strokeWidth={1.8} />
            </span>
            <div style={{ maxWidth: 520 }}>
              <p style={{ margin: 0, fontSize: "var(--adj-t-md)", fontWeight: 600, color: "var(--adj-ink)", letterSpacing: "-0.015em" }}>
                {t("dashboard.team.emptyTitle")}
              </p>
              <p style={{ margin: "8px 0 0", fontSize: "var(--adj-t-base)", color: "var(--adj-ink-3)", lineHeight: 1.55 }}>
                {t("dashboard.team.emptyDesc")}
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--adj-2)" }}>
              {(["nom", "poste", "diplome", "annees_experience"] as const).map((k) => (
                <span key={k} style={{
                  padding: "5px 12px", borderRadius: "var(--adj-round-s)",
                  background: "var(--adj-panel-2)", color: "var(--adj-ink-2)",
                  fontSize: "var(--adj-t-xs)", fontWeight: 500,
                }}>
                  {t(`dashboard.team.fields.${k}`)}
                </span>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
              <span style={{ color: "var(--adj-brand)", fontWeight: 600 }}>{t("dashboard.team.browse")}</span>
              {" "}{t("dashboard.team.orDrop")}
            </p>
          </div>
        )}

        {cvs.map((cv) => {
          const meta = [cv.specialite, cv.diplome].filter(Boolean).join(" · ");
          return (
            <Card key={cv.id} className="adj-1-4" padding="var(--adj-pad)">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-3)", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--adj-3)" }}>
                  <span aria-hidden style={{
                    width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--adj-brand-tint)", color: "var(--adj-brand)",
                    fontSize: "var(--adj-t-sm)", fontWeight: 700,
                  }}>
                    {`${cv.prenom?.[0] ?? ""}${cv.nom?.[0] ?? ""}`.toUpperCase() || "?"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                      margin: 0, fontSize: "var(--adj-t-base)", fontWeight: 600,
                      color: cv.actif ? "var(--adj-ink)" : "var(--adj-ink-3)",
                    }}>
                      {cv.prenom} {cv.nom}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)" }}>
                      {cv.poste}
                    </p>
                  </div>
                  {!cv.actif && (
                    <span style={{
                      flexShrink: 0, padding: "3px 8px", borderRadius: "var(--adj-round-s)",
                      background: "var(--adj-hold-tint)", color: "var(--adj-hold)",
                      fontSize: "var(--adj-t-xs)", fontWeight: 600,
                    }}>
                      {t("dashboard.team.inactive")}
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  {meta && (
                    <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", lineHeight: 1.45 }}>
                      {meta}
                    </p>
                  )}
                  {cv.annees_experience > 0 && (
                    <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" }}>
                      {t("dashboard.team.years", { count: cv.annees_experience })}
                    </p>
                  )}
                </div>

                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 2, margin: "0 -10px -6px",
                  paddingTop: "var(--adj-2)", borderTop: "1px solid var(--adj-hairline)",
                }}>
                  {cv.cv_url ? (
                    <button type="button" className="adj-focusable" style={rowAction}
                      onClick={() => ouvrirUrl(cv.cv_url!, `CV ${cv.prenom} ${cv.nom}.pdf`)}>
                      <Eye size={15} /> {t("dashboard.team.cv")}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="adj-focusable" style={rowAction}
                        onClick={() => pdfRefs.current[cv.id]?.click()}>
                        <Paperclip size={15} /> {t("dashboard.team.attachCv")}
                      </button>
                      <input ref={el => { pdfRefs.current[cv.id] = el; }} type="file" accept=".pdf" style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleReplacePdf(cv.id, f); e.target.value = ""; }} />
                    </>
                  )}
                  <button type="button" className="adj-focusable" style={rowAction} onClick={() => handleEdit(cv)}>
                    <Pencil size={15} /> {t("dashboard.team.edit")}
                  </button>
                  <button type="button" className="adj-focusable"
                    style={{ ...rowAction, color: "var(--adj-neg)", marginLeft: "auto" }}
                    onClick={() => handleDelete(cv.id)}>
                    <Trash2 size={15} /> {t("dashboard.team.delete")}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {modale}
    </div>
  );
}
