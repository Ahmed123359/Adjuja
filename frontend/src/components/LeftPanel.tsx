import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { CompanyData } from '../types';
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
  company: CompanyData; setCompany: (v: CompanyData | ((prev: CompanyData) => CompanyData)) => void;
  langue: 'fr' | 'en'; setLangue: (v: 'fr' | 'en') => void;
  onGenerate: () => void;
  loading: boolean;
  limitReached: boolean;
  onShowPricing: () => void;
  onGoLanding: () => void;
  onClose?: () => void;
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
        className="flex items-center justify-between w-full px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/60 rounded-lg transition-colors"
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
  const { aoText, setAoText, company, setCompany, langue, setLangue,
    onGenerate, loading, limitReached, onShowPricing, onGoLanding, onClose } = props;

  const [dragging, setDragging] = useState(false);
  const [fileMsg,  setFileMsg]  = useState('');
  const [saveTip,  setSaveTip]  = useState('');

  const fileRef  = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

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
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-sm">O</span>
          </div>
          <span className="font-semibold text-foreground text-lg tracking-tight">
            Offr<span className="text-primary">IA</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              title="Fermer"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

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
            className={`border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all group flex items-center gap-3 ${
              dragging
                ? 'border-primary/60 bg-accent/40'
                : 'border-border hover:border-primary/40 hover:bg-accent/30'
            }`}
          >
            <input
              ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAoFile(f); e.target.value = ''; }}
            />
            <div className="h-9 w-9 rounded-full bg-accent flex-shrink-0 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <svg className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-foreground font-medium">
                Déposez ou{' '}
                <span className="text-primary">parcourir</span>
              </p>
              <p className="text-xs text-muted-foreground">.txt · .pdf · .doc</p>
            </div>
          </div>

          {fileMsg && (
            <p className={`text-[11px] px-1 ${
              fileMsg.startsWith('✓') ? 'text-primary'
              : fileMsg.startsWith('Erreur') ? 'text-destructive'
              : 'text-muted-foreground'
            }`}>{fileMsg}</p>
          )}

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
          <div className="border border-border rounded-xl bg-card px-3 py-2.5">
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
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={limitReached ? onShowPricing : onGenerate}
          disabled={!canGenerate || loading}
          className={`w-full text-primary-foreground font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md ${
            limitReached
              ? 'cursor-pointer'
              : canGenerate && !loading
                ? 'gradient-cta hover:opacity-90 cursor-pointer'
                : 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
          }`}
          style={limitReached ? { background: 'linear-gradient(135deg,#4338ca,#6366f1)' } : undefined}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Génération en cours…
            </>
          ) : limitReached ? (
            'Voir les offres →'
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
