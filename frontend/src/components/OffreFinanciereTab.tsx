import { useRef, useState } from "react";
import { extractBordereauExcel } from "../api";

export default function OffreFinanciereTab() {
  const [bordereauFile, setBordereauFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleExtract() {
    if (!bordereauFile) return;
    setExtracting(true);
    setError("");
    try {
      const blob = await extractBordereauExcel(bordereauFile);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = bordereauFile.name.replace(".pdf", "_bordereau.xlsx");
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setBordereauFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'extraction.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="space-y-1 animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Offre financière
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Déposez votre PDF d'appel d'offres le bordereau de prix est détecté
          automatiquement et exporté en fichier Excel prêt à remplir.
        </p>
      </div>

      {/* ── Comment ça marche ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            n: "01",
            title: "Déposez le PDF AO",
            desc: "Le document complet, peu importe le nombre de pages",
          },
          {
            n: "02",
            title: "Détection automatique",
            desc: "Scan des mots-clés gratuit, puis GPT-4o Vision sur la meilleure page",
          },
          {
            n: "03",
            title: "Export Excel",
            desc: "Tableau structuré avec les cellules à remplir surlignées en jaune",
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

      {/* ── Upload zone ───────────────────────────────────────── */}
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
            setBordereauFile(f);
            setError("");
          }
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-4 transition-all cursor-pointer ${
          isDragging
            ? "border-primary bg-accent/50 scale-[1.01]"
            : bordereauFile
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-border hover:border-primary/40 hover:bg-accent/20"
        }`}
      >
        <div
          className={`h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center ${bordereauFile ? "bg-emerald-500/10" : "bg-accent"}`}
        >
          {bordereauFile ? (
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
          {bordereauFile ? (
            <>
              <p className="text-sm font-semibold text-foreground truncate">
                {bordereauFile.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cliquer pour changer de fichier
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                Glissez votre AO PDF ici
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
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setBordereauFile(f);
              setError("");
            }
          }}
        />
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

      {/* ── CTA Exporter ──────────────────────────────────────── */}
      <div className="gradient-cta rounded-2xl p-5 shadow-elevated relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,hsl(280_60%_65%_/_0.3),transparent_60%)]" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-primary-foreground mb-1">
              Générer le tableau Excel
            </h2>
            <p className="text-sm text-primary-foreground/80 max-w-md">
              {lastExport
                ? `Dernier export à ${lastExport}  déposez un nouveau fichier pour relancer.`
                : "Exportez un récapitulatif structuré du bordereau de prix, prêt à remplir."}
            </p>
          </div>
          <button
            onClick={handleExtract}
            disabled={!bordereauFile || extracting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-foreground/15 border border-primary-foreground/20 text-primary-foreground font-semibold text-sm hover:bg-primary-foreground/25 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {extracting ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Détection en cours…
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
                Exporter en .xlsx
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
