// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

export function Spinner() {
  return (
    <div
      style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "2px solid var(--l-card-border)",
          borderTopColor: "var(--l-blue)",
          animation: "spin 1s linear infinite",
        }}
      />
    </div>
  );
}

// ── Generation ─────────────────────────────────────────────
