// Veille des bons de commande -- habillage repris sur le socle le 2026-09-27.
//
// Meme habillage que la veille des AO (./components/ListChrome) : en-tetes en
// casse normale au lieu des capitales espacees, disposition de tableau
// automatique au lieu de largeurs figees en pourcentage, titres sur deux
// lignes, echeance en relatif. La logique n'a pas change.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapedBdc, ScrapedBdcList, WatcherBdcFilters } from '../../types';
import { fetchScrapedBdc, updateBdcStatus } from '../../api';
import WatcherStatusBadge from './components/WatcherStatusBadge';
import BdcFilters from './components/BdcFilters';
import BdcDetailPanel from './components/BdcDetailPanel';
import {
  ListToolbar, ListError, Pagination, EmptyRow, SkeletonRows, EcheanceCell,
  thStyle, tdStyle, clamp2, formatDateCourte, rowHandlers, type StatusTab,
} from './components/ListChrome';
import { useIsMobile } from '../../hooks/useIsMobile';

const PAGE_LIMIT = 50;
const COLS = 6;

const DEFAULT_FILTERS: WatcherBdcFilters = {
  status:            'all',
  search:            '',
  categorie:         '',
  nature_prestations: [],
  region:            '',
  date_limite_from:  '',
  page:              1,
};

const metaText: React.CSSProperties = {
  fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)', lineHeight: 1.4,
};

function BdcTableRow({ bdc, selected, onClick }: { bdc: ScrapedBdc; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <tr
      onClick={onClick}
      aria-selected={selected}
      style={{ cursor: 'pointer', background: selected ? 'var(--adj-brand-tint)' : 'transparent', transition: 'background .1s' }}
      {...rowHandlers(selected)}
    >
      <td style={{ ...tdStyle, maxWidth: '26ch' }}>
        <p title={bdc.acheteur ?? undefined} style={{ ...clamp2, fontSize: 'var(--adj-t-sm)', fontWeight: 500, color: 'var(--adj-ink)' }}>
          {bdc.acheteur ?? '-'}
        </p>
      </td>

      <td style={{ ...tdStyle, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {bdc.est_annule && (
            <span style={{
              flexShrink: 0, padding: '2px 8px', borderRadius: 'var(--adj-round-s)',
              background: 'var(--adj-neg-tint)', color: 'var(--adj-neg)',
              fontSize: 'var(--adj-t-xs)', fontWeight: 600,
            }}>
              {t('bdc.table.annule')}
            </span>
          )}
          <p title={bdc.titre} style={{ ...clamp2, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)' }}>
            {bdc.titre}
          </p>
        </div>
      </td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        <span className="adj-fig" style={metaText}>{formatDateCourte(bdc.date_publication)}</span>
      </td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        <EcheanceCell iso={bdc.date_limite} />
      </td>

      <td style={{ ...tdStyle, maxWidth: '18ch' }}>
        <p style={{ ...clamp2, ...metaText }}>{bdc.categorie ?? '-'}</p>
      </td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap', width: 1 }}>
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
  const loadIdRef                     = useRef(0);

  const load = useCallback(async (f: WatcherBdcFilters) => {
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchScrapedBdc(f, PAGE_LIMIT);
      if (id !== loadIdRef.current) return;
      setData(result);
    } catch {
      if (id !== loadIdRef.current) return;
      setError(t('veille.error.loadFailed'));
    } finally {
      if (id === loadIdRef.current) setLoading(false);
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
  // `nature_prestations` compte comme un filtre actif : sans lui, un filtre par
  // nature sans resultat affichait « aucun bon de commande » au lieu de
  // « aucun resultat pour ces filtres ».
  const hasActiveTextFilters = !!(
    filters.search || filters.categorie || filters.region || filters.date_limite_from
    || filters.nature_prestations.length > 0
  );
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--adj-panel)' }}>
        <ListToolbar
          activeTab={activeTab}
          onTab={(tab) => patchFilters({ status: tab, page: 1 })}
          total={data ? total : null}
          loading={loading}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(v => !v)}
          compact={isMobile}
        />

        {error && <ListError>{error}</ListError>}

        <div
          className="adj-scroll"
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'auto',
            // La bulle de discussion est fixee en bas a droite : sans cette
            // reserve, elle recouvre la derniere ligne du tableau.
            paddingBottom: 72,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('veille.table.acheteur')}</th>
                <th style={thStyle}>{t('veille.table.titre')}</th>
                <th style={thStyle}>{t('veille.table.datePub')}</th>
                <th style={thStyle}>{t('veille.table.dateLimite')}</th>
                <th style={thStyle}>{t('veille.table.categorie')}</th>
                <th style={thStyle}>{t('bdc.table.statut')}</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading && data ? 0.45 : 1, transition: 'opacity 0.15s' }}>
              {loading && !data ? (
                <SkeletonRows cols={COLS} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={COLS} statusTab={activeTab} hasFilters={hasActiveTextFilters} />
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

        <Pagination page={filters.page} totalPages={totalPages} onPage={(page) => patchFilters({ page })} />
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
