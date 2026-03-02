import { useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { Model, CompanyData } from '../types';

// ── Helpers ───────────────────────────────────────────────
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf   = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i) => {
      const page = await pdf.getPage(i + 1);
      const c    = await page.getTextContent();
      return c.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    })
  );
  return pages.join('\n\n').trim();
}

const COMPANY_FIELDS = [
  'nom','forme_juridique','date_creation','site_web',
  'description','secteurs','expertises','certifications',
  'effectif','chiffre_affaires','adresse','ville','telephone',
  'rc','ice','cnss','if_fiscal','references',
] as const;

// ── Design token ──────────────────────────────────────────
const inputCls = [
  'w-full',
  'bg-white dark:bg-[#0F1929]',
  'border border-gray-200 dark:border-transparent',
  'focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10',
  'rounded-xl',
  'text-gray-800 dark:text-slate-200',
  'text-[13px] placeholder:text-gray-400 dark:placeholder:text-slate-600',
  'px-3 py-2',
  'transition-all duration-200',
  'outline-none',
].join(' ');

const sectionLabel = 'text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-500 mb-2';

// ── Accordion ─────────────────────────────────────────────
function Accordion({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-colors ${
      open
        ? 'border-indigo-200/60 dark:border-indigo-500/20'
        : 'border-gray-200 dark:border-white/[.04]'
    }`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className={`text-[12px] font-semibold ${
          open ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-slate-400'
        }`}>
          {title}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            open ? 'rotate-90 text-indigo-500' : 'text-gray-400 dark:text-slate-600'
          }`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────
type Props = {
  aoText: string; setAoText: (v: string) => void;
  provider: string; setProvider: (v: string) => void;
  model: string; setModel: (v: string) => void;
  models: Model[];
  company: CompanyData; setCompany: (v: CompanyData | ((prev: CompanyData) => CompanyData)) => void;
  temperature: number; setTemp: (v: number) => void;
  maxTokens: number; setMaxTokens: (v: number) => void;
  instructions: string; setInstr: (v: string) => void;
  langue: 'fr' | 'en'; setLangue: (v: 'fr' | 'en') => void;
  onGenerate: () => void;
  loading: boolean;
  limitReached: boolean;
};

const PROVIDER_META: Record<string, { icon: string; name: string; color: string }> = {
  anthropic: { icon: '◆', name: 'Claude',  color: 'text-orange-400' },
  openai:    { icon: '○', name: 'GPT-4',   color: 'text-emerald-400' },
  mistral:   { icon: '⟡', name: 'Mistral', color: 'text-blue-400' },
};

const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

// ── Main component ─────────────────────────────────────────
export default function LeftPanel(props: Props) {
  const {
    aoText, setAoText, provider, setProvider, model, setModel, models,
    company, setCompany, temperature, setTemp, maxTokens, setMaxTokens,
    instructions, setInstr, langue, setLangue,
    onGenerate, loading, limitReached,
  } = props;

  const [dragging, setDragging] = useState(false);
  const [fileMsg,  setFileMsg]  = useState('');
  const [saveTip,  setSaveTip]  = useState('');
  const [open, setOpen] = useState({
    identity: true, contact: false, activity: false, capacity: false,
  });

  const fileRef  = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  const providers      = [...new Set(models.map(m => m.provider))];
  const filteredModels = models.filter(m => m.provider === provider);

  const updateField = useCallback((f: keyof CompanyData, v: string) => {
    setCompany((prev: CompanyData) => ({ ...prev, [f]: v }));
  }, [setCompany]);

  async function handleAoFile(file: File) {
    setFileMsg(`Lecture de ${file.name}…`);
    try {
      const text = file.name.toLowerCase().endsWith('.pdf')
        ? await extractPdfText(file) : await file.text();
      setAoText(text);
      setFileMsg(`✓ ${file.name}`);
    } catch (e: unknown) {
      setFileMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
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
  const toggle = (key: keyof typeof open) => setOpen(s => ({ ...s, [key]: !s[key] }));

  return (
    <aside className="w-[340px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-white/[.05] bg-white dark:bg-[#0B1220] overflow-hidden">

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6">

        {/* ══ Appel d'offres ══════════════════════════════ */}
        <section>
          <p className={sectionLabel}>Appel d'offres</p>

          <div
            onDragOver={e  => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files[0]; if (f) handleAoFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-all mb-2.5 ${
              dragging
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10'
                : 'border-gray-200 dark:border-white/[.07] hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:bg-gray-50 dark:hover:bg-white/[.02]'
            }`}
          >
            <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAoFile(f); e.target.value = ''; }}
            />
            <p className="text-[13px] font-medium text-gray-500 dark:text-slate-400">
              Déposez un fichier ou <span className="text-indigo-600 dark:text-indigo-400">cliquez</span>
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-600 mt-0.5">.txt · .pdf · .doc</p>
          </div>

          {fileMsg && (
            <p className={`text-[11px] mb-2 ${
              fileMsg.startsWith('✓') ? 'text-indigo-500 dark:text-indigo-400'
              : fileMsg.startsWith('Erreur') ? 'text-red-400'
              : 'text-gray-500 dark:text-slate-500'
            }`}>{fileMsg}</p>
          )}

          <textarea
            className={`${inputCls} resize-none`}
            rows={5}
            placeholder="Objet : Marché de prestations informatiques…"
            value={aoText}
            onChange={e => setAoText(e.target.value)}
          />
          {aoText.length > 0 && aoText.length < 50 && (
            <p className="text-[10px] text-amber-500 mt-1">{aoText.length}/50 caractères minimum</p>
          )}
        </section>

        {/* ══ Modèle IA ═══════════════════════════════════ */}
        <section>
          <p className={sectionLabel}>Modèle IA</p>

          {/* Provider pills */}
          <div className="flex gap-1.5 mb-3">
            {providers.map(p => {
              const meta   = PROVIDER_META[p] ?? { icon: '●', name: p, color: '' };
              const active = p === provider;
              return (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold transition-all ${
                    active
                      ? 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      : 'border-gray-200 dark:border-white/[.05] text-gray-500 dark:text-slate-500 hover:border-gray-300 dark:hover:border-white/[.10]'
                  }`}
                >
                  <span className={`text-[14px] ${meta.color}`}>{meta.icon}</span>
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>

          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer`}
            style={{ backgroundImage: selectArrow, backgroundRepeat: 'no-repeat', backgroundPosition: 'right .75rem center' }}
          >
            {filteredModels.map(m => (
              <option key={m.model_id} value={m.model_id}>
                {m.model_id}{m.description ? ` — ${m.description}` : ''}
              </option>
            ))}
          </select>
        </section>

        {/* ══ Profil entreprise ═══════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className={sectionLabel.replace(' mb-2', '')}>Profil entreprise</p>
            <div className="flex items-center gap-3">
              {saveTip && <span className="text-[10px] text-indigo-500 dark:text-indigo-400">{saveTip}</span>}
              <button onClick={saveToExcel} className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-indigo-500 transition-colors" title="Exporter">
                ↓ Export
              </button>
              <button onClick={() => excelRef.current?.click()} className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-indigo-500 transition-colors" title="Importer">
                ↑ Import
              </button>
              <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) loadFromExcel(f); e.target.value = ''; }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Accordion title="Identité & Légal" open={open.identity} onToggle={() => toggle('identity')}>
              <input className={inputCls} placeholder="Raison sociale *" value={company.nom} onChange={e => updateField('nom', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={company.forme_juridique}
                  onChange={e => updateField('forme_juridique', e.target.value)}
                  className={`${inputCls} appearance-none cursor-pointer`}
                  style={{ backgroundImage: selectArrow, backgroundRepeat: 'no-repeat', backgroundPosition: 'right .6rem center' }}
                >
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
            </Accordion>

            <Accordion title="Contact" open={open.contact} onToggle={() => toggle('contact')}>
              <input className={inputCls} placeholder="Adresse" value={company.adresse} onChange={e => updateField('adresse', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Ville"     value={company.ville}     onChange={e => updateField('ville',     e.target.value)} />
                <input className={inputCls} placeholder="Téléphone" value={company.telephone} onChange={e => updateField('telephone', e.target.value)} />
              </div>
              <input className={inputCls} placeholder="https://…" value={company.site_web} onChange={e => updateField('site_web', e.target.value)} />
            </Accordion>

            <Accordion title="Activité & Expertises" open={open.activity} onToggle={() => toggle('activity')}>
              <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Présentation générale…"        value={company.description}    onChange={e => updateField('description',    e.target.value)} />
              <input className={inputCls} placeholder="Secteurs (virgules)"           value={company.secteurs}       onChange={e => updateField('secteurs',       e.target.value)} />
              <input className={inputCls} placeholder="Expertises clés (virgules)"    value={company.expertises}     onChange={e => updateField('expertises',     e.target.value)} />
              <input className={inputCls} placeholder="Certifications (ISO 9001, …)" value={company.certifications} onChange={e => updateField('certifications', e.target.value)} />
            </Accordion>

            <Accordion title="Capacités & Références" open={open.capacity} onToggle={() => toggle('capacity')}>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} type="number" placeholder="Effectif"   value={company.effectif}         onChange={e => updateField('effectif',         e.target.value)} />
                <input className={inputCls}               placeholder="CA (12M DH)" value={company.chiffre_affaires} onChange={e => updateField('chiffre_affaires', e.target.value)} />
              </div>
              <textarea className={`${inputCls} resize-none`} rows={4} placeholder="Références client (un par ligne)" value={company.references} onChange={e => updateField('references', e.target.value)} />
            </Accordion>
          </div>
        </section>

        {/* ══ Paramètres ══════════════════════════════════ */}
        <section>
          <p className={sectionLabel}>Paramètres</p>

          {/* Langue */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[12px] text-gray-500 dark:text-slate-400">Langue de réponse</span>
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/[.04] rounded-lg">
              {(['fr','en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLangue(l)}
                  className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-all ${
                    langue === l
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
                  }`}
                >
                  {l === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-500 mb-1.5">
              Instructions supplémentaires
            </p>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="Adapter au contexte marocain, insister sur ISO 9001…"
              value={instructions}
              onChange={e => setInstr(e.target.value)}
            />
          </div>

          {/* Créativité */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-500">
                Créativité
              </p>
              <span className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range" min="0" max="1" step="0.1" value={temperature}
              onChange={e => setTemp(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] text-gray-400 dark:text-slate-600">Précis</span>
              <span className="text-[9px] text-gray-400 dark:text-slate-600">Créatif</span>
            </div>
          </div>

          {/* Tokens */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-500">
              Tokens / section
            </p>
            <input
              type="number" min="256" max="16000" value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value, 10))}
              className={`${inputCls} w-24 text-right shrink-0`}
            />
          </div>
        </section>

        <div className="h-1" />
      </div>

      {/* ── Bouton Générer ─────────────────────────────────── */}
      <div className="p-4 border-t border-gray-200 dark:border-white/[.05]">
        <button
          onClick={onGenerate}
          disabled={!canGenerate || loading || limitReached}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[14px] transition-all duration-200 ${
            canGenerate && !loading && !limitReached
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-[.98]'
              : 'bg-gray-100 dark:bg-white/[.04] text-gray-400 dark:text-slate-600 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Génération en cours…
            </>
          ) : limitReached ? (
            'Limite atteinte'
          ) : (
            <>
              Générer la réponse
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </>
          )}
        </button>
        {!canGenerate && !loading && (
          <p className="text-center text-[10px] text-gray-400 dark:text-slate-500 mt-2">
            {!aoText.trim() ? "Ajoutez un appel d'offres pour continuer"
             : !company.nom.trim() ? 'Renseignez le nom de votre entreprise'
             : 'Vérifiez les champs requis'}
          </p>
        )}
      </div>
    </aside>
  );
}
