// Paraphe & cachet -- repris sur le socle visuel le 2026-09-27.
//
// Quatre ressources graphiques de l'entreprise (signature, cachet, « lu et
// accepte », modele de note methodologique), rendues comme quatre panneaux de
// meme gabarit sur une rangee : un apercu, ce a quoi sert la ressource, ses
// actions. Avant : quatre sections empilees dans 896px, chacune avec ses
// propres boutons et tailles d'image.

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText, ImageOff, Trash2, Upload } from "lucide-react";
import {
  fetchCompanyProfile, uploadSignature, uploadCachet, deleteSignature,
  deleteCachet, uploadLuEtAccepte, deleteLuEtAccepte,
  uploadTemplateNoteMetho, deleteTemplateNoteMetho,
} from "../api";
import type { CompanyProfile } from "../../../types";
import { Card } from "../../../shared/ui/Card";
import { Button } from "../../../shared/ui/Button";
import { ErrorLine, LoadingBlock } from "../ui";

type Ressource = "signature" | "cachet" | "lu_et_accepte" | "template";

const UPLOAD: Record<Ressource, (f: File) => Promise<CompanyProfile>> = {
  signature: uploadSignature,
  cachet: uploadCachet,
  lu_et_accepte: uploadLuEtAccepte,
  template: uploadTemplateNoteMetho,
};
const REMOVE: Record<Ressource, () => Promise<CompanyProfile>> = {
  signature: deleteSignature,
  cachet: deleteCachet,
  lu_et_accepte: deleteLuEtAccepte,
  template: deleteTemplateNoteMetho,
};

/** Zone d'apercu commune aux quatre panneaux : meme hauteur, image contenue. */
function Apercu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: 160,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "var(--adj-4)",
      borderRadius: "var(--adj-round-m)",
      border: "1px solid var(--adj-hairline)",
      background: "var(--adj-panel-2)",
    }}>
      {children}
    </div>
  );
}

function Vide({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      color: "var(--adj-ink-3)", fontSize: "var(--adj-t-sm)",
    }}>
      {icon}
      {label}
    </span>
  );
}

function RessourceCard({
  title, description, apercu, present, busy, accept, onUpload, onDelete, extraAction,
}: {
  title: string;
  description: React.ReactNode;
  apercu: React.ReactNode;
  present: boolean;
  busy: "upload" | "delete" | "other" | null;
  accept: string;
  onUpload: (f: File) => void;
  onDelete: () => void;
  extraAction?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Card title={title} className="adj-1-4">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-4)", height: "100%" }}>
        <Apercu>{apercu}</Apercu>
        <p style={{ margin: 0, flex: 1, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", lineHeight: 1.5 }}>
          {description}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--adj-2)" }}>
          <Button
            size="sm"
            variant={present ? "secondary" : "primary"}
            icon={<Upload size={15} />}
            loading={busy === "upload"}
            disabled={busy !== null}
            onClick={() => ref.current?.click()}
          >
            {present ? t("dashboard.assets.replace") : t("dashboard.assets.upload")}
          </Button>
          {extraAction}
          {present && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={15} />}
              loading={busy === "delete"}
              disabled={busy !== null}
              onClick={onDelete}
              style={{ color: "var(--adj-neg)" }}
            >
              {t("dashboard.assets.delete")}
            </Button>
          )}
        </div>
        <input
          ref={ref}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>
    </Card>
  );
}

export function SignatureTab() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ res: Ressource; op: "upload" | "delete" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  const run = async (res: Ressource, op: "upload" | "delete", file?: File) => {
    setBusy({ res, op });
    setError(null);
    try {
      setProfile(op === "upload" && file ? await UPLOAD[res](file) : await REMOVE[res]());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t(op === "upload" ? "dashboard.assets.uploadError" : "dashboard.assets.deleteError"));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingBlock />;

  // Un seul envoi a la fois. `RessourceCard` desactive ses boutons des que
  // `busy` n'est pas nul, et n'affiche l'indicateur de travail que sur le
  // bouton de l'operation en cours : les autres panneaux recoivent donc un
  // etat « occupe » sans indicateur visible.
  const lock = (res: Ressource): "upload" | "delete" | "other" | null =>
    busy ? (busy.res === res ? busy.op : "other") : null;

  const img = (url: string, alt: string) => (
    <img src={url} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
  );
  const noImage = <Vide icon={<ImageOff size={22} strokeWidth={1.7} />} label={t("dashboard.assets.noImage")} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-4)" }}>
      <div className="adj-grid">
        <RessourceCard
          title={t("dashboard.assets.signature.title")}
          description={t("dashboard.assets.signature.desc")}
          apercu={profile?.signature_url ? img(profile.signature_url, t("dashboard.assets.signature.title")) : noImage}
          present={!!profile?.signature_url}
          busy={lock("signature")}
          accept="image/png,image/jpeg"
          onUpload={(f) => run("signature", "upload", f)}
          onDelete={() => run("signature", "delete")}
        />
        <RessourceCard
          title={t("dashboard.assets.cachet.title")}
          description={t("dashboard.assets.cachet.desc")}
          apercu={profile?.cachet_url ? img(profile.cachet_url, t("dashboard.assets.cachet.title")) : noImage}
          present={!!profile?.cachet_url}
          busy={lock("cachet")}
          accept="image/png,image/jpeg"
          onUpload={(f) => run("cachet", "upload", f)}
          onDelete={() => run("cachet", "delete")}
        />
        <RessourceCard
          title={t("dashboard.assets.luEtAccepte.title")}
          description={t("dashboard.assets.luEtAccepte.desc")}
          apercu={profile?.lu_et_accepte_url
            ? img(profile.lu_et_accepte_url, t("dashboard.assets.luEtAccepte.title"))
            : <Vide icon={<ImageOff size={22} strokeWidth={1.7} />} label={t("dashboard.assets.luEtAccepte.fallback")} />}
          present={!!profile?.lu_et_accepte_url}
          busy={lock("lu_et_accepte")}
          accept="image/png,image/jpeg"
          onUpload={(f) => run("lu_et_accepte", "upload", f)}
          onDelete={() => run("lu_et_accepte", "delete")}
        />
        <RessourceCard
          title={t("dashboard.assets.template.title")}
          description={t("dashboard.assets.template.desc")}
          apercu={
            <Vide
              icon={<FileText size={26} strokeWidth={1.6} color={profile?.template_note_metho_minio_key ? "var(--adj-brand)" : undefined} />}
              label={profile?.template_note_metho_minio_key ? t("dashboard.assets.template.configured") : t("dashboard.assets.template.default")}
            />
          }
          present={!!profile?.template_note_metho_minio_key}
          busy={lock("template")}
          accept=".docx"
          onUpload={(f) => run("template", "upload", f)}
          onDelete={() => run("template", "delete")}
          extraAction={profile?.template_note_metho_url ? (
            <a
              href={profile.template_note_metho_url}
              download
              className="adj-focusable"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px",
                borderRadius: "var(--adj-round-m)", border: "1px solid var(--adj-hairline)",
                background: "var(--adj-panel)", color: "var(--adj-ink)", textDecoration: "none",
                fontSize: "var(--adj-t-sm)", fontWeight: 600,
              }}
            >
              <Download size={15} />
              {t("dashboard.assets.download")}
            </a>
          ) : undefined}
        />
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
