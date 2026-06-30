import { useRef, useState } from "react";
import { signPdf } from "../api";

interface ParaphePdf {
  id: string;
  name: string;
  size: string;
  file: File;
  done: boolean;
  blob?: Blob;
  error?: string;
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
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const pdfRef = useRef<HTMLInputElement>(null);
  const parapheRef = useRef<HTMLInputElement>(null);

  const doneCount = docs.filter((d) => d.done).length;

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: ParaphePdf[] = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((f) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: f.name,
        size: formatSize(f.size),
        file: f,
        done: false,
      }));
    setDocs((prev) => [...prev, ...next]);
  }

  async function handleParaphe(id: string) {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const blob = await signPdf(doc.file, paraphe ?? undefined, undefined);
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, done: true, blob, error: undefined } : d)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, error: msg } : d)));
    } finally {
      setProcessing((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  async function handleParapheAll() {
    for (const doc of docs.filter((d) => !d.done)) {
      await handleParaphe(doc.id);
    }
  }

  function download(doc: ParaphePdf) {
    if (!doc.blob) return;
    const url = URL.createObjectURL(doc.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name.replace(".pdf", "_paraphe.pdf");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="space-y-1 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Paraphe</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Appose votre paraphe en bas de chaque page de vos documents PDF. Utile pour le CPS, le RC
          et tout document multi-pages à initialiser.
        </p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          { n: "01", title: "Image de paraphe", desc: "Optionnelle  un paraphe générique est utilisé si absent" },
          { n: "02", title: "Déposez vos PDFs", desc: "Un ou plusieurs documents à parapher" },
          { n: "03", title: "Téléchargez", desc: "Chaque page est paraphée en bas à droite" },
        ].map(({ n, title, desc }) => (
          <div
            key={n}
            className="flex flex-col gap-1.5 p-3 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all group"
          >
            <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
              {n}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Paraphe image */}
      <div className="border border-border rounded-xl bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Image de paraphe
          </h3>
          <span className="relative group/tooltip">
            <span className="inline-flex h-4 w-4 rounded-full bg-muted border border-border items-center justify-center text-[10px] font-bold text-muted-foreground cursor-default select-none">
              ?
            </span>
            <span className="absolute bottom-full right-0 mb-2 w-max max-w-[220px] rounded-lg bg-foreground px-3 py-2 text-[11px] text-background leading-snug shadow-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-50">
              PNG transparent recommandé. Si absent, un tampon texte est apposé.
            </span>
          </span>
        </div>
        <button
          onClick={() => parapheRef.current?.click()}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
            paraphe
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-dashed border-border hover:border-primary/40 hover:bg-accent/20"
          }`}
        >
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${paraphe ? "bg-emerald-500/10" : "bg-accent"}`}
          >
            {paraphe ? (
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {paraphe ? paraphe.name : "Choisir une image de paraphe"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {paraphe ? "Cliquer pour changer" : "PNG, JPG ou SVG · transparence supportée"}
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
        className={`border-2 border-dashed rounded-xl px-6 py-4 flex items-center gap-4 cursor-pointer transition-all ${
          isDragging ? "border-primary bg-accent/50" : "border-border hover:border-primary/40 hover:bg-accent/20"
        }`}
      >
        <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
          <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Glissez vos documents PDF ici</p>
          <p className="text-xs text-muted-foreground">
            ou <span className="text-primary font-medium">parcourez vos fichiers</span> · plusieurs fichiers acceptés
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
            {docs.some((d) => !d.done) && (
              <button
                onClick={handleParapheAll}
                disabled={processing.size > 0}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                Tout parapher
              </button>
            )}
          </div>

          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="group flex items-center gap-4 border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all"
              >
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    doc.done ? "bg-emerald-500/10" : doc.error ? "bg-destructive/10" : "bg-accent"
                  }`}
                >
                  {doc.done ? (
                    <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : doc.error ? (
                    <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : processing.has(doc.id) ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {doc.size}
                    {doc.done && <span className="ml-2 text-emerald-600 font-medium">· Paraphé ✓</span>}
                    {doc.error && <span className="ml-2 text-destructive">· {doc.error}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {doc.done && doc.blob && (
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
                  {!doc.done && !processing.has(doc.id) && (
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
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Documents",
            value: String(docs.length),
            sub: "fichiers déposés",
            icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
          },
          {
            label: "Paraphés",
            value: `${doneCount}/${docs.length || 0}`,
            sub: "documents traités",
            icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
          },
        ].map(({ label, value, sub, icon }) => (
          <div key={label} className="border border-border rounded-xl bg-card p-4 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
              <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center">
                <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
