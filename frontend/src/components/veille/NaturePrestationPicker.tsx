import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AoCategorie, NaturePrestation } from '../../types';
import { fetchNaturesPrestation } from '../../api';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function useNaturesPrestation(): { natures: NaturePrestation[]; loading: boolean } {
  const [natures, setNatures] = useState<NaturePrestation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchNaturesPrestation()
      .then(data => { if (!cancelled) setNatures(data); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { natures, loading };
}

type Props = {
  value: string[];
  onChange: (labels: string[]) => void;
  categorieFilter?: AoCategorie | '';
};

export default function NaturePrestationPicker({ value, onChange, categorieFilter }: Props) {
  const { t } = useTranslation();
  const { natures: allNatures, loading } = useNaturesPrestation();
  const natures = categorieFilter
    ? allNatures.filter(n => n.categorie === categorieFilter)
    : allNatures;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
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

  const term = normalize(search.trim());
  const filtered = term
    ? natures.filter(n => normalize(n.label).includes(term))
    : natures;

  function toggle(label: string) {
    if (value.includes(label)) {
      onChange(value.filter(v => v !== label));
    } else {
      onChange([...value, label]);
    }
  }

  function remove(label: string) {
    onChange(value.filter(v => v !== label));
  }

  const placeholder = value.length === 0
    ? t('bdc.naturePicker.placeholder')
    : t('bdc.naturePicker.selected', { count: value.length });

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
          color:          value.length > 0 ? 'var(--l-text)' : 'var(--l-dim)',
          fontSize:       13,
          fontFamily:     'inherit',
          cursor:         'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {placeholder}
        </span>
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
          {value.map(label => (
            <span
              key={label}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          5,
                padding:      '3px 6px 3px 9px',
                borderRadius: 20,
                background:   'var(--l-blue-a)',
                color:        'var(--l-blue)',
                fontSize:     11.5,
                fontWeight:   600,
                maxWidth:     '100%',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
                {label}
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); remove(label); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: 'var(--l-blue)', cursor: 'pointer', padding: 0,
                  flexShrink: 0,
                }}
              >
                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div
          style={{
            position:      'absolute',
            top:           'calc(100% + 6px)',
            left:          0,
            right:         0,
            zIndex:        60,
            background:    'var(--l-card)',
            border:        '1px solid var(--l-card-border)',
            borderRadius:  10,
            boxShadow:     '0 8px 24px rgba(0,0,0,0.35)',
            display:       'flex',
            flexDirection: 'column',
            maxHeight:     420,
            overflow:      'hidden',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid var(--l-card-border)', flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('bdc.naturePicker.searchPh')}
              style={{
                width:        '100%',
                padding:      '7px 10px',
                borderRadius: 7,
                border:       '1px solid var(--l-card-border)',
                background:   'var(--l-input-bg)',
                color:        'var(--l-text)',
                fontSize:     13,
                outline:      'none',
                boxSizing:    'border-box',
                fontFamily:   'inherit',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {loading ? (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 12.5, color: 'var(--l-dim)' }}>
                {t('bdc.naturePicker.loading')}
              </p>
            ) : filtered.length === 0 ? (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 12.5, color: 'var(--l-dim)' }}>
                {t('bdc.naturePicker.empty')}
              </p>
            ) : (
              filtered.map(n => {
                const isSelected = value.includes(n.label);
                return (
                  <div
                    key={n.code}
                    onClick={() => toggle(n.label)}
                    style={{
                      display:    'flex',
                      alignItems: 'flex-start',
                      gap:        8,
                      padding:    '7px 10px',
                      cursor:     'pointer',
                      background: isSelected ? 'var(--l-blue-a)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width:        14,
                      height:       14,
                      borderRadius: 4,
                      border:       `2px solid ${isSelected ? 'var(--l-blue)' : 'var(--l-card-border)'}`,
                      background:   isSelected ? 'var(--l-blue)' : 'transparent',
                      flexShrink:   0,
                      marginTop:    1,
                      display:      'flex',
                      alignItems:   'center',
                      justifyContent: 'center',
                    }}>
                      {isSelected && (
                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--l-text)', lineHeight: 1.4 }}>
                      {n.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
