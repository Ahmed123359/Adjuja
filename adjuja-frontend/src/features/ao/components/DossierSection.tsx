// Decoupe depuis pages/AoPipelinePage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useTranslation } from "react-i18next";
import { DocCard } from "./DocCard";
import type { AoDocumentOut } from "../types";

export function DossierSection({
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
