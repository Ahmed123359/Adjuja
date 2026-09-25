// Tuile de statistique.
//
// La référence visuelle affiche une sparkline dans chaque tuile. Nous n'avons
// aucune série temporelle sur les AO : en dessiner une serait une décoration
// mensongère. À la place, une barre de part réelle (ce statut sur le total),
// dérivée des données que nous avons vraiment. Elle occupe le même rôle
// graphique et dit quelque chose de vrai.
//
// Le chiffre est en chasse fixe : sans cela quatre tuiles côte à côte ne
// s'alignent pas, et la mise en page saute quand une valeur change.

import type { Tone } from "./Badge";

const TONE_FG: Record<Tone, string> = {
  neutral: "var(--ac-neutral)",
  primary: "var(--ac-primary)",
  success: "var(--ac-success)",
  warn:    "var(--ac-warn)",
  danger:  "var(--ac-danger)",
};

const TONE_BG: Record<Tone, string> = {
  neutral: "var(--ac-neutral-wash)",
  primary: "var(--ac-primary-wash)",
  success: "var(--ac-success-wash)",
  warn:    "var(--ac-warn-wash)",
  danger:  "var(--ac-danger-wash)",
};

export function StatTile({
  label, value, total, tone = "neutral", icon,
}: {
  label: string;
  value: number;
  /** Total de référence : la barre n'est affichée que s'il est fourni et non nul. */
  total?: number;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;

  return (
    <div
      style={{
        background: "var(--sf-card)",
        border: "1px solid var(--sf-line)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--e-1)",
        padding: "var(--s-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-4)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-3)" }}>
        <span
          style={{
            fontSize: "var(--t-sm)",
            fontWeight: "var(--t-w-medium)" as never,
            color: "var(--tx-muted)",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            aria-hidden
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--r-sm)",
              background: TONE_BG[tone], color: TONE_FG[tone], flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s-2)" }}>
        <span
          style={{
            fontSize: "var(--t-xl)",
            fontWeight: "var(--t-w-bold)" as never,
            color: "var(--tx-strong)",
            lineHeight: "var(--t-lead-tight)" as never,
            fontFeatureSettings: "var(--t-numeric)" as never,
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
        {pct !== null && value > 0 && (
          <span style={{ fontSize: "var(--t-xs)", color: "var(--tx-faint)", fontFeatureSettings: "var(--t-numeric)" as never }}>
            {pct}%
          </span>
        )}
      </div>

      {/* Barre de part : rail toujours visible pour que les quatre tuiles gardent
          la même hauteur, même quand la valeur est zéro. */}
      {total !== undefined && (
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "var(--sf-sunken)",
            overflow: "hidden",
          }}
        >
          <div
            className="adj-anim"
            style={{
              height: "100%",
              width: `${pct ?? 0}%`,
              background: TONE_FG[tone],
              borderRadius: 999,
              transition: "width .45s cubic-bezier(.22,.61,.36,1)",
            }}
          />
        </div>
      )}
    </div>
  );
}
