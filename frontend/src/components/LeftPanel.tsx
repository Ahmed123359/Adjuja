import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { Model, CompanyData } from '../types';
import { extractPdfText } from '../api';

// ── Constants ───────────────────────────────────────────────
const COMPANY_FIELDS = [
  'nom','forme_juridique','date_creation','site_web',
  'description','secteurs','expertises','certifications',
  'effectif','chiffre_affaires','adresse','ville','telephone',
  'rc','ice','cnss','if_fiscal','references',
] as const;

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all";

// ── Types ───────────────────────────────────────────────────
type Props = {
  aoText: string; setAoText: (v: string) => void;
  provider: string; setProvider: (v: string) => void;
  model: string; setModel: (v: string) => void;
  models: Model[];
  company: CompanyData; setCompany: (v: CompanyData | ((prev: CompanyData) => CompanyData)) => void;
  langue: 'fr' | 'en'; setLangue: (v: 'fr' | 'en') => void;
  onGenerate: () => void;
  loading: boolean;
  limitReached: boolean;
  onGoLanding: () => void;
};

// Lucide-compatible SVG paths
const PROVIDER_META: Record<string, { name: string; selectedColor: string; icon: (cls: string) => React.ReactNode }> = {
  openai: {
    name: 'GPT-4',
    selectedColor: 'text-emerald-600',
    icon: cls => (
      // Bot icon (lucide)
      <svg className={`h-4 w-4 ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8"/>
        <rect width="16" height="12" x="4" y="8" rx="2"/>
        <path d="M2 14h2"/>
        <path d="M20 14h2"/>
        <path d="M15 13v2"/>
        <path d="M9 13v2"/>
      </svg>
    ),
  },
  anthropic: {
    name: 'Claude',
    selectedColor: 'text-amber-600',
    icon: cls => (
      // Brain icon (lucide)
      <svg className={`h-4 w-4 ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
      </svg>
    ),
  },
  mistral: {
    name: 'Mistral',
    selectedColor: 'text-sky-600',
    icon: cls => (
      // Wind icon (lucide)
      <svg className={`h-4 w-4 ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
        <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
        <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
      </svg>
    ),
  },
};

// ── CollapsibleSection ──────────────────────────────────────
function CollapsibleSection({
  title, defaultOpen = false, children,
}: {
  title: string; defaultOpen?: boolean; children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/60 rounded-lg transition-colors"
      >
        <span>{title}</span>
        <svg
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function LeftPanel(props: Props) {
  const {
    aoText, setAoText, provider, setProvider, model, setModel, models,
    company, setCompany, langue, setLangue,
    onGenerate, loading, limitReached, onGoLanding,
  } = props;

  const [dragging, setDragging] = useState(false);
  const [fileMsg,  setFileMsg]  = useState('');
  const [saveTip,  setSaveTip]  = useState('');

  const fileRef  = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  const providers      = [...new Set(models.map(m => m.provider))];
  const filteredModels = models.filter(m => m.provider === provider);

  const updateField = useCallback((f: keyof CompanyData, v: string) => {
    setCompany((prev: CompanyData) => ({ ...prev, [f]: v }));
  }, [setCompany]);

  async function handleAoFile(file: File) {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setFileMsg('Analyse du PDF…');
      try {
        const result = await extractPdfText(file);
        setAoText(result.text);
        setFileMsg(result.is_scanned
          ? `✓ ${file.name} — ${result.pages}p (OCR via GPT-4o)`
          : `✓ ${file.name} — ${result.pages}p`);
      } catch (e: unknown) {
        setFileMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      setFileMsg(`Lecture de ${file.name}…`);
      try {
        setAoText(await file.text());
        setFileMsg(`✓ ${file.name}`);
      } catch (e: unknown) {
        setFileMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function saveToExcel() {
    const rows = COMPANY_FIELDS.map(f => ({ Champ: f, Valeur: company[f] ?? '' }));
    const ws   = XLSX.utils.json_to_sheet(rows, { header: ['Champ','Valeur'] });
    ws['!cols'] = [{ wch: 22 }, { wch: 65 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profil OffrIA');
    XLSX.writeFile(wb, 'profil_entreprise_offria.xlsx');
    flash('Export réussi ✓');
  }

  async function loadFromExcel(file: File) {
    try {
      const wb   = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<{ Champ: string; Valeur: string }>(wb.Sheets[wb.SheetNames[0]]);
      const data: Partial<CompanyData> = {};
      rows.forEach(r => { if (r.Champ) (data as Record<string, string>)[r.Champ] = String(r.Valeur ?? ''); });
      setCompany(prev => ({ ...prev, ...data }));
      flash('Profil importé ✓');
    } catch { flash('Erreur lecture Excel'); }
  }

  function flash(msg: string) { setSaveTip(msg); setTimeout(() => setSaveTip(''), 2500); }

  const canGenerate = aoText.trim().length >= 50 && company.nom.trim().length > 0;

  return (
    <aside className="w-[320px] min-w-[320px] h-screen border-r border-border bg-card flex flex-col overflow-hidden">

      {/* ── Logo ─────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-sm">O</span>
          </div>
          <span className="font-semibold text-foreground text-lg tracking-tight">
            Offr<span className="text-primary">IA</span>
          </span>
        </div>
        <button
          onClick={onGoLanding}
          title="Retour à l'accueil"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Accueil
        </button>
      </div>

      {/* ── Scrollable content ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">

        {/* Appel d'offres */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Appel d'offres
          </p>

          {/* Drop zone */}
          <div
            onDragOver={e  => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files[0]; if (f) handleAoFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all group ${
              dragging
                ? 'border-primary/60 bg-accent/40'
                : 'border-border hover:border-primary/40 hover:bg-accent/30'
            }`}
          >
            <input
              ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAoFile(f); e.target.value = ''; }}
            />
            <div className="h-10 w-10 rounded-full bg-accent mx-auto mb-2.5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <svg className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-sm text-foreground font-medium">
              Déposez un fichier ou{' '}
              <span className="text-primary">parcourir</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">.txt · .pdf · .doc</p>
          </div>

          {fileMsg && (
            <p className={`text-[11px] px-1 ${
              fileMsg.startsWith('✓') ? 'text-primary'
              : fileMsg.startsWith('Erreur') ? 'text-destructive'
              : 'text-muted-foreground'
            }`}>{fileMsg}</p>
          )}

          <textarea
            className={`${inputCls} resize-none`}
            rows={4}
            placeholder="Objet : Marché de prestations informatiques…"
            value={aoText}
            onChange={e => setAoText(e.target.value)}
          />
          {aoText.length > 0 && aoText.length < 50 && (
            <p className="text-[10px] text-amber-500 px-1">{aoText.length}/50 caractères minimum</p>
          )}
        </div>

        {/* Modèle IA */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Modèle IA
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(providers.length > 0 ? providers : ['anthropic', 'openai', 'mistral']).map(p => {
              const meta      = PROVIDER_META[p] ?? { name: p, icon: null };
              const isSelected = p === provider;
              return (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-all border ${
                    isSelected
                      ? 'border-primary bg-accent text-foreground shadow-sm ring-1 ring-primary/20'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent/50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  {meta.icon(isSelected ? meta.selectedColor : 'text-muted-foreground')}
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>
          <select
            className={inputCls}
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            {filteredModels.map(m => (
              <option key={m.model_id} value={m.model_id}>
                {m.model_id}{m.description ? ` — ${m.description}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Profil entreprise */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Profil Entreprise
            </p>
            <div className="flex items-center gap-1.5">
              {saveTip && <span className="text-[10px] text-primary">{saveTip}</span>}
              <button
                onClick={saveToExcel}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border bg-card hover:bg-muted/60 transition-all"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
              <button
                onClick={() => excelRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border bg-card hover:bg-muted/60 transition-all"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                Import
              </button>
              <input
                ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) loadFromExcel(f); e.target.value = ''; }}
              />
            </div>
          </div>

          <div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
            <CollapsibleSection title="Identité & Légal">
              <input className={inputCls} placeholder="Raison sociale *" value={company.nom} onChange={e => updateField('nom', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={company.forme_juridique} onChange={e => updateField('forme_juridique', e.target.value)}>
                  <option value="">Forme juridique</option>
                  {['SARL','SA','SAS','SARL AU','GIE','Autre'].map(f => <option key={f}>{f}</option>)}
                </select>
                <input className={inputCls} placeholder="Fondée en" value={company.date_creation} onChange={e => updateField('date_creation', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <input className={inputCls} placeholder="RC"   value={company.rc}   onChange={e => updateField('rc',   e.target.value)} />
                <input className={inputCls} placeholder="ICE"  value={company.ice}  onChange={e => updateField('ice',  e.target.value)} />
                <input className={inputCls} placeholder="CNSS" value={company.cnss} onChange={e => updateField('cnss', e.target.value)} />
              </div>
              <input className={inputCls} placeholder="Identifiant Fiscal (IF)" value={company.if_fiscal} onChange={e => updateField('if_fiscal', e.target.value)} />
            </CollapsibleSection>

            <CollapsibleSection title="Contact">
              <input className={inputCls} placeholder="Adresse" value={company.adresse} onChange={e => updateField('adresse', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Ville"     value={company.ville}     onChange={e => updateField('ville',     e.target.value)} />
                <input className={inputCls} placeholder="Téléphone" value={company.telephone} onChange={e => updateField('telephone', e.target.value)} />
              </div>
              <input className={inputCls} placeholder="https://…" value={company.site_web} onChange={e => updateField('site_web', e.target.value)} />
            </CollapsibleSection>

            <CollapsibleSection title="Activité & Expertises">
              <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Présentation générale…" value={company.description} onChange={e => updateField('description', e.target.value)} />
              <input className={inputCls} placeholder="Secteurs (virgules)"           value={company.secteurs}       onChange={e => updateField('secteurs',       e.target.value)} />
              <input className={inputCls} placeholder="Expertises clés (virgules)"    value={company.expertises}     onChange={e => updateField('expertises',     e.target.value)} />
              <input className={inputCls} placeholder="Certifications (ISO 9001, …)" value={company.certifications} onChange={e => updateField('certifications', e.target.value)} />
            </CollapsibleSection>

            <CollapsibleSection title="Capacités & Références">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} type="number" placeholder="Effectif"    value={company.effectif}         onChange={e => updateField('effectif',         e.target.value)} />
                <input className={inputCls}               placeholder="CA (12M DH)" value={company.chiffre_affaires} onChange={e => updateField('chiffre_affaires', e.target.value)} />
              </div>
              <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Références client (un par ligne)" value={company.references} onChange={e => updateField('references', e.target.value)} />
            </CollapsibleSection>
          </div>
        </div>

        {/* Paramètres */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Paramètres
          </p>
          <div className="border border-border rounded-xl bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                </svg>
                <span className="text-sm text-foreground">Langue de réponse</span>
              </div>
              <div className="flex bg-muted rounded-lg p-0.5">
                {(['fr','en'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLangue(l)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      langue === l
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {l === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Generate Button ───────────────────────────────── */}
      <div className="px-3 py-4 border-t border-border">
        <button
          onClick={onGenerate}
          disabled={!canGenerate || loading || limitReached}
          className={`w-full text-primary-foreground font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md ${
            canGenerate && !loading && !limitReached
              ? 'gradient-cta hover:opacity-90 cursor-pointer'
              : 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
          }`}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Génération en cours…
            </>
          ) : limitReached ? (
            'Limite atteinte'
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
              </svg>
              Générer la réponse
            </>
          )}
        </button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          {!canGenerate && !loading
            ? !aoText.trim() ? "Ajoutez un appel d'offres pour continuer"
              : !company.nom.trim() ? 'Renseignez le nom de votre entreprise'
              : 'Vérifiez les champs requis'
            : limitReached ? 'Quota atteint'
            : '\u00a0'}
        </p>
      </div>
    </aside>
  );
}
