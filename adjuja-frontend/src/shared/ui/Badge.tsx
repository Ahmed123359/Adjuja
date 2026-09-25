// Étiquette d'état. Fond lavé, texte dans la teinte pleine : lisible sans être
// criard, et le même composant sert dans les deux thèmes.
//
// Contrairement aux boutons, un badge PEUT être très arrondi : ce n'est pas une
// cible cliquable, la forme ne promet donc rien de faux. Les Rejected Patterns
// de ui-context.md visent les boutons en pilule, pas les étiquettes.

export type Tone = "neutral" | "primary" | "success" | "warn" | "danger";

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "var(--ac-neutral)", bg: "var(--ac-neutral-wash)" },
  primary: { fg: "var(--ac-primary)", bg: "var(--ac-primary-wash)" },
  success: { fg: "var(--ac-success)", bg: "var(--ac-success-wash)" },
  warn:    { fg: "var(--ac-warn)",    bg: "var(--ac-warn-wash)" },
  danger:  { fg: "var(--ac-danger)",  bg: "var(--ac-danger-wash)" },
};

export function Badge({
  children, tone = "neutral", dot,
}: {
  children: React.ReactNode;
  tone?: Tone;
  /** Pastille de couleur devant le libellé, pour les états d'un flux. */
  dot?: boolean;
}) {
  const c = TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--s-2)",
        padding: "4px 10px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: "var(--t-xs)",
        fontWeight: "var(--t-w-semi)" as never,
        lineHeight: 1.45,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "currentColor", flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
