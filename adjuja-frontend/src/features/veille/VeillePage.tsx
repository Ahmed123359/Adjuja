import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapedAo, ScrapedAoList, WatcherFilters } from '../../types';
import { fetchScrapedAos, updateScrapedAoStatus } from '../../api';
import WatcherStatusBadge from './components/WatcherStatusBadge';
import VeilleFilters from './components/VeilleFilters';
import AoDetailPanel from './components/AoDetailPanel';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatTitre, splitReservationClause } from '../../utils/formatTitre';

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 50;

const DEFAULT_FILTERS: WatcherFilters = {
  status:           'all',
  search:           '',
  categorie:        '',
  mode_passation:   '',
  region:           '',
  date_limite_from: '',
  secteur_codes:    [],
  page:             1,
};

const STATUS_TABS = ['all', 'new', 'favorited'] as const;
type StatusTab = typeof STATUS_TABS[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}

function formatAmount(raw: string | null): string {
  if (!raw) return '-';
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toLocaleString('fr-MA', { maximumFractionDigits: 0 });
}

function isDeadlineSoon(iso: string | null): boolean {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 7 }).map((_, j) => (
            <td
              key={j}
              style={{
                padding:     '11px 14px',
                borderBottom: '1px solid var(--adj-hairline)',
              }}
            >
              <div
                style={{
                  height:       12,
                  borderRadius: 4,
                  background:   'var(--adj-panel-2)',
                  width:        j === 1 ? '80%' : j === 0 ? '70%' : '55%',
                  animation:    'pulse 1.5s infinite',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({
  statusTab,
  hasFilters,
}: {
  statusTab: StatusTab;
  hasFilters: boolean;
}) {
  const { t } = useTranslation();

  const [icon, title, desc] = (() => {
    if (hasFilters) return [
      'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
      t('veille.empty.allTitle'),
      t('veille.empty.allDesc'),
    ];
    if (statusTab === 'new')       return [
      'M9.348 14.651a3.75 3.75 0 010-5.303m5.304-.001a3.75 3.75 0 010 5.304m-7.425 2.122a6.75 6.75 0 010-9.546m9.546.001a6.75 6.75 0 010 9.545M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
      t('veille.empty.newTitle'),
      t('veille.empty.newDesc'),
    ];
    if (statusTab === 'favorited') return [
      'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
      t('veille.empty.favTitle'),
      t('veille.empty.favDesc'),
    ];
    return [
      'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      t('veille.empty.allTitle'),
      t('veille.empty.allDesc'),
    ];
  })();

  return (
    <tr>
      <td colSpan={8}>
        <div
          style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            padding:       '72px 24px',
            gap:           12,
            textAlign:     'center',
          }}
        >
          <div
            style={{
              width:          52,
              height:         52,
              borderRadius:   14,
              background:     'var(--adj-brand-tint)',
              border:         '1px solid var(--adj-hairline)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
            }}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--adj-brand)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--adj-ink)' }}>{title}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--adj-ink-2)', maxWidth: '46ch' }}>{desc}</p>
        </div>
      </td>
    </tr>
  );
}

function AoTableRow({
  ao,
  selected,
  onClick,
}: {
  ao: ScrapedAo;
  selected: boolean;
  onClick: () => void;
}) {
  const deadlineSoon = isDeadlineSoon(ao.date_limite);

  return (
    <tr
      onClick={onClick}
      style={{
        cursor:     'pointer',
        background: selected ? 'var(--adj-brand-tint)' : 'transparent',
        transition: 'background .1s',
      }}
      onMouseEnter={e => {
        if (!selected) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--adj-panel-2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLTableRowElement).style.background = selected ? 'var(--adj-brand-tint)' : 'transparent';
      }}
    >
      {/* Acheteur */}
      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--adj-hairline)', maxWidth: '26ch' }}>
        <p
          title={ao.acheteur ?? undefined}
          style={{
            margin: 0, fontSize: 'var(--adj-t-sm)', fontWeight: 500, color: 'var(--adj-ink)',
            // Deux lignes plutot qu'une troncature : « MENESFC / DMENB -
            // DIRECTI... » ne permet pas de distinguer deux directions du meme
            // ministere, ce qui est precisement ce qu'on lit ici.
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', lineHeight: 1.35,
          }}
        >
          {ao.acheteur ?? '-'}
        </p>
      </td>

      {/* Titre : la colonne qu'on lit reellement, donc la plus large. */}
      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--adj-hairline)', width: '100%' }}>
        <p
          title={ao.titre}
          style={{
            margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {formatTitre(splitReservationClause(ao.titre).main)}
        </p>
      </td>

      {/* Date de publication */}
      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--adj-hairline)', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12, color: 'var(--adj-ink-2)' }}>{formatDate(ao.date_publication)}</span>
      </td>

      {/* Date limite */}
      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--adj-hairline)', whiteSpace: 'nowrap' }}>
        <span style={{
          fontSize:   12,
          fontWeight: deadlineSoon ? 700 : 400,
          color:      deadlineSoon ? '#d97706' : 'var(--adj-ink-2)',
        }}>
          {formatDate(ao.date_limite)}
        </span>
      </td>

      {/* Categorie */}
      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--adj-hairline)', maxWidth: '18ch' }}>
        <span style={{ fontSize: 12, color: 'var(--adj-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {ao.categorie ?? '-'}
        </span>
      </td>

      {/* Localisation */}
      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--adj-hairline)', maxWidth: '18ch' }}>
        <span style={{ fontSize: 12, color: 'var(--adj-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {ao.region || ao.ville || '-'}
        </span>
      </td>

      {/* Budget : le montant seul, en chiffres tabulaires pour que les
          ordres de grandeur se comparent d'une ligne a l'autre. */}
      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--adj-hairline)', textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
        {ao.budget_estime ? (
          <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-ink)' }}>
            {formatAmount(ao.budget_estime)} Dhs
          </span>
        ) : (
          <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>—</span>
        )}
      </td>

      {/* Etat : sa propre colonne, pour ne plus empieter sur le montant ni sur
          le nom de l'acheteur. */}
      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--adj-hairline)', whiteSpace: 'nowrap', width: 1 }}>
        <WatcherStatusBadge status={ao.status} />
      </td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function VeillePage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [filters, setFilters]           = useState<WatcherFilters>(DEFAULT_FILTERS);
  const [data, setData]                 = useState<ScrapedAoList | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [selectedAo, setSelectedAo]     = useState<ScrapedAo | null>(null);
  const [showFilters, setShowFilters]   = useState(() => !isMobile);
  const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadIdRef                       = useRef(0);

  const load = useCallback(async (f: WatcherFilters) => {
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchScrapedAos(f, PAGE_LIMIT);
      if (id !== loadIdRef.current) return;
      setData(result);
    } catch (e: unknown) {
      if (id !== loadIdRef.current) return;
      setError(t('veille.error.loadFailed'));
    } finally {
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [t]);

  // Debounce on text filters, immediate on status/page
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(filters), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters, load]);

  const patchFilters = useCallback((patch: Partial<WatcherFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(prev => ({ ...DEFAULT_FILTERS, status: prev.status }));
  }, []);

  const handleRowUpdated = useCallback((updated: ScrapedAo) => {
    setData(prev => prev
      ? { ...prev, items: prev.items.map(a => a.id === updated.id ? updated : a) }
      : prev,
    );
    setSelectedAo(updated);
  }, []);

  const handleRowClick = useCallback(async (ao: ScrapedAo) => {
    setSelectedAo(ao);
    // Mark as seen on click if still new
    if (ao.status === 'new') {
      try {
        const updated = await updateScrapedAoStatus(ao.id, 'seen');
        handleRowUpdated(updated);
      } catch {
        // non-fatal: just open the panel
      }
    }
  }, [handleRowUpdated]);

  const activeTab = filters.status as StatusTab;
  const hasActiveTextFilters = !!(
    filters.search || filters.categorie || filters.mode_passation || filters.region || filters.date_limite_from
    || filters.secteur_codes.length > 0
  );
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const thStyle: React.CSSProperties = {
    padding:        '12px 14px',
    fontSize:       'var(--adj-t-xs)',
    fontWeight:     600,
    color:          'var(--adj-ink-3)',
    textAlign:      'left',
    borderBottom:   '1px solid var(--adj-hairline)',
    background:     'var(--adj-panel)',
    position:       'sticky',
    top:            0,
    whiteSpace:     'nowrap',
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Filter sidebar */}
      {showFilters && (
        <VeilleFilters
          filters={filters}
          onChange={patchFilters}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            0,
            padding:        '0 16px',
            borderBottom:   '1px solid var(--adj-hairline)',
            background:     'var(--adj-panel)',
            flexShrink:     0,
            height:         48,
          }}
        >
          {/* Status tabs */}
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0, flex: 1, minWidth: 0, overflowX: 'auto' }}>
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => patchFilters({ status: tab === 'all' ? 'all' : tab, page: 1 })}
                style={{
                  height:       '100%',
                  padding:      '0 14px',
                  background:   'none',
                  border:       'none',
                  borderBottom: activeTab === tab ? '2px solid var(--adj-brand)' : '2px solid transparent',
                  color:        activeTab === tab ? 'var(--adj-brand)' : 'var(--adj-ink-2)',
                  fontSize:     13,
                  fontWeight:   activeTab === tab ? 700 : 500,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          6,
                  whiteSpace:   'nowrap',
                  transition:   'color .12s',
                }}
              >
                {t(`veille.tabs.${tab}`)}
                {tab === 'all' && data && !loading && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '1px 6px',
                    borderRadius: 10, background: 'var(--adj-panel-2)',
                    color: 'var(--adj-ink-2)',
                  }}>
                    {total.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: total + toggle filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {!isMobile && !loading && data && (
              <span style={{ fontSize: 12, color: 'var(--adj-ink-4)', whiteSpace: 'nowrap' }}>
                {total.toLocaleString()} {total <= 1 ? t('veille.totalSingle') : t('veille.total')}
              </span>
            )}
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            6,
                padding:        isMobile ? '6px' : '6px 11px',
                borderRadius:   7,
                border:         '1px solid var(--adj-hairline)',
                background:     showFilters ? 'var(--adj-brand-tint)' : 'transparent',
                color:          showFilters ? 'var(--adj-brand)' : 'var(--adj-ink-2)',
                fontSize:       12,
                fontWeight:     600,
                cursor:         'pointer',
                fontFamily:     'inherit',
                transition:     'background .12s, color .12s',
                flexShrink:     0,
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              {!isMobile && (showFilters ? t('veille.filters.hide') : t('veille.filters.show'))}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '10px 16px', background: 'rgba(220,38,38,0.07)',
            borderBottom: '1px solid rgba(220,38,38,0.2)',
            fontSize: 13, color: '#dc2626', flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {/* Table area */}
        <div
          className="adj-scroll"
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'auto',
            // La bulle de discussion est fixee en bas a droite : sans cette
            // reserve, elle recouvre la derniere ligne du tableau, et c'est
            // justement la colonne d'etat qui passe dessous.
            paddingBottom: 72,
          }}
        >
          {/* Disposition AUTOMATIQUE, sans colgroup : `table-layout: fixed`
              obligeait a decider chaque largeur a l'avance -- donc a deviner
              celle d'une pastille ou d'un montant. Trop etroit, le contenu
              etait coupe ; somme differente de 100 %, il restait un vide ; et
              le bon reglage changeait avec la largeur de l'ecran.
              Ici chaque colonne prend ce que son contenu demande, le titre
              absorbe le reste. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('veille.table.acheteur')}</th>
                <th style={thStyle}>{t('veille.table.titre')}</th>
                <th style={thStyle}>{t('veille.table.datePub')}</th>
                <th style={thStyle}>{t('veille.table.dateLimite')}</th>
                <th style={thStyle}>{t('veille.table.categorie')}</th>
                <th style={thStyle}>{t('veille.table.region')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{t('veille.table.budget')}</th>
                <th style={thStyle}>{t('veille.table.statut')}</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading && data ? 0.45 : 1, transition: 'opacity 0.15s' }}>
              {loading && !data ? (
                <TableSkeleton />
              ) : !data?.items.length ? (
                <EmptyState statusTab={activeTab} hasFilters={hasActiveTextFilters} />
              ) : (
                data.items.map(ao => (
                  <AoTableRow
                    key={ao.id}
                    ao={ao}
                    selected={selectedAo?.id === ao.id}
                    onClick={() => handleRowClick(ao)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            8,
              padding:        '10px 16px',
              borderTop:      '1px solid var(--adj-hairline)',
              background:     'var(--adj-panel)',
              flexShrink:     0,
            }}
          >
            <button
              onClick={() => patchFilters({ page: filters.page - 1 })}
              disabled={filters.page <= 1}
              style={{
                padding:      '6px 13px',
                borderRadius: 7,
                border:       '1px solid var(--adj-hairline)',
                background:   'var(--adj-panel-2)',
                color:        'var(--adj-ink-2)',
                fontSize:     13,
                fontWeight:   500,
                cursor:       filters.page <= 1 ? 'not-allowed' : 'pointer',
                opacity:      filters.page <= 1 ? 0.4 : 1,
                fontFamily:   'inherit',
              }}
            >
              {t('veille.pagination.prev')}
            </button>

            <span style={{ fontSize: 13, color: 'var(--adj-ink-2)' }}>
              {filters.page} {t('veille.pagination.of')} {totalPages}
            </span>

            <button
              onClick={() => patchFilters({ page: filters.page + 1 })}
              disabled={filters.page >= totalPages}
              style={{
                padding:      '6px 13px',
                borderRadius: 7,
                border:       '1px solid var(--adj-hairline)',
                background:   'var(--adj-panel-2)',
                color:        'var(--adj-ink-2)',
                fontSize:     13,
                fontWeight:   500,
                cursor:       filters.page >= totalPages ? 'not-allowed' : 'pointer',
                opacity:      filters.page >= totalPages ? 0.4 : 1,
                fontFamily:   'inherit',
              }}
            >
              {t('veille.pagination.next')}
            </button>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedAo && (
        <AoDetailPanel
          key={selectedAo.id}
          ao={selectedAo}
          onClose={() => setSelectedAo(null)}
          onUpdated={handleRowUpdated}
        />
      )}
    </div>
  );
}
