import { useRef, useState } from 'react';
import { signPdf } from '../api';

interface UploadedDoc {
  id: string;
  name: string;
  size: string;
  file: File;
  signed: boolean;
  signedBlob?: Blob;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsTab() {
  const [documents, setDocuments]   = useState<UploadedDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [signature, setSignature]   = useState<File | null>(null);
  const [cachet, setCachet]         = useState<File | null>(null);
  const [signing, setSigning]       = useState<Set<string>>(new Set());
  const [lieu, setLieu]             = useState('');
  const [date, setDate]             = useState(''); // format YYYY-MM-DD (input type="date")

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const cacInputRef = useRef<HTMLInputElement>(null);

  const signedCount = documents.filter(d => d.signed).length;

  // ── Ajout de fichiers PDF ────────────────────────────────────
  function addFiles(files: FileList | null) {
    if (!files) return;
    const newDocs: UploadedDoc[] = Array.from(files)
      .filter(f => f.type === 'application/pdf')
      .map(f => ({
        id:     `${Date.now()}-${Math.random()}`,
        name:   f.name,
        size:   formatSize(f.size),
        file:   f,
        signed: false,
      }));
    setDocuments(prev => [...prev, ...newDocs]);
  }

  // ── Signer un document ───────────────────────────────────────
  async function handleSign(id: string) {
    setSigning(prev => new Set(prev).add(id));
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    try {
      // Convertit YYYY-MM-DD → DD/MM/YYYY pour l'affichage dans le PDF
      const dateFr = date ? date.split('-').reverse().join('/') : undefined;
      const blob = await signPdf(
        doc.file,
        signature ?? undefined,
        cachet ?? undefined,
        lieu || undefined,
        dateFr,
      );
      setDocuments(prev => prev.map(d =>
        d.id === id ? { ...d, signed: true, signedBlob: blob, error: undefined } : d
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de signature';
      setDocuments(prev => prev.map(d =>
        d.id === id ? { ...d, error: msg } : d
      ));
    } finally {
      setSigning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Tout signer ──────────────────────────────────────────────
  async function handleSignAll() {
    for (const doc of documents.filter(d => !d.signed)) {
      await handleSign(doc.id);
    }
  }

  // ── Télécharger un PDF signé ─────────────────────────────────
  function downloadSigned(doc: UploadedDoc) {
    if (!doc.signedBlob) return;
    const url = URL.createObjectURL(doc.signedBlob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = doc.name.replace('.pdf', '_signe.pdf');
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="space-y-2 animate-fade-in">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          Documents & Signatures
        </h1>
        <p className="text-base text-muted-foreground max-w-xl">
          Déposez vos documents PDF, signez-les automatiquement avec votre
          signature et cachet, puis téléchargez les versions signées.
        </p>
      </div>

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          {
            label: 'Documents',
            value: String(documents.length),
            sub:   'fichiers déposés',
            icon: (
              <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            ),
          },
          {
            label: 'Signés',
            value: `${signedCount}/${documents.length || 0}`,
            sub:   'documents signés',
            icon: (
              <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            ),
          },
        ].map(({ label, value, sub, icon }) => (
          <div key={label} className="border border-border rounded-xl bg-card p-5 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
              <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">{icon}</div>
            </div>
            <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Configuration signature & cachet ──────────────────── */}
      <div className="border border-border rounded-xl bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Signature & Cachet
          </h3>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-accent border border-border">
            Optionnels — des défauts sont utilisés si non renseignés
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Signature */}
          <button
            onClick={() => sigInputRef.current?.click()}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
              signature
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-dashed border-border hover:border-primary/40 hover:bg-accent/20'
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${signature ? 'bg-emerald-500/10' : 'bg-accent'}`}>
              {signature ? (
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {signature ? signature.name : 'Signature personnalisée'}
              </p>
              <p className="text-xs text-muted-foreground">
                {signature ? 'Cliquer pour changer' : 'Par défaut : tampon "Signé électroniquement"'}
              </p>
            </div>
            <input ref={sigInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => setSignature(e.target.files?.[0] ?? null)} />
          </button>

          {/* Cachet */}
          <button
            onClick={() => cacInputRef.current?.click()}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
              cachet
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-dashed border-border hover:border-primary/40 hover:bg-accent/20'
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cachet ? 'bg-emerald-500/10' : 'bg-accent'}`}>
              {cachet ? (
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="h-4 w-4 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {cachet ? cachet.name : 'Cachet personnalisé'}
              </p>
              <p className="text-xs text-muted-foreground">
                {cachet ? 'Cliquer pour changer' : 'Par défaut : tampon circulaire "CACHET"'}
              </p>
            </div>
            <input ref={cacInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => setCachet(e.target.files?.[0] ?? null)} />
          </button>
        </div>

        {/* ── Lieu & Date ──────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Lieu & Date <span className="normal-case font-normal text-muted-foreground/70">(remplit automatiquement "Fait à ___, le ___" dans le document)</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Lieu */}
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={lieu}
                onChange={e => setLieu(e.target.value)}
                placeholder="Ville (ex : Casablanca)"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>

            {/* Date — calendrier natif */}
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          {/* Aperçu */}
          {(lieu || date) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Aperçu :{' '}
              <span className="font-medium text-foreground">
                Fait à {lieu || '…'}, le {date ? date.split('-').reverse().join('/') : '…'}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* ── Upload zone PDFs ──────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => pdfInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
          isDragging ? 'border-primary bg-accent/50 scale-[1.01]' : 'border-border hover:border-primary/40 hover:bg-accent/20'
        }`}
      >
        <div className="h-14 w-14 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center">
          <svg className="h-6 w-6 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <p className="text-base font-semibold text-foreground">Glissez vos documents PDF ici</p>
        <p className="text-sm text-muted-foreground mt-1">
          ou <span className="text-primary font-medium hover:underline">parcourez vos fichiers</span>
        </p>
        <p className="text-xs text-muted-foreground mt-2">.pdf uniquement · plusieurs fichiers acceptés</p>
        <input ref={pdfInputRef} type="file" accept=".pdf" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
      </div>

      {/* ── Liste des documents ───────────────────────────────── */}
      {documents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fichiers déposés
            </h3>
            {documents.some(d => !d.signed) && (
              <button
                onClick={handleSignAll}
                disabled={signing.size > 0}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                Tout signer
              </button>
            )}
          </div>

          <div className="space-y-2">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="group flex items-center gap-4 border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  doc.signed ? 'bg-emerald-500/10' : doc.error ? 'bg-destructive/10' : 'bg-accent'
                }`}>
                  {doc.signed ? (
                    <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : doc.error ? (
                    <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : signing.has(doc.id) ? (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {doc.size}
                    {doc.signed && <span className="ml-2 text-emerald-600 font-medium">· Signé ✓</span>}
                    {doc.error  && <span className="ml-2 text-destructive">· {doc.error}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {doc.signed && doc.signedBlob && (
                    <button
                      onClick={() => downloadSigned(doc)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Télécharger
                    </button>
                  )}
                  {!doc.signed && !signing.has(doc.id) && (
                    <button
                      onClick={() => handleSign(doc.id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Signer
                    </button>
                  )}
                  <button
                    onClick={() => setDocuments(prev => prev.filter(d => d.id !== doc.id))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}