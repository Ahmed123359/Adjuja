// Decoupe depuis pages/AoPipelinePage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        background: "var(--adj-panel-2)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 3,
          background: "linear-gradient(90deg, var(--adj-brand), #22c55e)",
          width: `${pct}%`,
          transition: "width .7s ease",
        }}
      />
    </div>
  );
}
