import { useEffect, useRef, useState } from "react";
import { startFiller, getFillerStatus, cancelFiller } from "../../../api";
import type { FillerResult, FillerOutputFile } from "../../../types";
import { useApercuDocument } from "../../../shared/ui/DocumentPreviewModal";

const LS_KEY = "remplissage_job_id";

const DOC_TYPE_LABELS: Record<string, string> = {
  acte_engagement:   "Acte d'engagement",
  bordereau_prix:    "Bordereau des prix",
  declaration:       "Déclaration sur l'honneur",
  note_methodologie: "Note méthodologique",
  presentation:      "Présentation de l'entreprise",
};

const FORMAT_ICONS: Record<string, string> = {
  pdf:   "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  docx:  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  excel: "M3 10h18M3 14h18M10 3v18M14 3v18",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseLots(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

export default function RemplissageTab() {
  const [file, setFile] = useState<File | null>(null);
  const [lotsRaw, setLotsRaw] = useState("1");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(() => localStorage.getItem(LS_KEY));
  const [result, setResult] = useState<FillerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  // Apercu du dossier depose et des documents remplis. Seuls les PDF
  // s'affichent : un .zip ou un .docx n'a pas de rendu dans le navigateur.
  const { ouvrirFichier, ouvrirUrl, modale: apercuModale } = useApercuDocument();
  const estPdf = (nom: string) => /\.pdf$/i.test(nom);

  // Restauration d'un job actif au montage
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return;
    setLoading(true);
    setJobId(saved);
  }, []);

  // Polling
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const s = await getFillerStatus(jobId);
        if (s.status === "done") {
          setResult(s.result as FillerResult);
          if (s.result && (s.result as FillerResult).erreurs?.length > 0) {
            setError((s.result as FillerResult).erreurs.join(" | "));
          }
          setLoading(false);
          setJobId(null);
          localStorage.removeItem(LS_KEY);
        } else if (s.status === "failed") {
          setError(s.error ?? "Erreur lors du remplissage.");
          setLoading(false);
          setJobId(null);
          localStorage.removeItem(LS_KEY);
        } else if (s.status === "cancelled") {
          setLoading(false);
          setJobId(null);
          localStorage.removeItem(LS_KEY);
        }
      } catch {
        // Ignore les erreurs transitoires
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [jobId]);

  function pickFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    setFile(files[0]);
    setResult(null);
    setError(null);
  }

  async function handleRun() {
    if (!file) return;
    const lots = parseLots(lotsRaw);
    if (lots.length === 0) {
      setError("Saisissez au moins un numéro de lot.");
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { job_id } = await startFiller(file, lots);
      setJobId(job_id);
      localStorage.setItem(LS_KEY, job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du démarrage.");
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!jobId) return;
    try { await cancelFiller(jobId); } catch { /* ignore */ }
    setLoading(false);
    setJobId(null);
    localStorage.removeItem(LS_KEY);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setJobId(null);
    localStorage.removeItem(LS_KEY);
  }

  async function handleDownload(f: FillerOutputFile) {
    if (!f.download_url) return;
    const a = document.createElement("a");
    a.href = f.download_url;
    a.download = f.filename;
    a.click();
  }

  return (
    <div className="space-y-4">
      {/* Configuration : meme carte que Signature & Cachet et Paraphe */}
      <div className="border border-border rounded-xl bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <label htmlFor="remplissage-lots" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Lots concernés
          </label>
          <span className="text-xs text-muted-foreground">Données : profil entreprise</span>
        </div>
        <input
          id="remplissage-lots"
          type="text"
          value={lotsRaw}
          onChange={(e) => setLotsRaw(e.target.value)}
          placeholder="ex : 1, 2, 3"
          className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        />
        {lotsRaw && parseLots(lotsRaw).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Lots détectés :{" "}
            <span className="font-medium text-foreground">
              {parseLots(lotsRaw).join(", ")}
            </span>
          </p>
        )}
      </div>

      {/* File upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files); }}
        onClick={() => !file && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-12 flex flex-col items-center justify-center text-center gap-4 transition-all ${
          file
            ? "border-emerald-500/30 bg-emerald-500/5 cursor-default"
            : isDragging
            ? "border-primary bg-accent/50 cursor-pointer"
            : "border-border hover:border-primary/40 hover:bg-accent/20 cursor-pointer"
        }`}
      >
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${file ? "bg-emerald-500/10" : "bg-accent"}`}>
          {file ? (
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
        </div>
        <div className="min-w-0 max-w-full">
          {file ? (
            <>
              <p className="text-base font-semibold text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatSize(file.size)}</p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-foreground">Glissez votre dossier AO ici</p>
              <p className="text-xs text-muted-foreground">
                ou <span className="text-primary font-medium">parcourez vos fichiers</span> · .pdf ou .zip · un seul fichier
              </p>
            </>
          )}
        </div>
        {file && estPdf(file.name) && (
          <button
            onClick={(e) => { e.stopPropagation(); ouvrirFichier(file); }}
            title="Voir le dossier déposé"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
            Aperçu
          </button>
        )}
        {file && (
          <button
            onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); setError(null); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <input ref={fileRef} type="file" accept=".zip,.pdf" className="hidden" onChange={(e) => pickFile(e.target.files)} />
      </div>

      {/* CTA */}
      <div className="flex gap-2">
        {result && !loading && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-muted-foreground text-sm font-medium hover:text-foreground hover:border-primary/30 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Nouveau
          </button>
        )}
        {loading && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-400/40 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Arrêter
          </button>
        )}
        <button
          onClick={handleRun}
          disabled={loading || !file}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Remplissage en cours...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Remplir automatiquement
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 border border-destructive/20 bg-destructive/5 rounded-xl p-4">
          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Erreur</p>
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && result.fichiers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Documents générés
            </h3>
            <span className="text-xs text-muted-foreground">
              {result.fichiers.length} fichier{result.fichiers.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-2">
            {result.fichiers.map((f) => (
              <div
                key={f.filename}
                className="flex items-center gap-4 border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all"
              >
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={FORMAT_ICONS[f.format] ?? FORMAT_ICONS.pdf} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {DOC_TYPE_LABELS[f.doc_type] ?? f.doc_type}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {f.filename} · <span className="uppercase font-medium">{f.format}</span>
                  </p>
                </div>
                {f.download_url && (f.format === "pdf" || estPdf(f.filename)) && (
                  <button
                    onClick={() => ouvrirUrl(f.download_url!, f.filename)}
                    title="Voir le document rempli"
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5 flex-shrink-0"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    Aperçu
                  </button>
                )}
                <button
                  onClick={() => handleDownload(f)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Télécharger
                </button>
              </div>
            ))}
          </div>

          {result.message && (
            <p className="text-xs text-muted-foreground px-1">{result.message}</p>
          )}
        </div>
      )}

      {/* Empty result */}
      {result && result.fichiers.length === 0 && !error && (
        <div className="border border-border rounded-xl bg-card p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Aucun document généré</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Le dossier AO ne contient pas de formulaires reconnus. Vérifiez que le fichier inclut les PDFs de l'acte d'engagement ou du bordereau.
          </p>
        </div>
      )}
      {apercuModale}
    </div>
  );
}
