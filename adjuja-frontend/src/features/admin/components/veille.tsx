// Administration : pièces des écrans de la veille -- 2026-09-30, découpé en
// sous-pages le 2026-10-01 (sources, remplissage, actions, téléchargements).
//
// Spec : context/feature-spec/admin-panel/client.md, module Veille.
//
// Montre ce que les diagnostics de production allaient chercher à la main
// (psql, journaux) : combien d'avis ouverts par source, lesquels arrivent
// incomplets, lesquels n'ont pas pu être téléchargés. Le remplissage compare
// les avis ouverts aux avis récents : c'est ce qui aurait révélé l'effacement
// du 2026-09-29 (champs vidés à chaque re-scrape) au premier coup d'œil.
//
// Sur téléphone les tableaux deviennent une carte par source : pas de
// défilement horizontal, qui cache la moitié des colonnes.

import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { DceEchec, Remplissage, SourceVeille } from '../types';
import { Depuis, nombre, td, th } from './ui';

/* ------------------------------------------------------------ pièces */

export function NomSource({ source }: { source: string }) {
  const { t } = useTranslation();
  return <>{t(`admin.veille.source.${source}`, { defaultValue: source })}</>;
}

/** Un taux et, dessous, sa référence récente. L'alerte change la couleur ET
 *  ajoute une icône : la couleur ne porte jamais le sens seule. */
export function Taux({ r }: { r: Remplissage | undefined }) {
  const { t } = useTranslation();
  if (!r) return <span>-</span>;
  const fmt = (v: number | null) => (v === null ? '-' : `${Math.round(v)} %`);
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', gap: 2,
      padding: r.alerte ? '4px 8px' : 0, margin: r.alerte ? '-4px -8px' : 0,
      borderRadius: 'var(--adj-round-s)',
      background: r.alerte ? 'var(--adj-neg-tint)' : 'transparent',
    }}>
      <span className="adj-fig" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontWeight: 'var(--adj-w-semi)' as never,
        color: r.alerte ? 'var(--adj-neg)' : 'var(--adj-ink)',
      }}>
        {r.alerte && <AlertTriangle size={15} strokeWidth={2} aria-label={t('admin.veille.remplissage.alerteCourte')} />}
        {fmt(r.ouverts_pct)}
      </span>
      {/* Aucun avis découvert sur 7 jours : pas de référence à citer. */}
      {r.recents_pct !== null && (
        <span className="adj-fig" style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', whiteSpace: 'nowrap' }}>
          {t('admin.veille.remplissage.recents', { taux: fmt(r.recents_pct) })}
        </span>
      )}
    </span>
  );
}

function Analyses({ s }: { s: SourceVeille }) {
  const { t } = useTranslation();
  if (!s.analyses) return <>-</>;
  return <>{t('admin.veille.sources.analysesValeur', { faites: s.analyses.faites, aEnrichir: s.analyses.a_enrichir })}</>;
}

function DernierPassage({ s }: { s: SourceVeille }) {
  const { t } = useTranslation();
  const essai = s.dernier_essai;
  // Dernière tentative en échec, postérieure au dernier succès.
  const echecRecent = essai && essai.statut === 'erreur'
    && (!s.dernier_passage || Date.parse(essai.debut) > Date.parse(s.dernier_passage));
  if (!s.dernier_passage && !essai) {
    return <span style={{ color: 'var(--adj-ink-3)' }}>{t('admin.veille.sources.nonEnregistre')}</span>;
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: s.passage_en_retard ? 'var(--adj-neg)' : 'var(--adj-ink)',
        fontWeight: (s.passage_en_retard ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
      }}>
        {s.passage_en_retard && <AlertTriangle size={15} strokeWidth={2} aria-hidden />}
        {s.dernier_passage ? <Depuis iso={s.dernier_passage} /> : t('admin.veille.sources.jamaisReussi')}
        {s.passage_en_retard && <span>{t('admin.veille.sources.enRetard')}</span>}
      </span>
      {echecRecent && essai && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)' }}>
            {t('admin.veille.sources.essaiEchoue')} <Depuis iso={essai.debut} />
          </summary>
          <pre style={{
            margin: '6px 0 0', padding: 'var(--adj-3)', borderRadius: 'var(--adj-round-s)',
            background: 'var(--adj-panel-2)', color: 'var(--adj-ink-2)', maxWidth: 360,
            fontSize: 'var(--adj-t-xs)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left',
          }}>{essai.erreur}</pre>
        </details>
      )}
    </span>
  );
}

/* ---------------------------------------------------------- sources */

export function TableSources({ sources }: { sources: SourceVeille[] }) {
  const { t } = useTranslation();
  const etroit = useIsMobile(900);
  const colonnes: { cle: string; rendu: (s: SourceVeille) => React.ReactNode; num?: boolean }[] = [
    { cle: 'ouverts', rendu: s => s.ouverts, num: true },
    { cle: 'nouveaux24h', rendu: s => s.nouveaux_24h, num: true },
    { cle: 'nouveaux7j', rendu: s => s.nouveaux_7j, num: true },
    {
      cle: 'dceEchec', num: true,
      rendu: s => <span style={{ color: s.dce_en_echec ? 'var(--adj-neg)' : undefined }}>{s.dce_en_echec}</span>,
    },
    { cle: 'analyses', rendu: s => <Analyses s={s} /> },
    { cle: 'dernierPassage', rendu: s => <DernierPassage s={s} /> },
  ];

  if (etroit) {
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sources.map(s => (
          <li key={s.source} style={{ padding: 'var(--adj-4) 0', borderBottom: '1px solid var(--adj-hairline)' }}>
            <div style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)', marginBottom: 'var(--adj-2)' }}>
              <NomSource source={s.source} />
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px var(--adj-4)' }}>
              {colonnes.map(c => (
                <div key={c.cle} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>{t(`admin.veille.sources.${c.cle}`)}</dt>
                  <dd className="adj-fig" style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)', textAlign: 'right' }}>{c.rendu(s)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>{t('admin.veille.sources.source')}</th>
          {colonnes.map(c => (
            <th key={c.cle} style={{ ...th, textAlign: c.num ? 'right' : 'left' }}>{t(`admin.veille.sources.${c.cle}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sources.map(s => (
          <tr key={s.source}>
            <td style={{ ...td, color: 'var(--adj-ink)', fontWeight: 'var(--adj-w-semi)' as never }}><NomSource source={s.source} /></td>
            {colonnes.map(c => (
              <td key={c.cle} className={c.num ? 'adj-fig' : undefined} style={c.num ? nombre : td}>{c.rendu(s)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------- remplissage */

export function MatriceRemplissage({ sources }: { sources: SourceVeille[] }) {
  const { t } = useTranslation();
  const etroit = useIsMobile(900);
  const champs = sources[0]?.remplissage.map(r => r.champ) ?? [];
  const taux = (s: SourceVeille, champ: string) => s.remplissage.find(r => r.champ === champ);
  const libelle = (champ: string) => t(`admin.veille.champ.${champ}`, { defaultValue: champ });

  if (etroit) {
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sources.map(s => (
          <li key={s.source} style={{ padding: 'var(--adj-4) 0', borderBottom: '1px solid var(--adj-hairline)' }}>
            <div style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)', marginBottom: 'var(--adj-3)' }}>
              <NomSource source={s.source} />
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px var(--adj-4)' }}>
              {champs.map(c => (
                <div key={c} style={{ display: 'contents' }}>
                  <dt style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>{libelle(c)}</dt>
                  <dd style={{ margin: 0, textAlign: 'right' }}><Taux r={taux(s, c)} /></dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>{t('admin.veille.remplissage.champ')}</th>
          {sources.map(s => <th key={s.source} style={th}><NomSource source={s.source} /></th>)}
        </tr>
      </thead>
      <tbody>
        {champs.map(c => (
          <tr key={c}>
            <td style={{ ...td, color: 'var(--adj-ink)' }}>{libelle(c)}</td>
            {sources.map(s => <td key={s.source} style={td}><Taux r={taux(s, c)} /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* --------------------------------------------------------- DCE en échec */

function joursRestants(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
}

export function LigneDce({ e }: { e: DceEchec }) {
  const { t } = useTranslation();
  const jours = joursRestants(e.date_limite);
  return (
    <li style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: 'var(--adj-4) 0', borderBottom: '1px solid var(--adj-hairline)', minWidth: 0,
    }}>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px var(--adj-3)', alignItems: 'baseline' }}>
        <span className="adj-fig" style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>
          {e.reference || t('admin.veille.dce.identifiant', { id: e.id })}
        </span>
        <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}><NomSource source={e.source} /></span>
        {jours !== null && (
          <span style={{ fontSize: 'var(--adj-t-xs)', color: jours <= 3 ? 'var(--adj-neg)' : 'var(--adj-ink-3)' }}>
            {jours === 0 ? t('admin.veille.dce.aujourdhui') : t('admin.veille.dce.dans', { count: jours })}
          </span>
        )}
      </span>
      <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', lineHeight: 1.45 }}>{e.titre}</span>
      {e.acheteur && <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{e.acheteur}</span>}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-brand)' }}>
          {t('admin.veille.dce.voirErreur')}
        </summary>
        <pre style={{
          margin: '8px 0 0', padding: 'var(--adj-3)', borderRadius: 'var(--adj-round-s)',
          background: 'var(--adj-panel-2)', color: 'var(--adj-ink-2)',
          fontSize: 'var(--adj-t-xs)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {e.erreur}
        </pre>
      </details>
    </li>
  );
}
