import { useState, useRef, useEffect } from 'react';

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  style?: React.CSSProperties;
};

export default function CustomSelect({ value, onChange, options, placeholder, style }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...style,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          color: current ? 'var(--l-text)' : 'var(--l-dim)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : placeholder}
        </span>
        <svg
          width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          style={{ flexShrink: 0, marginLeft: 8, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--l-card)', border: '1px solid var(--l-card-border)',
            borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto',
            boxShadow: '0 16px 40px -12px rgba(0,0,0,0.5)', zIndex: 200,
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                width: '100%', padding: '11px 14px', background: 'none', border: 'none',
                borderBottom: '1px solid var(--l-card-border)',
                cursor: 'pointer', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit',
                textAlign: 'left', color: opt.value === value ? 'var(--l-blue)' : 'var(--l-sub)',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--l-surface-2, rgba(255,255,255,0.05))'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {opt.label}
              {opt.value === value && (
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
