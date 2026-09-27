import { useEffect, useRef, useState } from "react";
import { startSign, getSignStatus, cancelSign } from "../../../api";
import { useApercuDocument } from "../../../shared/ui/DocumentPreviewModal";

type DocStatus = "idle" | "pending" | "running" | "done" | "failed" | "cancelled";

interface ParaphePdf {
  id: string;
  name: string;
  size: string;
  file: File;
  status: DocStatus;
  downloadUrl?: string;
  error?: string;
}

const LS_KEY = "paraphe_active_jobs";

function loadJobs(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveJobs(jobs: Record<string, string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(jobs));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ParapheTab() {
  const [docs, setDocs] = useState<ParaphePdf[]>([]);
  const [paraphe, setParaphe] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // docId -> jobId
  const [activeJobs, setActiveJobs] = useState<Record<string, string>>(loadJobs);

  // Apercu : le PDF depose tant qu'il n'est pas paraphe, le PDF paraphe ensuite.
  const { ouvrirFichier, ouvrirUrl, modale: apercuModale } = useApercuDocument();

  const pdfRef = useRef<HTMLInputElement>(null);
  const parapheRef = useRef<HTMLInputElement>(null);

  const doneCount = docs.filter((d) => d.status === "done").length;

  // Polling des jobs actifs
  useEffect(() => {
    const ids = Object.entries(activeJobs);
    if (ids.length === 0) return;
    const interval = setInterval(async () => {
      for (const [docId, jobId] of ids) {
        try {
          const s = await getSignStatus(jobId);
          if (s.status === "done" || s.status === "failed" || s.status === "cancelled") {
            setDocs((prev) => prev.map((d) => d.id !== docId ? d : {
              ...d,
              status: s.status as DocStatus,
              downloadUrl: s.download_url,
              error: s.error,
            }));
            setActiveJobs((prev) => {
              const next = { ...prev };
              delete next[docId];
              saveJobs(next);
              return next;
            });
          } else if (s.status === "running") {
            setDocs((prev) => prev.map((d) => d.id !== docId ? d : { ...d, status: "running" }));
          }
        } catch {
          // Ignore les erreurs réseau transitoires
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeJobs]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: ParaphePdf[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((f) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: f.name,
        size: formatSize(f.size),
        file: f,
        status: "idle" as DocStatus,
      }));
    setDocs((prev) => [...prev, ...next]);
  }

  async function handleParaphe(docId: string) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc || doc.status === "pending" || doc.status === "running") return;
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, status: "pending", error: undefined } : d));
    try {
      const { job_id } = await startSign(doc.file, paraphe ?? null, null, "", "", true);
      setActiveJobs((prev) => {
        const next = { ...prev, [docId]: job_id };
        saveJobs(next);
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, status: "failed", error: msg } : d));
    }
  }

  async function handleParapheAll() {
    for (const doc of docs.filter((d) => d.status === "idle" || d.status === "failed")) {
      await handleParaphe(doc.id);
    }
  }

  async function handleCancel(docId: string) {
    const jobId = activeJobs[docId];
    if (!jobId) return;
    try { await cancelSign(jobId); } catch { /* ignore */ }
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, status: "cancelled" } : d));
    setActiveJobs((prev) => {
      const next = { ...prev };
      delete next[docId];
      saveJobs(next);
      return next;
    });
  }

  function download(doc: ParaphePdf) {
    if (!doc.downloadUrl) return;
    const a = document.createElement("a");
    a.href = doc.downloadUrl;
    a.download = doc.name.replace(/\.pdf$/i, "_paraphe.pdf");
    a.click();
  }

  return (
    <div className="space-y-4">
      {/* Configuration du paraphe : meme carte que Signature & Cachet */}
      <div className="border border-border rounded-xl bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image de paraphe</h3>
          <span className="text-xs text-muted-foreground">Par défaut : image du profil entreprise</span>
        </div>
        <button
          onClick={() => parapheRef.current?.click()}
          className={`w-full flex items-center gap-4 px-5 py-6 rounded-xl border transition-all text-left ${
            paraphe
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-dashed border-border hover:border-primary/40 hover:bg-accent/20"
          }`}
        >
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${paraphe ? "bg-emerald-500/10" : "bg-accent"}`}>
            {paraphe ? (
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {paraphe ? paraphe.name : "Choisir une image de paraphe"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {paraphe ? "Cliquer pour changer" : "Optionnel · PNG transparent recommandé"}
            </p>
          </div>
          {paraphe && (
            <button
              onClick={(e) => { e.stopPropagation(); setParaphe(null); }}
              className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <input ref={parapheRef} type="file" accept="image/*" className="hidden" onChange={(e) => setParaphe(e.target.files?.[0] ?? null)} />
        </button>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => pdfRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-12 flex flex-col items-center justify-center text-center gap-4 cursor-pointer transition-all ${
          isDragging ? "border-primary bg-accent/50" : "border-border hover:border-primary/40 hover:bg-accent/20"
        }`}
      >
        <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0">
          <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">Glissez vos documents PDF ici</p>
          <p className="text-xs text-muted-foreground">
            ou <span className="text-primary font-medium">parcourez vos fichiers</span> · .pdf · plusieurs fichiers acceptés
          </p>
        </div>
        <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>

      {/* Document list */}
      {docs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fichiers déposés
            </h3>
            {docs.some((d) => d.status === "idle" || d.status === "failed") && (
              <button
                onClick={handleParapheAll}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                Tout parapher
              </button>
            )}
          </div>

          <div className="space-y-2">
            {docs.map((doc) => {
              const isActive = doc.status === "pending" || doc.status === "running";
              return (
                <div
                  key={doc.id}
                  className="group flex items-center gap-4 border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all"
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    doc.status === "done" ? "bg-emerald-500/10"
                    : doc.status === "failed" ? "bg-destructive/10"
                    : "bg-accent"
                  }`}>
                    {doc.status === "done" ? (
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : doc.status === "failed" ? (
                      <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : isActive ? (
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => ouvrirFichier(doc.file)}
                      title="Voir le document déposé"
                      className="block max-w-full text-sm font-semibold text-foreground truncate text-left hover:text-primary transition-colors"
                    >
                      {doc.name}
                    </button>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.size}
                      {doc.status === "done" && <span className="ml-2 text-emerald-600 font-medium">· Paraphé</span>}
                      {doc.status === "pending" && <span className="ml-2 text-muted-foreground">· En attente...</span>}
                      {doc.status === "running" && <span className="ml-2 text-primary">· Traitement en cours...</span>}
                      {doc.status === "cancelled" && <span className="ml-2 text-muted-foreground">· Annulé</span>}
                      {doc.status === "failed" && doc.error && <span className="ml-2 text-destructive">· {doc.error}</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => doc.status === "done" && doc.downloadUrl
                        ? ouvrirUrl(doc.downloadUrl, doc.name.replace(/\.pdf$/i, "_paraphe.pdf"))
                        : ouvrirFichier(doc.file)}
                      title={doc.status === "done" ? "Voir le document paraphé" : "Voir le document déposé"}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Aperçu
                    </button>
                    {doc.status === "done" && doc.downloadUrl && (
                      <button
                        onClick={() => download(doc)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Télécharger
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => handleCancel(doc.id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-400/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Arrêter
                      </button>
                    )}
                    {(doc.status === "idle" || doc.status === "failed" || doc.status === "cancelled") && (
                      <button
                        onClick={() => handleParaphe(doc.id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Parapher
                      </button>
                    )}
                    <button
                      onClick={() => setDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats : une ligne discrete, comme Signature & Cachet */}
      {docs.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-sm">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{docs.length}</span>
            {" "}fichier{docs.length > 1 ? "s" : ""} déposé{docs.length > 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{doneCount}</span>
            {" "}paraphé{doneCount > 1 ? "s" : ""}
          </span>
        </div>
      )}
      {apercuModale}
    </div>
  );
}
