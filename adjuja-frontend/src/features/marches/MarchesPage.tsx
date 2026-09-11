import { useState, useEffect, useCallback } from "react";
import {
  createMarche,
  fetchMarches,
  fetchMarche,
  uploadCps,
  uploadRc,
} from "../../api";
import type { MarcheSummary, MarcheDetail } from "../../types";
import OffreTechniqueTab from "../tools/components/OffreTechniqueTab";
import FillerTab from "../tools/components/FillerTab";
import OffreFinanciereTab from "../tools/components/OffreFinanciereTab";
import ActeEngagementTab from "../tools/components/ActeEngagementTab";
import DocumentsTab from "../tools/components/DocumentsTab";

type View = "list" | "detail" | "create";
type ToolTab =
  | "documents"
  | "offre_technique"
  | "filler"
  | "bordereau"
  | "acte"
  | "signatures";

const TOOL_TABS: { id: ToolTab; label: string; icon: string }[] = [
  {
    id: "documents",
    label: "Dossier",
    icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
  },
  {
    id: "offre_technique",
    label: "Offre technique",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "filler",
    label: "Remplissage dossier",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  },
  {
    id: "bordereau",
    label: "Offre financière",
    icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2",
  },
  {
    id: "acte",
    label: "Acte d'engagement",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    id: "signatures",
    label: "Signatures",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
];

export default function MarchesPage() {
  const [view, setView] = useState<View>("list");
  const [marches, setMarches] = useState<MarcheSummary[]>([]);
  const [selected, setSelected] = useState<MarcheDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toolTab, setToolTab] = useState<ToolTab>("documents");

  // formulaire création
  const [reference, setReference] = useState("");
  const [acheteur, setAcheteur] = useState("");
  const [objet, setObjet] = useState("");
  const [creating, setCreating] = useState(false);

  // upload CPS/RC
  const [cpsFile, setCpsFile] = useState<File | null>(null);
  const [rcFile, setRcFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<"cps" | "rc" | null>(null);

  const loadMarches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchMarches();
      setMarches(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur chargement marchés.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarches();
  }, [loadMarches]);

  const openMarche = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const detail = await fetchMarche(id);
      setSelected(detail);
      setToolTab("documents");
      setView("detail");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Impossible de charger ce marché.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreate = async () => {
    if (!reference.trim() || !acheteur.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createMarche({
        reference: reference.trim(),
        acheteur: acheteur.trim(),
        objet: objet.trim(),
      });
      setReference("");
      setAcheteur("");
      setObjet("");
      await loadMarches();
      setView("list");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur création marché.");
    } finally {
      setCreating(false);
    }
  };

  const handleUploadCps = async () => {
    if (!cpsFile || !selected) return;
    setUploading("cps");
    setError("");
    try {
      await uploadCps(selected.id, cpsFile);
      setCpsFile(null);
      const detail = await fetchMarche(selected.id);
      setSelected(detail);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload CPS.");
    } finally {
      setUploading(null);
    }
  };

  const handleUploadRc = async () => {
    if (!rcFile || !selected) return;
    setUploading("rc");
    setError("");
    try {
      await uploadRc(selected.id, rcFile);
      setRcFile(null);
      const detail = await fetchMarche(selected.id);
      setSelected(detail);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur upload RC.");
    } finally {
      setUploading(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const statutBadge = (statut: string) => {
    const map: Record<string, string> = {
      en_cours: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      soumis: "bg-green-500/15 text-green-400 border-green-500/30",
      archive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    };
    const label: Record<string, string> = {
      en_cours: "En cours",
      soumis: "Soumis",
      archive: "Archivé",
    };
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded border font-medium ${map[statut] ?? map.en_cours}`}
      >
        {label[statut] ?? statut}
      </span>
    );
  };

  // ── Liste ────────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mes Marchés</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Chaque AO est un dossier de travail persistant.
            </p>
          </div>
          <button
            onClick={() => setView("create")}
            className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Nouveau marché
          </button>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Chargement...
          </div>
        )}

        {!loading && marches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <svg
                className="w-8 h-8 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-foreground">
                Aucun marché pour l'instant
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Créez votre premier dossier AO pour commencer.
              </p>
            </div>
            <button
              onClick={() => setView("create")}
              className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Créer un marché
            </button>
          </div>
        )}

        {!loading && marches.length > 0 && (
          <div className="flex flex-col gap-3">
            {marches.map((m) => (
              <button
                key={m.id}
                onClick={() => openMarche(m.id)}
                className="w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-accent/30 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground truncate">
                        {m.reference}
                      </span>
                      {statutBadge(m.statut)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {m.acheteur}
                    </p>
                    {m.objet && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                        {m.objet}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(m.created_at)}
                    </span>
                    <div className="flex gap-1.5">
                      {m.cps_uploaded && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded">
                          CPS
                        </span>
                      )}
                      {m.rc_uploaded && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded">
                          RC
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Création ─────────────────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("list")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-foreground">Nouveau marché</h1>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 bg-card border border-border rounded-xl p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Référence AO <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ex : AO N°18/ANEF/2026"
              className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Acheteur <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={acheteur}
              onChange={(e) => setAcheteur(e.target.value)}
              placeholder="ex : ANEF, Ministère de l'Éducation..."
              className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Objet</label>
            <textarea
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder="Objet du marché (optionnel)"
              rows={2}
              className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none focus:outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !reference.trim() || !acheteur.trim()}
            className="py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {creating ? "Création..." : "Créer le marché"}
          </button>
        </div>
      </div>
    );
  }

  // ── Détail ────────────────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    return (
      <div className="flex flex-col h-full">
        {/* En-tête marché */}
        <div className="flex-shrink-0 flex items-start gap-3 px-6 pt-5 pb-4 border-b border-border bg-card">
          <button
            onClick={() => {
              setView("list");
              setSelected(null);
              loadMarches();
            }}
            className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-foreground">
                {selected.reference}
              </h1>
              {statutBadge(selected.statut)}
              <div className="flex gap-1.5 ml-1">
                {selected.cps_uploaded && (
                  <span className="text-xs px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded">
                    CPS
                  </span>
                )}
                {selected.rc_uploaded && (
                  <span className="text-xs px-1.5 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded">
                    RC
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{selected.acheteur}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-2 border-b border-border bg-background overflow-x-auto">
          {TOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setToolTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap text-xs px-3 py-2 rounded-t-lg border-b-2 transition-all ${
                toolTab === tab.id
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg
                className="h-3.5 w-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={tab.icon}
                />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenu de l'onglet */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Dossier (CPS/RC + historique) ─────────── */}
          {toolTab === "documents" && (
            <div className="max-w-3xl mx-auto p-6 flex flex-col gap-5">
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
                <h2 className="font-semibold text-foreground text-sm">
                  Documents d'entrée
                </h2>

                {/* CPS */}
                <div className="flex items-center gap-4">
                  <div
                    className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border text-sm ${selected.cps_uploaded ? "bg-green-500/10 border-green-500/30 text-green-400" : "border-border text-muted-foreground"}`}
                  >
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                    CPS {selected.cps_uploaded ? " chargé" : " non chargé"}
                  </div>
                  {!selected.cps_uploaded && (
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf"
                        id="cps-upload"
                        className="hidden"
                        onChange={(e) =>
                          setCpsFile(e.target.files?.[0] ?? null)
                        }
                      />
                      <label
                        htmlFor="cps-upload"
                        className="cursor-pointer text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {cpsFile ? cpsFile.name : "Choisir PDF"}
                      </label>
                      {cpsFile && (
                        <button
                          onClick={handleUploadCps}
                          disabled={uploading === "cps"}
                          className="text-xs px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          {uploading === "cps" ? "Upload..." : "Upload"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* RC */}
                <div className="flex items-center gap-4">
                  <div
                    className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border text-sm ${selected.rc_uploaded ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "border-border text-muted-foreground"}`}
                  >
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                    RC {selected.rc_uploaded ? " chargé" : " optionnel"}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf"
                      id="rc-upload"
                      className="hidden"
                      onChange={(e) => setRcFile(e.target.files?.[0] ?? null)}
                    />
                    <label
                      htmlFor="rc-upload"
                      className="cursor-pointer text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {rcFile
                        ? rcFile.name
                        : selected.rc_uploaded
                          ? "Remplacer"
                          : "Choisir PDF"}
                    </label>
                    {rcFile && (
                      <button
                        onClick={handleUploadRc}
                        disabled={uploading === "rc"}
                        className="text-xs px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        {uploading === "rc" ? "Upload..." : "Upload"}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Historique des jobs */}
              {(selected.offre_technique_jobs.length > 0 ||
                selected.filler_jobs.length > 0 ||
                selected.signing_jobs.length > 0) && (
                <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
                  <h2 className="font-semibold text-foreground text-sm">
                    Historique des générations
                  </h2>

                  {selected.offre_technique_jobs.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Offres Techniques
                      </p>
                      {selected.offre_technique_jobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between px-3 py-2 bg-background rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                            <span className="text-xs font-mono text-foreground">
                              {job.job_id.slice(0, 8)}...
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(job.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selected.filler_jobs.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Remplissage Dossier
                      </p>
                      {selected.filler_jobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between px-3 py-2 bg-background rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
                            <span className="text-xs font-mono text-foreground">
                              {job.job_id.slice(0, 8)}...
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(job.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selected.signing_jobs.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Signatures
                      </p>
                      {selected.signing_jobs.map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between px-3 py-2 bg-background rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                            <span className="text-xs font-mono text-foreground">
                              {job.job_id.slice(0, 8)}...
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(job.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Marché créé le {formatDate(selected.created_at)}
              </p>
            </div>
          )}

          {/* ── Offre technique ────────────────────────── */}
          {toolTab === "offre_technique" && (
            <div className="max-w-3xl mx-auto px-6 py-4">
              <OffreTechniqueTab marcheId={selected.id} />
            </div>
          )}

          {/* ── Remplissage dossier ────────────────────── */}
          {toolTab === "filler" && (
            <div className="max-w-3xl mx-auto px-6 py-4">
              <FillerTab marcheId={selected.id} />
            </div>
          )}

          {/* ── Offre financière ───────────────────────── */}
          {toolTab === "bordereau" && (
            <div className="max-w-3xl mx-auto px-6 py-4">
              <OffreFinanciereTab />
            </div>
          )}

          {/* ── Acte d'engagement ──────────────────────── */}
          {toolTab === "acte" && (
            <div className="max-w-3xl mx-auto px-6 py-4">
              <ActeEngagementTab />
            </div>
          )}

          {/* ── Documents & Signatures ─────────────────── */}
          {toolTab === "signatures" && (
            <div className="max-w-3xl mx-auto px-6 py-4">
              <DocumentsTab />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
