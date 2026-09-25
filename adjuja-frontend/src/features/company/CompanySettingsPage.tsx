// Espace « Mon entreprise » : les reglages, en 5 onglets.
//
// Etait l'ecran d'accueil de l'application sous le nom DashboardPage, avec un
// 6e onglet « Vue d'ensemble ». Depuis le chantier dashboard-collaboratif
// (2026-09-15), l'accueil est un vrai tableau de bord
// (features/dashboard/DashboardHomePage) et cet ecran ne porte plus que du
// reglage ; on y accede par le pied de la barre laterale.
//
// La « Vue d'ensemble » n'a pas ete supprimee : elle est devenue
// features/dashboard/components/ActivitySection, rendue par le tableau de bord.
// Les 5 onglets restants n'ont pas ete touches, ils sont en production.

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { checkCompanyProfile } from "./api";
import type { ProfileCheck } from "../../types";
import { ProfileTab } from "./tabs/ProfileTab";
import { SignatureTab } from "./tabs/SignatureTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { EquipeTab } from "./tabs/EquipeTab";
import { GenerationTab } from "./tabs/GenerationTab";

type DashTab =
  | "profile"
  | "signature"
  | "documents"
  | "equipe"
  | "generation";

export default function CompanySettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DashTab>("profile");
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

      {/* Contenu.

          Les onglets refondus sur le socle visuel portent eux-memes leur mise en
          page via <Page> : largeur, gouttieres et defilement. Les envelopper
          dans le conteneur ci-dessous produirait un double defilement et une
          largeur bridee a 896px.

          Les autres onglets gardent le conteneur historique le temps d'etre
          repris a leur tour. Deplacer cette frontiere onglet par onglet est
          justement ce qui rend la refonte progressive et verifiable. */}
      {(
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ maxWidth: 896, margin: "0 auto", width: "100%" }}>
            {tab === "profile" && <ProfileTab onProfileSaved={loadCheck} />}
            {tab === "signature" && <SignatureTab />}
            {tab === "documents" && <DocumentsTab />}
            {tab === "equipe" && <EquipeTab />}
            {tab === "generation" && <GenerationTab />}
          </div>
        </div>
      )}
    </div>
  );
}
