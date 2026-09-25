// Bouton unique du produit. Remplace les 194 <button> stylés un par un et les
// 12 copies de `btnBase`.
//
// Trois variantes seulement, parce qu'un écran qui a besoin d'une quatrième a
// généralement un problème de hiérarchie, pas de bouton :
//   primary   une action par écran, celle qui fait avancer
//   secondary les actions de soutien
//   ghost     les actions discrètes (annuler, icônes de ligne)
//
// Pas de coins entièrement arrondis, pas de dégradé par défaut : ui-context.md
// les liste en Rejected Patterns et ce sont des marqueurs visuels d'interface
// générée. Le relief vient de l'ombre et d'un léger déplacement au survol.

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Icône SVG placée avant le libellé. */
  icon?: React.ReactNode;
  /** Occupe toute la largeur disponible. */
  block?: boolean;
  /** Affiche un indicateur de travail et désactive le bouton. */
  loading?: boolean;
};

// Hauteurs fixes plutot qu'un padding vertical : c'est ce qui aligne un bouton
// avec un champ de recherche ou un bouton carre poses sur la meme ligne.
const SIZES: Record<Size, React.CSSProperties> = {
  sm: { height: 36, padding: "0 14px", fontSize: "var(--adj-t-sm)", gap: "var(--adj-2)" },
  md: { height: 44, padding: "0 20px", fontSize: "var(--adj-t-base)", gap: "var(--adj-2)" },
};

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--adj-brand)",
    color: "#fff",
    border: "1px solid transparent",
    boxShadow: "var(--adj-lift-1)",
  },
  secondary: {
    background: "var(--adj-panel)",
    color: "var(--adj-ink)",
    border: "1px solid var(--adj-hairline)",
    boxShadow: "var(--adj-lift-1)",
  },
  ghost: {
    background: "transparent",
    color: "var(--adj-ink-3)",
    border: "1px solid transparent",
    boxShadow: "none",
  },
  danger: {
    background: "var(--adj-neg-tint)",
    color: "var(--adj-neg)",
    border: "1px solid transparent",
    boxShadow: "none",
  },
};

/** Survol : la couleur change peu, c'est l'élévation qui répond. Un bouton qui
 *  change franchement de teinte au survol donne un effet « web 2010 ». */
const HOVER: Record<Variant, { bg?: string; shadow?: string; lift?: boolean }> = {
  primary:   { bg: "var(--adj-brand-deep)", shadow: "var(--adj-lift-2)", lift: true },
  secondary: { bg: "var(--adj-panel-3)", shadow: "var(--adj-lift-2)", lift: true },
  ghost:     { bg: "var(--adj-panel-3)" },
  danger:    { bg: "var(--adj-neg-tint)", shadow: "var(--adj-lift-1)" },
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", icon, block, loading, disabled, children, style,
    className, ...rest },
  ref,
) {
  const inactive = disabled || loading;
  const h = HOVER[variant];

  return (
    <button
      ref={ref}
      disabled={inactive}
      // La classe de l'appelant s'AJOUTE : `{...rest}` etant epandu plus bas,
      // un className recu remplacerait sinon adj-focusable et adj-anim, donc
      // l'anneau de focus au clavier et le respect du mouvement reduit.
      className={["adj-focusable adj-anim", className].filter(Boolean).join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: block ? "100%" : undefined,
        borderRadius: "var(--adj-round-m)",
        fontWeight: "var(--adj-w-semi)" as never,
        lineHeight: 1,
        cursor: inactive ? "not-allowed" : "pointer",
        opacity: inactive ? 0.55 : 1,
        transition: "background .15s, box-shadow .15s, transform .15s",
        whiteSpace: "nowrap",
        ...SIZES[size],
        ...VARIANTS[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (inactive) return;
        if (h.bg) e.currentTarget.style.background = h.bg;
        if (h.shadow) e.currentTarget.style.boxShadow = h.shadow;
        if (h.lift) e.currentTarget.style.transform = "translateY(-1px)";
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (inactive) return;
        const v = VARIANTS[variant];
        e.currentTarget.style.background = v.background as string;
        e.currentTarget.style.boxShadow = (v.boxShadow as string) ?? "none";
        e.currentTarget.style.transform = "none";
        rest.onMouseLeave?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

/** Indicateur de travail hérité de la couleur du texte : il fonctionne donc sur
 *  les quatre variantes sans être paramétré. */
function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 13,
        height: 13,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        opacity: 0.8,
        animation: "spin .7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}
