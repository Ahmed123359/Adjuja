// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--l-card)",
        border: "1px solid var(--l-card-border)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--l-sub)", fontWeight: 500 }}>
          {label}
        </span>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "var(--l-blue-a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--l-blue)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--l-text)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}
