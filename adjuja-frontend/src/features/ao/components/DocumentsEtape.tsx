// Documents produits par les etapes 5 (Redaction), 6 (Remplissage) et 7
// (Signature) du mode accompagne, avec apercu, telechargement et, aux etapes 5
// et 6, remplacement par la version corrigee de l'utilisateur.
//
// Spec : context/feature-spec/mode-accompagne/client.md. Ecart assume : la spec
// prevoyait d'editer la note dans un champ texte. La note est un fichier Word mis
// en forme (modele de l'entreprise) : un champ texte en perdait toute la mise en
// forme. L'utilisateur corrige donc dans Word et televerse sa version, que
// l'etape 7 signe et compile a la place de la version generee.

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Upload } from "lucide-react";
import { DocCard } from "./DocCard";
import { replaceAoDocument } from "../api";
import type { AoDocumentOut, AoResponse, AoStepKey } from "../types";

type EtapeDocuments = Extract<AoStepKey, "redaction" | "remplissage" | "signature">;

function documentsDeLEtape(docs: AoDocumentOut[], etape: EtapeDocuments): AoDocumentOut[] {
  if (etape === "redaction") {
    return docs.filter((d) => d.doc_type === "note_metho" && ["genere", "modifie"].includes(d.origine));
  }
  if (etape === "remplissage") {
    return docs.filter(
      (d) => ["administratif", "financier"].includes(d.dossier)
        && ["rempli", "modifie"].includes(d.origine)
        && d.doc_type !== "note_metho",
    );
  }
  // Signature : le dossier compile d'abord, puis les pieces qu'il contient.
  const zip = docs.filter((d) => d.doc_type === "zip_final");
  const pieces = docs.filter((d) => d.dossier !== "source" && d.doc_type !== "zip_final");
  return [...zip, ...pieces];
}

/** Un groupe par type de document : la version PDF et la version Word d'une meme piece. */
function grouper(docs: AoDocumentOut[]): AoDocumentOut[][] {
  const groupes = new Map<string, AoDocumentOut[]>();
  for (const d of docs) {
    const cle = d.origine === "upload" ? `upload__${d.id}` : d.doc_type;
    groupes.set(cle, [...(groupes.get(cle) ?? []), d]);
  }
  return [...groupes.values()];
}

function BoutonRemplacer({ aoId, docType, onRemplace }: { aoId: string; docType: string; onRemplace: (signable: boolean) => void }) {
  const { t } = useTranslation();
  const champ = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function choisir(fichier: File | undefined) {
    if (!fichier) return;
    setEnvoi(true);
    setErreur("");
    try {
      const { signable } = await replaceAoDocument(aoId, docType, fichier);
      onRemplace(signable);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t("pipeline.documents.erreurRemplacement"));
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        ref={champ}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => choisir(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => champ.current?.click()}
        disabled={envoi}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
          padding: "7px 12px", borderRadius: "var(--adj-round-s)",
          border: "1px solid var(--adj-hairline)", background: "var(--adj-panel)",
          color: "var(--adj-ink)", fontSize: "var(--adj-t-xs)", fontWeight: 600,
          cursor: envoi ? "wait" : "pointer", fontFamily: "inherit",
        }}
      >
        <Upload size={15} />
        {envoi ? t("pipeline.documents.remplacement") : t("pipeline.documents.remplacer")}
      </button>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-neg)" }}>{erreur}</p>}
    </div>
  );
}

export function DocumentsEtape({
  ao,
  etape,
  modifiable,
  onChange,
}: {
  ao: AoResponse;
  etape: EtapeDocuments;
  /** Faux pendant qu'une tache tourne : le serveur refuserait le remplacement. */
  modifiable: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [nonSignable, setNonSignable] = useState(false);
  const groupes = grouper(documentsDeLEtape(ao.documents, etape));

  if (!groupes.length) {
    return (
      <p style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
        {t(`pipeline.steps.${etape}.placeholder`)}
      </p>
    );
  }

  const remplacable = etape !== "signature" && modifiable;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-3)" }}>
      {remplacable && (
        <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", lineHeight: 1.5 }}>
          {t("pipeline.documents.aide")}
        </p>
      )}
      {nonSignable && (
        <div role="status" style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--adj-round-m)", background: "var(--adj-hold-tint)" }}>
          <AlertTriangle size={16} style={{ color: "var(--adj-hold)", flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-2)", lineHeight: 1.5 }}>
            {t("pipeline.documents.nonSignable")}
          </p>
        </div>
      )}

      {groupes.map((groupe) => {
        const principal = groupe.find((d) => d.nom_fichier.endsWith(".pdf")) ?? groupe[0];
        const corrige = groupe.some((d) => d.origine === "modifie");
        return (
          <div key={principal.doc_type + principal.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {corrige && (
              <span style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: "var(--adj-round-s)", background: "var(--adj-brand-tint)", color: "var(--adj-brand-deep)", fontSize: "var(--adj-t-xs)", fontWeight: 600 }}>
                {t("pipeline.documents.corrige")}
              </span>
            )}
            <DocCard doc={principal} aoId={ao.id} variants={groupe} />
            {remplacable && (
              <BoutonRemplacer
                aoId={ao.id}
                docType={principal.doc_type}
                onRemplace={(signable) => { setNonSignable(!signable); onChange(); }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
