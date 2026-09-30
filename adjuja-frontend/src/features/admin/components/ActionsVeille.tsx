// Actions de maintenance de la veille -- 2026-09-30.
//
// Spec : context/feature-spec/admin-panel/client.md, « Actions ». Remplacent
// les commandes tapées sur le serveur (rattraper_details.py,
// enrichir_analyses.py, relance d'un scrape).
//
// Règle de sûreté : une action qui écrit ou appelle le modèle se SIMULE
// d'abord. Le bouton réel ne s'active qu'une fois une simulation terminée avec
// exactement les mêmes paramètres, et il en rappelle le chiffre : on sait ce
// qu'on lance avant de le lancer.
//
// La tâche suivie vit au niveau du module, pas dans l'état du composant :
// changer d'onglet démonte l'écran, et au retour le suivi reprend au lieu
// d'oublier une ré-analyse de quarante minutes en cours.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { Select } from '../../../shared/ui/Select';
import { invalider } from '../../../shared/lib/cache';
import { AccesAdminRefuse, fetchEtatTache, lancerActionVeille } from '../api';
import type { ActionVeille, EtatTache, SourceAo } from '../types';
import { ignores, resumeRapport } from './rapport';

type Suivi = { taskId: string; reel: boolean; cle: string };

const suivis = new Map<ActionVeille, Suivi>();
/** Dernière simulation terminée, par jeu de paramètres. */
const simulations = new Map<string, Record<string, unknown>>();

const INTERVALLE_MS = 2000;
const SOURCES: SourceAo[] = ['marchespublics', 'safakat_cdg', 'achats_cimr'];

function cleParametres(action: ActionVeille, limite: number | null, source: string): string {
  return `${action}|${limite ?? ''}|${source}`;
}

function limiteDepuis(saisie: string): number | null {
  const v = Number.parseInt(saisie, 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/* ------------------------------------------------------------ pièces */

function Progression({ etat }: { etat: EtatTache }) {
  const { t } = useTranslation();
  if (etat.etat === 'en_attente' || !etat.progression) {
    return <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
      {t(etat.etat === 'en_attente' ? 'admin.actions.enAttente' : 'admin.actions.enCours')}
    </span>;
  }
  const { fait, total } = etat.progression;
  const pct = total ? Math.round((100 * fait) / total) : 0;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span aria-hidden style={{ flex: 1, maxWidth: 240, height: 6, borderRadius: 999, background: 'var(--adj-panel-2)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--adj-brand)' }} />
      </span>
      <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>
        {t('admin.actions.progression', { fait, total })}
      </span>
    </span>
  );
}

function ChampLimite({ valeur, onChange, disabled }: { valeur: string; onChange: (v: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <input
      type="number" min={1} inputMode="numeric"
      value={valeur} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder={t('admin.actions.limiteToutes')}
      aria-label={t('admin.actions.limite')}
      className="adj-focusable"
      style={{
        width: 150, height: 40, padding: '0 12px',
        borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-edge)',
        background: 'var(--adj-panel)', color: 'var(--adj-ink)',
        fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', outline: 'none',
      }}
    />
  );
}

/* ------------------------------------------------------------- action */

function Action({ action, avecSimulation, avecSource, onFini }: {
  action: ActionVeille;
  avecSimulation: boolean;
  avecSource: boolean;
  onFini: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  const [limite, setLimite] = useState('');
  const [source, setSource] = useState('');
  const [suivi, setSuivi] = useState<Suivi | null>(() => suivis.get(action) ?? null);
  const [etat, setEtat] = useState<EtatTache | null>(null);
  const [dernier, setDernier] = useState<{ reel: boolean; etat: EtatTache } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const limiteValeur = limiteDepuis(limite);
  const cle = cleParametres(action, limiteValeur, source);
  const simulation = simulations.get(cle);

  // Suivi de la tâche en cours, jusqu'à son état final.
  useEffect(() => {
    if (!suivi) return;
    let actif = true;
    const lire = async () => {
      try {
        const e = await fetchEtatTache(suivi.taskId);
        if (!actif) return;
        setEtat(e);
        if (e.etat === 'termine' || e.etat === 'echec') {
          suivis.delete(action);
          if (!suivi.reel && e.etat === 'termine' && e.resultat) simulations.set(suivi.cle, e.resultat);
          setDernier({ reel: suivi.reel, etat: e });
          setSuivi(null);
          setEtat(null);
          onFini();
        }
      } catch (err) {
        if (actif) setErreur(err instanceof Error ? err.message : String(err));
      }
    };
    lire();
    const id = window.setInterval(lire, INTERVALLE_MS);
    return () => { actif = false; window.clearInterval(id); };
  }, [suivi, action, onFini]);

  const lancer = async (reel: boolean) => {
    setErreur(null);
    setDernier(null);
    setEnvoi(true);
    try {
      const r = await lancerActionVeille(action, {
        reel, limite: limiteValeur, ...(avecSource ? { source: (source || null) as SourceAo | null } : {}),
      });
      const s = { taskId: r.task_id, reel, cle };
      suivis.set(action, s);
      setSuivi(s);
      invalider('admin:actions');
    } catch (err) {
      setErreur(err instanceof AccesAdminRefuse ? t('admin.refuse') : err instanceof Error ? err.message : String(err));
      invalider('admin:actions');
    } finally {
      setEnvoi(false);
    }
  };

  const occupe = envoi || suivi !== null;
  const aSimuler = simulation
    ? resumeRapport(t, action, simulation, locale)
    : null;

  return (
    <li style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--adj-3)',
      padding: 'var(--adj-5) 0', borderBottom: '1px solid var(--adj-hairline)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 'var(--adj-t-base)', fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>
          {t(`admin.actions.${action}.titre`)}
        </span>
        <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)', lineHeight: 'var(--adj-lead-body)' as never }}>
          {t(`admin.actions.${action}.description`)}
        </span>
      </div>

      <div className="adj-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
        {avecSource && (
          <span style={{ width: 240 }}>
            <Select
              value={source}
              onChange={setSource}
              disabled={occupe}
              options={[
                { value: '', label: t('admin.actions.toutesSources') },
                ...SOURCES.map(s => ({ value: s, label: t(`admin.veille.source.${s}`) })),
              ]}
            />
          </span>
        )}
        {avecSimulation && <ChampLimite valeur={limite} onChange={setLimite} disabled={occupe} />}

        {avecSimulation ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => lancer(false)} disabled={occupe}>
              {t('admin.actions.simuler')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => lancer(true)} disabled={occupe || !simulation}>
              {t('admin.actions.lancerReel')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => lancer(true)} disabled={occupe}>
            {t('admin.actions.relancer')}
          </Button>
        )}
      </div>

      {avecSimulation && !occupe && (
        <span style={{ fontSize: 'var(--adj-t-sm)', color: simulation ? 'var(--adj-ink-2)' : 'var(--adj-ink-3)' }}>
          {aSimuler ? t('admin.actions.simulationFaite', { resume: aSimuler }) : t('admin.actions.simulerDabord')}
        </span>
      )}

      {suivi && etat && <Progression etat={etat} />}
      {suivi && !etat && <Progression etat={{ etat: 'en_attente', progression: null, resultat: null, erreur: null }} />}

      {dernier && dernier.etat.etat === 'termine' && (
        <div role="status" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-pos)' }}>
          {t(dernier.reel ? 'admin.actions.termineReel' : 'admin.actions.termineSimulation')}{' '}
          <span style={{ color: 'var(--adj-ink-2)' }}>{resumeRapport(t, action, dernier.etat.resultat, locale)}</span>
          {ignores(dernier.etat.resultat).length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--adj-brand)' }}>{t('admin.actions.voirIgnores')}</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--adj-ink-2)' }}>
                {ignores(dernier.etat.resultat).map(i => <li key={i.ao_id}>{t('admin.actions.ignore', i)}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      {dernier && dernier.etat.etat === 'echec' && (
        <div role="alert" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>
          {t('admin.actions.echec')}
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--adj-brand)' }}>{t('admin.veille.dce.voirErreur')}</summary>
            <pre style={{
              margin: '6px 0 0', padding: 'var(--adj-3)', borderRadius: 'var(--adj-round-s)',
              background: 'var(--adj-panel-2)', color: 'var(--adj-ink-2)',
              fontSize: 'var(--adj-t-xs)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{dernier.etat.erreur}</pre>
          </details>
        </div>
      )}
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>{erreur}</p>}
    </li>
  );
}

/* --------------------------------------------------------------- liste */

export function ActionsVeille({ onFini }: { onFini: () => void }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      <Action action="scrape-ao" avecSimulation={false} avecSource={false} onFini={onFini} />
      <Action action="scrape-bdc" avecSimulation={false} avecSource={false} onFini={onFini} />
      <Action action="rattrapage-details" avecSimulation avecSource onFini={onFini} />
      <Action action="enrichir-analyses" avecSimulation avecSource={false} onFini={onFini} />
    </ul>
  );
}
