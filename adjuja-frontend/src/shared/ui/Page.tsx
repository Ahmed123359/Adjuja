// Gabarit de page. Corrige deux défauts structurels relevés sur les captures
// du 2026-09-12 :
//
//   - les largeurs ne se répondaient pas d'un écran à l'autre (en-tête pleine
//     largeur, liste ~1000px, formulaire ~260px) : une seule largeur ici ;
//   - le contenu était collé en haut avec 40 à 60% de hauteur vide : le fond
//     couvre désormais toute la zone et la page respire par le haut comme par
//     le bas.

export function Page({
  title, subtitle, actions, children, width = "wide",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** "narrow" pour les formulaires courts, "wide" par défaut, "full" pour les
   *  écrans denses (tableau de bord) qui doivent occuper toute la largeur au
   *  lieu de laisser deux marges vides de chaque côté. */
  width?: "narrow" | "wide" | "full";
}) {
  return (
    <div
      className="adj-app-bg adj-scroll"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
      }}

    >
      <div
        style={{
          maxWidth: width === "narrow" ? 560 : width === "full" ? "none" : "var(--layout-max)",
          margin: "0 auto",
          // En pleine largeur la barre du haut a deja donne l'air en haut : on
          // n'y ajoute qu'un demi-pas, sinon le titre d'accueil descend trop bas.
          padding: width === "full"
            ? "var(--s-2) var(--s-6) var(--s-8)"
            : `var(--s-8) var(--layout-gutter) var(--s-12)`,
          display: "flex",
          flexDirection: "column",
          gap: width === "full" ? "var(--s-5)" : "var(--s-6)",
          minHeight: "100%",
        }}
      >
        {(title || actions) && (
          <header
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "var(--s-4)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              {typeof title === "string" ? (
                <h1
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: width === "full" ? "var(--t-2xl)" : "26px",
                    fontWeight: "var(--t-w-bold)" as never,
                    color: "var(--tx-strong)",
                    lineHeight: "var(--t-lead-tight)" as never,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {title}
                </h1>
              ) : title}
              {subtitle && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "var(--t-base)",
                    color: "var(--tx-muted)",
                    lineHeight: "var(--t-lead-normal)" as never,
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div style={{ display: "flex", gap: "var(--s-3)", flexShrink: 0 }}>{actions}</div>
            )}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

/** Grille responsive sans media query : les tuiles se replacent selon la place
 *  disponible, ce qui évite d'avoir à décider de points de rupture. */
export function Grid({
  min = 220, gap = "var(--s-4)", children,
}: {
  min?: number;
  gap?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}
