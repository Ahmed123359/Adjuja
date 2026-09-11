// Espace entreprise : reglages en 6 onglets.
// Les onglets vivent dans ./tabs/ et les composants dans ./components/
// depuis le 2026-09-12. Le chantier dashboard-collaboratif prevoit de
// renommer cette page en espace Parametres ; non fait ici (deplacement pur).

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { checkCompanyProfile } from "./api";
import type { ProfileCheck } from "../../types";
import { OverviewTab } from "./tabs/OverviewTab";
import { ProfileTab } from "./tabs/ProfileTab";
import { SignatureTab } from "./tabs/SignatureTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { EquipeTab } from "./tabs/EquipeTab";
import { GenerationTab } from "./tabs/GenerationTab";

type DashTab =
  | "overview"
  | "profile"
  | "signature"
  | "documents"
  | "equipe"
  | "generation";

export default function DashboardPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DashTab>("overview");
  const [profileCheck, setProfileCheck] = useState<ProfileCheck | null>(null);

  const loadCheck = useCallback(() => {
    checkCompanyProfile()
      .then(setProfileCheck)
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadCheck();
  }, [loadCheck]);

  const TABS: { id: DashTab; label: string }[] = [
    { id: "overview", label: t("dashboard.tabs.overview") },
    { id: "profile", label: t("dashboard.tabs.profile") },
    { id: "signature", label: "Paraphe & Cachet" },
    { id: "documents", label: "Documents" },
    { id: "equipe", label: "Equipe / CVs" },
    { id: "generation", label: t("dashboard.tabs.generation") },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          padding: "0 28px",
          borderBottom: "1px solid var(--l-card-border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: "var(--l-card)",
          overflowX: "auto",
        }}
      >
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              position: "relative",
              padding: "14px 14px",
              background: "none",
              border: "none",
              whiteSpace: "nowrap",
              fontSize: 13,
              fontWeight: tab === tb.id ? 600 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
              color: tab === tb.id ? "var(--l-text)" : "var(--l-sub)",
              transition: "color .15s",
            }}
          >
            {tb.label}
            {tb.id === "profile" && profileCheck && !profileCheck.complet && (
              <span
                style={{
                  position: "absolute",
                  top: 10,
                  right: 6,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#f59e0b",
                }}
              />
            )}
            {tab === tb.id && (
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "var(--l-blue)",
                  borderRadius: "2px 2px 0 0",
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", width: "100%" }}>
          {tab === "overview" && <OverviewTab profileCheck={profileCheck} />}
          {tab === "profile" && <ProfileTab onProfileSaved={loadCheck} />}
          {tab === "signature" && <SignatureTab />}
          {tab === "documents" && <DocumentsTab />}
          {tab === "equipe" && <EquipeTab />}
          {tab === "generation" && <GenerationTab />}
        </div>
      </div>
    </div>
  );
}
