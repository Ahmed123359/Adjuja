// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchNotificationPreferences, updateNotificationPreferences, sendTestNotification,
} from "../../notifications/api";
import type { NotificationPreferences } from "../../notifications/api";
import { getMe } from "../../auth/api";
import type { AoCategorie } from "../../../types";
import SecteurPicker from "../../veille/components/SecteurPicker";
import CategorieSelect from "../../veille/components/CategorieSelect";
import CustomSelect from "../../../shared/ui/CustomSelect";
import { SectionCard } from "./SectionCard";
import { inputStyle } from "../styles";
import { AO_CATEGORIES } from "../constants";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}h`,
}));

const NOTIF_DEFAULTS: Omit<NotificationPreferences, "org_id" | "last_notified_at"> = {
  enabled: true,
  secteur_codes: [],
  notify_bdc: false,
  cadence_unit: "day",
  cadence_value: 1,
  send_hour: 8,
  max_items: 50,
};

export function NotificationPreferencesSection({ secteursInteretDefault }: { secteursInteretDefault: string[] }) {
  const { t } = useTranslation();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastNotifiedAt, setLastNotifiedAt] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Omit<NotificationPreferences, "org_id" | "last_notified_at">>(NOTIF_DEFAULTS);
  const [categorieLens, setCategorieLens] = useState<AoCategorie | "">("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((user) => {
        const resolvedOrgId = user.org_id || user.id;
        if (cancelled) return null;
        setOrgId(resolvedOrgId);
        return fetchNotificationPreferences(resolvedOrgId);
      })
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setPrefs({
            enabled: existing.enabled,
            secteur_codes: existing.secteur_codes,
            notify_bdc: existing.notify_bdc,
            cadence_unit: existing.cadence_unit,
            cadence_value: existing.cadence_value,
            send_hour: existing.send_hour,
            max_items: existing.max_items,
          });
          setLastNotifiedAt(existing.last_notified_at);
        } else {
          setPrefs((prev) => ({ ...prev, secteur_codes: secteursInteretDefault }));
        }
      })
      .catch(() => setError(t("dashboard.notifications.loadError")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // secteursInteretDefault n'est lu qu'au premier chargement (préférence
    // absente) -- ProfileTab ne monte ce composant qu'une fois son propre
    // profil chargé, donc la valeur est déjà stable au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateNotificationPreferences(orgId, prefs);
      setLastNotifiedAt(result.last_notified_at);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("dashboard.notifications.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!orgId) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await sendTestNotification(orgId, prefs);
      if (result.sent) {
        setTestResult({
          ok: true,
          message: t("dashboard.notifications.testResultSent", { email: result.recipient, count: result.ao_count }),
        });
      } else if (result.reason === "no_matching_aos") {
        setTestResult({ ok: false, message: t("dashboard.notifications.testResultNoAos") });
      } else if (result.reason === "no_email") {
        setTestResult({ ok: false, message: t("dashboard.notifications.testResultNoEmail") });
      } else {
        setTestResult({ ok: false, message: t("dashboard.notifications.testResultFailed") });
      }
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : t("dashboard.notifications.testResultError") });
    } finally {
      setTestSending(false);
    }
  };

  const lastNotifiedDisplay = (() => {
    if (!lastNotifiedAt) return t("dashboard.notifications.lastNotifiedNever");
    const days = Math.floor((Date.now() - new Date(lastNotifiedAt).getTime()) / 86_400_000);
    if (days <= 0) return t("dashboard.notifications.lastNotifiedToday");
    return t("dashboard.notifications.lastNotifiedDaysAgo", { count: days });
  })();

  if (loading) {
    return (
      <SectionCard title={t("dashboard.notifications.title")}>
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
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
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("dashboard.notifications.title")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--l-sub)" }}>
          {t("dashboard.notifications.hint")}
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", width: "fit-content" }}>
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => {
              setPrefs((p) => ({ ...p, enabled: e.target.checked }));
              setSaved(false);
            }}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: "var(--l-text)", fontWeight: 500 }}>
            {t("dashboard.notifications.enabledLabel")}
          </span>
        </label>

        {prefs.enabled && (
          <>
            <div>
              <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
                {t("dashboard.notifications.sectorsLabel")}
              </label>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--l-dim)" }}>
                {t("dashboard.notifications.sectorsHint")}
              </p>
              <div style={{ marginBottom: 10 }}>
                <CategorieSelect
                  value={categorieLens}
                  onChange={setCategorieLens}
                  options={[
                    { value: "", label: t("veille.filters.categorieAll") },
                    ...AO_CATEGORIES.map((cat) => ({ value: cat, label: t(`veille.categories.${cat}`) })),
                  ]}
                />
              </div>
              <SecteurPicker
                selected={prefs.secteur_codes}
                onChange={(codes) => {
                  setPrefs((p) => ({ ...p, secteur_codes: codes }));
                  setSaved(false);
                }}
                categorieFilter={categorieLens}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px 16px" }}>
              <div>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
                  {t("dashboard.notifications.cadenceLabel")}
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={prefs.cadence_value}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                      setPrefs((p) => ({ ...p, cadence_value: v }));
                      setSaved(false);
                    }}
                    style={{ ...inputStyle, width: 60, flexShrink: 0 }}
                  />
                  <CustomSelect
                    value={prefs.cadence_unit}
                    onChange={(v) => {
                      setPrefs((p) => ({ ...p, cadence_unit: v as NotificationPreferences["cadence_unit"] }));
                      setSaved(false);
                    }}
                    options={[
                      { value: "day", label: t("dashboard.notifications.cadenceUnit.day") },
                      { value: "week", label: t("dashboard.notifications.cadenceUnit.week") },
                      { value: "month", label: t("dashboard.notifications.cadenceUnit.month") },
                    ]}
                    placeholder={t("dashboard.notifications.cadenceUnit.day")}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
                  {t("dashboard.notifications.hourLabel")}
                </label>
                <CustomSelect
                  value={String(prefs.send_hour)}
                  onChange={(v) => {
                    setPrefs((p) => ({ ...p, send_hour: Number(v) }));
                    setSaved(false);
                  }}
                  options={HOUR_OPTIONS}
                  placeholder="08h"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
                  {t("dashboard.notifications.maxItemsLabel")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={prefs.max_items}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(200, Number(e.target.value) || 1));
                    setPrefs((p) => ({ ...p, max_items: v }));
                    setSaved(false);
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 12, color: "var(--l-dim)" }}>
              {t("dashboard.notifications.lastNotifiedLabel")} : {lastNotifiedDisplay}
            </p>
          </>
        )}

        {error && <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{error}</p>}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: 9,
              border: "none",
              background: saving ? "var(--l-dim)" : "var(--l-blue)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "opacity .15s",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.opacity = ".85";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {saving ? t("dashboard.notifications.saving") : t("dashboard.notifications.save")}
          </button>

          {prefs.enabled && (
            <button
              type="button"
              onClick={handleTestSend}
              disabled={testSending}
              title={t("dashboard.notifications.testHint")}
              style={{
                padding: "10px 20px",
                borderRadius: 9,
                border: "1px solid var(--l-card-border)",
                background: "transparent",
                color: testSending ? "var(--l-dim)" : "var(--l-text)",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: testSending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "border-color .15s",
              }}
              onMouseEnter={(e) => {
                if (!testSending) e.currentTarget.style.borderColor = "var(--l-blue)";
              }}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--l-card-border)")}
            >
              {testSending ? t("dashboard.notifications.testSending") : t("dashboard.notifications.testSend")}
            </button>
          )}

          {saved && (
            <span style={{ fontSize: 13, color: "#16a34a", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {t("dashboard.notifications.saved")}
            </span>
          )}
        </div>

        {prefs.enabled && !testResult && (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--l-dim)" }}>
            {t("dashboard.notifications.testHint")}
          </p>
        )}
        {testResult && (
          <p style={{ margin: 0, fontSize: 12, color: testResult.ok ? "#16a34a" : "#dc2626" }}>
            {testResult.message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

// ── Membres de l'organisation ──────────────────────────────
