import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AoCategorie, Secteur } from '../../../types';
import { fetchSecteurs } from '../../../api';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function useSecteurs(): { secteurs: Secteur[]; loading: boolean } {
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSecteurs()
      .then(data => { if (!cancelled) setSecteurs(data); })
      .catch(() => { /* non-fatal: picker stays empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { secteurs, loading };
}

type Props = {
  selected: string[];
  onChange: (codes: string[]) => void;
  /** Quand fourni, ne montre que les secteurs de cette categorie (cascade
   * categorie -> activites, choisie en premier dans l'UI). */
  categorieFilter?: AoCategorie | '';
};

export default function SecteurPicker({ selected, onChange, categorieFilter }: Props) {
  const { t } = useTranslation();
  const { secteurs: allSecteurs, loading } = useSecteurs();
  const secteurs = categorieFilter
    ? allSecteurs.filter(s => s.categorie === categorieFilter)
    : allSecteurs;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
    ? secteurs.filter(s =>
        normalize(s.label).includes(term)
        || s.activites.some(a => normalize(a).includes(term)),
      )
    : secteurs;

  // Auto-expand secteurs that only matched via a sub-activite, so the
  // user understands why the result surfaced.
  useEffect(() => {
    if (!term) return;
    setExpanded(prev => {
      const next = new Set(prev);
      for (const s of filtered) {
        if (!normalize(s.label).includes(term)) next.add(s.code);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function toggleSelected(code: string) {
    onChange(
      selected.includes(code)
        ? selected.filter(c => c !== code)
        : [...selected, code],
    );
  }

  function toggleExpanded(code: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  // Intentionnellement allSecteurs (pas le sous-ensemble filtre par categorie) :
  // un secteur deja selectionne dans une autre categorie doit rester visible
  // en chip, meme si la categorie active dans le picker a change (cf. usage
  // profil entreprise, ou la categorie n'est qu'une loupe, pas un filtre dur).
  const selectedLabels = allSecteurs
    .filter(s => selected.includes(s.code))
    .map(s => s.label);

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
          border:         `1px solid ${open ? 'var(--adj-brand)' : 'var(--adj-hairline)'}`,
          background:     'var(--adj-panel-2)',
          color:          selected.length ? 'var(--adj-ink)' : 'var(--adj-ink-4)',
          fontSize:       13,
          fontFamily:     'inherit',
          cursor:         'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected.length
            ? t('veille.secteurPicker.selectedCount', { count: selected.length })
            : t('veille.secteurPicker.placeholder')}
        </span>
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
          {selectedLabels.map((label, i) => (
            <span
              key={selected[i]}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          5,
                padding:      '3px 6px 3px 9px',
                borderRadius: 20,
                background:   'var(--adj-brand-tint)',
                color:        'var(--adj-brand)',
                fontSize:     11.5,
                fontWeight:   600,
                maxWidth:     '100%',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                {label}
              </span>
              <button
                type="button"
                onClick={() => toggleSelected(selected[i])}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: 'var(--adj-brand)', cursor: 'pointer', padding: 0,
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
            background:    'var(--adj-panel)',
            border:        '1px solid var(--adj-hairline)',
            borderRadius:  10,
            boxShadow:     '0 8px 24px rgba(0,0,0,0.35)',
            display:       'flex',
            flexDirection: 'column',
            maxHeight:     420,
            overflow:      'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--adj-hairline)', flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('veille.secteurPicker.searchPh')}
              style={{
                width:        '100%',
                padding:      '7px 10px',
                borderRadius: 7,
                border:       '1px solid var(--adj-hairline)',
                background:   'var(--adj-panel-2)',
                color:        'var(--adj-ink)',
                fontSize:     13,
                outline:      'none',
                boxSizing:    'border-box',
                fontFamily:   'inherit',
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {loading ? (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 12.5, color: 'var(--adj-ink-4)' }}>
                {t('veille.secteurPicker.loading')}
              </p>
            ) : filtered.length === 0 ? (
              <p style={{ margin: 0, padding: '16px 14px', fontSize: 12.5, color: 'var(--adj-ink-4)' }}>
                {t('veille.secteurPicker.empty')}
              </p>
            ) : (
              filtered.map(s => {
                const isExpanded = expanded.has(s.code);
                const isSelected = selected.includes(s.code);
                return (
                  <div key={s.code}>
                    <div
                      style={{
                        display:    'flex',
                        alignItems: 'flex-start',
                        gap:        8,
                        padding:    '7px 10px',
                        cursor:     'pointer',
                      }}
                      onClick={() => toggleSelected(s.code)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(s.code)}
                        onClick={e => e.stopPropagation()}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--adj-ink)', lineHeight: 1.4 }}>
                        {s.label}
                      </span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleExpanded(s.code); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, border: 'none', background: 'none',
                          color: 'var(--adj-ink-4)', cursor: 'pointer', flexShrink: 0, padding: 0,
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform .12s',
                        }}
                      >
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    </div>
                    {isExpanded && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 10px 9px 32px' }}>
                        {s.activites.map(a => (
                          <span
                            key={a}
                            style={{
                              fontSize:     11,
                              padding:      '2px 7px',
                              borderRadius: 12,
                              background:   'var(--adj-panel-2)',
                              color:        'var(--adj-ink-2)',
                              border:       '1px solid var(--adj-hairline)',
                            }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
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
