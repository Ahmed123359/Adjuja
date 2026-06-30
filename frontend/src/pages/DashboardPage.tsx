import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchAos,
  fetchCompanyProfile,
  upsertCompanyProfile,
  checkCompanyProfile,
  uploadSignature,
  uploadCachet,
  deleteSignature,
  deleteCachet,
  uploadLuEtAccepte,
  deleteLuEtAccepte,
  uploadTemplateNoteMetho,
  deleteTemplateNoteMetho,
  fetchCompanyDocuments,
  uploadCompanyDocument,
  deleteCompanyDocument,
  fetchStaffCvs,
  createStaffCv,
  updateStaffCv,
  deleteStaffCv,
  uploadCvPdf,
  extractCvFromPdf,
} from "../api";
import SecteurPicker from "../components/veille/SecteurPicker";
import CategorieSelect from "../components/veille/CategorieSelect";
import { StringListField, StructuredListField } from "../components/veille/RepeatableListField";
import type {
  AoCategorie,
  AoSummary,
  CompanyProfile,
  CompanyProfileForm,
  ProfileCheck,
  StaffCv,
  StaffCvForm,
  CompanyDocument,
} from "../types";

const AO_CATEGORIES: AoCategorie[] = ["Travaux", "Fournitures", "Services"];

type DashTab =
  | "overview"
  | "profile"
  | "signature"
  | "documents"
  | "equipe"
  | "generation";

const COMPANY_DOC_TYPES: { value: string; label: string }[] = [
  { value: "pouvoir_gerance", label: "Pouvoir de gérance" },
  { value: "attestation_fiscale", label: "Attestation fiscale" },
  { value: "attestation_cnas", label: "Attestation CNAS" },
  { value: "attestation_casnos", label: "Attestation CASNOS" },
  { value: "reference_realisation", label: "Référence de réalisation" },
  { value: "diplome", label: "Diplôme" },
  { value: "autre", label: "Autre" },
];

const STATUT_BADGE: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  brouillon: {
    bg: "var(--l-input-bg)",
    color: "var(--l-sub)",
    border: "var(--l-card-border)",
  },
  en_analyse: {
    bg: "rgba(30,136,229,0.10)",
    color: "#1E88E5",
    border: "rgba(30,136,229,0.25)",
  },
  en_traitement: {
    bg: "rgba(245,158,11,0.10)",
    color: "#d97706",
    border: "rgba(245,158,11,0.25)",
  },
  termine: {
    bg: "rgba(34,197,94,0.10)",
    color: "#16a34a",
    border: "rgba(34,197,94,0.25)",
  },
  erreur: {
    bg: "rgba(220,38,38,0.07)",
    color: "#dc2626",
    border: "rgba(220,38,38,0.20)",
  },
};

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid var(--l-card-border)",
  background: "var(--l-input-bg)",
  color: "var(--l-text)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color .15s",
};

function StatCard({
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

function SectionCard({
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
        overflow: "hidden",
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

// ── Overview ────────────────────────────────────────────────
function OverviewTab({ profileCheck }: { profileCheck: ProfileCheck | null }) {
  const { t } = useTranslation();
  const [aos, setAos] = useState<AoSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAos()
      .then(setAos)
      .finally(() => setLoading(false));
  }, []);

  const total = aos.length;
  const enCours = aos.filter((a) =>
    ["en_analyse", "en_traitement"].includes(a.statut),
  ).length;
  const termines = aos.filter((a) => a.statut === "termine").length;
  const erreurs = aos.filter((a) => a.statut === "erreur").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {profileCheck && !profileCheck.complet && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#d97706"
            strokeWidth={2}
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <p
              style={{
                margin: "0 0 2px",
                fontSize: 13,
                fontWeight: 600,
                color: "#d97706",
              }}
            >
              {t("dashboard.overview.profileWarning")}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#b45309" }}>
              {profileCheck.message ||
                t("dashboard.overview.profileWarningDesc")}
            </p>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard
          label={t("dashboard.overview.total")}
          value={total}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <StatCard
          label={t("dashboard.overview.inProgress")}
          value={enCours}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label={t("dashboard.overview.completed")}
          value={termines}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label={t("dashboard.overview.errors")}
          value={erreurs}
          icon={
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          }
        />
      </div>

      <SectionCard title={t("dashboard.overview.recentTitle")}>
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "24px 0",
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
        ) : !aos.length ? (
          <p
            style={{
              textAlign: "center",
              padding: "24px 0",
              fontSize: 13,
              color: "var(--l-dim)",
              margin: 0,
            }}
          >
            {t("dashboard.overview.noAos")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {aos.slice(0, 8).map((ao, i) => {
              const badge = STATUT_BADGE[ao.statut] ?? STATUT_BADGE.brouillon;
              return (
                <div
                  key={ao.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 0",
                    borderTop:
                      i > 0 ? "1px solid var(--l-card-border)" : "none",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: "0 0 2px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--l-text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {ao.reference || t("pipeline.detail.noRef")}
                    </p>
                    {ao.acheteur && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: "var(--l-sub)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ao.acheteur}
                      </p>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexShrink: 0,
                      marginLeft: 12,
                    }}
                  >
                    {["en_analyse", "en_traitement"].includes(ao.statut) && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--l-dim)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {ao.pipeline_pct}%
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {t(`pipeline.status.${ao.statut}`) ?? ao.statut}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────
function ProfileTab({ onProfileSaved }: { onProfileSaved: () => void }) {
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

  function Field({
    fieldKey,
    required,
    placeholder,
    half,
  }: {
    fieldKey: keyof CompanyProfileForm;
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
          onChange={(e) => handleChange(fieldKey, e.target.value)}
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

  return (
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
          <Field
            fieldKey="nom_entreprise"
            required
            placeholder="SARL Mon Entreprise"
          />
          <Field
            fieldKey="secteur"
            required
            placeholder="Informatique, BTP..."
            half
          />
          <Field fieldKey="ville" placeholder="Casablanca" half />
          <Field fieldKey="adresse" required />
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
          <Field fieldKey="ice" required placeholder="15 chiffres" half />
          <Field fieldKey="rc" placeholder="12345" half />
          <Field fieldKey="if_fiscal" half />
          <Field fieldKey="cnss" half />
          <Field fieldKey="capital_social" half />
          <Field fieldKey="rib" half />
          <Field fieldKey="forme_juridique" half />
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
          <Field fieldKey="gerant_nom" required half />
          <Field fieldKey="gerant_prenom" required half />
          <Field fieldKey="gerant_cin" half />
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
          <Field fieldKey="telephone" half />
          <Field fieldKey="email" half />
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
  );
}

// ── Signature & Cachet ─────────────────────────────────────
function SignatureTab() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<"signature" | "cachet" | "lu_et_accepte" | null>(null);
  const [deleting, setDeleting] = useState<"signature" | "cachet" | "lu_et_accepte" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const cacRef = useRef<HTMLInputElement>(null);
  const leaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCompanyProfile()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (type: "signature" | "cachet" | "lu_et_accepte", file: File) => {
    setUploading(type);
    setError(null);
    try {
      const updated =
        type === "signature" ? await uploadSignature(file)
        : type === "cachet"  ? await uploadCachet(file)
        : await uploadLuEtAccepte(file);
      setProfile(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (type: "signature" | "cachet" | "lu_et_accepte") => {
    setDeleting(type);
    setError(null);
    try {
      const updated =
        type === "signature" ? await deleteSignature()
        : type === "cachet"  ? await deleteCachet()
        : await deleteLuEtAccepte();
      setProfile(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur suppression");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <Spinner />;

  const imgStyle: React.CSSProperties = {
    width: 160,
    height: 80,
    objectFit: "contain",
    border: "1px solid var(--l-card-border)",
    borderRadius: 8,
    background: "var(--l-input-bg)",
    padding: 8,
  };
  const placeholderStyle: React.CSSProperties = {
    ...imgStyle,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--l-dim)",
    fontSize: 12,
  };
  const btnOutlineStyle: React.CSSProperties = {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid var(--l-blue)",
    background: "transparent",
    color: "var(--l-blue)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const btnDangerStyle: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid rgba(220,38,38,0.5)",
    background: "transparent",
    color: "#dc2626",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionCard title="Paraphe du gérant">
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {profile?.signature_url ? (
            <img src={profile.signature_url} alt="Signature" style={imgStyle} />
          ) : (
            <div style={placeholderStyle as React.CSSProperties}>Aucune signature</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--l-sub)" }}>
              Petite signature apposée sur chaque page du CPS et RC uniquement
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => sigRef.current?.click()}
                disabled={uploading === "signature" || deleting === "signature"}
                style={btnOutlineStyle}
              >
                {uploading === "signature" ? "Upload..." : profile?.signature_url ? "Remplacer" : "Uploader"}
              </button>
              {profile?.signature_url && (
                <button
                  onClick={() => handleDelete("signature")}
                  disabled={deleting === "signature" || uploading === "signature"}
                  style={btnDangerStyle}
                >
                  {deleting === "signature" ? "..." : "Supprimer"}
                </button>
              )}
            </div>
            <input ref={sigRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUpload("signature", e.target.files[0])} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cachet de l'entreprise">
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {profile?.cachet_url ? (
            <img src={profile.cachet_url} alt="Cachet" style={{ ...imgStyle, width: 100, height: 100 }} />
          ) : (
            <div style={{ ...placeholderStyle, width: 100, height: 100 } as React.CSSProperties}>Aucun cachet</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--l-sub)" }}>
              Image PNG ou JPEG apposée avec la signature sur la dernière page
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => cacRef.current?.click()}
                disabled={uploading === "cachet" || deleting === "cachet"}
                style={btnOutlineStyle}
              >
                {uploading === "cachet" ? "Upload..." : profile?.cachet_url ? "Remplacer" : "Uploader"}
              </button>
              {profile?.cachet_url && (
                <button
                  onClick={() => handleDelete("cachet")}
                  disabled={deleting === "cachet" || uploading === "cachet"}
                  style={btnDangerStyle}
                >
                  {deleting === "cachet" ? "..." : "Supprimer"}
                </button>
              )}
            </div>
            <input ref={cacRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUpload("cachet", e.target.files[0])} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Lu et accepté (optionnel)">
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 9, background: 'rgba(30,136,229,0.07)', border: '1px solid rgba(30,136,229,0.2)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--l-sub)', lineHeight: 1.6 }}>
            Image manuscrite apposée en bas de chaque page du CPS et RC. Si absente, le texte "Lu et accepté" est généré automatiquement.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {profile?.lu_et_accepte_url ? (
            <img src={profile.lu_et_accepte_url} alt="Lu et accepté" style={imgStyle} />
          ) : (
            <div style={placeholderStyle as React.CSSProperties}>Aucune image</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => leaRef.current?.click()}
                disabled={uploading === "lu_et_accepte" || deleting === "lu_et_accepte"}
                style={btnOutlineStyle}
              >
                {uploading === "lu_et_accepte" ? "Upload..." : profile?.lu_et_accepte_url ? "Remplacer" : "Uploader"}
              </button>
              {profile?.lu_et_accepte_url && (
                <button
                  onClick={() => handleDelete("lu_et_accepte")}
                  disabled={deleting === "lu_et_accepte" || uploading === "lu_et_accepte"}
                  style={btnDangerStyle}
                >
                  {deleting === "lu_et_accepte" ? "..." : "Supprimer"}
                </button>
              )}
            </div>
            <input ref={leaRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUpload("lu_et_accepte", e.target.files[0])} />
          </div>
        </div>
      </SectionCard>

      {/* Template note méthodologique */}
      <SectionCard title="Template note méthodologique (optionnel)">
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: 'rgba(30,136,229,0.07)', border: '1px solid rgba(30,136,229,0.2)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--l-sub)', lineHeight: 1.6 }}>
            Uploadez votre template DOCX pour que chaque note méthodologique hérite de votre charte graphique
            (logo, couleurs, polices, header, footer). Sans template, un design standard est utilisé.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--l-dim)' }}>
            Le template doit être un fichier .docx avec vos styles Word configurés (Heading 1/2, Normal).
            Le contenu du corps sera remplacé par le texte généré.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {profile?.template_note_metho_minio_key ? (
              <span style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Template configuré
              </span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--l-dim)' }}>Aucun template  design par défaut utilisé</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <TemplateUploadButton profile={profile} setProfile={setProfile} setError={setError} />
            {profile?.template_note_metho_minio_key && (
              <>
                {profile.template_note_metho_url && (
                  <a href={profile.template_note_metho_url} download
                    style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'transparent', color: 'var(--l-sub)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    Télécharger
                  </a>
                )}
                <TemplateDeleteButton profile={profile} setProfile={setProfile} setError={setError} />
              </>
            )}
          </div>
        </div>
      </SectionCard>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

function TemplateUploadButton({ profile, setProfile, setError }: {
  profile: CompanyProfile | null;
  setProfile: (p: CompanyProfile) => void;
  setError: (e: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = async (file: File) => {
    setUploading(true); setError(null);
    try { setProfile(await uploadTemplateNoteMetho(file)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur upload"); }
    finally { setUploading(false); }
  };
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={uploading}
        style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--l-blue)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
        {uploading ? "Upload..." : profile?.template_note_metho_minio_key ? "Remplacer" : "Uploader .docx"}
      </button>
      <input ref={ref} type="file" accept=".docx" style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handle(e.target.files[0])} />
    </>
  );
}

function TemplateDeleteButton({ profile, setProfile, setError }: {
  profile: CompanyProfile | null;
  setProfile: (p: CompanyProfile) => void;
  setError: (e: string | null) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const handle = async () => {
    setDeleting(true); setError(null);
    try { setProfile(await deleteTemplateNoteMetho()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur suppression"); }
    finally { setDeleting(false); }
  };
  return (
    <button onClick={handle} disabled={deleting}
      style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(220,38,38,0.3)', background: 'transparent', color: '#dc2626', fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
      {deleting ? "..." : "Supprimer"}
    </button>
  );
}

// ── Documents permanents ────────────────────────────────────
function DocumentsTab() {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selType, setSelType] = useState(COMPANY_DOC_TYPES[0].value);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetchCompanyDocuments()
      .then(setDocs)
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await uploadCompanyDocument(file, selType);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompanyDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur suppression");
    }
  };

  if (loading) return <Spinner />;

  const grouped = COMPANY_DOC_TYPES.reduce<Record<string, CompanyDocument[]>>(
    (acc, t) => {
      acc[t.value] = docs.filter((d) => d.doc_type === t.value);
      return acc;
    },
    {},
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Upload */}
      <SectionCard title="Ajouter un document">
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={selType}
            onChange={(e) => setSelType(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 7,
              border: "1px solid var(--l-card-border)",
              background: "var(--l-input-bg)",
              color: "var(--l-text)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            {COMPANY_DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: "var(--l-blue)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {uploading ? "Upload..." : "Choisir un fichier"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            style={{ display: "none" }}
            onChange={(e) =>
              e.target.files?.[0] && handleUpload(e.target.files[0])
            }
          />
        </div>
        {error && (
          <p style={{ color: "#dc2626", fontSize: 12, margin: "8px 0 0" }}>
            {error}
          </p>
        )}
      </SectionCard>

      {/* Liste par type */}
      {COMPANY_DOC_TYPES.map(({ value, label }) => {
        const typeDocs = grouped[value] ?? [];
        return (
          <SectionCard key={value} title={label}>
            {typeDocs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--l-dim)" }}>
                Aucun document
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {typeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--l-card-border)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--l-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {doc.nom_fichier}
                      </p>
                      {doc.date_validite && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 11,
                            color: "var(--l-dim)",
                          }}
                        >
                          Valide jusqu'au {doc.date_validite}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexShrink: 0,
                        marginLeft: 12,
                      }}
                    >
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 12,
                            color: "var(--l-blue)",
                            textDecoration: "none",
                          }}
                        >
                          Voir
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(doc.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#dc2626",
                          fontSize: 12,
                          padding: 0,
                          fontFamily: "inherit",
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

// ── Equipe / CVs ────────────────────────────────────────────
const EMPTY_CV: StaffCvForm = {
  nom: "", prenom: "", poste: "", specialite: "", diplome: "",
  annees_experience: 0, actif: true, details: null,
};

type EquipeMode = "list" | "extracting" | "confirm" | "edit";

function EquipeTab() {
  const [cvs, setCvs]               = useState<StaffCv[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mode, setMode]             = useState<EquipeMode>("list");
  const [form, setForm]             = useState<StaffCvForm>(EMPTY_CV);
  const [editId, setEditId]         = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const addRef  = useRef<HTMLInputElement>(null);
  const pdfRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () => fetchStaffCvs().then(setCvs).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleNewUpload = async (file: File) => {
    setMode("extracting"); setError(null);
    try {
      const result = await extractCvFromPdf(file);
      setForm({
        nom: result.nom, prenom: result.prenom, poste: result.poste,
        specialite: result.specialite, diplome: result.diplome,
        annees_experience: result.annees_experience, actif: true, details: null,
      });
      setPendingPdf(result.tmp_pdf_bytes_b64);
      setEditId(null);
      setMode("confirm");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur extraction");
      setMode("list");
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const created = await createStaffCv(form);
      if (pendingPdf) {
        const bytes = Uint8Array.from(atob(pendingPdf), c => c.charCodeAt(0));
        const pdfFile = new File([bytes], "cv.pdf", { type: "application/pdf" });
        await uploadCvPdf(created.id, pdfFile);
      }
      await load();
      setMode("list"); setForm(EMPTY_CV); setPendingPdf(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur enregistrement");
    } finally { setSaving(false); }
  };

  const handleEdit = (cv: StaffCv) => {
    setEditId(cv.id);
    setForm({ nom: cv.nom, prenom: cv.prenom, poste: cv.poste, specialite: cv.specialite,
      diplome: cv.diplome, annees_experience: cv.annees_experience, actif: cv.actif, details: cv.details });
    setMode("edit");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editId) return;
    setSaving(true); setError(null);
    try {
      const updated = await updateStaffCv(editId, form);
      setCvs(prev => prev.map(c => c.id === editId ? updated : c));
      setMode("list"); setEditId(null); setForm(EMPTY_CV);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteStaffCv(id); setCvs(prev => prev.filter(c => c.id !== id)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur suppression"); }
  };

  const handleReplacePdf = async (cvId: string, file: File) => {
    try {
      const updated = await uploadCvPdf(cvId, file);
      setCvs(prev => prev.map(c => c.id === cvId ? updated : c));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur upload PDF"); }
  };

  const fi = (key: keyof StaffCvForm, label: string, half?: boolean, type = "text") => (
    <div style={{ gridColumn: half ? undefined : '1 / -1' }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 4 }}>{label}</label>
      <input type={type} value={String(form[key] ?? "")}
        onChange={e => setForm(prev => ({ ...prev, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)', color: 'var(--l-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />
    </div>
  );

  const cancel = () => { setMode("list"); setEditId(null); setForm(EMPTY_CV); setPendingPdf(null); setError(null); };

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {mode === "list" && (
        <>
          <button onClick={() => addRef.current?.click()}
            style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--l-blue)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Ajouter un CV (PDF)
          </button>
          <input ref={addRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleNewUpload(e.target.files[0])} />
        </>
      )}

      {mode === "extracting" && (
        <SectionCard title="Analyse du CV en cours...">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--l-card-border)', borderTopColor: 'var(--l-blue)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--l-sub)' }}>L'IA extrait les informations du CV...</p>
          </div>
        </SectionCard>
      )}

      {(mode === "confirm" || mode === "edit") && (
        <SectionCard title={mode === "confirm" ? "Vérifier les informations extraites" : "Modifier le membre"}>
          {mode === "confirm" && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#16a34a' }}>
                Informations extraites automatiquement  vérifiez et corrigez si nécessaire.
              </p>
            </div>
          )}
          <form onSubmit={mode === "confirm" ? handleConfirm : handleSaveEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              {fi("nom",               "Nom *",               true)}
              {fi("prenom",            "Prénom *",            true)}
              {fi("poste",             "Poste *")}
              {fi("specialite",        "Spécialité",          true)}
              {fi("diplome",           "Diplôme",             true)}
              {fi("annees_experience", "Années d'expérience", false, "number")}
            </div>
            {error && <p style={{ color: '#dc2626', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" disabled={saving || !form.nom || !form.poste}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button type="button" onClick={cancel}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--l-card-border)', background: 'transparent', color: 'var(--l-sub)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Annuler
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {mode === "list" && (
        cvs.length === 0 ? (
          <SectionCard title="Equipe">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--l-dim)' }}>
              Aucun membre dans le pool. Uploadez un CV PDF  les informations seront extraites automatiquement.
            </p>
          </SectionCard>
        ) : (
          <SectionCard title={`Equipe (${cvs.length} membre${cvs.length > 1 ? 's' : ''})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {cvs.map((cv, i) => (
                <div key={cv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: i > 0 ? '1px solid var(--l-card-border)' : 'none' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: cv.actif ? 'var(--l-text)' : 'var(--l-dim)' }}>
                      {cv.nom} {cv.prenom}
                      {!cv.actif && <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706' }}>Inactif</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--l-sub)' }}>
                      {cv.poste}{cv.specialite ? `  ${cv.specialite}` : ''}{cv.annees_experience ? `  ${cv.annees_experience} ans` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12, alignItems: 'center' }}>
                    {cv.cv_url ? (
                      <a href={cv.cv_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--l-blue)', textDecoration: 'none' }}>PDF</a>
                    ) : (
                      <>
                        <button onClick={() => pdfRefs.current[cv.id]?.click()}
                          style={{ fontSize: 12, color: 'var(--l-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                          + PDF
                        </button>
                        <input ref={el => { pdfRefs.current[cv.id] = el; }} type="file" accept=".pdf" style={{ display: 'none' }}
                          onChange={e => e.target.files?.[0] && handleReplacePdf(cv.id, e.target.files[0])} />
                      </>
                    )}
                    <button onClick={() => handleEdit(cv)}
                      style={{ fontSize: 12, color: 'var(--l-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Modifier
                    </button>
                    <button onClick={() => handleDelete(cv.id)}
                      style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )
      )}

      {error && mode === "list" && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────
function Spinner() {
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
function GenerationTab() {
  const { t } = useTranslation();
  return (
    <SectionCard title={t("dashboard.generation.title")}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--l-sub)",
          lineHeight: 1.7,
        }}
      >
        {t("dashboard.generation.desc")}
      </p>
    </SectionCard>
  );
}

// ── Dashboard principal ───────────────────────────────────
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
