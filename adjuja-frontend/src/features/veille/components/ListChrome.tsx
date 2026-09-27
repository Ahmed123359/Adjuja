// Habillage commun des listes de veille (AO et bons de commande) -- 2026-09-27.
//
// Les deux ecrans portaient chacun leur copie de la barre d'onglets, de la
// pagination, de l'etat vide et de la cellule d'echeance, et ces copies avaient
// diverge : en-tetes en capitales espacees d'un cote (motif rejete dans
// ui-context.md), largeurs de colonnes figees de l'autre, titres tronques sur
// une ligne ici et sur deux la. Une seule version ici, sur le socle --adj-*.

import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../../shared/ui/Button';

export const STATUS_TABS = ['all', 'new', 'favorited'] as const;
export type StatusTab = typeof STATUS_TABS[number];

export const thStyle: React.CSSProperties = {
  padding:      '12px 16px',
  fontSize:     'var(--adj-t-xs)',
  fontWeight:   600,
  color:        'var(--adj-ink-3)',
  textAlign:    'left',
  borderBottom: '1px solid var(--adj-hairline)',
  background:   'var(--adj-panel)',
  position:     'sticky',
  top:          0,
  zIndex:       1,
  whiteSpace:   'nowrap',
};

export const tdStyle: React.CSSProperties = {
  padding:       '14px 16px',
  borderBottom:  '1px solid var(--adj-hairline)',
  verticalAlign: 'top',
};

/** Texte de cellule sur deux lignes au plus : une troncature a une ligne ne
 *  permet pas de distinguer deux directions du meme ministere ni deux objets
 *  qui commencent pareil. */
export const clamp2: React.CSSProperties = {
  margin: 0,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  overflow: 'hidden', lineHeight: 1.4,
};

export function formatDateCourte(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}

/** Nombre de jours calendaires entre aujourd'hui et la date (negatif si passee). */
function joursAvant(iso: string): number | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const debut = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((debut(d) - debut(new Date())) / 86_400_000);
}

/** Echeance : la date, et en dessous le delai en relatif (« dans 3 jours »,
 *  « demain ») quand il reste moins de 15 jours -- ui-context.md, « Retenu ».
 *  Couleur d'attente sous 7 jours, negative une fois depassee. */
export function EcheanceCell({ iso }: { iso: string | null }) {
  const { t } = useTranslation();
  if (!iso) return <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>—</span>;
  const jours = joursAvant(iso);
  const proche = jours !== null && jours < 7;
  const couleur = jours !== null && jours < 0 ? 'var(--adj-neg)' : proche ? 'var(--adj-hold)' : 'var(--adj-ink-2)';
  const relatif = jours === null || jours >= 15 ? null
    : jours < 0 ? t('dashboard.home.dueLate', { count: Math.abs(jours) })
    : jours === 0 ? t('dashboard.home.dueToday')
    : jours === 1 ? t('dashboard.home.dueTomorrow')
    : t('dashboard.home.dueInDays', { count: jours });
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="adj-fig" style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)' }}>
        {formatDateCourte(iso)}
      </span>
      {relatif && (
        <span style={{ fontSize: 'var(--adj-t-xs)', fontWeight: 600, color: couleur }}>{relatif}</span>
      )}
    </span>
  );
}

/** Barre d'outils : onglets d'etat a gauche, total et bascule des filtres a droite. */
export function ListToolbar({
  activeTab, onTab, total, loading, showFilters, onToggleFilters, compact,
}: {
  activeTab: StatusTab;
  onTab: (tab: StatusTab) => void;
  total: number | null;
  loading: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
  /** Mobile : le bouton de filtres se reduit a son icone. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--adj-3)',
      padding: '0 var(--adj-5)', height: 60, flexShrink: 0,
      borderBottom: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)',
    }}>
      <div role="tablist" className="adj-scroll" style={{ display: 'flex', alignItems: 'stretch', height: '100%', flex: 1, minWidth: 0, overflowX: 'auto' }}>
        {STATUS_TABS.map(tab => {
          const actif = activeTab === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={actif}
              onClick={() => onTab(tab)}
              className="adj-focusable"
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 var(--adj-4)', background: 'none', border: 'none',
                color: actif ? 'var(--adj-ink)' : 'var(--adj-ink-3)',
                fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', fontWeight: actif ? 600 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t(`veille.tabs.${tab}`)}
              {tab === 'all' && total !== null && !loading && (
                <span className="adj-fig" style={{
                  fontSize: 'var(--adj-t-xs)', fontWeight: 600, padding: '1px 8px',
                  borderRadius: 'var(--adj-round-s)', background: 'var(--adj-panel-2)', color: 'var(--adj-ink-2)',
                }}>
                  {total.toLocaleString('fr-FR')}
                </span>
              )}
              {actif && (
                <span style={{
                  position: 'absolute', left: 'var(--adj-3)', right: 'var(--adj-3)', bottom: -1,
                  height: 3, borderRadius: '3px 3px 0 0', background: 'var(--adj-brand)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      <Button
        size="sm"
        variant={showFilters ? 'secondary' : 'ghost'}
        icon={<SlidersHorizontal size={16} />}
        onClick={onToggleFilters}
        aria-pressed={showFilters}
        aria-label={showFilters ? t('veille.filters.hide') : t('veille.filters.show')}
        style={showFilters ? { color: 'var(--adj-brand)', borderColor: 'var(--adj-brand-edge)', background: 'var(--adj-brand-tint)' } : undefined}
      >
        {!compact && (showFilters ? t('veille.filters.hide') : t('veille.filters.show'))}
      </Button>
    </div>
  );
}

export function ListError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{
      padding: '12px var(--adj-5)', flexShrink: 0,
      background: 'var(--adj-neg-tint)', color: 'var(--adj-neg)',
      borderBottom: '1px solid color-mix(in srgb, var(--adj-neg) 25%, transparent)',
      fontSize: 'var(--adj-t-sm)',
    }}>
      {children}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--adj-3)',
      padding: '12px var(--adj-5)', flexShrink: 0,
      borderTop: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)',
    }}>
      <Button size="sm" icon={<ChevronLeft size={16} />} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('veille.pagination.prev')}
      </Button>
      <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', minWidth: 72, textAlign: 'center' }}>
        {page} {t('veille.pagination.of')} {totalPages}
      </span>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        {t('veille.pagination.next')}
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}

const ICONES: Record<'search' | 'new' | 'fav' | 'all', string> = {
  search: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  new: 'M9.348 14.651a3.75 3.75 0 010-5.303m5.304-.001a3.75 3.75 0 010 5.304m-7.425 2.122a6.75 6.75 0 010-9.546m9.546.001a6.75 6.75 0 010 9.545M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12z',
  fav: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  all: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
};

export function EmptyRow({ colSpan, statusTab, hasFilters }: {
  colSpan: number;
  statusTab: StatusTab;
  hasFilters: boolean;
}) {
  const { t } = useTranslation();
  const [icon, title, desc] =
    hasFilters ? [ICONES.search, t('veille.empty.allTitle'), t('veille.empty.allDesc')]
    : statusTab === 'new' ? [ICONES.new, t('veille.empty.newTitle'), t('veille.empty.newDesc')]
    : statusTab === 'favorited' ? [ICONES.fav, t('veille.empty.favTitle'), t('veille.empty.favDesc')]
    : [ICONES.all, t('veille.empty.allTitle'), t('veille.empty.allDesc')];
  return (
    <tr>
      <td colSpan={colSpan}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--adj-3)',
          padding: '80px var(--adj-6)', textAlign: 'center',
        }}>
          <span aria-hidden style={{
            width: 56, height: 56, borderRadius: 'var(--adj-round-l)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--adj-brand-tint)', color: 'var(--adj-brand)',
          }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </span>
          <p style={{ margin: 0, fontSize: 'var(--adj-t-md)', fontWeight: 600, color: 'var(--adj-ink)', letterSpacing: '-0.015em' }}>{title}</p>
          <p style={{ margin: 0, fontSize: 'var(--adj-t-base)', color: 'var(--adj-ink-3)', maxWidth: '46ch', lineHeight: 1.55 }}>{desc}</p>
        </div>
      </td>
    </tr>
  );
}

export function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={tdStyle}>
              <div style={{
                height: 14, borderRadius: 'var(--adj-round-s)', background: 'var(--adj-panel-2)',
                width: j === 1 ? '80%' : j === 0 ? '70%' : '55%', animation: 'pulse 1.5s infinite',
              }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Survol de ligne cliquable : fond de survol, fond de marque si selectionnee. */
export function rowHandlers(selected: boolean) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => {
      if (!selected) e.currentTarget.style.background = 'var(--adj-panel-3)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) => {
      e.currentTarget.style.background = selected ? 'var(--adj-brand-tint)' : 'transparent';
    },
  };
}
