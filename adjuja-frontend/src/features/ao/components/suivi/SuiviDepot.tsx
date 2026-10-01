// Suivi du dépôt : du dépôt du dossier au résultat -- 2026-10-01.
//
// Spec : context/feature-spec/suivi-resultats/00-overview.md (phase 1).
//
// Ordre de l'écran = ordre de la procédure : le marché (nature, estimation),
// les offres lues en séance publique (art. 42 : le président lit les admis,
// les écartés et les montants), le classement prévu, puis le résultat
// officiel. L'entreprise saisit ce qu'elle entend en séance et voit tout de
// suite qui devrait gagner, sans attendre la publication du PV.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { useRessource } from '../../../../shared/lib/cache';
import { Button } from '../../../../shared/ui/Button';
import { DateField } from '../../../../shared/ui/DateField';
import { Select } from '../../../../shared/ui/Select';
import { enregistrerOffres, enregistrerSuivi, fetchSuivi } from '../../api';
import type { NatureMarche, OffreSaisie, StatutFinal, StatutOffre, Suivi, SuiviData } from '../../types';
import { ClassementPrevu } from './ClassementPrevu';
import { afficherMontant, lireMontant } from './montants';

const NATURES: NatureMarche[] = ['travaux', 'fournitures', 'services', 'etudes', 'gardiennage_nettoyage'];
const STATUTS_OFFRE: StatutOffre[] = ['en_attente', 'admis', 'ecarte_administratif', 'ecarte_technique'];
const STATUTS_FINAUX: StatutFinal[] = ['en_attente', 'retenu', 'non_retenu', 'infructueux', 'annule'];

function loc(langue: string): string {
  return langue === 'en' ? 'en-GB' : 'fr-FR';
}

/* --------------------------------------------------------------- pièces */

const champ: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box',
  borderRadius: 'var(--adj-round-s)', border: '1px solid var(--adj-edge)',
  background: 'var(--adj-panel)', color: 'var(--adj-ink)', fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
};

function Bloc({ titre, aide, children }: { titre: string; aide?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-3)', paddingTop: 'var(--adj-5)', borderTop: '1px solid var(--adj-hairline)', minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 'var(--adj-t-base)', fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>{titre}</h3>
      {aide && <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)', lineHeight: 'var(--adj-lead-body)' as never }}>{aide}</p>}
      {children}
    </section>
  );
}

function Etiquette({ texte, children }: { texte: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>{texte}</span>
      {children}
    </label>
  );
}

/** Champ de montant : saisie libre (« 1 250 000,50 »), relu à la sortie. */
function ChampMontant({ valeur, onChange, placeholder, label }: {
  valeur: string; onChange: (v: string) => void; placeholder?: string; label: string;
}) {
  const invalide = valeur.trim() !== '' && lireMontant(valeur) === null;
  return (
    <input
      value={valeur}
      onChange={e => onChange(e.target.value)}
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalide || undefined}
      className="adj-focusable adj-fig"
      style={{ ...champ, borderColor: invalide ? 'var(--adj-neg)' : 'var(--adj-edge)', textAlign: 'right' }}
    />
  );
}

function Erreur({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return <p role="alert" style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>{texte}</p>;
}

/* ----------------------------------------------------- le marché + résultat */

type FormMarche = {
  nature: NatureMarche; estimation: string; poids: string; seuil: string;
  ouverture: string; statutFinal: StatutFinal; attributaire: string; montantAttribue: string;
};

function formDepuis(s: Suivi, langue: string): FormMarche {
  const d = s.suivi!;
  const montant = (v: string | null) => (v ? afficherMontant(v, loc(langue)) : '');
  return {
    nature: d.nature_marche, estimation: montant(d.estimation_mad),
    poids: d.poids_financier ? String(Number(d.poids_financier)) : '',
    seuil: d.seuil_technique ? String(Number(d.seuil_technique)) : '',
    ouverture: d.date_ouverture?.slice(0, 10) ?? '', statutFinal: d.statut_final,
    attributaire: d.attributaire ?? '', montantAttribue: montant(d.montant_attribue),
  };
}

function versSuiviData(f: FormMarche, base: SuiviData): SuiviData {
  const nombre = (v: string) => (v.trim() ? v.trim().replace(',', '.') : null);
  return {
    ...base,
    nature_marche: f.nature,
    estimation_mad: lireMontant(f.estimation),
    poids_financier: f.nature === 'etudes' ? nombre(f.poids) : null,
    seuil_technique: f.nature === 'etudes' ? nombre(f.seuil) : null,
    date_ouverture: f.ouverture || null,
    statut_final: f.statutFinal,
    attributaire: f.attributaire.trim() || null,
    montant_attribue: lireMontant(f.montantAttribue),
  };
}

/* ------------------------------------------------------------ les offres */

type Ligne = {
  cle: string; nom: string; est_nous: boolean; lu: string; corrige: string;
  statut: StatutOffre; motif: string; note: string;
};

let compteur = 0;
const nouvelleCle = () => `l${++compteur}`;

function lignesDepuis(s: Suivi, langue: string): Ligne[] {
  return s.offres.map(o => ({
    cle: nouvelleCle(), nom: o.nom, est_nous: o.est_nous,
    lu: o.montant_lu ? afficherMontant(o.montant_lu, loc(langue)) : '',
    corrige: o.montant_corrige ? afficherMontant(o.montant_corrige, loc(langue)) : '',
    statut: o.statut, motif: o.motif ?? '', note: o.note_technique ? String(Number(o.note_technique)) : '',
  }));
}

function versOffres(lignes: Ligne[]): OffreSaisie[] {
  return lignes.filter(l => l.nom.trim()).map(l => ({
    nom: l.nom.trim(), est_nous: l.est_nous,
    montant_lu: lireMontant(l.lu), montant_corrige: lireMontant(l.corrige),
    statut: l.statut, motif: l.motif.trim() || null,
    note_technique: l.note.trim() ? l.note.trim().replace(',', '.') : null,
  }));
}

function LigneOffre({ l, etudes, etroit, onChange, onRetirer }: {
  l: Ligne; etudes: boolean; etroit: boolean;
  onChange: (l: Ligne) => void; onRetirer: () => void;
}) {
  const { t } = useTranslation();
  const ecarte = l.statut === 'ecarte_administratif' || l.statut === 'ecarte_technique';
  return (
    <li style={{
      display: 'grid', gap: 8, padding: '12px 0', borderBottom: '1px solid var(--adj-hairline)',
      gridTemplateColumns: etroit ? '1fr' : `minmax(0, 2fr) minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1.2fr)${etudes ? ' minmax(0, 0.8fr)' : ''} 40px`,
      alignItems: 'start',
    }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <input
          value={l.nom}
          onChange={e => onChange({ ...l, nom: e.target.value })}
          placeholder={t('suivi.offres.nom')}
          aria-label={t('suivi.offres.nom')}
          className="adj-focusable"
          style={{ ...champ, fontWeight: (l.est_nous ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never }}
        />
        {l.est_nous && <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-brand)' }}>{t('suivi.offres.votreOffre')}</span>}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <Select
          value={l.statut}
          onChange={v => onChange({ ...l, statut: v as StatutOffre })}
          options={STATUTS_OFFRE.map(s => ({ value: s, label: t(`suivi.statutOffre.${s}`) }))}
        />
        {ecarte && (
          <input
            value={l.motif}
            onChange={e => onChange({ ...l, motif: e.target.value })}
            placeholder={t('suivi.offres.motif')}
            aria-label={t('suivi.offres.motif')}
            className="adj-focusable"
            style={champ}
          />
        )}
      </span>
      <ChampMontant valeur={l.lu} onChange={v => onChange({ ...l, lu: v })} label={t('suivi.offres.montantLu')} placeholder={t('suivi.offres.montantLu')} />
      <ChampMontant valeur={l.corrige} onChange={v => onChange({ ...l, corrige: v })} label={t('suivi.offres.montantCorrige')} placeholder={t('suivi.offres.montantCorrige')} />
      {etudes && (
        <input
          value={l.note}
          onChange={e => onChange({ ...l, note: e.target.value })}
          inputMode="decimal"
          placeholder={t('suivi.offres.note')}
          aria-label={t('suivi.offres.note')}
          className="adj-focusable adj-fig"
          style={{ ...champ, textAlign: 'right' }}
        />
      )}
      {l.est_nous ? <span /> : (
        <button
          onClick={onRetirer}
          aria-label={t('suivi.offres.retirer', { nom: l.nom || '' })}
          title={t('suivi.offres.retirer', { nom: l.nom || '' })}
          className="adj-focusable"
          style={{
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--adj-hairline)', borderRadius: 'var(--adj-round-s)',
            background: 'transparent', color: 'var(--adj-ink-3)', cursor: 'pointer',
          }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

/* --------------------------------------------------------------- panneau */

function PanneauOuvert({ s, aoId, onMaj }: { s: Suivi; aoId: string; onMaj: (s: Suivi) => void }) {
  const { t, i18n } = useTranslation();
  const etroit = useIsMobile(760);
  const [form, setForm] = useState<FormMarche>(() => formDepuis(s, i18n.language));
  const [lignes, setLignes] = useState<Ligne[]>(() => lignesDepuis(s, i18n.language));
  const [envoi, setEnvoi] = useState<'marche' | 'offres' | 'resultat' | null>(null);
  const [erreur, setErreur] = useState<{ ou: string; texte: string } | null>(null);
  const etudes = form.nature === 'etudes';

  const enregistrerMarche = async (ou: 'marche' | 'resultat') => {
    setEnvoi(ou); setErreur(null);
    try { onMaj(await enregistrerSuivi(aoId, versSuiviData(form, s.suivi!))); }
    catch (e) { setErreur({ ou, texte: e instanceof Error ? e.message : String(e) }); }
    finally { setEnvoi(null); }
  };

  const enregistrerLesOffres = async () => {
    setEnvoi('offres'); setErreur(null);
    try {
      // Le marché d'abord : le classement dépend de la nature et de l'estimation.
      await enregistrerSuivi(aoId, versSuiviData(form, s.suivi!));
      onMaj(await enregistrerOffres(aoId, versOffres(lignes)));
    } catch (e) {
      setErreur({ ou: 'offres', texte: e instanceof Error ? e.message : String(e) });
    } finally { setEnvoi(null); }
  };

  const estimationSuggeree = s.estimation_suggeree && !form.estimation;
  const montantsInvalides = lignes.some(l => (l.lu.trim() && !lireMontant(l.lu)) || (l.corrige.trim() && !lireMontant(l.corrige)));

  return (
    <>
      <Bloc titre={t('suivi.marche.titre')} aide={t('suivi.marche.aide')}>
        <div style={{ display: 'grid', gap: 'var(--adj-3)', gridTemplateColumns: etroit ? '1fr' : 'repeat(3, minmax(0, 1fr))' }}>
          <Etiquette texte={t('suivi.marche.nature')}>
            <Select value={form.nature} onChange={v => setForm({ ...form, nature: v as NatureMarche })}
              options={NATURES.map(n => ({ value: n, label: t(`suivi.nature.${n}`) }))} />
          </Etiquette>
          <Etiquette texte={t('suivi.marche.estimation')}>
            <ChampMontant valeur={form.estimation} onChange={v => setForm({ ...form, estimation: v })} label={t('suivi.marche.estimation')} placeholder="MAD" />
          </Etiquette>
          <Etiquette texte={t('suivi.marche.seance')}>
            <DateField value={form.ouverture} onChange={v => setForm({ ...form, ouverture: v })} />
          </Etiquette>
          {etudes && (
            <>
              <Etiquette texte={t('suivi.marche.poids')}>
                <input value={form.poids} onChange={e => setForm({ ...form, poids: e.target.value })} inputMode="decimal"
                  placeholder="10 - 40" className="adj-focusable adj-fig" style={champ} />
              </Etiquette>
              <Etiquette texte={t('suivi.marche.seuil')}>
                <input value={form.seuil} onChange={e => setForm({ ...form, seuil: e.target.value })} inputMode="decimal"
                  placeholder="/ 100" className="adj-focusable adj-fig" style={champ} />
              </Etiquette>
            </>
          )}
        </div>
        {estimationSuggeree && (
          <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>
            {t('suivi.marche.suggestion', { montant: afficherMontant(s.estimation_suggeree, loc(i18n.language)) })}{' '}
            <button
              onClick={() => setForm({ ...form, estimation: afficherMontant(s.estimation_suggeree, loc(i18n.language)) })}
              className="adj-focusable"
              style={{ border: 'none', background: 'none', padding: 0, color: 'var(--adj-brand)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}
            >
              {t('suivi.marche.utiliser')}
            </button>
          </p>
        )}
        <div><Button variant="secondary" size="sm" loading={envoi === 'marche'} onClick={() => enregistrerMarche('marche')}>{t('suivi.enregistrer')}</Button></div>
        <Erreur texte={erreur?.ou === 'marche' ? erreur.texte : null} />
      </Bloc>

      <Bloc titre={t('suivi.offres.titre')} aide={t('suivi.offres.aide')}>
        {!etroit && (
          <div aria-hidden style={{
            display: 'grid', gap: 8, fontSize: 'var(--adj-t-xs)', fontWeight: 600, color: 'var(--adj-ink-3)',
            gridTemplateColumns: `minmax(0, 2fr) minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1.2fr)${etudes ? ' minmax(0, 0.8fr)' : ''} 40px`,
          }}>
            <span>{t('suivi.offres.nom')}</span><span>{t('suivi.offres.statut')}</span>
            <span style={{ textAlign: 'right' }}>{t('suivi.offres.montantLu')}</span>
            <span style={{ textAlign: 'right' }}>{t('suivi.offres.montantCorrige')}</span>
            {etudes && <span style={{ textAlign: 'right' }}>{t('suivi.offres.note')}</span>}
            <span />
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lignes.map((l, i) => (
            <LigneOffre
              key={l.cle} l={l} etudes={etudes} etroit={etroit}
              onChange={n => setLignes(lignes.map((x, j) => (j === i ? n : x)))}
              onRetirer={() => setLignes(lignes.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 'var(--adj-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="secondary" size="sm" icon={<Plus size={15} />}
            onClick={() => setLignes([...lignes, { cle: nouvelleCle(), nom: '', est_nous: false, lu: '', corrige: '', statut: 'en_attente', motif: '', note: '' }])}>
            {t('suivi.offres.ajouter')}
          </Button>
          <Button variant="primary" size="sm" loading={envoi === 'offres'} disabled={montantsInvalides} onClick={enregistrerLesOffres}>
            {t('suivi.offres.calculer')}
          </Button>
          {montantsInvalides && <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>{t('suivi.offres.montantInvalide')}</span>}
        </div>
        <Erreur texte={erreur?.ou === 'offres' ? erreur.texte : null} />
      </Bloc>

      <Bloc titre={t('suivi.classement.titre')} aide={t(`suivi.regle.${s.suivi!.nature_marche}`)}>
        <ClassementPrevu classement={s.classement} offres={s.offres} nature={s.suivi!.nature_marche} />
      </Bloc>

      <Bloc titre={t('suivi.resultat.titre')} aide={t('suivi.resultat.aide')}>
        <div style={{ display: 'grid', gap: 'var(--adj-3)', gridTemplateColumns: etroit ? '1fr' : 'repeat(3, minmax(0, 1fr))' }}>
          <Etiquette texte={t('suivi.resultat.statut')}>
            <Select value={form.statutFinal} onChange={v => setForm({ ...form, statutFinal: v as StatutFinal })}
              options={STATUTS_FINAUX.map(x => ({ value: x, label: t(`suivi.statutFinal.${x}`) }))} />
          </Etiquette>
          <Etiquette texte={t('suivi.resultat.attributaire')}>
            <input value={form.attributaire} onChange={e => setForm({ ...form, attributaire: e.target.value })} className="adj-focusable" style={champ} />
          </Etiquette>
          <Etiquette texte={t('suivi.resultat.montant')}>
            <ChampMontant valeur={form.montantAttribue} onChange={v => setForm({ ...form, montantAttribue: v })} label={t('suivi.resultat.montant')} placeholder="MAD" />
          </Etiquette>
        </div>
        <div><Button variant="secondary" size="sm" loading={envoi === 'resultat'} onClick={() => enregistrerMarche('resultat')}>{t('suivi.enregistrer')}</Button></div>
        <Erreur texte={erreur?.ou === 'resultat' ? erreur.texte : null} />
      </Bloc>
    </>
  );
}

export function SuiviDepot({ aoId }: { aoId: string }) {
  const { t, i18n } = useTranslation();
  const ressource = useRessource(`ao:suivi:${aoId}`, () => fetchSuivi(aoId));
  const [maj, setMaj] = useState<Suivi | null>(null);
  const [ouverture, setOuverture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const s = maj ?? ressource.data;

  const marquerDepose = async () => {
    if (!s) return;
    setOuverture(true); setErreur(null);
    try {
      setMaj(await enregistrerSuivi(aoId, {
        nature_marche: s.nature_suggeree ?? 'travaux', estimation_mad: s.estimation_suggeree,
        poids_financier: null, seuil_technique: null, date_depot: null, date_ouverture: null,
        statut_final: 'en_attente', attributaire: null, montant_attribue: null,
      }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally { setOuverture(false); }
  };

  return (
    <section style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)',
      background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)', borderRadius: 'var(--adj-round-l)',
      padding: 'var(--adj-5) var(--adj-pad)', minWidth: 0,
    }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--adj-t-md)', fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>
          {t('suivi.titre')}
        </h2>
        {s?.suivi?.date_depot && (
          <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
            {t('suivi.deposeLe', { date: new Date(s.suivi.date_depot).toLocaleDateString(loc(i18n.language), { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </span>
        )}
      </header>

      {ressource.erreur && !s && <Erreur texte={ressource.erreur.message} />}
      {ressource.loading && !s && <p style={{ margin: 0, color: 'var(--adj-ink-3)' }}>{t('suivi.chargement')}</p>}

      {s && !s.ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-3)', alignItems: 'flex-start' }}>
          <p style={{ margin: 0, color: 'var(--adj-ink-2)', lineHeight: 'var(--adj-lead-body)' as never }}>{t('suivi.invitation')}</p>
          <Button variant="primary" size="sm" loading={ouverture} onClick={marquerDepose}>{t('suivi.marquerDepose')}</Button>
          <Erreur texte={erreur} />
        </div>
      )}

      {s && s.ouvert && <PanneauOuvert key={aoId} s={s} aoId={aoId} onMaj={setMaj} />}
    </section>
  );
}
