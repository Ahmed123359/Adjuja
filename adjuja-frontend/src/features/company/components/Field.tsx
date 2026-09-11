// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useTranslation } from "react-i18next";
import type { CompanyProfileForm } from "../../../types";
import { inputStyle } from "../styles";

export function Field({
  fieldKey,
  form,
  onChange,
  t,
  required,
  placeholder,
  half,
}: {
  fieldKey: keyof CompanyProfileForm;
  form: CompanyProfileForm;
  onChange: (key: keyof CompanyProfileForm, value: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
  required?: boolean;
  placeholder?: string;
  half?: boolean;
}) {
  return (
    <div style={{ gridColumn: half ? undefined : "1 / -1" }}>
      <label
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--l-sub)",
          marginBottom: 4,
        }}
      >
        {t(`dashboard.profile.fields.${fieldKey}`)}
        {required && (
          <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>
        )}
      </label>
      <input
        value={(form[fieldKey] as string) ?? ""}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--l-blue)")}
        onBlur={(e) =>
          (e.currentTarget.style.borderColor = "var(--l-card-border)")
        }
      />
    </div>
  );
}

// ── Preferences de notification ──────────────────────────────
