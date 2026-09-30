// Veille des appels d'offres -- habillage repris sur le socle le 2026-09-27.
//
// Barre d'outils, pagination, etat vide et cellule d'echeance viennent de
// ./components/ListChrome, partages avec les bons de commande (BdcPage). La
// logique de chargement, de filtres et de selection n'a pas change.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapedAo, ScrapedAoList, WatcherFilters } from '../../types';
import { fetchScrapedAo, fetchScrapedAos, updateScrapedAoStatus } from './api';
import { consommerAoVeille } from '../../shared/lib/navigation';
import WatcherStatusBadge from './components/WatcherStatusBadge';
import VeilleFilters from './components/VeilleFilters';
import AoDetailPanel from './components/AoDetailPanel';
import {
  ListToolbar, ListError, Pagination, EmptyRow, SkeletonRows, EcheanceCell,
  thStyle, tdStyle, clamp2, formatDateCourte, rowHandlers, type StatusTab,
} from './components/ListChrome';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatTitre, splitReservationClause } from '../../utils/formatTitre';

const PAGE_LIMIT = 50;
const COLS = 8;

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

function formatAmount(raw: string | null): string {
  if (!raw) return '-';
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toLocaleString('fr-MA', { maximumFractionDigits: 0 });
}

const metaText: React.CSSProperties = {
  fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)', lineHeight: 1.4,
};

function AoTableRow({ ao, selected, onClick }: {
  ao: ScrapedAo;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      aria-selected={selected}
      style={{ cursor: 'pointer', background: selected ? 'var(--adj-brand-tint)' : 'transparent', transition: 'background .1s' }}
      {...rowHandlers(selected)}
    >
      {/* Acheteur, sur deux lignes : « MENESFC / DMENB - DIRECTI... » ne
          distingue pas deux directions du meme ministere. */}
      <td style={{ ...tdStyle, maxWidth: '26ch' }}>
        <p title={ao.acheteur ?? undefined} style={{ ...clamp2, fontSize: 'var(--adj-t-sm)', fontWeight: 500, color: 'var(--adj-ink)' }}>
          {ao.acheteur ?? '-'}
        </p>
      </td>

      {/* Titre : la colonne qu'on lit reellement, donc la plus large. */}
      <td style={{ ...tdStyle, width: '100%' }}>
        <p title={ao.titre} style={{ ...clamp2, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)' }}>
          {formatTitre(splitReservationClause(ao.titre).main)}
        </p>
      </td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        <span className="adj-fig" style={metaText}>{formatDateCourte(ao.date_publication)}</span>
      </td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        <EcheanceCell iso={ao.date_limite} />
      </td>

      <td style={{ ...tdStyle, maxWidth: '18ch' }}>
        <p style={{ ...clamp2, ...metaText }}>{ao.categorie ?? '-'}</p>
      </td>

      <td style={{ ...tdStyle, maxWidth: '18ch' }}>
        <p style={{ ...clamp2, ...metaText }}>{ao.region || ao.ville || '-'}</p>
      </td>

      {/* Budget en chiffres tabulaires : les ordres de grandeur se comparent
          d'une ligne a l'autre. */}
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
        {ao.budget_estime ? (
          <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-ink)' }}>
            {formatAmount(ao.budget_estime)} Dhs
          </span>
        ) : (
          <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>—</span>
        )}
      </td>

      <td style={{ ...tdStyle, whiteSpace: 'nowrap', width: 1 }}>
        <WatcherStatusBadge status={ao.status} />
      </td>
    </tr>
  );
}

export default function VeillePage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [filters, setFilters]           = useState<WatcherFilters>(DEFAULT_FILTERS);
  const [data, setData]                 = useState<ScrapedAoList | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [selectedAo, setSelectedAo]     = useState<ScrapedAo | null>(null);
  const [lienIntrouvable, setLienIntrouvable] = useState(false);
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
    } catch {
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

  // Fiche demandee par un lien d'email (shared/lib/navigation) : chargee a
  // part, l'AO n'est pas forcement dans la page de resultats affichee.
  useEffect(() => {
    const id = consommerAoVeille();
    if (id === null) return;
    fetchScrapedAo(id)
      .then(handleRowClick)
      .catch(() => setLienIntrouvable(true));
  }, [handleRowClick]);

  const activeTab = filters.status as StatusTab;
  const hasActiveTextFilters = !!(
    filters.search || filters.categorie || filters.mode_passation || filters.region || filters.date_limite_from
    || filters.secteur_codes.length > 0
  );
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {showFilters && (
        <VeilleFilters
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
        {lienIntrouvable && <ListError>{t('veille.error.aoIntrouvable')}</ListError>}

        <div
          className="adj-scroll"
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'auto',
            // La bulle de discussion est fixee en bas a droite : sans cette
            // reserve, elle recouvre la derniere ligne du tableau.
            paddingBottom: 72,
          }}
        >
          {/* Disposition automatique : chaque colonne prend ce que son contenu
              demande, le titre absorbe le reste. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 760 }}>
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
                <SkeletonRows cols={COLS} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={COLS} statusTab={activeTab} hasFilters={hasActiveTextFilters} />
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

        <Pagination page={filters.page} totalPages={totalPages} onPage={(page) => patchFilters({ page })} />
      </div>

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
