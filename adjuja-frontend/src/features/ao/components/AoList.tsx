// Liste des appels d'offres -- 2026-09-25.
//
// Remplace la liste de cartes empilees, qui donnait une ligne de 90px par
// dossier sans rien de comparable d'une ligne a l'autre : ni echeance, ni
// avancement, ni tri. Sur dix dossiers elle devenait une pile a lire une par
// une.
//
// Ici chaque dossier est une ligne de tableau : reference, objet, acheteur,
// avancement, echeance, statut. Les colonnes s'alignent, donc les dossiers se
// comparent -- c'est toute la difference entre une liste et un tableau.
//
// Sur telephone le tableau redevient une carte par dossier : sept colonnes sur
// 360px sont illisibles, et une barre de defilement horizontale dans une liste
// est une facon deguisee de cacher la moitie des donnees.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../shared/ui/Button';
import { Select } from '../../../shared/ui/Select';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { AoSummary } from '../types';

/** Teintes de statut : l'indigo pour ce qui avance, le vert pour ce qui est
 *  fini, le rouge pour ce qui demande une action. Le reste reste neutre. */
const TON: Record<string, { fg: string; bg: string }> = {
  brouillon:     { fg: 'var(--adj-ink-3)', bg: 'var(--adj-mute-tint)' },
  en_attente:    { fg: 'var(--adj-ink-3)', bg: 'var(--adj-mute-tint)' },
  en_analyse:    { fg: 'var(--adj-brand)', bg: 'var(--adj-brand-tint)' },
  en_traitement: { fg: 'var(--adj-brand)', bg: 'var(--adj-brand-tint)' },
  termine:       { fg: 'var(--adj-pos)',   bg: 'var(--adj-pos-tint)' },
  erreur:        { fg: 'var(--adj-neg)',   bg: 'var(--adj-neg-tint)' },
  abandonne:     { fg: 'var(--adj-ink-4)', bg: 'var(--adj-mute-tint)' },
};

function Statut({ statut }: { statut: string }) {
  const { t } = useTranslation();
  const c = TON[statut] ?? TON.brouillon;
  return (
    <span style={{
      display: 'inline-block', padding: '4px 10px', borderRadius: 'var(--adj-round-s)',
      background: c.bg, color: c.fg,
      fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
      whiteSpace: 'nowrap',
    }}>
      {t(`pipeline.status.${statut}`, { defaultValue: statut })}
    </span>
  );
}

/** Avancement : la barre seule ne se lit pas a 60px de large, le nombre seul ne
 *  se compare pas d'une ligne a l'autre. Les deux ensemble font les deux. */
function Avancement({ pct, statut }: { pct: number; statut: string }) {
  const valeur = Math.max(0, Math.min(100, pct || 0));
  const teinte = statut === 'erreur' ? 'var(--adj-neg)'
    : statut === 'termine' ? 'var(--adj-pos)' : 'var(--adj-brand)';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <span aria-hidden style={{
        flex: 1, minWidth: 44, height: 6, borderRadius: 999,
        background: 'var(--adj-panel-2)', overflow: 'hidden',
      }}>
        <span style={{ display: 'block', height: '100%', width: `${valeur}%`, background: teinte, borderRadius: 999 }} />
      </span>
      <span className="adj-fig" style={{
        flexShrink: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', minWidth: 32, textAlign: 'right',
      }}>
        {valeur}&nbsp;%
      </span>
    </span>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '0 var(--adj-4) 12px',
  fontSize: 'var(--adj-t-xs)', fontWeight: 600,
  color: 'var(--adj-ink-3)', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--adj-hairline)',
};

const td: React.CSSProperties = {
  padding: '14px var(--adj-4)', fontSize: 'var(--adj-t-sm)',
  color: 'var(--adj-ink-2)', verticalAlign: 'middle',
};

export function AoList({
  aos, loading, onOpen, onCreate, onDelete,
}: {
  aos: AoSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (ao: AoSummary) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const etroit = useIsMobile(900);

  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('tous');

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return aos.filter(a => {
      if (statut !== 'tous' && a.statut !== statut) return false;
      if (!terme) return true;
      return (a.reference ?? '').toLowerCase().includes(terme)
        || (a.objet ?? '').toLowerCase().includes(terme)
        || (a.acheteur ?? '').toLowerCase().includes(terme);
    });
  }, [aos, recherche, statut]);

  const echeance = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const jours = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    return { texte: d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }), jours };
  };

  /* --------------------------------------------------------------- rendu */

  const ligneMobile = (ao: AoSummary) => {
    const e = echeance(ao.date_limite);
    return (
      <li
        key={ao.id}
        onClick={() => onOpen(ao.id)}
        className="adj-row adj-anim"
        style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: 'var(--adj-4)',
          borderBottom: '1px solid var(--adj-hairline)',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-2)' }}>
          <span className="adj-fig" style={{
            flex: 1, minWidth: 0, fontSize: 'var(--adj-t-sm)',
            fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ao.reference || t('pipeline.detail.noRef')}
          </span>
          <Statut statut={ao.statut} />
        </span>

        <span style={{
          fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', lineHeight: 1.45,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {ao.objet || '-'}
        </span>

        {ao.acheteur && (
          <span style={{
            fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ao.acheteur}
          </span>
        )}

        <Avancement pct={ao.pipeline_pct} statut={ao.statut} />

        <span style={{ fontSize: 'var(--adj-t-xs)', color: e && e.jours < 0 ? 'var(--adj-neg)' : 'var(--adj-ink-4)' }}>
          {e ? e.texte : t('dashboard.home.activity.noDate')}
        </span>
      </li>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)', minHeight: 0 }}>
      {/* Barre d'outils : recherche, filtre, creation. */}
      <div className="adj-toolbar" style={{
        display: 'flex', alignItems: 'center', gap: 'var(--adj-3)', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span className="adj-toolbar-wide" style={{ position: 'relative', flex: '0 1 300px', minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
            <Search size={16} strokeWidth={1.9} color="var(--adj-ink-4)" />
          </span>
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder={t('pipeline.list.search')}
            aria-label={t('pipeline.list.search')}
            className="adj-focusable"
            style={{
              width: '100%', height: 42, padding: '0 12px 0 36px',
              borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-edge)',
              background: 'var(--adj-panel)', color: 'var(--adj-ink)',
              fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', outline: 'none',
            }}
          />
        </span>

        <span style={{ width: 200 }}>
          <Select
            value={statut}
            onChange={setStatut}
            options={[
              { value: 'tous', label: t('pipeline.list.allStatuses') },
              ...['brouillon', 'en_attente', 'en_analyse', 'en_traitement', 'termine', 'erreur', 'abandonne']
                .map(s => ({ value: s, label: t(`pipeline.status.${s}`, { defaultValue: s }) })),
            ]}
          />
        </span>

        <span className="adj-toolbar-spacer" style={{ flex: 1 }} />

        <span className="adj-toolbar-action">
          <Button variant="primary" size="md" icon={<Plus size={17} strokeWidth={2.4} />} onClick={onCreate}>
            {t('pipeline.new')}
          </Button>
        </span>
      </div>

      {loading && aos.length === 0 && (
        <p style={{ margin: 0, padding: 'var(--adj-6)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
          {t('dashboard.home.loading')}
        </p>
      )}

      {/* Rien du tout, ou rien qui corresponde au filtre : ce ne sont pas les
          memes situations et elles n'appellent pas la meme phrase. */}
      {!loading && aos.length === 0 && (
        <div style={{
          padding: 'var(--adj-12) var(--adj-6)', textAlign: 'center',
          background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)',
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--adj-t-md)', fontWeight: 600, color: 'var(--adj-ink)' }}>
            {t('pipeline.noAos')}
          </p>
          <p style={{ margin: '0 0 var(--adj-5)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
            {t('pipeline.noAosDesc')}
          </p>
          <Button variant="primary" size="md" icon={<Plus size={17} strokeWidth={2.4} />} onClick={onCreate}>
            {t('pipeline.new')}
          </Button>
        </div>
      )}

      {!loading && aos.length > 0 && visibles.length === 0 && (
        <p style={{
          margin: 0, padding: 'var(--adj-8) var(--adj-6)', textAlign: 'center',
          fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)',
          background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)',
        }}>
          {t('pipeline.list.noMatch')}
        </p>
      )}

      {visibles.length > 0 && etroit && (
        <ul style={{
          listStyle: 'none', margin: 0, padding: 0,
          background: 'var(--adj-panel)',
          border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)',
          overflow: 'hidden',
        }}>
          {visibles.map(ligneMobile)}
        </ul>
      )}

      {visibles.length > 0 && !etroit && (
        <div style={{
          background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, paddingTop: 'var(--adj-4)' }}>{t('dashboard.home.table.reference')}</th>
                <th style={{ ...th, paddingTop: 'var(--adj-4)' }}>{t('dashboard.home.table.object')}</th>
                <th style={{ ...th, paddingTop: 'var(--adj-4)' }}>{t('pipeline.list.buyer')}</th>
                <th style={{ ...th, paddingTop: 'var(--adj-4)', width: 150 }}>{t('pipeline.list.progress')}</th>
                <th style={{ ...th, paddingTop: 'var(--adj-4)' }}>{t('dashboard.home.table.due')}</th>
                <th style={{ ...th, paddingTop: 'var(--adj-4)' }}>{t('dashboard.home.table.status')}</th>
                <th style={{ ...th, paddingTop: 'var(--adj-4)', width: 44 }} aria-label={t('pipeline.list.actions')} />
              </tr>
            </thead>
            <tbody>
              {visibles.map((ao, i) => {
                const e = echeance(ao.date_limite);
                return (
                  <tr
                    key={ao.id}
                    className="adj-row adj-anim"
                    onClick={() => onOpen(ao.id)}
                    style={{ cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--adj-hairline)' }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--adj-panel-3)'; }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <span className="adj-fig" style={{ fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>
                        {ao.reference || t('pipeline.detail.noRef')}
                      </span>
                    </td>
                    <td style={{ ...td, maxWidth: 0, width: '45%' }}>
                      <span title={ao.objet} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ao.objet || '-'}
                      </span>
                    </td>
                    <td style={{ ...td, maxWidth: 0, width: '20%', color: 'var(--adj-ink-3)' }}>
                      <span title={ao.acheteur} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ao.acheteur || '-'}
                      </span>
                    </td>
                    <td style={td}>
                      <Avancement pct={ao.pipeline_pct} statut={ao.statut} />
                    </td>
                    <td style={{
                      ...td, whiteSpace: 'nowrap',
                      color: e && e.jours < 0 ? 'var(--adj-neg)' : e ? 'var(--adj-ink-2)' : 'var(--adj-ink-4)',
                    }}>
                      {e ? e.texte : t('dashboard.home.activity.noDate')}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <Statut statut={ao.statut} />
                    </td>
                    <td style={{ ...td, paddingLeft: 0, paddingRight: 'var(--adj-3)' }}>
                      <button
                        type="button"
                        className="adj-row-actions adj-focusable"
                        onClick={ev => { ev.stopPropagation(); onDelete(ao); }}
                        aria-label={t('pipeline.list.delete')}
                        title={t('pipeline.list.delete')}
                        style={{
                          display: 'flex', padding: 6, border: 'none', background: 'transparent',
                          borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-4)', cursor: 'pointer',
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.color = 'var(--adj-neg)'; }}
                        onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--adj-ink-4)'; }}
                      >
                        <Trash2 size={15} strokeWidth={1.9} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
