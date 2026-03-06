import React, { useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { Model, CompanyData } from '../types';
import { extractPdfText } from '../api';

const COMPANY_FIELDS = [
  'nom','forme_juridique','date_creation','site_web',
  'description','secteurs','expertises','certifications',
  'effectif','chiffre_affaires','adresse','ville','telephone',
  'rc','ice','cnss','if_fiscal','references',
] as const;

const sectionLabel = 'text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-2';

const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

// ── Accordion ─────────────────────────────────────────────
function Accordion({ title, open, onToggle, children, isDark = true }: {
  title: string; open: boolean; onToggle: () => void; children: ReactNode; isDark?: boolean;
}) {
  return (
    <div
      className="rounded-xl border transition-colors"
      style={{
        borderColor: open ? 'rgba(99,102,241,0.3)' : isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
        background: open ? 'rgba(99,102,241,0.04)' : 'transparent',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className={`text-[12px] font-semibold ${
          open ? 'text-indigo-400' : isDark ? 'text-slate-400' : 'text-slate-600'
        }`}>
          {title}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            open ? 'rotate-90 text-indigo-400' : isDark ? 'text-slate-600' : 'text-slate-400'
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
  langue: 'fr' | 'en'; setLangue: (v: 'fr' | 'en') => void;
  onGenerate: () => void;
  loading: boolean;
  limitReached: boolean;
  isDark: boolean;
};

const PROVIDER_META: Record<string, { icon: string; name: string }> = {
  anthropic: { icon: '◆', name: 'Claude'  },
  openai:    { icon: '○', name: 'GPT-4'   },
  mistral:   { icon: '⟡', name: 'Mistral' },
};

// ── Styled input wrappers ──────────────────────────────────
function Input({ isDark = true, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { isDark?: boolean }) {
  const blurBorder = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0';
  const textCls = isDark ? 'text-slate-200 placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400';
  const cls = `w-full text-[13px] ${textCls} px-3 py-2 rounded-xl outline-none transition-all duration-200`;
  return (
    <input
      {...props}
      className={`${cls} ${props.className ?? ''}`}
      style={{
        background: isDark ? 'rgba(8,16,28,0.8)' : '#ffffff',
        border: `1px solid ${blurBorder}`,
        ...props.style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.08)'; }}
      onBlur={e  => { e.currentTarget.style.borderColor = blurBorder; e.currentTarget.style.boxShadow = 'none'; }}
    />
  );
}

function Textarea({ isDark = true, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { isDark?: boolean }) {
  const blurBorder = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0';
  const textCls = isDark ? 'text-slate-200 placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400';
  const cls = `w-full text-[13px] ${textCls} px-3 py-2 rounded-xl outline-none transition-all duration-200 resize-none`;
  return (
    <textarea
      {...props}
      className={`${cls} ${props.className ?? ''}`}
      style={{
        background: isDark ? 'rgba(8,16,28,0.8)' : '#ffffff',
        border: `1px solid ${blurBorder}`,
        ...props.style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.08)'; }}
      onBlur={e  => { e.currentTarget.style.borderColor = blurBorder; e.currentTarget.style.boxShadow = 'none'; }}
    />
  );
}

function StyledSelect({ isDark = true, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { isDark?: boolean }) {
  const border = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0';
  const textCls = isDark ? 'text-slate-200' : 'text-slate-800';
  const cls = `w-full text-[13px] ${textCls} px-3 py-2 rounded-xl outline-none transition-all duration-200 appearance-none cursor-pointer`;
  return (
    <select
      {...props}
      className={`${cls} ${props.className ?? ''}`}
      style={{
        background: isDark ? 'rgba(8,16,28,0.8)' : '#ffffff',
        border: `1px solid ${border}`,
        backgroundImage: selectArrow,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right .75rem center',
        ...props.style,
      }}
    />
  );
}

// ── Main component ─────────────────────────────────────────
export default function LeftPanel(props: Props) {
  const {
    aoText, setAoText, provider, setProvider, model, setModel, models,
    company, setCompany, langue, setLangue,
    onGenerate, loading, limitReached, isDark,
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
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setFileMsg(`Analyse du PDF…`);
      try {
        const result = await extractPdfText(file);
        setAoText(result.text);
        const label = result.is_scanned
          ? `✓ ${file.name} — ${result.pages}p (OCR via GPT-4o)`
          : `✓ ${file.name} — ${result.pages}p`;
        setFileMsg(label);
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
  const toggle = (key: keyof typeof open) => setOpen(s => ({ ...s, [key]: !s[key] }));

  // ── Theme tokens ───────────────────────────────────────
  const asideBg     = isDark ? '#050914' : '#ffffff';
  const asideBorder = isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0';
  const dropBorder  = dragging
    ? 'rgba(99,102,241,0.6)'
    : isDark ? 'rgba(255,255,255,0.08)' : '#cbd5e1';
  const dropBg      = dragging ? 'rgba(99,102,241,0.08)' : 'transparent';
  const dropHoverBorder = isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.4)';
  const dropHoverBg     = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(99,102,241,0.03)';
  const dropResetBorder = isDark ? 'rgba(255,255,255,0.08)' : '#cbd5e1';
  const langContainerBg     = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc';
  const langContainerBorder = isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0';
  const bottomBorder        = isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0';
  const pillActiveBg     = 'rgba(99,102,241,0.15)';
  const pillActiveBorder = 'rgba(99,102,241,0.45)';
  const pillInactiveBg     = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc';
  const pillInactiveBorder = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0';

  return (
    <aside
      className="w-[340px] flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        background: asideBg,
        borderRight: `1px solid ${asideBorder}`,
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6">

        {/* ══ Appel d'offres ══════════════════════════════ */}
        <section>
          <p className={sectionLabel}>Appel d'offres</p>

          {/* Drop zone */}
          <div
            onDragOver={e  => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files[0]; if (f) handleAoFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-all mb-2.5"
            style={{ borderColor: dropBorder, background: dropBg }}
            onMouseEnter={e => { if (!dragging) { e.currentTarget.style.borderColor = dropHoverBorder; e.currentTarget.style.background = dropHoverBg; }}}
            onMouseLeave={e => { if (!dragging) { e.currentTarget.style.borderColor = dropResetBorder; e.currentTarget.style.background = 'transparent'; }}}
          >
            <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAoFile(f); e.target.value = ''; }}
            />
            <p className={`text-[13px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Déposez un fichier ou <span className="text-indigo-400">cliquez</span>
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>.txt · .pdf · .doc</p>
          </div>

          {fileMsg && (
            <p className={`text-[11px] mb-2 ${
              fileMsg.startsWith('✓') ? 'text-indigo-400'
              : fileMsg.startsWith('Erreur') ? 'text-red-400'
              : isDark ? 'text-slate-500' : 'text-slate-400'
            }`}>{fileMsg}</p>
          )}

          <Textarea
            isDark={isDark}
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
              const meta   = PROVIDER_META[p] ?? { icon: '●', name: p };
              const active = p === provider;
              return (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: active ? pillActiveBg : pillInactiveBg,
                    border: `1px solid ${active ? pillActiveBorder : pillInactiveBorder}`,
                    color: active ? '#818cf8' : '#64748b',
                  }}
                >
                  <span className="text-[14px]">{meta.icon}</span>
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>

          <StyledSelect
            isDark={isDark}
            value={model}
            onChange={e => setModel(e.target.value)}
            style={{ backgroundPosition: 'right .75rem center' }}
          >
            {filteredModels.map(m => (
              <option key={m.model_id} value={m.model_id}>
                {m.model_id}{m.description ? ` — ${m.description}` : ''}
              </option>
            ))}
          </StyledSelect>
        </section>

        {/* ══ Profil entreprise ═══════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className={sectionLabel.replace(' mb-2', '')}>Profil entreprise</p>
            <div className="flex items-center gap-3">
              {saveTip && <span className="text-[10px] text-indigo-400">{saveTip}</span>}
              <button onClick={saveToExcel} className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors" title="Exporter">
                ↓ Export
              </button>
              <button onClick={() => excelRef.current?.click()} className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors" title="Importer">
                ↑ Import
              </button>
              <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) loadFromExcel(f); e.target.value = ''; }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Accordion isDark={isDark} title="Identité & Légal" open={open.identity} onToggle={() => toggle('identity')}>
              <Input isDark={isDark} placeholder="Raison sociale *" value={company.nom} onChange={e => updateField('nom', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <StyledSelect
                  isDark={isDark}
                  value={company.forme_juridique}
                  onChange={e => updateField('forme_juridique', e.target.value)}
                  style={{ backgroundPosition: 'right .6rem center' }}
                >
                  <option value="">Forme juridique</option>
                  {['SARL','SA','SAS','SARL AU','GIE','Autre'].map(f => <option key={f}>{f}</option>)}
                </StyledSelect>
                <Input isDark={isDark} placeholder="Fondée en" value={company.date_creation} onChange={e => updateField('date_creation', e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Input isDark={isDark} placeholder="RC"   value={company.rc}   onChange={e => updateField('rc',   e.target.value)} />
                <Input isDark={isDark} placeholder="ICE"  value={company.ice}  onChange={e => updateField('ice',  e.target.value)} />
                <Input isDark={isDark} placeholder="CNSS" value={company.cnss} onChange={e => updateField('cnss', e.target.value)} />
              </div>
              <Input isDark={isDark} placeholder="Identifiant Fiscal (IF)" value={company.if_fiscal} onChange={e => updateField('if_fiscal', e.target.value)} />
            </Accordion>

            <Accordion isDark={isDark} title="Contact" open={open.contact} onToggle={() => toggle('contact')}>
              <Input isDark={isDark} placeholder="Adresse" value={company.adresse} onChange={e => updateField('adresse', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input isDark={isDark} placeholder="Ville"     value={company.ville}     onChange={e => updateField('ville',     e.target.value)} />
                <Input isDark={isDark} placeholder="Téléphone" value={company.telephone} onChange={e => updateField('telephone', e.target.value)} />
              </div>
              <Input isDark={isDark} placeholder="https://…" value={company.site_web} onChange={e => updateField('site_web', e.target.value)} />
            </Accordion>

            <Accordion isDark={isDark} title="Activité & Expertises" open={open.activity} onToggle={() => toggle('activity')}>
              <Textarea isDark={isDark} rows={3} placeholder="Présentation générale…"        value={company.description}    onChange={e => updateField('description',    e.target.value)} />
              <Input isDark={isDark} placeholder="Secteurs (virgules)"           value={company.secteurs}       onChange={e => updateField('secteurs',       e.target.value)} />
              <Input isDark={isDark} placeholder="Expertises clés (virgules)"    value={company.expertises}     onChange={e => updateField('expertises',     e.target.value)} />
              <Input isDark={isDark} placeholder="Certifications (ISO 9001, …)" value={company.certifications} onChange={e => updateField('certifications', e.target.value)} />
            </Accordion>

            <Accordion isDark={isDark} title="Capacités & Références" open={open.capacity} onToggle={() => toggle('capacity')}>
              <div className="grid grid-cols-2 gap-2">
                <Input isDark={isDark} type="number" placeholder="Effectif"   value={company.effectif}         onChange={e => updateField('effectif',         e.target.value)} />
                <Input isDark={isDark}               placeholder="CA (12M DH)" value={company.chiffre_affaires} onChange={e => updateField('chiffre_affaires', e.target.value)} />
              </div>
              <Textarea isDark={isDark} rows={4} placeholder="Références client (un par ligne)" value={company.references} onChange={e => updateField('references', e.target.value)} />
            </Accordion>
          </div>
        </section>

        {/* ══ Paramètres ══════════════════════════════════ */}
        <section>
          <p className={sectionLabel}>Paramètres</p>

          {/* Langue */}
          <div className="flex items-center justify-between">
            <span className={`text-[12px] ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>Langue de réponse</span>
            <div
              className="flex gap-1 p-1 rounded-lg"
              style={{ background: langContainerBg, border: `1px solid ${langContainerBorder}` }}
            >
              {(['fr','en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLangue(l)}
                  className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-all"
                  style={langue === l
                    ? { background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff' }
                    : { color: '#64748b' }
                  }
                >
                  {l === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="h-1" />
      </div>

      {/* ── Bouton Générer ─────────────────────────────────── */}
      <div className="p-4" style={{ borderTop: `1px solid ${bottomBorder}` }}>
        <button
          onClick={onGenerate}
          disabled={!canGenerate || loading || limitReached}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[14px] transition-all duration-200"
          style={canGenerate && !loading && !limitReached
            ? {
                background: 'linear-gradient(135deg,#4338ca,#6366f1)',
                color: '#fff',
                boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
              }
            : {
                background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                color: isDark ? '#475569' : '#94a3b8',
                cursor: 'not-allowed',
              }
          }
          onMouseEnter={e => {
            if (canGenerate && !loading && !limitReached)
              e.currentTarget.style.boxShadow = '0 6px 32px rgba(99,102,241,0.55)';
          }}
          onMouseLeave={e => {
            if (canGenerate && !loading && !limitReached)
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(99,102,241,0.4)';
          }}
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
          <p className={`text-center text-[10px] mt-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            {!aoText.trim() ? "Ajoutez un appel d'offres pour continuer"
             : !company.nom.trim() ? 'Renseignez le nom de votre entreprise'
             : 'Vérifiez les champs requis'}
          </p>
        )}
      </div>
    </aside>
  );
}
