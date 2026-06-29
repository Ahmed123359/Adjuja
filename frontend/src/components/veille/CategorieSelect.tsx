import { useEffect, useRef, useState } from 'react';
import type { AoCategorie } from '../../types';

type Option = { value: AoCategorie | ''; label: string };

type Props = {
  value: AoCategorie | '';
  onChange: (value: AoCategorie | '') => void;
  options: Option[];
};

/**
 * Select custom (pas un <select> natif) : le popup d'un <select> natif
 * suit le theme OS, pas nos CSS vars -- impossible a styler proprement
 * dans tous les navigateurs. Meme langage visuel que SecteurPicker.
 */
export default function CategorieSelect({ value, onChange, options }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = options.find(o => o.value === value) ?? options[0];

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            8,
          padding:        '8px 11px',
          borderRadius:   8,
          border:         `1px solid ${open ? 'var(--l-blue)' : 'var(--l-card-border)'}`,
          background:     'var(--l-input-bg)',
          color:          value ? 'var(--l-text)' : 'var(--l-dim)',
          fontSize:       13,
          fontFamily:     'inherit',
          cursor:         'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.label}
        </span>
        <svg
          width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position:     'absolute',
            top:          'calc(100% + 6px)',
            left:         0,
            right:        0,
            zIndex:       60,
            background:   'var(--l-card)',
            border:       '1px solid var(--l-card-border)',
            borderRadius: 10,
            boxShadow:    '0 8px 24px rgba(0,0,0,0.35)',
            overflow:     'hidden',
            padding:      4,
          }}
        >
          {options.map(opt => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value || 'all'}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width:        '100%',
                  textAlign:    'left',
                  padding:      '8px 10px',
                  borderRadius: 6,
                  border:       'none',
                  background:   selected ? 'var(--l-blue-a)' : 'transparent',
                  color:        selected ? 'var(--l-blue)' : 'var(--l-text)',
                  fontSize:     13,
                  fontWeight:   selected ? 600 : 500,
                  fontFamily:   'inherit',
                  cursor:       'pointer',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--l-input-bg)'; }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
