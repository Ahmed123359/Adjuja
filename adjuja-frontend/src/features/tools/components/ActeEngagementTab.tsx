import { useRef, useState } from "react";
import { fillActeEngagement } from "../../../api";
import type { ActeEngagementData } from "../../../types";
import { DEFAULT_ACTE_ENGAGEMENT } from "../../../types";

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground
                   placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function Tooltip({ text, alignRight }: { text: string; alignRight?: boolean }) {
  return (
    <span className="relative group/tooltip flex-shrink-0">
      <span className="inline-flex h-4 w-4 rounded-full bg-muted border border-border items-center justify-center text-[10px] font-bold text-muted-foreground cursor-default select-none">
        ?
      </span>
      <span
        className={`absolute bottom-full mb-2 w-max max-w-[220px] rounded-lg bg-foreground px-3 py-2 text-[11px] text-background leading-snug shadow-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-50 ${alignRight ? "right-0" : "left-1/2 -translate-x-1/2"}`}
      >
        {text}
      </span>
    </span>
  );
}

export default function ActeEngagementTab() {
  const [data, setData] = useState<ActeEngagementData>(DEFAULT_ACTE_ENGAGEMENT);
  const [pdf, setPdf] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [cachet, setCachet] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const pdfRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const cacRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ActeEngagementData>(
    key: K,
    val: ActeEngagementData[K],
  ) {
    setData((prev) => ({ ...prev, [key]: val }));
    setDone(false);
    setError("");
  }

  async function handleSubmit() {
    if (!pdf) {
      setError("Veuillez uploader le modèle PDF de l'acte d'engagement.");
      return;
    }
    setLoading(true);
    setError("");
    setDone(false);
    try {
      const dateFr = data.fait_a_date
        ? data.fait_a_date.split("-").reverse().join("/")
        : undefined;
      const blob = await fillActeEngagement(
        pdf,
        { ...data, fait_a_date: dateFr ?? data.fait_a_date },
        signature,
        cachet,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (pdf.name || "acte_engagement").replace(
        ".pdf",
        "_rempli.pdf",
      );
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }

  const typeLabels = {
    physique: "Personne physique",
    morale: "Personne morale",
    groupement: "Groupement",
  };

  return (
    <div className="space-y-4">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="space-y-1 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Acte d'engagement
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Déposez le modèle PDF, remplissez les informations et téléchargez le
          document prêt à signer.
        </p>
      </div>

      {/* ── Étapes ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            n: "01",
            title: "Déposez le PDF modèle",
            desc: "Le document vierge fourni par le maître d'ouvrage",
          },
          {
            n: "02",
            title: "Remplissez les informations",
            desc: "Identité, type de soumissionnaire, lieu et date",
          },
          {
            n: "03",
            title: "Téléchargez le PDF rempli",
            desc: "Le document complété avec signature et cachet apposés",
          },
        ].map(({ n, title, desc }) => (
          <div
            key={n}
            className="flex flex-col gap-1.5 p-3 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all group"
          >
            <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
              {n}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Upload PDF ────────────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f?.type === "application/pdf") {
            setPdf(f);
            setDone(false);
          }
        }}
        onClick={() => pdfRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-4 transition-all cursor-pointer ${
          isDragging
            ? "border-primary bg-accent/50 scale-[1.01]"
            : pdf
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-border hover:border-primary/40 hover:bg-accent/20"
        }`}
      >
        <div
          className={`h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center ${pdf ? "bg-emerald-500/10" : "bg-accent"}`}
        >
          {pdf ? (
            <svg
              className="h-5 w-5 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 text-accent-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {pdf ? (
            <>
              <p className="text-sm font-semibold text-foreground truncate">
                {pdf.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cliquer pour changer de fichier
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                Glissez le PDF modèle ici
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ou{" "}
                <span className="text-primary font-medium">
                  parcourez vos fichiers
                </span>{" "}
                · .pdf uniquement
              </p>
            </>
          )}
        </div>
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setPdf(f);
              setDone(false);
            }
          }}
        />
      </div>

      {/* ── Type de soumissionnaire ───────────────────────────── */}
      <div className="border border-border rounded-xl bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Type de soumissionnaire
        </h3>
        <div className="flex gap-3 flex-wrap">
          {(["physique", "morale", "groupement"] as const).map((type) => (
            <button
              key={type}
              onClick={() => set("type_soumissionnaire", type)}
              className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                data.type_soumissionnaire === type
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
              }`}
            >
              {typeLabels[type]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Champs selon le type ──────────────────────────────── */}
      {data.type_soumissionnaire === "physique" && (
        <div className="border border-border rounded-xl bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informations Personne physique
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field
                label="Prénom, Nom et qualité"
                value={data.signataire_nom}
                onChange={(v) => set("signataire_nom", v)}
                placeholder="ex: Ahmed Benali, Directeur Général"
                required
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Adresse du domicile élu"
                value={data.adresse_domicile}
                onChange={(v) => set("adresse_domicile", v)}
                placeholder="ex: 12 rue Hassan II, Casablanca"
              />
            </div>
            <Field
              label="N° affiliation CNSS"
              value={data.cnss}
              onChange={(v) => set("cnss", v)}
              placeholder="ex: 1234567"
            />
            <Field
              label="Localité (registre commerce)"
              value={data.rc_localite}
              onChange={(v) => set("rc_localite", v)}
              placeholder="ex: Casablanca"
            />
            <Field
              label="N° registre commerce"
              value={data.rc_numero}
              onChange={(v) => set("rc_numero", v)}
              placeholder="ex: 145853"
            />
            <Field
              label="N° taxe professionnelle"
              value={data.taxe_pro}
              onChange={(v) => set("taxe_pro", v)}
              placeholder="ex: 56789012"
            />
            <div className="md:col-span-2">
              <Field
                label="ICE"
                value={data.ice}
                onChange={(v) => set("ice", v)}
                placeholder="ex: 002579010000023"
              />
            </div>
          </div>
        </div>
      )}

      {data.type_soumissionnaire === "morale" && (
        <div className="border border-border rounded-xl bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informations Personne morale
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field
                label="Prénom, Nom et qualité du signataire"
                value={data.signataire_nom}
                onChange={(v) => set("signataire_nom", v)}
                placeholder="ex: Ahmed Benali, Directeur Général"
                required
              />
            </div>
            <Field
              label="Raison sociale"
              value={data.raison_sociale}
              onChange={(v) => set("raison_sociale", v)}
              placeholder="ex: ABI Consulting"
              required
            />
            <Field
              label="Forme juridique"
              value={data.forme_juridique}
              onChange={(v) => set("forme_juridique", v)}
              placeholder="ex: SARL"
            />
            <Field
              label="Capital social"
              value={data.capital_social}
              onChange={(v) => set("capital_social", v)}
              placeholder="ex: 100.000 MAD"
            />
            <div className="md:col-span-2">
              <Field
                label="Adresse du siège social"
                value={data.adresse_siege}
                onChange={(v) => set("adresse_siege", v)}
                placeholder="ex: Imm 30, Appt 08, Rue Moulay Ahmed Loukili, Rabat"
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="Adresse du domicile élu"
                value={data.adresse_domicile}
                onChange={(v) => set("adresse_domicile", v)}
                placeholder="Si différent du siège social"
              />
            </div>
            <Field
              label="N° affiliation CNSS"
              value={data.cnss}
              onChange={(v) => set("cnss", v)}
              placeholder="ex: 1234567"
            />
            <Field
              label="Localité (registre commerce)"
              value={data.rc_localite}
              onChange={(v) => set("rc_localite", v)}
              placeholder="ex: Casablanca"
            />
            <Field
              label="N° registre commerce"
              value={data.rc_numero}
              onChange={(v) => set("rc_numero", v)}
              placeholder="ex: 145853"
            />
            <Field
              label="N° taxe professionnelle"
              value={data.taxe_pro}
              onChange={(v) => set("taxe_pro", v)}
              placeholder="ex: 56789012"
            />
            <div className="md:col-span-2">
              <Field
                label="ICE"
                value={data.ice}
                onChange={(v) => set("ice", v)}
                placeholder="ex: 002579010000023"
              />
            </div>
          </div>
        </div>
      )}

      {data.type_soumissionnaire === "groupement" && (
        <div className="border border-border rounded-xl bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Informations Groupement
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Membres du groupement{" "}
                <span className="text-muted-foreground/60">(un par ligne)</span>
              </label>
              <textarea
                value={data.membres_groupement}
                onChange={(e) => set("membres_groupement", e.target.value)}
                placeholder={
                  "Membre 1  Raison sociale\nMembre 2  Raison sociale\n..."
                }
                rows={4}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground
                           placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
            <div className="md:col-span-2">
              <Field
                label="ICE du mandataire"
                value={data.ice}
                onChange={(v) => set("ice", v)}
                placeholder="ex: 002579010000023"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Signature, Cachet & Lieu/Date (section fusionnée) ─── */}
      <div className="border border-border rounded-xl bg-card p-4 space-y-3">
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Signature & Cachet
          </h3>
          <Tooltip
            text="Optionnels  des tampons par défaut sont utilisés si non renseignés"
            alignRight
          />
        </div>

        {/* Ligne 1 : Signature + Cachet */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => sigRef.current?.click()}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
              signature
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-dashed border-border hover:border-primary/40 hover:bg-accent/20"
            }`}
          >
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${signature ? "bg-emerald-500/10" : "bg-accent"}`}
            >
              {signature ? (
                <svg
                  className="h-4 w-4 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 text-accent-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">
                  {signature ? signature.name : "Signature personnalisée"}
                </p>
                {!signature && (
                  <Tooltip text='Par défaut : tampon "Signé électroniquement" apposé en bas à droite' />
                )}
              </div>
              {signature && (
                <p className="text-xs text-muted-foreground">
                  Cliquer pour changer
                </p>
              )}
            </div>
            <input
              ref={sigRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setSignature(e.target.files?.[0] ?? null)}
            />
          </button>

          <button
            onClick={() => cacRef.current?.click()}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
              cachet
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-dashed border-border hover:border-primary/40 hover:bg-accent/20"
            }`}
          >
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cachet ? "bg-emerald-500/10" : "bg-accent"}`}
            >
              {cachet ? (
                <svg
                  className="h-4 w-4 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 text-accent-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">
                  {cachet ? cachet.name : "Cachet personnalisé"}
                </p>
                {!cachet && (
                  <Tooltip text='Par défaut : tampon circulaire "CACHET" apposé en bas à gauche' />
                )}
              </div>
              {cachet && (
                <p className="text-xs text-muted-foreground">
                  Cliquer pour changer
                </p>
              )}
            </div>
            <input
              ref={cacRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setCachet(e.target.files?.[0] ?? null)}
            />
          </button>
        </div>

        {/* Séparateur */}
        <div className="border-t border-border" />

        {/* Ligne 2 : Lieu & Date */}
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          Lieu & Date
          <Tooltip text='Remplit automatiquement "Fait à ___, le ___" dans le document' />
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg
                className="h-4 w-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={data.fait_a_lieu}
              onChange={(e) => set("fait_a_lieu", e.target.value)}
              placeholder="ex: Casablanca"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg
                className="h-4 w-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <input
              type="date"
              value={data.fait_a_date}
              onChange={(e) => set("fait_a_date", e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        </div>
        {(data.fait_a_lieu || data.fait_a_date) && (
          <p className="text-xs text-muted-foreground">
            Aperçu :{" "}
            <span className="font-medium text-foreground">
              Fait à {data.fait_a_lieu || "…"}, le{" "}
              {data.fait_a_date
                ? data.fait_a_date.split("-").reverse().join("/")
                : "…"}
            </span>
          </p>
        )}
      </div>

      {/* ── Erreur ────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-destructive/20 bg-destructive/5">
          <svg
            className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── CTA ───────────────────────────────────────────────── */}
      <div className="gradient-cta rounded-2xl p-5 shadow-elevated relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,hsl(280_60%_65%_/_0.3),transparent_60%)]" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-primary-foreground mb-1">
              Remplir & télécharger le PDF
            </h2>
            <p className="text-sm text-primary-foreground/80 max-w-md">
              {done
                ? "Document généré avec succès  déposez un nouveau fichier pour relancer."
                : "Le PDF modèle est complété avec vos informations et vos tampons."}
            </p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !pdf}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border font-semibold text-sm transition-colors whitespace-nowrap disabled:opacity-50 ${
              done
                ? "bg-emerald-500/20 border-emerald-300/30 text-primary-foreground"
                : "bg-primary-foreground/15 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/25"
            }`}
          >
            {loading ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                Traitement…
              </>
            ) : done ? (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Téléchargé ✓
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Télécharger le PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
