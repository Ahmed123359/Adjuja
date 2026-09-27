import { useTranslation } from 'react-i18next';
import { DateField } from '../../../shared/ui/DateField';
import type { AoCategorie, WatcherBdcFilters } from '../../../types';
import { useIsMobile } from '../../../hooks/useIsMobile';
import CategorieSelect from './CategorieSelect';
import NaturePrestationPicker from './NaturePrestationPicker';

const CATEGORIES: AoCategorie[] = ['Travaux', 'Fournitures', 'Services'];

type Props = {
  filters: WatcherBdcFilters;
  onChange: (patch: Partial<WatcherBdcFilters>) => void;
  onReset: () => void;
  onClose?: () => void;
};

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '8px 11px',
  borderRadius: 8,
  border:       '1px solid var(--adj-hairline)',
  background:   'var(--adj-panel-2)',
  color:        'var(--adj-ink)',
  fontSize:     13,
  outline:      'none',
  boxSizing:    'border-box',
  fontFamily:   'inherit',
  transition:   'border-color .15s',
};

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize:      11,
          fontWeight:    700,
          textTransform: 'uppercase',
          letterSpacing: '.07em',
          color:         'var(--adj-ink-4)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function BdcFilters({ filters, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const hasActiveFilters =
    filters.search || filters.categorie || filters.nature_prestations.length > 0 || filters.region || filters.date_limite_from;

  const categorieOptions: { value: AoCategorie | ''; label: string }[] = [
    { value: '', label: t('veille.filters.categorieAll') },
    ...CATEGORIES.map(cat => ({ value: cat, label: t(`veille.categories.${cat}`) })),
  ];

  return (
    <>
      {isMobile && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        />
      )}
      <aside
        style={
          isMobile
            ? {
                position:      'fixed',
                top:           0,
                left:          0,
                bottom:        0,
                zIndex:        56,
                width:         280,
                maxWidth:      '85vw',
                display:       'flex',
                flexDirection: 'column',
                background:    'var(--adj-panel)',
                borderRight:   '1px solid var(--adj-hairline)',
                overflowY:     'auto',
              }
            : {
                width:          240,
                flexShrink:     0,
                display:        'flex',
                flexDirection:  'column',
                background:     'var(--adj-panel)',
                borderRight:    '1px solid var(--adj-hairline)',
                height:         '100%',
                overflowY:      'auto',
              }
        }
      >
      {/* Header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 16px 10px',
          borderBottom:   '1px solid var(--adj-hairline)',
          flexShrink:     0,
          gap:            10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--adj-ink)' }}>
          {t('veille.filters.title')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasActiveFilters && (
            <button
              onClick={onReset}
              style={{
                background:   'none',
                border:       'none',
                cursor:       'pointer',
                fontSize:     12,
                color:        'var(--adj-brand)',
                fontFamily:   'inherit',
                padding:      0,
                fontWeight:   600,
              }}
            >
              {t('veille.filters.reset')}
            </button>
          )}
          {isMobile && onClose && (
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adj-ink-4)', display: 'flex', padding: 2 }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          flex:          1,
          padding:       '16px 14px',
          display:       'flex',
          flexDirection: 'column',
          gap:           18,
          overflowY:     'auto',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="var(--adj-ink-4)"
            strokeWidth={2}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={filters.search}
            onChange={e => onChange({ search: e.target.value, page: 1 })}
            placeholder={t('bdc.filters.search')}
            style={{ ...inputStyle, paddingLeft: 32 }}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--adj-brand)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--adj-hairline)')}
          />
        </div>

        {/* Categorie principale (reuse) */}
        <FilterSection label={t('veille.filters.categorie')}>
          <CategorieSelect
            value={filters.categorie as AoCategorie | ''}
            onChange={cat => onChange({
              categorie: cat,
              nature_prestations: [],
              page: 1,
            })}
            options={categorieOptions}
          />
        </FilterSection>

        {/* Nature de prestation : narrowee par la categorie choisie ci-dessus */}
        <FilterSection label={t('bdc.filters.naturePrestation')}>
          <NaturePrestationPicker
            value={filters.nature_prestations}
            onChange={labels => onChange({ nature_prestations: labels, page: 1 })}
            categorieFilter={filters.categorie as AoCategorie | ''}
          />
        </FilterSection>

        {/* Region */}
        <FilterSection label={t('veille.filters.region')}>
          <input
            value={filters.region}
            onChange={e => onChange({ region: e.target.value, page: 1 })}
            placeholder={t('veille.filters.regionPh')}
            style={inputStyle}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--adj-brand)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--adj-hairline)')}
          />
        </FilterSection>

        {/* Date limite from */}
        <FilterSection label={t('veille.filters.dateLimite')}>
          <DateField
            value={filters.date_limite_from}
            onChange={v => onChange({ date_limite_from: v, page: 1 })}
          />
        </FilterSection>
      </div>
      </aside>
    </>
  );
}
