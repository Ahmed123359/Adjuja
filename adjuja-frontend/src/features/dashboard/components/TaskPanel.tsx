// Liste des tâches.
//
// Une liste dense à filets, pas des blocs : on doit pouvoir lire dix tâches sans
// défiler. Les actions de modification et de suppression n'apparaissent qu'au
// survol de la ligne (et restent visibles au clavier et sur tactile), pour ne
// pas hérisser la liste de deux icônes par ligne. Cocher reste toujours visible :
// c'est le geste le plus fréquent.

import { useTranslation } from "react-i18next";
import type { User } from "../../../types";
import type { Task } from "../types";

type Props = {
  tasks: Task[];
  membres: User[];
  /** Commutateur « les miennes / toute l'equipe ». Omis, l'onglet disparait :
   *  l'ecran des taches porte ses propres filtres, plus fins. */
  mine?: boolean;
  onMineChange?: (mine: boolean) => void;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  loading: boolean;
  emptyLabel: string;
};

function membre(membres: User[], id: string | null): User | null {
  return id ? membres.find(m => m.id === id) ?? null : null;
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: "var(--adj-round-s)",
  border: "none", background: "transparent", color: "var(--adj-ink-3)",
  cursor: "pointer", flexShrink: 0,
};

export function TaskPanel({
  tasks, membres, mine, onMineChange, onToggleDone, onEdit, onDelete, loading, emptyLabel,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-GB" : "fr-FR";
  const today = new Date().toISOString().slice(0, 10);

  const filtre = (actif: boolean): React.CSSProperties => ({
    padding: "6px 0",
    border: "none",
    borderBottom: `2px solid ${actif ? "var(--adj-ink)" : "transparent"}`,
    background: "transparent",
    color: actif ? "var(--adj-ink)" : "var(--adj-ink-3)",
    fontFamily: "inherit",
    fontSize: "var(--adj-t-sm)",
    fontWeight: (actif ? "var(--adj-w-semi)" : "var(--adj-w-normal)") as never,
    cursor: "pointer",
  });

  return (
    <div>
      {onMineChange && (
        <div style={{
          display: "flex", gap: "var(--adj-pad)", padding: "0 var(--adj-4)",
          borderBottom: "1px solid var(--adj-hairline)",
        }}>
          <button type="button" style={filtre(!!mine)} onClick={() => onMineChange(true)}>
            {t("dashboard.home.task.mineShort")}
          </button>
          <button type="button" style={filtre(!mine)} onClick={() => onMineChange(false)}>
            {t("dashboard.home.task.teamShort")}
          </button>
        </div>
      )}

      {loading && (
        <p style={{ margin: 0, padding: "var(--adj-4)", fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
          {t("dashboard.home.loading")}
        </p>
      )}

      {!loading && !tasks.length && (
        <p style={{ margin: 0, padding: "var(--adj-pad) var(--adj-4)", fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
          {emptyLabel}
        </p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tasks.map((tache, i) => {
          const faite = tache.statut === "faite";
          const echeance = tache.echeance?.slice(0, 10) ?? null;
          const enRetard = !faite && !!echeance && echeance < today;
          const assigne = membre(membres, tache.assignee_id);

          const meta: React.ReactNode[] = [];
          if (echeance) {
            meta.push(
              <span key="date" style={{ color: enRetard ? "var(--adj-neg)" : undefined }}>
                {new Date(`${echeance}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                {enRetard && `, ${t("dashboard.home.task.late")}`}
              </span>,
            );
          }
          if (tache.ao_reference) meta.push(<span key="ao">{tache.ao_reference}</span>);
          meta.push(
            <span key="qui">
              {assigne ? `${assigne.prenom} ${assigne.nom}`.trim() : t("dashboard.home.task.unassigned")}
            </span>,
          );

          return (
            <li
              key={tache.id}
              className="adj-row"
              style={{
                display: "flex", alignItems: "center", gap: "var(--adj-3)",
                padding: "10px var(--adj-4)",
                borderTop: i === 0 ? "none" : "1px solid var(--adj-hairline)",
                minWidth: 0,
              }}
            >
              <input
                type="checkbox"
                checked={faite}
                onChange={() => onToggleDone(tache)}
                aria-label={t("dashboard.home.task.markDone")}
                style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer", accentColor: "var(--adj-brand)" }}
              />

              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{
                  fontSize: "var(--adj-t-base)",
                  color: faite ? "var(--adj-ink-4)" : "var(--adj-ink)",
                  textDecoration: faite ? "line-through" : "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {tache.titre}
                </span>
                <span style={{ fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)", display: "flex", flexWrap: "wrap" }}>
                  {meta.map((m, k) => (
                    <span key={k} style={{ display: "inline-flex" }}>
                      {k > 0 && <span aria-hidden style={{ margin: "0 6px", color: "var(--adj-ink-4)" }}>/</span>}
                      {m}
                    </span>
                  ))}
                </span>
              </span>

              <span className="adj-row-actions" style={{ display: "flex", gap: 2 }}>
                <button
                  type="button" style={iconBtn} className="adj-focusable" onClick={() => onEdit(tache)}
                  aria-label={t("dashboard.home.task.edit")} title={t("dashboard.home.task.edit")}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--adj-panel-3)"; e.currentTarget.style.color = "var(--adj-ink)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--adj-ink-3)"; }}
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
                <button
                  type="button" style={iconBtn} className="adj-focusable" onClick={() => onDelete(tache)}
                  aria-label={t("dashboard.home.task.delete")} title={t("dashboard.home.task.delete")}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--adj-neg-tint)"; e.currentTarget.style.color = "var(--adj-neg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--adj-ink-3)"; }}
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
