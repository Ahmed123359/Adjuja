import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapedBdc, ScrapedBdcList, WatcherBdcFilters } from '../types';
import { fetchScrapedBdc, updateBdcStatus } from '../api';
import WatcherStatusBadge from '../components/veille/WatcherStatusBadge';
import BdcFilters from '../components/veille/BdcFilters';
import BdcDetailPanel from '../components/veille/BdcDetailPanel';
import { useIsMobile } from '../hooks/useIsMobile';

const PAGE_LIMIT = 50;

const DEFAULT_FILTERS: WatcherBdcFilters = {
  status:            'all',
  search:            '',
  categorie:         '',
  nature_prestation: '',
  region:            '',
  date_limite_from:  '',
  page:              1,
};

const STATUS_TABS = ['all', 'new', 'favorited'] as const;
type StatusTab = typeof STATUS_TABS[number];

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}

function isDeadlineSoon(iso: string | null): boolean {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <td key={j} style={{ padding: '11px 14px', borderBottom: '1px solid var(--l-card-border)' }}>
              <div style={{
                height: 12, borderRadius: 4, background: 'var(--l-input-bg)',
                width: j === 1 ? '80%' : j === 0 ? '70%' : '55%', animation: 'pulse 1.5s infinite',
              }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ statusTab, hasFilters }: { statusTab: StatusTab; hasFilters: boolean }) {
  const { t } = useTranslation();
  const [icon, title, desc] = (() => {
    if (hasFilters) return [
      'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
      t('veille.empty.allTitle'), t('veille.empty.allDesc'),
    ];
    if (statusTab === 'favorited') return [
      'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
      t('veille.empty.favTitle'), t('veille.empty.favDesc'),
    ];
    return [
      'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      t('veille.empty.allTitle'), t('veille.empty.allDesc'),
    ];
  })();

  return (
    <tr>
      <td colSpan={6}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '72px 24px', gap: 12, textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: 'var(--l-blue-a)',
            border: '1px solid var(--l-card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--l-text)' }}>{title}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--l-sub)', maxWidth: 380 }}>{desc}</p>
        </div>
      </td>
    </tr>
  );
}

function BdcTableRow({ bdc, selected, onClick }: { bdc: ScrapedBdc; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const deadlineSoon = isDeadlineSoon(bdc.date_limite);

  return (
    <tr
      onClick={onClick}
      style={{ cursor: 'pointer', background: selected ? 'var(--l-blue-a)' : 'transparent', transition: 'background .1s' }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--l-input-bg)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = selected ? 'var(--l-blue-a)' : 'transparent'; }}
    >
      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--l-card-border)', minWidth: 160, maxWidth: 220 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--l-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bdc.acheteur ?? '-'}
        </p>
      </td>

      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--l-card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {bdc.est_annule && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.1)', color: '#dc2626', flexShrink: 0 }}>
              {t('bdc.table.annule')}
            </span>
          )}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--l-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
            {bdc.titre}
          </p>
        </div>
      </td>

      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--l-card-border)', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12, color: 'var(--l-sub)' }}>{formatDate(bdc.date_publication)}</span>
      </td>

      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--l-card-border)', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12, fontWeight: deadlineSoon ? 700 : 400, color: deadlineSoon ? '#d97706' : 'var(--l-sub)' }}>
          {formatDate(bdc.date_limite)}
        </span>
      </td>

      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--l-card-border)', maxWidth: 140 }}>
        <span style={{ fontSize: 12, color: 'var(--l-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {bdc.categorie ?? '-'}
        </span>
      </td>

      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--l-card-border)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <WatcherStatusBadge status={bdc.status} />
      </td>
    </tr>
  );
}

export default function BdcPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [filters, setFilters]         = useState<WatcherBdcFilters>(DEFAULT_FILTERS);
  const [data, setData]               = useState<ScrapedBdcList | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedBdc, setSelectedBdc] = useState<ScrapedBdc | null>(null);
  const [showFilters, setShowFilters] = useState(() => !isMobile);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (f: WatcherBdcFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchScrapedBdc(f, PAGE_LIMIT);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('veille.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(filters), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters, load]);

  const patchFilters = useCallback((patch: Partial<WatcherBdcFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(prev => ({ ...DEFAULT_FILTERS, status: prev.status }));
  }, []);

  const handleRowUpdated = useCallback((updated: ScrapedBdc) => {
    setData(prev => prev ? { ...prev, items: prev.items.map(b => b.id === updated.id ? updated : b) } : prev);
    setSelectedBdc(updated);
  }, []);

  const handleRowClick = useCallback(async (bdc: ScrapedBdc) => {
    setSelectedBdc(bdc);
    if (bdc.status === 'new') {
      try {
        const updated = await updateBdcStatus(bdc.id, 'seen');
        handleRowUpdated(updated);
      } catch {
        // non-fatal
      }
    }
  }, [handleRowUpdated]);

  const activeTab = filters.status as StatusTab;
  const hasActiveTextFilters = !!(filters.search || filters.categorie || filters.region || filters.date_limite_from);
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em',
    color: 'var(--l-dim)', textAlign: 'left', borderBottom: '1px solid var(--l-card-border)',
    background: 'var(--l-card)', position: 'sticky', top: 0, whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {showFilters && (
        <BdcFilters
          filters={filters}
          onChange={patchFilters}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 16px', borderBottom: '1px solid var(--l-card-border)', background: 'var(--l-card)', flexShrink: 0, height: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0, flex: 1, minWidth: 0, overflowX: 'auto' }}>
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => patchFilters({ status: tab === 'all' ? 'all' : tab, page: 1 })}
                style={{
                  height: '100%', padding: '0 14px', background: 'none', border: 'none',
                  borderBottom: activeTab === tab ? '2px solid var(--l-blue)' : '2px solid transparent',
                  color: activeTab === tab ? 'var(--l-blue)' : 'var(--l-sub)', fontSize: 13,
                  fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'color .12s',
                }}
              >
                {t(`veille.tabs.${tab}`)}
                {tab === 'all' && data && !loading && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: 'var(--l-input-bg)', color: 'var(--l-sub)' }}>
                    {total.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {!isMobile && !loading && data && (
              <span style={{ fontSize: 12, color: 'var(--l-dim)', whiteSpace: 'nowrap' }}>
                {total.toLocaleString()} {total <= 1 ? t('veille.totalSingle') : t('veille.total')}
              </span>
            )}
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '6px' : '6px 11px',
                borderRadius: 7, border: '1px solid var(--l-card-border)',
                background: showFilters ? 'var(--l-blue-a)' : 'transparent', color: showFilters ? 'var(--l-blue)' : 'var(--l-sub)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .12s, color .12s', flexShrink: 0,
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              {!isMobile && (showFilters ? t('veille.filters.hide') : t('veille.filters.show'))}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', background: 'rgba(220,38,38,0.07)', borderBottom: '1px solid rgba(220,38,38,0.2)', fontSize: 13, color: '#dc2626', flexShrink: 0 }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 700 }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}>{t('veille.table.acheteur')}</th>
                <th style={thStyle}>{t('veille.table.titre')}</th>
                <th style={thStyle}>{t('veille.table.datePub')}</th>
                <th style={thStyle}>{t('veille.table.dateLimite')}</th>
                <th style={thStyle}>{t('veille.table.categorie')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{t('bdc.table.statut')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <TableSkeleton />
              ) : !data?.items.length ? (
                <EmptyState statusTab={activeTab} hasFilters={hasActiveTextFilters} />
              ) : (
                data.items.map(bdc => (
                  <BdcTableRow
                    key={bdc.id}
                    bdc={bdc}
                    selected={selectedBdc?.id === bdc.id}
                    onClick={() => handleRowClick(bdc)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--l-card-border)', background: 'var(--l-card)', flexShrink: 0 }}>
            <button
              onClick={() => patchFilters({ page: filters.page - 1 })}
              disabled={filters.page <= 1}
              style={{
                padding: '6px 13px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)',
                color: 'var(--l-sub)', fontSize: 13, fontWeight: 500, cursor: filters.page <= 1 ? 'not-allowed' : 'pointer',
                opacity: filters.page <= 1 ? 0.4 : 1, fontFamily: 'inherit',
              }}
            >
              {t('veille.pagination.prev')}
            </button>
            <span style={{ fontSize: 13, color: 'var(--l-sub)' }}>
              {filters.page} {t('veille.pagination.of')} {totalPages}
            </span>
            <button
              onClick={() => patchFilters({ page: filters.page + 1 })}
              disabled={filters.page >= totalPages}
              style={{
                padding: '6px 13px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)',
                color: 'var(--l-sub)', fontSize: 13, fontWeight: 500, cursor: filters.page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: filters.page >= totalPages ? 0.4 : 1, fontFamily: 'inherit',
              }}
            >
              {t('veille.pagination.next')}
            </button>
          </div>
        )}
      </div>

      {selectedBdc && (
        <BdcDetailPanel
          key={selectedBdc.id}
          bdc={selectedBdc}
          onClose={() => setSelectedBdc(null)}
          onUpdated={handleRowUpdated}
        />
      )}
    </div>
  );
}
