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
  /** Omis quand le panneau qui contient la liste porte deja son titre :
   *  l'ecrire deux fois de suite n'apprend rien. */
  title?: string;
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-3)" }}>
      {title && (
        <p style={{
          margin: 0, fontSize: "var(--adj-t-xs)", fontWeight: 600,
          color: "var(--adj-ink-3)",
        }}>
          {title}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-2)" }}>
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
