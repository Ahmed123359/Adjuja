// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--l-card)",
        border: "1px solid var(--l-card-border)",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          padding: "11px 16px",
          borderBottom: "1px solid var(--l-card-border)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--l-text)",
          }}
        >
          {title}
        </p>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

// ── Abonnement ──────────────────────────────────────────────
