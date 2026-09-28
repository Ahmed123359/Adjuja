// Sections de la fiche d'analyse, hors risques : contexte, jalons, questions au
// maitre d'ouvrage, clauses, budget, pieces a produire.
// Spec : context/feature-spec/analyse-ao-enrichie/client.md.
//
// Chaque section rend null quand sa donnee est absente : la fiche n'affiche
// jamais de titre au-dessus du vide.

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import type { AnalyseAo, Jalon } from "../../types";
import { Citation } from "./ListeRisques";

const texteCorps = { margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-ink-2)", lineHeight: 1.5 } as const;
const texteMeta = { margin: 0, fontSize: "var(--adj-t-xs)", color: "var(--adj-ink-3)" } as const;

export function TitreSection({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <h3 style={{ margin: 0, fontSize: "var(--adj-t-base)", fontWeight: 700, color: "var(--adj-ink)" }}>{children}</h3>
      {action}
    </div>
  );
}

function useDateLongue() {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(i18n.language?.startsWith("en") ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
  // Date ISO -> « 10 octobre 2026 » ; tout autre texte est rendu tel quel.
  return (v: string) => {
    const d = dateIso(v);
    return d ? fmt.format(d) : v;
  };
}

function useMontant() {
  const { i18n } = useTranslation();
  const fmt = new Intl.NumberFormat(i18n.language?.startsWith("en") ? "en-US" : "fr-FR", { maximumFractionDigits: 0 });
  return (n: number) => `${fmt.format(n)} MAD`;
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 11rem) 1fr", gap: 12, padding: "6px 0" }}>
      <span style={texteMeta}>{libelle}</span>
      <span style={{ ...texteCorps, color: "var(--adj-ink)" }}>{valeur}</span>
    </div>
  );
}

// ── Contexte (remplace l'affichage JSON brut) ────────────────────────────────

export function SectionContexte({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const montant = useMontant();
  const dateLongue = useDateLongue();
  const c = analyse.contexte ?? {};
  const criteres = (analyse.criteres_ponderation ?? []).filter((x) => x?.nom);
  const profils = (analyse.profils_requis ?? []).filter((x) => x?.poste);
  const certifs = (analyse.certifications_requises ?? []).filter(Boolean);
  const lots = Array.isArray(c.lots) ? c.lots.length : 0;

  const exigences: [string, ReactNode][] = [];
  if (analyse.qualification_requise) exigences.push([t("analyse.contexte.qualification"), analyse.qualification_requise]);
  if (certifs.length) exigences.push([t("analyse.contexte.certifications"), certifs.join(", ")]);
  if (analyse.chiffre_affaires_minimum_exige) exigences.push([t("analyse.contexte.chiffreAffaires"), montant(analyse.chiffre_affaires_minimum_exige)]);
  if (analyse.nombre_references_similaires_exige) exigences.push([t("analyse.contexte.references"), String(analyse.nombre_references_similaires_exige)]);
  if (analyse.montant_caution) exigences.push([t("analyse.contexte.caution"), montant(analyse.montant_caution)]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <TitreSection>{t("analyse.contexte.titre")}</TitreSection>
        {(c.objet || c.intitule) && <Ligne libelle={t("analyse.contexte.objet")} valeur={c.objet || c.intitule} />}
        {c.acheteur && <Ligne libelle={t("analyse.contexte.acheteur")} valeur={c.acheteur} />}
        {c.date_limite && c.date_limite !== "non_disponible" && <Ligne libelle={t("analyse.contexte.dateLimite")} valeur={dateLongue(c.date_limite)} />}
        {typeof c.budget_estime === "number" && <Ligne libelle={t("analyse.contexte.budget")} valeur={montant(c.budget_estime)} />}
        {lots > 1 && <Ligne libelle={t("analyse.contexte.lots")} valeur={String(lots)} />}
      </div>

      {criteres.length > 0 && (
        <div>
          <TitreSection>{t("analyse.contexte.criteres")}</TitreSection>
          {criteres.map((x, i) => (
            <Ligne key={i} libelle={x.nom} valeur={typeof x.poids === "number" ? `${x.poids} %` : t("analyse.nonPrecise")} />
          ))}
        </div>
      )}

      {profils.length > 0 && (
        <div>
          <TitreSection>{t("analyse.contexte.profils")}</TitreSection>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {profils.map((p, i) => (
              <li key={i}>
                <p style={{ ...texteCorps, color: "var(--adj-ink)", fontWeight: 600 }}>
                  {p.poste}{p.specialite ? ` (${p.specialite})` : ""}
                </p>
                <p style={texteMeta}>
                  {[p.diplome_min, typeof p.annees_experience_min === "number" ? t("analyse.contexte.experience", { count: p.annees_experience_min }) : null]
                    .filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {exigences.length > 0 && (
        <div>
          <TitreSection>{t("analyse.contexte.exigences")}</TitreSection>
          {exigences.map(([l, v]) => <Ligne key={l} libelle={l} valeur={v} />)}
        </div>
      )}
    </div>
  );
}

// ── Jalons ───────────────────────────────────────────────────────────────────

function dateIso(v?: string | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(`${v.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function SectionJalons({ jalons }: { jalons?: Jalon[] }) {
  const { t, i18n } = useTranslation();
  if (!jalons?.length) return null;
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const dates = jalons.map((j) => ({ j, d: dateIso(j.date) }));
  // Dates lisibles d'abord, dans l'ordre ; dates non interpretables a la fin.
  dates.sort((a, b) => (a.d && b.d ? a.d.getTime() - b.d.getTime() : a.d ? -1 : b.d ? 1 : 0));
  const fmt = new Intl.DateTimeFormat(i18n.language?.startsWith("en") ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <TitreSection>{t("analyse.jalons.titre")}</TitreSection>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {dates.map(({ j, d }, i) => {
          const jours = d ? Math.round((d.getTime() - aujourdhui.getTime()) / 86_400_000) : null;
          const passe = jours !== null && jours < 0;
          const relatif = jours === null ? null
            : jours === 0 ? t("analyse.jalons.aujourdhui")
            : jours > 0 ? t("analyse.jalons.dans", { count: jours })
            : t("analyse.jalons.passe", { count: -jours });
          return (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 9.5rem) 1fr", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--adj-hairline)" : "none" }}>
              <div>
                <p style={{ ...texteCorps, fontWeight: 600, color: passe ? "var(--adj-ink-3)" : "var(--adj-ink)" }}>
                  {d ? fmt.format(d) : j.date || t("analyse.nonPrecise")}
                </p>
                {relatif && <p style={{ ...texteMeta, color: passe ? "var(--adj-ink-3)" : jours! <= 7 ? "var(--adj-hold)" : "var(--adj-ink-3)" }}>{relatif}</p>}
              </div>
              <div>
                <p style={{ ...texteCorps, color: passe ? "var(--adj-ink-3)" : "var(--adj-ink)" }}>{j.libelle}</p>
                <p style={texteMeta}>
                  {[
                    // Type omis quand il repete le libelle (« Visite des lieux » deux fois).
                    t(`analyse.jalons.type.${j.type}`).toLowerCase() === j.libelle.trim().toLowerCase() ? null : t(`analyse.jalons.type.${j.type}`),
                    j.reference,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Questions au maitre d'ouvrage ────────────────────────────────────────────

export function SectionQuestions({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const [copie, setCopie] = useState(false);
  const questions = (analyse.questions_moa ?? []).filter((q) => q?.question);
  if (!questions.length) return null;

  // Texte pret a coller dans un courrier au maitre d'ouvrage.
  async function copier() {
    const objet = analyse.contexte?.objet || analyse.contexte?.intitule;
    const texte = [
      t("analyse.questions.enteteCourrier", { objet: objet || "" }).trim(),
      "",
      ...questions.map((q, i) => `${i + 1}. ${q.question}${q.reference ? ` (${q.reference})` : ""}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers refuse (contexte non securise) : pas d'effet, pas d'erreur.
    }
  }

  return (
    <div>
      <TitreSection
        action={
          <button
            type="button"
            onClick={copier}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
              borderRadius: "var(--adj-round-s)", border: "1px solid var(--adj-hairline)",
              background: "var(--adj-panel)", color: copie ? "var(--adj-pos)" : "var(--adj-ink)",
              fontSize: "var(--adj-t-xs)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {copie ? <Check size={15} /> : <Copy size={15} />}
            {copie ? t("analyse.questions.copie") : t("analyse.questions.copier")}
          </button>
        }
      >
        {t("analyse.questions.titre")}
      </TitreSection>
      <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        {questions.map((q, i) => (
          <li key={i} style={{ ...texteCorps, color: "var(--adj-ink)" }}>
            {q.question}
            {(q.motif || q.reference) && (
              <p style={{ ...texteMeta, marginTop: 3 }}>{[q.motif, q.reference].filter(Boolean).join(" · ")}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Clauses a surveiller ─────────────────────────────────────────────────────

export function SectionClauses({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const clauses = (analyse.clauses_a_surveiller ?? []).filter((c) => c?.sujet);
  if (!clauses.length) return null;
  return (
    <div>
      <TitreSection>{t("analyse.clauses.titre")}</TitreSection>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
        {clauses.map((c, i) => (
          <li key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ ...texteCorps, color: "var(--adj-ink)", fontWeight: 600 }}>{c.sujet}</p>
            {c.clause && <Citation texte={c.clause} reference={c.reference} />}
            {c.pourquoi && (
              <p style={texteCorps}><strong style={{ color: "var(--adj-ink)" }}>{t("analyse.clauses.pourquoi")}</strong> {c.pourquoi}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Budget ───────────────────────────────────────────────────────────────────

export function SectionBudget({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const montant = useMontant();
  const b = analyse.decomposition_budgetaire;
  const postes = (b?.postes ?? []).filter((p) => p?.libelle);
  if (!b || (typeof b.montant_estime !== "number" && !postes.length)) return null;
  const total = typeof b.montant_estime === "number" ? b.montant_estime
    : postes.reduce((s, p) => s + (typeof p.montant === "number" ? p.montant : 0), 0);

  return (
    <div>
      <TitreSection>{t("analyse.budget.titre")}</TitreSection>
      {total > 0 && (
        <p style={{ margin: "0 0 10px", fontSize: "var(--adj-t-lg)", fontWeight: 700, color: "var(--adj-ink)", fontVariantNumeric: "tabular-nums" }}>
          {montant(total)}
        </p>
      )}
      {postes.map((p, i) => (
        <Ligne
          key={i}
          libelle={p.libelle}
          valeur={typeof p.montant === "number"
            ? `${montant(p.montant)}${total > 0 ? ` · ${Math.round((p.montant / total) * 100)} %` : ""}`
            : t("analyse.nonPrecise")}
        />
      ))}
      {b.source && <div style={{ marginTop: 8 }}><Citation texte={b.source} /></div>}
    </div>
  );
}

// ── Pieces a produire (etape Preparation) ────────────────────────────────────

export function SectionPieces({ analyse }: { analyse: AnalyseAo }) {
  const { t } = useTranslation();
  const pieces = (analyse.documents_requis ?? []).filter((p) => p?.nom);
  // Coche locale : aide-memoire de l'utilisateur, rien n'est enregistre.
  const [cochees, setCochees] = useState<Set<number>>(new Set());
  if (!pieces.length) return null;

  return (
    <div>
      <TitreSection>{t("analyse.pieces.titre")}</TitreSection>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {pieces.map((p, i) => (
          <li key={i}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={cochees.has(i)}
                onChange={() => setCochees((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                style={{ width: 17, height: 17, accentColor: "var(--adj-brand)", cursor: "pointer" }}
              />
              <span style={{ ...texteCorps, color: cochees.has(i) ? "var(--adj-ink-3)" : "var(--adj-ink)", textDecoration: cochees.has(i) ? "line-through" : "none" }}>
                {t(`analyse.pieces.nom.${p.nom}`, { defaultValue: p.nom.replace(/_/g, " ") })}
              </span>
              {p.obligatoire === false && <span style={texteMeta}>{t("analyse.pieces.facultative")}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
