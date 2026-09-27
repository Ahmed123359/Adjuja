// Panneau de filtres des veilles AO et bons de commande -- 2026-09-27.
//
// Cadre commun (colonne laterale sur ordinateur, tiroir sur mobile), en-tete,
// sections et champs. Les deux panneaux en etaient deux copies, avec des
// libelles de section en capitales espacees -- motif rejete dans
// ui-context.md -- et des champs de 36px.

import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { useIsMobile } from '../../../hooks/useIsMobile';

export const filterInputStyle: React.CSSProperties = {
  width:        '100%',
  height:       44,
  padding:      '0 14px',
  borderRadius: 'var(--adj-round-s)',
  border:       '1px solid var(--adj-hairline)',
  background:   'var(--adj-panel)',
  color:        'var(--adj-ink)',
  fontSize:     'var(--adj-t-base)',
  outline:      'none',
  boxSizing:    'border-box',
  fontFamily:   'inherit',
  transition:   'border-color .15s, box-shadow .15s',
};

const focus = {
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--adj-brand)';
    e.currentTarget.style.boxShadow = 'var(--adj-ring)';
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'var(--adj-hairline)';
    e.currentTarget.style.boxShadow = 'none';
  },
};

export function FilterSection({ label, htmlFor, children }: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 500, color: 'var(--adj-ink-2)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function FilterSearch({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={17} aria-hidden style={{
        position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--adj-ink-4)', pointerEvents: 'none',
      }} />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...filterInputStyle, paddingLeft: 40 }}
        {...focus}
      />
    </div>
  );
}

export function FilterText({ id, value, onChange, placeholder }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={filterInputStyle}
      {...focus}
    />
  );
}

export function FilterPanel({ hasActiveFilters, onReset, onClose, children }: {
  hasActiveFilters: boolean;
  onReset: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile && (
        <div
          className="adj-overlay"
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        />
      )}
      <aside
        aria-label={t('veille.filters.title')}
        className={isMobile ? 'adj-drawer' : undefined}
        style={{
          display: 'flex', flexDirection: 'column',
          background: 'var(--adj-panel)', borderRight: '1px solid var(--adj-hairline)',
          ...(isMobile
            ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 56, width: 320, maxWidth: '88vw' }
            : { width: 300, flexShrink: 0, height: '100%' }),
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--adj-3)',
          height: 60, padding: '0 var(--adj-5)', flexShrink: 0,
          borderBottom: '1px solid var(--adj-hairline)',
        }}>
          <span style={{ fontSize: 'var(--adj-t-base)', fontWeight: 600, color: 'var(--adj-ink)' }}>
            {t('veille.filters.title')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-2)' }}>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onReset}
                className="adj-focusable"
                style={{
                  padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer',
                  borderRadius: 'var(--adj-round-s)', fontFamily: 'inherit',
                  fontSize: 'var(--adj-t-xs)', fontWeight: 600, color: 'var(--adj-brand)',
                }}
              >
                {t('veille.filters.reset')}
              </button>
            )}
            {isMobile && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('veille.filters.hide')}
                className="adj-focusable"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer',
                  borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-3)',
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="adj-scroll" style={{
          flex: 1, overflowY: 'auto',
          padding: 'var(--adj-5)',
          display: 'flex', flexDirection: 'column', gap: 'var(--adj-5)',
        }}>
          {children}
        </div>
      </aside>
    </>
  );
}
