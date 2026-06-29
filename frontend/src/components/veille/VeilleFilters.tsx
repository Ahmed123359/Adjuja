import { useTranslation } from 'react-i18next';
import type { AoCategorie, WatcherFilters } from '../../types';
import { useIsMobile } from '../../hooks/useIsMobile';
import SecteurPicker from './SecteurPicker';
import CategorieSelect from './CategorieSelect';

const CATEGORIES: AoCategorie[] = ['Travaux', 'Fournitures', 'Services'];

type Props = {
  filters: WatcherFilters;
  onChange: (patch: Partial<WatcherFilters>) => void;
  onReset: () => void;
  onClose?: () => void;
};

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '8px 11px',
  borderRadius: 8,
  border:       '1px solid var(--l-card-border)',
  background:   'var(--l-input-bg)',
  color:        'var(--l-text)',
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
          color:         'var(--l-dim)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function VeilleFilters({ filters, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const categorieOptions: { value: AoCategorie | ''; label: string }[] = [
    { value: '', label: t('veille.filters.categorieAll') },
    ...CATEGORIES.map(cat => ({ value: cat, label: t(`veille.categories.${cat}`) })),
  ];

  const hasActiveFilters =
    filters.search || filters.categorie || filters.region || filters.date_limite_from
    || filters.secteur_codes.length > 0;

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
                background:    'var(--l-card)',
                borderRight:   '1px solid var(--l-card-border)',
                overflowY:     'auto',
              }
            : {
                width:          240,
                flexShrink:     0,
                display:        'flex',
                flexDirection:  'column',
                background:     'var(--l-card)',
                borderRight:    '1px solid var(--l-card-border)',
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
          borderBottom:   '1px solid var(--l-card-border)',
          flexShrink:     0,
          gap:            10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--l-text)' }}>
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
                color:        'var(--l-blue)',
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-dim)', display: 'flex', padding: 2 }}
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
            stroke="var(--l-dim)"
            strokeWidth={2}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={filters.search}
            onChange={e => onChange({ search: e.target.value, page: 1 })}
            placeholder={t('veille.filters.search')}
            style={{ ...inputStyle, paddingLeft: 32 }}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--l-blue)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--l-card-border)')}
          />
        </div>

        {/* Categorie principale : choisie en premier, cadre la liste d'activites ci-dessous */}
        <FilterSection label={t('veille.filters.categorie')}>
          <CategorieSelect
            value={filters.categorie as AoCategorie | ''}
            onChange={cat => onChange({
              categorie: cat,
              secteur_codes: [], // les activites selectionnees ne s'appliquent plus forcement a la nouvelle categorie
              page: 1,
            })}
            options={categorieOptions}
          />
        </FilterSection>

        {/* Activites (secteurs) : narrowees par la categorie choisie ci-dessus */}
        <FilterSection label={t('veille.filters.activites')}>
          <SecteurPicker
            selected={filters.secteur_codes}
            onChange={codes => onChange({ secteur_codes: codes, page: 1 })}
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
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--l-blue)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--l-card-border)')}
          />
        </FilterSection>

        {/* Date limite from */}
        <FilterSection label={t('veille.filters.dateLimite')}>
          <input
            type="date"
            value={filters.date_limite_from}
            onChange={e => onChange({ date_limite_from: e.target.value, page: 1 })}
            style={inputStyle}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--l-blue)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--l-card-border)')}
          />
        </FilterSection>
      </div>
      </aside>
    </>
  );
}
