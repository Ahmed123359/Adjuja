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
    { id: "signature", label: t("dashboard.tabs.signature") },
    { id: "documents", label: t("dashboard.tabs.documents") },
    { id: "equipe", label: t("dashboard.tabs.equipe") },
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
      {/* Barre d'onglets, sur le socle --adj-* : libelles a 15px, soulignement
          de marque sur l'onglet actif. */}
      <div
        role="tablist"
        className="adj-scroll"
        style={{
          padding: "0 var(--adj-6)",
          borderBottom: "1px solid var(--adj-hairline)",
          flexShrink: 0,
          display: "flex",
          alignItems: "stretch",
          gap: "var(--adj-1)",
          background: "var(--adj-panel)",
          overflowX: "auto",
        }}
      >
        {TABS.map((tb) => {
          const actif = tab === tb.id;
          return (
            <button
              key={tb.id}
              role="tab"
              aria-selected={actif}
              onClick={() => setTab(tb.id)}
              className="adj-focusable"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 52,
                padding: "0 var(--adj-4)",
                background: "none",
                border: "none",
                whiteSpace: "nowrap",
                fontSize: "var(--adj-t-sm)",
                fontWeight: actif ? 600 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                color: actif ? "var(--adj-ink)" : "var(--adj-ink-3)",
                transition: "color .15s",
              }}
            >
              {tb.label}
              {tb.id === "profile" && profileCheck && !profileCheck.complet && (
                <span
                  aria-label="incomplet"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--adj-hold)",
                  }}
                />
              )}
              {actif && (
                <span
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: "var(--adj-3)",
                    right: "var(--adj-3)",
                    height: 3,
                    background: "var(--adj-brand)",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Contenu : les cinq onglets sont repris sur le socle (2026-09-27).
          Pleine largeur de l'application (--adj-max, comme les outils), grille
          de fractions. L'ancien conteneur de 896px centre laissait deux marges
          vides -- motif rejete dans ui-context.md. Le profil colle sa barre
          d'etat en haut de CE defilement. */}
      <div className="adj-app-bg adj-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{
          maxWidth: "var(--adj-max)", margin: "0 auto",
          padding: "var(--adj-5) var(--adj-6) var(--adj-10)",
        }}>
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
