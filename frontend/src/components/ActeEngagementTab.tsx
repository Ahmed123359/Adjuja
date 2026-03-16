import { useRef, useState } from 'react';
import { fillActeEngagement } from '../api';
import type { ActeEngagementData } from '../types';
import { DEFAULT_ACTE_ENGAGEMENT } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? ''}
        className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground
                   placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ActeEngagementTab() {
  const [data, setData]           = useState<ActeEngagementData>(DEFAULT_ACTE_ENGAGEMENT);
  const [pdf, setPdf]             = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [cachet, setCachet]       = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  const pdfRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const cacRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ActeEngagementData>(key: K, val: ActeEngagementData[K]) {
    setData(prev => ({ ...prev, [key]: val }));
    setDone(false);
    setError('');
  }

  async function handleSubmit() {
    if (!pdf) { setError('Veuillez uploader le modèle PDF de l\'acte d\'engagement.'); return; }
    setLoading(true);
    setError('');
    setDone(false);
    try {
      const blob = await fillActeEngagement(pdf, data, signature, cachet);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = (pdf.name || 'acte_engagement').replace('.pdf', '_rempli.pdf');
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }

  const typeLabels = {
    physique:    'Personne physique',
    morale:      'Personne morale',
    groupement:  'Groupement',
  };

  return (
    <div className="space-y-8">

      {/* En-tête */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">Acte d'Engagement</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Remplissez le modèle PDF de l'acte d'engagement et apposez votre signature.
        </p>
      </div>

      {/* Upload PDF template */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Modèle PDF de l'acte d'engagement
        </h3>
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { setPdf(e.target.files?.[0] ?? null); setDone(false); }} />
        <button
          onClick={() => pdfRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-dashed border-border
                     text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {pdf ? pdf.name : 'Choisir le fichier PDF'}
        </button>
      </section>

      {/* Type de soumissionnaire */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Type de soumissionnaire</h3>
        <div className="flex gap-3 flex-wrap">
          {(['physique', 'morale', 'groupement'] as const).map(type => (
            <button
              key={type}
              onClick={() => set('type_soumissionnaire', type)}
              className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                data.type_soumissionnaire === type
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              {typeLabels[type]}
            </button>
          ))}
        </div>
      </section>

      {/* Champs selon le type */}
      {data.type_soumissionnaire === 'physique' && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Informations — Personne physique</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field label="Prénom, Nom et qualité" value={data.signataire_nom}
                onChange={v => set('signataire_nom', v)}
                placeholder="ex: Ahmed Benali, Directeur Général" required />
            </div>
            <div className="md:col-span-2">
              <Field label="Adresse du domicile élu" value={data.adresse_domicile}
                onChange={v => set('adresse_domicile', v)}
                placeholder="ex: 12 rue Hassan II, Casablanca" />
            </div>
            <Field label="N° affiliation CNSS" value={data.cnss}
              onChange={v => set('cnss', v)} placeholder="ex: 1234567" />
            <Field label="Localité (registre commerce)" value={data.rc_localite}
              onChange={v => set('rc_localite', v)} placeholder="ex: Casablanca" />
            <Field label="N° registre commerce" value={data.rc_numero}
              onChange={v => set('rc_numero', v)} placeholder="ex: 145853" />
            <Field label="N° taxe professionnelle" value={data.taxe_pro}
              onChange={v => set('taxe_pro', v)} placeholder="ex: 56789012" />
            <div className="md:col-span-2">
              <Field label="ICE (identifiant commun de l'entreprise)" value={data.ice}
                onChange={v => set('ice', v)} placeholder="ex: 002579010000023" />
            </div>
          </div>
        </section>
      )}

      {data.type_soumissionnaire === 'morale' && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Informations — Personne morale</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field label="Prénom, Nom et qualité du signataire" value={data.signataire_nom}
                onChange={v => set('signataire_nom', v)}
                placeholder="ex: Ahmed Benali, Directeur Général" required />
            </div>
            <Field label="Raison sociale" value={data.raison_sociale}
              onChange={v => set('raison_sociale', v)} placeholder="ex: ABI Consulting" required />
            <Field label="Forme juridique" value={data.forme_juridique}
              onChange={v => set('forme_juridique', v)} placeholder="ex: SARL" />
            <Field label="Capital social" value={data.capital_social}
              onChange={v => set('capital_social', v)} placeholder="ex: 100.000 MAD" />
            <div className="md:col-span-2">
              <Field label="Adresse du siège social" value={data.adresse_siege}
                onChange={v => set('adresse_siege', v)}
                placeholder="ex: Imm 30, Appt 08, Rue Moulay Ahmed Loukili, Rabat" />
            </div>
            <div className="md:col-span-2">
              <Field label="Adresse du domicile élu" value={data.adresse_domicile}
                onChange={v => set('adresse_domicile', v)}
                placeholder="Si différent du siège social" />
            </div>
            <Field label="N° affiliation CNSS" value={data.cnss}
              onChange={v => set('cnss', v)} placeholder="ex: 1234567" />
            <Field label="Localité (registre commerce)" value={data.rc_localite}
              onChange={v => set('rc_localite', v)} placeholder="ex: Casablanca" />
            <Field label="N° registre commerce" value={data.rc_numero}
              onChange={v => set('rc_numero', v)} placeholder="ex: 145853" />
            <Field label="N° taxe professionnelle" value={data.taxe_pro}
              onChange={v => set('taxe_pro', v)} placeholder="ex: 56789012" />
            <div className="md:col-span-2">
              <Field label="ICE (identifiant commun de l'entreprise)" value={data.ice}
                onChange={v => set('ice', v)} placeholder="ex: 002579010000023" />
            </div>
          </div>
        </section>
      )}

      {data.type_soumissionnaire === 'groupement' && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Informations — Groupement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Membres du groupement <span className="text-muted-foreground/60">(un par ligne)</span>
              </label>
              <textarea
                value={data.membres_groupement}
                onChange={e => set('membres_groupement', e.target.value)}
                placeholder={'Membre 1 — Raison sociale\nMembre 2 — Raison sociale\n...'}
                rows={4}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground
                           placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
            <div className="md:col-span-2">
              <Field label="ICE du mandataire" value={data.ice}
                onChange={v => set('ice', v)} placeholder="ex: 002579010000023" />
            </div>
          </div>
        </section>
      )}

      {/* Lieu & Date */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Lieu & Date — "Fait à … le …"</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Lieu" value={data.fait_a_lieu}
            onChange={v => set('fait_a_lieu', v)} placeholder="ex: Casablanca" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input
              type="date"
              value={data.fait_a_date}
              onChange={e => set('fait_a_date', e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground
                         focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        {data.fait_a_lieu && data.fait_a_date && (
          <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
            Aperçu : <span className="text-foreground font-medium">
              Fait à {data.fait_a_lieu}, le {data.fait_a_date.split('-').reverse().join('/')}
            </span>
          </p>
        )}
      </section>

      {/* Signature & Cachet */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Signature & Cachet</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Image de signature (optionnel)</p>
            <input ref={sigRef} type="file" accept="image/*" className="hidden"
              onChange={e => setSignature(e.target.files?.[0] ?? null)} />
            <button onClick={() => sigRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-dashed border-border
                         text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center">
              {signature
                ? <><span className="text-primary">✓</span> {signature.name}</>
                : '+ Choisir signature'}
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Image de cachet (optionnel)</p>
            <input ref={cacRef} type="file" accept="image/*" className="hidden"
              onChange={e => setCachet(e.target.files?.[0] ?? null)} />
            <button onClick={() => cacRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-dashed border-border
                         text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center">
              {cachet
                ? <><span className="text-primary">✓</span> {cachet.name}</>
                : '+ Choisir cachet'}
            </button>
          </div>
        </div>
      </section>

      {/* Erreur */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Bouton */}
      <button
        onClick={handleSubmit}
        disabled={loading || !pdf}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
          done
            ? 'bg-emerald-500 text-white'
            : loading
              ? 'bg-primary/60 text-primary-foreground cursor-not-allowed'
              : !pdf
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
        }`}
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Traitement en cours…
          </>
        ) : done ? (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Téléchargé avec succès
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Remplir & télécharger le PDF
          </>
        )}
      </button>

    </div>
  );
}