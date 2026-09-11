// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchCompanyProfile, upsertCompanyProfile } from "../api";
import type { AoCategorie, CompanyProfile, CompanyProfileForm } from "../../../types";
import SecteurPicker from "../../veille/components/SecteurPicker";
import CategorieSelect from "../../veille/components/CategorieSelect";
import { StringListField, StructuredListField } from "../../veille/components/RepeatableListField";
import { SectionCard } from "../components/SectionCard";
import { Field } from "../components/Field";
import { NotificationPreferencesSection } from "../components/NotificationPreferencesSection";
import { OrgMembersSection } from "../components/OrgMembersSection";
import { inputStyle } from "../styles";
import { AO_CATEGORIES } from "../constants";

const EMPTY_FORM: CompanyProfileForm = {
  nom_entreprise: "",
  ice: "",
  rc: "",
  if_fiscal: "",
  cnss: "",
  capital_social: "",
  rib: "",
  forme_juridique: "",
  adresse: "",
  ville: "",
  telephone: "",
  email: "",
  gerant_nom: "",
  gerant_prenom: "",
  gerant_cin: "",
  secteur: "",
  extra: null,
};

export function ProfileTab({ onProfileSaved }: { onProfileSaved: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CompanyProfileForm>(EMPTY_FORM);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Loupe locale (non sauvegardee) : cadre la liste d'activites affichee
  // dans le picker, sans jamais effacer les secteurs deja selectionnes
  // dans une autre categorie -- une entreprise peut couvrir plusieurs categories.
  const [secteurCategorieLens, setSecteurCategorieLens] = useState<AoCategorie | "">("");

  useEffect(() => {
    fetchCompanyProfile()
      .then((p) => {
        if (p) {
          setProfile(p);
          const { id, org_id, created_at, updated_at, complet, ...rest } = p;
          void id;
          void org_id;
          void created_at;
          void updated_at;
          void complet;
          setForm(rest);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: keyof CompanyProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const secteursInteret = Array.isArray(form.extra?.secteurs_interet)
    ? (form.extra!.secteurs_interet as string[])
    : [];

  const handleSecteursChange = (codes: string[]) => {
    setForm((prev) => ({ ...prev, extra: { ...prev.extra, secteurs_interet: codes } }));
    setSaved(false);
  };

  const agrements = Array.isArray(form.extra?.agrements)
    ? (form.extra!.agrements as Record<string, string>[])
    : [];
  const classifications = Array.isArray(form.extra?.classifications)
    ? (form.extra!.classifications as Record<string, string>[])
    : [];
  const certifications = Array.isArray(form.extra?.certifications)
    ? (form.extra!.certifications as string[])
    : [];
  const referencesSimilaires = Array.isArray(form.extra?.references_similaires)
    ? (form.extra!.references_similaires as Record<string, string>[])
    : [];
  const chiffreAffairesMoyen = typeof form.extra?.chiffre_affaires_moyen === "string"
    ? (form.extra!.chiffre_affaires_moyen as string)
    : "";

  const updateExtra = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, extra: { ...prev.extra, [key]: value } }));
    setSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const p = await upsertCompanyProfile(form);
      setProfile(p);
      setSaved(true);
      onProfileSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("dashboard.profile.error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 160,
        }}
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

  const requiredKeys: (keyof CompanyProfileForm)[] = [
    "nom_entreprise",
    "secteur",
    "ice",
    "gerant_nom",
    "gerant_prenom",
    "adresse",
  ];
  const isComplete = requiredKeys.every((k) => !!(form[k] as string));

  const statusStyle = profile?.complet
    ? {
        bg: "rgba(34,197,94,0.08)",
        border: "rgba(34,197,94,0.25)",
        color: "#16a34a",
        dot: "#16a34a",
      }
    : {
        bg: "rgba(245,158,11,0.08)",
        border: "rgba(245,158,11,0.25)",
        color: "#d97706",
        dot: "#f59e0b",
      };

  const statusMsg = profile?.complet
    ? t("dashboard.profile.complete")
    : profile
      ? t("dashboard.profile.incompleteProfile")
      : t("dashboard.profile.notConfigured");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <form
      onSubmit={handleSave}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Status banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 10,
          background: statusStyle.bg,
          border: `1px solid ${statusStyle.border}`,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: statusStyle.dot,
            flexShrink: 0,
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: statusStyle.color,
            fontWeight: 500,
          }}
        >
          {statusMsg}
        </p>
      </div>

      {/* Section: Entreprise */}
      <SectionCard title={t("dashboard.profile.sections.company")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px 16px",
          }}
        >
          <Field form={form} onChange={handleChange} t={t}
            fieldKey="nom_entreprise"
            required
            placeholder="SARL Mon Entreprise"
          />
          <Field form={form} onChange={handleChange} t={t}
            fieldKey="secteur"
            required
            placeholder="Informatique, BTP..."
            half
          />
          <Field form={form} onChange={handleChange} t={t} fieldKey="ville" placeholder="Casablanca" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="adresse" required />
        </div>
      </SectionCard>

      {/* Section: Secteurs d'activite */}
      <SectionCard title={t("dashboard.profile.sections.activites")}>
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--l-sub)" }}>
          {t("dashboard.profile.activitesHint")}
        </p>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
            {t("veille.filters.categorie")}
          </label>
          <CategorieSelect
            value={secteurCategorieLens}
            onChange={setSecteurCategorieLens}
            options={[
              { value: "", label: t("veille.filters.categorieAll") },
              ...AO_CATEGORIES.map((cat) => ({ value: cat, label: t(`veille.categories.${cat}`) })),
            ]}
          />
        </div>
        <SecteurPicker
          selected={secteursInteret}
          onChange={handleSecteursChange}
          categorieFilter={secteurCategorieLens}
        />
      </SectionCard>

      {/* Section: Qualifications et references */}
      <SectionCard title={t("dashboard.profile.sections.qualifications")}>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--l-sub)" }}>
          {t("dashboard.profile.qualificationsHint")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
              {t("dashboard.profile.fields.agrements")}
            </label>
            <StructuredListField
              rows={agrements}
              onChange={(rows) => updateExtra("agrements", rows)}
              addLabel={t("dashboard.profile.addAgrement")}
              fields={[
                { key: "domaine", placeholder: t("dashboard.profile.fields.agrementDomaine") },
                { key: "numero", placeholder: t("dashboard.profile.fields.agrementNumero") },
              ]}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
              {t("dashboard.profile.fields.classifications")}
            </label>
            <StructuredListField
              rows={classifications}
              onChange={(rows) => updateExtra("classifications", rows)}
              addLabel={t("dashboard.profile.addClassification")}
              fields={[
                { key: "domaine", placeholder: t("dashboard.profile.fields.domaine") },
                { key: "categorie", placeholder: t("dashboard.profile.fields.categorie") },
                { key: "classe", placeholder: t("dashboard.profile.fields.classe") },
              ]}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
              {t("dashboard.profile.fields.certifications")}
            </label>
            <StringListField
              items={certifications}
              onChange={(items) => updateExtra("certifications", items)}
              placeholder={t("dashboard.profile.certificationPh")}
              addLabel={t("dashboard.profile.addCertification")}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
              {t("dashboard.profile.fields.references_similaires")}
            </label>
            <StructuredListField
              rows={referencesSimilaires}
              onChange={(rows) => updateExtra("references_similaires", rows)}
              addLabel={t("dashboard.profile.addReference")}
              fields={[
                { key: "intitule", placeholder: t("dashboard.profile.fields.intitule") },
                { key: "montant", placeholder: t("dashboard.profile.fields.montant"), type: "number" },
                { key: "annee", placeholder: t("dashboard.profile.fields.annee"), type: "number" },
              ]}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--l-sub)", marginBottom: 6 }}>
              {t("dashboard.profile.fields.chiffre_affaires_moyen")}
            </label>
            <input
              type="number"
              value={chiffreAffairesMoyen}
              onChange={(e) => updateExtra("chiffre_affaires_moyen", e.target.value)}
              placeholder={t("dashboard.profile.caPh")}
              style={inputStyle}
            />
          </div>
        </div>
      </SectionCard>

      {/* Section: Identifiants légaux */}
      <SectionCard title={t("dashboard.profile.sections.legal")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 16px",
          }}
        >
          <Field form={form} onChange={handleChange} t={t} fieldKey="forme_juridique" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="capital_social" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="ice" required placeholder="15 chiffres" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="rc" placeholder="12345" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="if_fiscal" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="cnss" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="rib" half />
        </div>
      </SectionCard>

      {/* Section: Gérant */}
      <SectionCard title={t("dashboard.profile.sections.manager")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 16px",
          }}
        >
          <Field form={form} onChange={handleChange} t={t} fieldKey="gerant_nom" required half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="gerant_prenom" required half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="gerant_cin" half />
        </div>
      </SectionCard>

      {/* Section: Contact */}
      <SectionCard title={t("dashboard.profile.sections.contact")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 16px",
          }}
        >
          <Field form={form} onChange={handleChange} t={t} fieldKey="telephone" half />
          <Field form={form} onChange={handleChange} t={t} fieldKey="email" half />
        </div>
      </SectionCard>

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{error}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={saving || !isComplete}
          style={{
            padding: "10px 24px",
            borderRadius: 9,
            border: "none",
            background:
              saving || !isComplete ? "var(--l-dim)" : "var(--l-blue)",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: saving || !isComplete ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "opacity .15s",
          }}
          onMouseEnter={(e) => {
            if (!saving && isComplete) e.currentTarget.style.opacity = ".85";
          }}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          {saving ? t("dashboard.profile.saving") : t("dashboard.profile.save")}
        </button>
        {saved && (
          <span
            style={{
              fontSize: 13,
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
            {t("dashboard.profile.saved")}
          </span>
        )}
        {!isComplete && !saved && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--l-dim)" }}>
            {t("dashboard.profile.requiredIncomplete")}
          </p>
        )}
      </div>
    </form>
    <NotificationPreferencesSection secteursInteretDefault={secteursInteret} />
    <OrgMembersSection />
    </div>
  );
}

// ── Signature & Cachet ─────────────────────────────────────
