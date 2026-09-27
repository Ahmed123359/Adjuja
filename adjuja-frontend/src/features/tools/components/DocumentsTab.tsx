import { DateField } from '../../../shared/ui/DateField';
import { useApercuDocument } from '../../../shared/ui/DocumentPreviewModal';
import { useEffect, useRef, useState } from "react";
import { startSign, getSignStatus, cancelSign } from "../../../api";

interface UploadedDoc {
  id: string;
  name: string;
  size: string;
  file: File;
  jobId?: string;
  status: "idle" | "pending" | "running" | "done" | "failed" | "cancelled";
  downloadUrl?: string;
  signedFilename?: string;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STORAGE_KEY = "sign_active_jobs";

function loadActiveJobs(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveActiveJobs(jobs: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export default function DocumentsTab() {
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [signature, setSignature] = useState<File | null>(null);
  const [cachet, setCachet] = useState<File | null>(null);
  const [lieu, setLieu] = useState("");
  const [date, setDate] = useState("");

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const cacInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signedCount = documents.filter((d) => d.status === "done").length;
  const activeJobs = useRef<Record<string, string>>(loadActiveJobs());

  function updateDoc(id: string, patch: Partial<UploadedDoc>) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // Polling pour tous les jobs actifs
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const jobs = { ...activeJobs.current };
      if (Object.keys(jobs).length === 0) return;

      for (const [docId, jobId] of Object.entries(jobs)) {
        try {
          const s = await getSignStatus(jobId);
          if (s.status === "done") {
            updateDoc(docId, {
              status: "done",
              downloadUrl: s.download_url,
              signedFilename: s.filename,
            });
            delete activeJobs.current[docId];
            saveActiveJobs(activeJobs.current);
          } else if (s.status === "failed") {
            updateDoc(docId, { status: "failed", error: s.error });
            delete activeJobs.current[docId];
            saveActiveJobs(activeJobs.current);
          } else if (s.status === "cancelled") {
            updateDoc(docId, { status: "cancelled" });
            delete activeJobs.current[docId];
            saveActiveJobs(activeJobs.current);
          }
        } catch {
          // Job expiré ou réseau -- ignorer
        }
      }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const newDocs: UploadedDoc[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((f) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: f.name,
        size: formatSize(f.size),
        file: f,
        status: "idle",
      }));
    setDocuments((prev) => [...prev, ...newDocs]);
  }

  async function handleSign(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;

    updateDoc(id, { status: "pending", error: undefined });
    const dateFr = date ? date.split("-").reverse().join("/") : undefined;

    try {
      const { job_id } = await startSign(doc.file, signature, cachet, lieu || undefined, dateFr);
      updateDoc(id, { status: "running", jobId: job_id });
      activeJobs.current[id] = job_id;
      saveActiveJobs(activeJobs.current);
    } catch (e) {
      updateDoc(id, { status: "failed", error: e instanceof Error ? e.message : "Erreur" });
    }
  }

  async function handleCancel(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc?.jobId) return;
    try { await cancelSign(doc.jobId); } catch { /* ignore */ }
    updateDoc(id, { status: "cancelled" });
    delete activeJobs.current[id];
    saveActiveJobs(activeJobs.current);
  }

  async function handleSignAll() {
    for (const doc of documents.filter((d) => d.status === "idle" || d.status === "failed")) {
      await handleSign(doc.id);
    }
  }

  // Apercu : le PDF depose tant qu'il n'est pas signe, le PDF signe ensuite.
  const { ouvrirFichier, ouvrirUrl, modale: apercuModale } = useApercuDocument();

  function downloadSigned(doc: UploadedDoc) {
    if (!doc.downloadUrl) return;
    const a = document.createElement("a");
    a.href = doc.downloadUrl;
    a.download = doc.signedFilename || doc.name.replace(".pdf", "_signe.pdf");
    a.click();
  }

  const isActive = (d: UploadedDoc) => d.status === "pending" || d.status === "running";

  return (
    <>
    <div className="space-y-4">


      {/* Configuration signature & cachet */}
      <div className="border border-border rounded-xl bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signature & Cachet</h3>
          <span className="text-xs text-muted-foreground">Par défaut : images du profil entreprise</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { label: "Signature personnalisée", ref: sigInputRef, file: signature, set: setSignature, icon: "pen" },
            { label: "Cachet personnalisé", ref: cacInputRef, file: cachet, set: setCachet, icon: "shield" },
          ] as const).map(({ label, ref, file, set }) => (
            <button
              key={label}
              onClick={() => (ref as React.RefObject<HTMLInputElement>).current?.click()}
              className={`flex items-center gap-4 px-5 py-6 rounded-xl border transition-all text-left ${file ? "border-emerald-500/30 bg-emerald-500/5" : "border-dashed border-border hover:border-primary/40 hover:bg-accent/20"}`}
            >
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${file ? "bg-emerald-500/10" : "bg-accent"}`}>
                {file
                  ? <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{file ? file.name : label}</p>
                <p className="text-xs text-muted-foreground">{file ? "Cliquer pour changer" : "Optionnel"}</p>
              </div>
              <input ref={ref as React.RefObject<HTMLInputElement>} type="file" accept="image/*" className="hidden" onChange={(e) => (set as (f: File | null) => void)(e.target.files?.[0] ?? null)} />
            </button>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Lieu & Date</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Ville (ex : Casablanca)" className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
            <DateField value={date} onChange={setDate} />
          </div>
        </div>
      </div>

      {/* Zone de drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => pdfInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-12 flex flex-col items-center justify-center text-center gap-4 cursor-pointer transition-all ${isDragging ? "border-primary bg-accent/50" : "border-border hover:border-primary/40 hover:bg-accent/20"}`}
      >
        <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0">
          <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">Glissez vos documents PDF ici</p>
          <p className="text-xs text-muted-foreground">ou <span className="text-primary font-medium">parcourez vos fichiers</span> · .pdf · plusieurs fichiers acceptés</p>
        </div>
        <input ref={pdfInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>

      {/* Liste des documents */}
      {documents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fichiers déposés</h3>
            {documents.some((d) => d.status === "idle" || d.status === "failed") && (
              <button onClick={handleSignAll} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" /></svg>
                Tout signer
              </button>
            )}
          </div>

          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="group flex items-center gap-4 border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all">
                {/* Icône statut */}
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${doc.status === "done" ? "bg-emerald-500/10" : doc.status === "failed" ? "bg-destructive/10" : doc.status === "cancelled" ? "bg-muted" : "bg-accent"}`}>
                  {doc.status === "done" && <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  {doc.status === "failed" && <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                  {doc.status === "cancelled" && <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                  {isActive(doc) && <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
                  {doc.status === "idle" && <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                </div>

                {/* Info */}
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
                    {doc.status === "done" && <span className="ml-2 text-emerald-600 font-medium">· Signé</span>}
                    {doc.status === "running" && <span className="ml-2 text-primary font-medium">· En cours...</span>}
                    {doc.status === "pending" && <span className="ml-2 text-muted-foreground">· En attente...</span>}
                    {doc.status === "cancelled" && <span className="ml-2 text-muted-foreground">· Annulé</span>}
                    {doc.status === "failed" && <span className="ml-2 text-destructive">· {doc.error}</span>}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => doc.status === "done" && doc.downloadUrl
                      ? ouvrirUrl(doc.downloadUrl, doc.signedFilename || doc.name.replace(/\.pdf$/i, "_signe.pdf"))
                      : ouvrirFichier(doc.file)}
                    title={doc.status === "done" ? "Voir le document signé" : "Voir le document déposé"}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    Aperçu
                  </button>
                  {doc.status === "done" && doc.downloadUrl && (
                    <button onClick={() => downloadSigned(doc)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Télécharger
                    </button>
                  )}
                  {isActive(doc) && (
                    <button onClick={() => handleCancel(doc.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Arrêter
                    </button>
                  )}
                  {(doc.status === "idle" || doc.status === "failed" || doc.status === "cancelled") && (
                    <button onClick={() => handleSign(doc.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Signer
                    </button>
                  )}
                  <button onClick={() => setDocuments((prev) => prev.filter((d) => d.id !== doc.id))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-sm">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{documents.length}</span>
            {' '}fichier{documents.length > 1 ? 's' : ''} déposé{documents.length > 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{signedCount}</span>
            {' '}signé{signedCount > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>

      {apercuModale}
    </>
  );
}
