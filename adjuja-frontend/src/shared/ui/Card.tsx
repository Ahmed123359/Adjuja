// Panneau de contenu -- 2e passe du 2026-09-24.
//
// Panneau blanc sur fond gris franc, filet clair, rayon moyen, relief presque
// nul : ce qui detoure le panneau est le contraste avec le fond, pas une ombre
// portee.
//
// En-tete : titre a 18px, ligne de contexte a 13px dessous, action a droite.
// Pied optionnel, separe par un filet : c'est la que va la lecture de la carte
// (« 12 echeances sur 30 jours »), jamais une deuxieme action.

type Props = {
  children: React.ReactNode;
  title?: React.ReactNode;
  /** Ligne de contexte sous le titre : ce que la carte montre, en clair. */
  subtitle?: React.ReactNode;
  /** Nombre d'elements, en gris, juste apres le titre. */
  count?: number;
  action?: React.ReactNode;
  /** Ligne de lecture en pied de carte, separee par un filet. */
  footer?: React.ReactNode;
  /** Retire le padding du corps, pour une liste ou un tableau bord a bord. */
  flush?: boolean;
  /** Survol marque : reserve aux panneaux reellement cliquables. */
  interactive?: boolean;
  padding?: string;
  style?: React.CSSProperties;
  /** Fraction de grille (`adj-1-2`, `adj-1-4`...). En CLASSE et non en style
   *  inline : un `gridColumn` inline l'emporte sur toute media query, donc la
   *  carte gardait ses 4 colonnes sur un telephone ou la grille n'en a qu'une,
   *  et debordait. */
  className?: string;
  onClick?: () => void;
};

export function Card({
  children, title, subtitle, count, action, footer, flush, interactive, padding, style,
  className, onClick,
}: Props) {
  const clickable = interactive || !!onClick;

  return (
    <section
      onClick={onClick}
      className={[className, clickable ? "adj-anim" : null].filter(Boolean).join(" ") || undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--adj-panel)",
        border: "1px solid var(--adj-hairline)",
        borderRadius: "var(--adj-round-l)",
        boxShadow: "var(--adj-lift-1)",
        overflow: "hidden",
        minWidth: 0,
        cursor: onClick ? "pointer" : undefined,
        transition: clickable ? "border-color .16s, box-shadow .16s" : undefined,
        ...style,
      }}
      onMouseEnter={clickable ? (e) => {
        e.currentTarget.style.borderColor = "var(--adj-edge)";
        e.currentTarget.style.boxShadow = "var(--adj-lift-2)";
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        e.currentTarget.style.borderColor = "var(--adj-hairline)";
        e.currentTarget.style.boxShadow = "var(--adj-lift-1)";
      } : undefined}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--adj-3)",
            padding: "var(--adj-pad) var(--adj-pad) 10px",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
              {typeof title === "string" ? (
                <h2
                  style={{
                    margin: 0,
                    fontSize: "var(--adj-t-md)",
                    fontWeight: "var(--adj-w-semi)" as never,
                    letterSpacing: "-0.015em",
                    color: "var(--adj-ink)",
                    lineHeight: 1.25,
                  }}
                >
                  {title}
                </h2>
              ) : title}
              {typeof count === "number" && (
                <span style={{
                  fontSize: "var(--adj-t-xs)",
                  color: "var(--adj-ink-4)",
                  fontFeatureSettings: "var(--adj-num)" as never,
                }}>
                  {count}
                </span>
              )}
            </span>
            {subtitle && (
              <span style={{
                fontSize: "var(--adj-t-xs)",
                color: "var(--adj-ink-3)",
                lineHeight: 1.4,
              }}>
                {subtitle}
              </span>
            )}
          </span>
          {action && <span style={{ flexShrink: 0 }}>{action}</span>}
        </header>
      )}

      <div style={{ flex: 1, minHeight: 0, padding: flush ? 0 : (padding ?? "0 var(--adj-pad) var(--adj-pad)") }}>
        {children}
      </div>

      {footer && (
        <div style={{
          padding: "9px var(--adj-pad)",
          borderTop: "1px solid var(--adj-hairline)",
          fontSize: "var(--adj-t-xs)",
          color: "var(--adj-ink-3)",
          lineHeight: 1.4,
        }}>
          {footer}
        </div>
      )}
    </section>
  );
}

/** Action d'en-tete de panneau : un lien texte, jamais un bouton plein. Une
 *  section n'a qu'une action, elle n'a pas besoin de crier. */
export function CardAction({
  children, onClick, label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="adj-focusable"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 7px", marginRight: -5, marginTop: -1,
        border: "none", background: "transparent", borderRadius: "var(--adj-round-s)",
        color: "var(--adj-brand)", fontFamily: "inherit",
        fontSize: "var(--adj-t-xs)", fontWeight: "var(--adj-w-semi)" as never,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--adj-brand-tint)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}
