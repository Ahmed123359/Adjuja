// Profil entreprise -- repris sur le socle visuel le 2026-09-27.
//
// Avant : une colonne de 896px centree, six sections empilees au meme poids,
// libelles a 11px, et un bouton « Enregistrer » tout en bas, grise sans dire
// quel champ manquait. On remplissait vingt champs pour decouvrir, en bas de
// page, que l'enregistrement etait bloque.
//
// Maintenant :
//   - une barre d'etat collee en haut du defilement porte l'etat du profil, les
//     champs obligatoires manquants (cliquables : ils menent au champ) et
//     l'enregistrement, toujours atteignable ;
//   - les champs sont regroupes par usage sur la grille de fractions : identite
//     et identifiants legaux cote a cote, siege et gerant cote a cote, puis les
//     secteurs et les qualifications en pleine largeur.
//
// Les champs obligatoires sont ceux qu'exigeait deja ce formulaire (les cinq
// du pipeline cote backend, `_PIPELINE_REQUIRED`, plus le secteur, requis par
// la generation). Aucune regle metier n'a change.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { fetchCompanyProfile, upsertCompanyProfile } from "../api";
import type { AoCategorie, CompanyProfile, CompanyProfileForm } from "../../../types";
import SecteurPicker from "../../veille/components/SecteurPicker";
import { StringListField, StructuredListField } from "../../veille/components/RepeatableListField";
import { NotificationPreferencesSection } from "../components/NotificationPreferencesSection";
import { OrgMembersSection } from "../components/OrgMembersSection";
import { AO_CATEGORIES } from "../constants";
import { Card } from "../../../shared/ui/Card";
import { invalider } from "../../../shared/lib/cache";
import { Button } from "../../../shared/ui/Button";
import { Select } from "../../../shared/ui/Select";
import { FieldGrid, TextField, LoadingBlock, type Fraction, labelStyle, fieldInputStyle, focusOn, focusOff } from "../ui";

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

const REQUIRED_KEYS: (keyof CompanyProfileForm)[] = [
  "nom_entreprise",
  "secteur",
  "ice",
  "gerant_nom",
  "gerant_prenom",
  "adresse",
];

const fieldId = (key: string) => `profil-${key}`;

// ── Champs ──────────────────────────────────────────────────

function ProfileField({
  fieldKey, form, onChange, placeholder, span, type = "text",
}: {
  fieldKey: keyof CompanyProfileForm;
  form: CompanyProfileForm;
  onChange: (key: keyof CompanyProfileForm, value: string) => void;
  placeholder?: string;
  /** Fraction occupee dans la grille de champs du panneau. */
  span?: Fraction;
  type?: string;
}) {
  const { t } = useTranslation();
  return (
    <TextField
      id={fieldId(fieldKey)}
      label={t(`dashboard.profile.fields.${fieldKey}`)}
      required={REQUIRED_KEYS.includes(fieldKey)}
      value={(form[fieldKey] as string) ?? ""}
      onChange={(v) => onChange(fieldKey, v)}
      placeholder={placeholder}
      span={span}
      type={type}
    />
  );
}

/** Bloc titre + controle a l'interieur d'un panneau (agrements, certifications...). */
function SubBlock({ label, htmlFor, children }: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Onglet ──────────────────────────────────────────────────

export function ProfileTab({ onProfileSaved, champ, onChampAtteint }: {
  onProfileSaved: () => void;
  /** Champ a montrer a l'ouverture (action du fit score), ex. `certifications`. */
  champ?: string | null;
  onChampAtteint?: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CompanyProfileForm>(EMPTY_FORM);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
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

  const touch = () => {
    setSaved(false);
    setDirty(true);
  };

  const handleChange = (key: keyof CompanyProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    touch();
  };

  const updateExtra = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, extra: { ...prev.extra, [key]: value } }));
    touch();
  };

  const secteursInteret = Array.isArray(form.extra?.secteurs_interet)
    ? (form.extra!.secteurs_interet as string[])
    : [];
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const p = await upsertCompanyProfile(form);
      setProfile(p);
      setSaved(true);
      setDirty(false);
      // Le fit score depend du profil : il sera recalcule a la prochaine lecture.
      invalider("ao:fit:");
      onProfileSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("dashboard.profile.error"));
    } finally {
      setSaving(false);
    }
  };

  // Action du fit score : defiler jusqu'au champ vise une fois le profil charge.
  useEffect(() => {
    if (loading || !champ) return;
    const id = champ === "chiffre_affaires_moyen" ? "profil-ca" : `profil-${champ}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
    }
    onChampAtteint?.();
  }, [loading, champ, onChampAtteint]);

  if (loading) return <LoadingBlock />;

  const missing = REQUIRED_KEYS.filter((k) => !(form[k] as string)?.trim());
  const isComplete = missing.length === 0;

  const allerAuChamp = (key: string) => {
    const el = document.getElementById(fieldId(key));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLInputElement).focus({ preventScroll: true });
  };

  // Etat affiche : ce qui est ENREGISTRE (profile.complet, calcule par le
  // backend) quand il n'y a rien en attente, sinon ce que donnera
  // l'enregistrement du formulaire en cours.
  const actif = isComplete && (dirty || profile?.complet);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-5)" }}>
      <form onSubmit={handleSave} noValidate style={{ display: "flex", flexDirection: "column", gap: "var(--adj-5)" }}>

        {/* Barre d'etat et d'enregistrement, collee en haut du defilement */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "var(--adj-3) var(--adj-5)",
          padding: "14px var(--adj-pad)",
          background: "var(--adj-panel)",
          border: "1px solid var(--adj-hairline)",
          borderRadius: "var(--adj-round-l)",
          boxShadow: "var(--adj-lift-2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--adj-3)", minWidth: 0, flex: "1 1 360px" }}>
            <span aria-hidden style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
              background: actif ? "var(--adj-pos)" : "var(--adj-hold)",
              boxShadow: `0 0 0 4px ${actif ? "var(--adj-pos-tint)" : "var(--adj-hold-tint)"}`,
            }} />
            {isComplete ? (
              <p style={{ margin: 0, fontSize: "var(--adj-t-base)", fontWeight: 600, color: "var(--adj-ink)" }}>
                {t("dashboard.profile.complete")}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: "var(--adj-t-base)", color: "var(--adj-ink-2)", lineHeight: 1.6 }}>
                <span style={{ fontWeight: 600, color: "var(--adj-ink)" }}>
                  {t("dashboard.profile.missing", { count: missing.length })}
                </span>{" "}
                {missing.map((k, i) => (
                  <span key={k}>
                    <button
                      type="button"
                      onClick={() => allerAuChamp(k)}
                      className="adj-focusable"
                      style={{
                        padding: 0, border: "none", background: "none", cursor: "pointer",
                        fontFamily: "inherit", fontSize: "inherit", fontWeight: 600,
                        color: "var(--adj-brand)", textDecoration: "underline",
                        textUnderlineOffset: 3,
                      }}
                    >
                      {t(`dashboard.profile.fields.${k}`)}
                    </button>
                    {i < missing.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--adj-4)", flexShrink: 0 }}>
            {error && (
              <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-neg)" }}>{error}</span>
            )}
            {!error && saved && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--adj-t-sm)", color: "var(--adj-pos)", fontWeight: 600 }}>
                <Check size={16} strokeWidth={2.5} />
                {t("dashboard.profile.saved")}
              </span>
            )}
            {!error && !saved && dirty && (
              <span style={{ fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)" }}>
                {t("dashboard.profile.unsaved")}
              </span>
            )}
            <Button type="submit" variant="primary" loading={saving} disabled={!isComplete || (!dirty && !!profile)}>
              {saving ? t("dashboard.profile.saving") : t("dashboard.profile.save")}
            </Button>
          </div>
        </div>

        <div className="adj-grid">
          {/* Rangee 1 -- 1/2 + 1/2, deux lignes de champs de chaque cote,
              chaque ligne tombant pile sur 8/8. */}
          <Card title={t("dashboard.profile.sections.identity")} className="adj-1-2">
            <FieldGrid>
              <ProfileField form={form} onChange={handleChange} fieldKey="nom_entreprise" placeholder="SARL Mon Entreprise" span="1-2" />
              <ProfileField form={form} onChange={handleChange} fieldKey="forme_juridique" placeholder="SARL, SA..." span="1-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="capital_social" span="1-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="secteur" placeholder="Informatique, BTP..." span="1-1" />
            </FieldGrid>
          </Card>

          <Card title={t("dashboard.profile.sections.legal")} className="adj-1-2">
            <FieldGrid>
              <ProfileField form={form} onChange={handleChange} fieldKey="ice" placeholder="15 chiffres" span="1-2" />
              <ProfileField form={form} onChange={handleChange} fieldKey="rc" placeholder="12345" span="1-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="if_fiscal" span="1-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="cnss" span="1-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="rib" span="3-4" />
            </FieldGrid>
          </Card>

          {/* Rangee 2 -- 5/8 + 3/8 : le siege a quatre champs, le gerant trois,
              deux lignes de champs de chaque cote. */}
          <Card title={t("dashboard.profile.sections.headquarters")} className="adj-5-8">
            <FieldGrid>
              <ProfileField form={form} onChange={handleChange} fieldKey="adresse" span="3-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="ville" placeholder="Casablanca" span="1-4" />
              <ProfileField form={form} onChange={handleChange} fieldKey="telephone" type="tel" span="1-2" />
              <ProfileField form={form} onChange={handleChange} fieldKey="email" type="email" span="1-2" />
            </FieldGrid>
          </Card>

          <Card title={t("dashboard.profile.sections.manager")} className="adj-3-8">
            <FieldGrid>
              <ProfileField form={form} onChange={handleChange} fieldKey="gerant_nom" span="1-2" />
              <ProfileField form={form} onChange={handleChange} fieldKey="gerant_prenom" span="1-2" />
              <ProfileField form={form} onChange={handleChange} fieldKey="gerant_cin" span="1-1" />
            </FieldGrid>
          </Card>

          {/* Secteurs et capacite, cote a cote. En pleine largeur, le selecteur
              de categorie et la liste d'activites s'etiraient sur 1500px. */}
          <Card
            title={t("dashboard.profile.sections.activites")}
            subtitle={t("dashboard.profile.activitesHint")}
            className="adj-1-2"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-4)" }}>
              <div>
                <label htmlFor="profil-categorie" style={labelStyle}>{t("veille.filters.categorie")}</label>
                <Select
                  id="profil-categorie"
                  value={secteurCategorieLens}
                  onChange={(v) => setSecteurCategorieLens(v as AoCategorie | "")}
                  options={[
                    { value: "", label: t("veille.filters.categorieAll") },
                    ...AO_CATEGORIES.map((cat) => ({ value: cat, label: t(`veille.categories.${cat}`) })),
                  ]}
                />
              </div>
              <SecteurPicker
                selected={secteursInteret}
                onChange={(codes) => updateExtra("secteurs_interet", codes)}
                categorieFilter={secteurCategorieLens}
              />
            </div>
          </Card>

          <Card title={t("dashboard.profile.sections.capacity")} className="adj-1-2">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adj-5)" }}>
              <SubBlock label={t("dashboard.profile.fields.chiffre_affaires_moyen")} htmlFor="profil-ca">
                <input
                  id="profil-ca"
                  type="number"
                  value={chiffreAffairesMoyen}
                  onChange={(e) => updateExtra("chiffre_affaires_moyen", e.target.value)}
                  placeholder={t("dashboard.profile.caPh")}
                  style={fieldInputStyle}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
              </SubBlock>
              <SubBlock label={t("dashboard.profile.fields.certifications")}>
                <span id="profil-certifications" aria-hidden style={{ display: "block", scrollMarginTop: 120 }} />
                <StringListField
                  items={certifications}
                  onChange={(items) => updateExtra("certifications", items)}
                  placeholder={t("dashboard.profile.certificationPh")}
                  addLabel={t("dashboard.profile.addCertification")}
                />
              </SubBlock>
            </div>
          </Card>

          {/* Qualifications : un intertitre, puis un panneau par liste. */}
          <div className="adj-1-1" style={{ padding: "var(--adj-4) 2px 0" }}>
            <h2 style={{
              margin: 0, fontSize: "var(--adj-t-lg)", fontWeight: 700,
              letterSpacing: "-0.02em", color: "var(--adj-ink)",
            }}>
              {t("dashboard.profile.sections.qualifications")}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-3)", lineHeight: 1.5 }}>
              {t("dashboard.profile.qualificationsHint")}
            </p>
          </div>

          <Card title={t("dashboard.profile.fields.agrements")} count={agrements.length} className="adj-1-2">
            <StructuredListField
              rows={agrements}
              onChange={(rows) => updateExtra("agrements", rows)}
              addLabel={t("dashboard.profile.addAgrement")}
              fields={[
                { key: "domaine", placeholder: t("dashboard.profile.fields.agrementDomaine") },
                { key: "numero", placeholder: t("dashboard.profile.fields.agrementNumero") },
              ]}
            />
          </Card>

          <Card title={t("dashboard.profile.fields.classifications")} count={classifications.length} className="adj-1-2">
            <span id="profil-classifications" aria-hidden style={{ display: "block", scrollMarginTop: 120 }} />
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
          </Card>

          <Card title={t("dashboard.profile.fields.references_similaires")} count={referencesSimilaires.length} className="adj-1-1">
            <span id="profil-references_similaires" aria-hidden style={{ display: "block", scrollMarginTop: 120 }} />
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
          </Card>
        </div>
      </form>

      {/* Notifications et membres, cote a cote plutot qu'etires en pleine largeur. */}
      <div className="adj-grid">
        <div className="adj-1-2" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <NotificationPreferencesSection secteursInteretDefault={secteursInteret} />
        </div>
        <div className="adj-1-2" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <OrgMembersSection />
        </div>
      </div>
    </div>
  );
}
