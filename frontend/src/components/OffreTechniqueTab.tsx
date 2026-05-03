import { useEffect, useRef, useState } from 'react';
import { runOffreTechnique, downloadOffreTechniqueFile } from '../api';
import type { OffreTechniqueOutputFile, OffreTechniqueResult, QualityReport } from '../types';

const FORMAT_COLORS: Record<string, string> = {
  pdf:  'text-red-600  bg-red-50  border-red-200',
  docx: 'text-blue-600 bg-blue-50 border-blue-200',
};

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const pct   = Math.round(score * 100);
  const color =
    pct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    pct >= 65 ? 'text-amber-700   bg-amber-50   border-amber-200'   :
                'text-red-700     bg-red-50     border-red-200';
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${color}`}>
      <span className="font-medium capitalize">{label}</span>
      <span className="font-bold tabular-nums">{pct}%</span>
    </div>
  );
}

function QualityPanel({ report }: { report: QualityReport }) {
  const globalPct = Math.round(report.global_score * 100);
  const ringColor = globalPct >= 75 ? '#10b981' : globalPct >= 60 ? '#f59e0b' : '#ef4444';
  const circumf   = 2 * Math.PI * 20;

  return (
    <div className="border border-border rounded-xl bg-card p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-4">
        {/* Global score ring */}
        <div className="relative h-14 w-14 flex-shrink-0">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
            <circle
              cx="24" cy="24" r="20" fill="none"
              stroke={ringColor} strokeWidth="4"
              strokeDasharray={circumf}
              strokeDashoffset={circumf - (circumf * globalPct) / 100}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-foreground">
            {globalPct}%
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {report.approved ? 'Offre approuvée' : 'Qualite insuffisante'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Score global pondéré</p>
        </div>
        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          report.approved
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {report.approved ? 'Validée' : 'Avertissement'}
        </span>
      </div>

      <div className="space-y-1.5">
        <ScoreBadge label="Conformité"      score={report.conformite.score} />
        <ScoreBadge label="Cohérence"       score={report.coherence.score} />
        <ScoreBadge label="Différenciation" score={report.differentiation.score} />
      </div>

      {/* Issues summary */}
      {[report.conformite, report.coherence, report.differentiation].flatMap(s => s.issues).length > 0 && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-1">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Points à améliorer</p>
          {[...report.conformite.issues, ...report.coherence.issues, ...report.differentiation.issues].map((issue, i) => (
            <p key={i} className="text-xs text-amber-600">· {issue}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadCard({ file, index }: { file: OffreTechniqueOutputFile; index: number }) {
  const [downloading, setDownloading] = useState(false);
  const [done,        setDone]        = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadOffreTechniqueFile(file.download_url, file.filename);
      setDone(true);
    } catch {
      // user can retry
    } finally {
      setDownloading(false);
    }
  }

  const colorClass  = FORMAT_COLORS[file.format] ?? 'text-muted-foreground bg-muted border-border';
  const formatLabel = file.format.toUpperCase();

  return (
    <div
      className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all animate-fade-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={`flex-shrink-0 h-10 w-10 rounded-lg border flex items-center justify-center text-[11px] font-bold ${colorClass}`}>
        {formatLabel}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {file.format === 'docx' ? 'Offre technique Word' : 'Offre technique PDF'}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{file.filename}</p>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-50 ${
          done
            ? 'border-emerald-300/50 bg-emerald-500/10 text-emerald-700'
            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary bg-background'
        }`}
      >
        {downloading ? (
          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        ) : done ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {done ? 'Téléchargé' : 'Télécharger'}
      </button>
    </div>
  );
}

export default function OffreTechniqueTab() {
  const [pdf,        setPdf]        = useState<File | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [elapsed,    setElapsed]    = useState(0);
  const [error,      setError]      = useState('');
  const [result,     setResult]     = useState<OffreTechniqueResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pdfRef   = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  async function handleSubmit() {
    if (!pdf) { setError('Veuillez sélectionner un CPS en PDF.'); return; }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await runOffreTechnique(pdf);
      setResult(res);
      if (!res.succes && res.erreurs.length > 0) {
        setError(res.erreurs.join(' · '));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPdf(null);
    setError('');
    setResult(null);
  }

  const formatElapsed = (s: number) =>
    s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="space-y-4">

      {/* Hero */}
      <div className="space-y-1 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Offre Technique
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Déposez le CPS (Cahier des Prescriptions Spéciales) : l'IA analyse le marché,
          choisit un angle différenciant et génère une offre technique complète en Word et PDF.
        </p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: '01', title: 'Déposez le CPS',    desc: 'Le cahier des prescriptions spéciales en PDF' },
          { n: '02', title: 'Analyse et stratégie', desc: "L'IA choisit l'angle différenciant optimal" },
          { n: '03', title: 'Téléchargez',        desc: 'Offre technique complète en Word et PDF' },
        ].map(({ n, title, desc }) => (
          <div key={n} className="flex flex-col gap-1.5 p-3 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all group">
            <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">{n}</div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault(); setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f?.type === 'application/pdf') { setPdf(f); setResult(null); setError(''); }
        }}
        onClick={() => pdfRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-4 transition-all cursor-pointer ${
          isDragging
            ? 'border-primary bg-accent/50 scale-[1.01]'
            : pdf
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-border hover:border-primary/40 hover:bg-accent/20'
        }`}
      >
        <div className={`h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center ${pdf ? 'bg-emerald-500/10' : 'bg-accent'}`}>
          {pdf ? (
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {pdf ? (
            <>
              <p className="text-sm font-semibold text-foreground truncate">{pdf.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(pdf.size / (1024 * 1024)).toFixed(1)} Mo · Cliquer pour changer
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Glissez le CPS ici</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ou <span className="text-primary font-medium">parcourez vos fichiers</span> · .pdf uniquement · max 20 Mo
              </p>
            </>
          )}
        </div>
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setPdf(f); setResult(null); setError(''); }
          }} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="border border-primary/20 rounded-xl bg-primary/5 p-5 flex items-center gap-4 animate-fade-in">
          <div className="flex-shrink-0 relative h-12 w-12">
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary/20" />
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3"
                strokeDasharray="125.66"
                strokeDashoffset={125.66 - (125.66 * Math.min(elapsed / 150, 1))}
                strokeLinecap="round"
                className="text-primary transition-[stroke-dashoffset] duration-1000" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Génération en cours…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analyse du CPS, choix de l'angle stratégique, rédaction des 5 sections et évaluation qualité.
              Comptez 2 à 3 minutes selon la complexité du marché.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-destructive/20 bg-destructive/5">
          <svg className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-3 animate-fade-in">

          {/* Quality report */}
          {result.quality && <QualityPanel report={result.quality} />}

          {/* Download cards */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fichiers produits
            </h3>
            {result.fichiers.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-300/40 text-emerald-700">
                {result.fichiers.length} fichier{result.fichiers.length > 1 ? 's' : ''} disponible{result.fichiers.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {result.fichiers.length > 0 ? (
            <div className="space-y-2">
              {result.fichiers.map((f, i) => (
                <DownloadCard key={f.filename} file={f} index={i} />
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-amber-300/40 bg-amber-500/5 text-sm text-amber-700">
              Aucun document généré. Vérifiez que le fichier est bien un CPS valide.
            </div>
          )}

          {result.erreurs.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-300/40 bg-amber-500/5 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Avertissements</p>
              {result.erreurs.map((e, i) => (
                <p key={i} className="text-xs text-amber-600">· {e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="gradient-cta rounded-2xl p-5 shadow-elevated relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,hsl(280_60%_65%_/_0.3),transparent_60%)]" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-primary-foreground mb-1">
              Générer l'offre technique
            </h2>
            <p className="text-sm text-primary-foreground/80 max-w-md">
              {result?.succes
                ? 'Génération terminée — déposez un nouveau CPS pour relancer.'
                : loading
                  ? 'Analyse IA en cours, veuillez patienter…'
                  : "L'IA lit le CPS, choisit un angle différenciant et rédige les 5 sections réglementaires."}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {result && !loading && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground text-sm font-medium hover:bg-primary-foreground/20 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Nouveau
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading || !pdf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border font-semibold text-sm transition-colors whitespace-nowrap disabled:opacity-50
                         bg-primary-foreground/15 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/25"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Génération…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Générer l'offre
                </>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
