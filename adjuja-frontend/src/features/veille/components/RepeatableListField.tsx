import { useState } from 'react';

const inputStyle: React.CSSProperties = {
  flex:         1,
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
  minWidth:     0,
};

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 44, height: 44, borderRadius: 'var(--adj-round-s)', border: '1px solid var(--adj-hairline)',
        background: 'var(--adj-panel)', color: 'var(--adj-ink-3)', cursor: 'pointer', flexShrink: 0, padding: 0,
      }}
    >
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 44, padding: '0 16px', borderRadius: 'var(--adj-round-s)', border: '1px dashed var(--adj-edge)',
        background: 'transparent', color: 'var(--adj-brand)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        fontSize: 'var(--adj-t-sm)', fontWeight: 600, fontFamily: 'inherit', alignSelf: 'flex-start',
      }}
    >
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {label}
    </button>
  );
}

// ── Liste simple de chaines (ex: certifications) ────────────────────────────

type StringListProps = {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
};

export function StringListField({ items, onChange, placeholder, addLabel }: StringListProps) {
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px 6px 12px', borderRadius: 'var(--adj-round-s)',
                background: 'var(--adj-brand-tint)', color: 'var(--adj-brand)',
                fontSize: 'var(--adj-t-sm)', fontWeight: 600,
              }}
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: 'var(--adj-brand)', cursor: 'pointer', padding: 0,
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
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={inputStyle}
        />
        <AddButton onClick={add} label={addLabel} />
      </div>
    </div>
  );
}

// ── Liste de lignes structurees (ex: classifications, references) ──────────

export type FieldDef = {
  key:         string;
  placeholder: string;
  type?:       'text' | 'number';
};

type StructuredListProps = {
  rows:     Record<string, string>[];
  fields:   FieldDef[];
  onChange: (rows: Record<string, string>[]) => void;
  addLabel: string;
};

export function StructuredListField({ rows, fields, onChange, addLabel }: StructuredListProps) {
  function updateRow(index: number, key: string, value: string) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    onChange([...rows, Object.fromEntries(fields.map(f => [f.key, '']))]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {fields.map(f => (
            <input
              key={f.key}
              type={f.type === 'number' ? 'number' : 'text'}
              value={row[f.key] ?? ''}
              onChange={e => updateRow(i, f.key, e.target.value)}
              placeholder={f.placeholder}
              style={inputStyle}
            />
          ))}
          <RemoveButton onClick={() => removeRow(i)} />
        </div>
      ))}
      <AddButton onClick={addRow} label={addLabel} />
    </div>
  );
}
