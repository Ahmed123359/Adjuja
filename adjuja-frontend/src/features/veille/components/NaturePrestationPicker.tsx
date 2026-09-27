import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFloating, floatingStyle } from '../../../shared/ui/useFloating';
import type { AoCategorie, NaturePrestation } from '../../../types';
import { fetchNaturesPrestation } from '../../../api';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const pos = useFloating(triggerRef, open, 420);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const cible = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(cible) && !popRef.current?.contains(cible)) {
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
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="adj-focusable"
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            8,
          height:         44,
          padding:        '0 14px',
          borderRadius:   'var(--adj-round-s)',
          border:         `1px solid ${open ? 'var(--adj-brand)' : 'var(--adj-edge)'}`,
          background:     'var(--adj-panel)',
          color:          value.length > 0 ? 'var(--adj-ink)' : 'var(--adj-ink-4)',
          fontSize:       'var(--adj-t-base)',
          fontFamily:     'inherit',
          textAlign:      'left',
          cursor:         'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {placeholder}
        </span>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, color: 'var(--adj-ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {value.map(label => (
            <span
              key={label}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          5,
                padding:      '5px 8px 5px 11px',
                borderRadius: 'var(--adj-round-s)',
                background:   'var(--adj-brand-tint)',
                color:        'var(--adj-brand)',
                fontSize:     'var(--adj-t-xs)',
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
                  width: 20, height: 20, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: 'var(--adj-brand)', cursor: 'pointer', padding: 0,
                  flexShrink: 0,
                }}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Liste flottante, en portail (shared/ui/useFloating) : dans un panneau
          en overflow hidden, elle etait rognee au lieu de passer par-dessus. */}
      {open && pos && createPortal(
        <div
          ref={popRef}
          className="adj-pop"
          style={{
            ...floatingStyle(pos),
            background:    'var(--adj-panel)',
            border:        '1px solid var(--adj-hairline)',
            borderRadius:  'var(--adj-round-m)',
            boxShadow:     'var(--adj-lift-3)',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid var(--adj-hairline)', flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('bdc.naturePicker.searchPh')}
              style={{
                width:        '100%',
                height:       40,
                padding:      '0 12px',
                borderRadius: 'var(--adj-round-s)',
                border:       '1px solid var(--adj-hairline)',
                background:   'var(--adj-panel)',
                color:        'var(--adj-ink)',
                fontSize:     'var(--adj-t-sm)',
                outline:      'none',
                boxSizing:    'border-box',
                fontFamily:   'inherit',
              }}
            />
          </div>

          <div className="adj-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
            {loading ? (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>
                {t('bdc.naturePicker.loading')}
              </p>
            ) : filtered.length === 0 ? (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>
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
                      padding:    '10px 14px',
                      cursor:     'pointer',
                      background: isSelected ? 'var(--adj-brand-tint)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width:        14,
                      height:       14,
                      borderRadius: 4,
                      border:       `2px solid ${isSelected ? 'var(--adj-brand)' : 'var(--adj-hairline)'}`,
                      background:   isSelected ? 'var(--adj-brand)' : 'transparent',
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
                    <span style={{ flex: 1, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)', lineHeight: 1.4 }}>
                      {n.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
