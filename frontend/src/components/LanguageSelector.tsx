import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

const LANGUAGES = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English',  short: 'EN' },
] as const;

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--l-card-border)', borderRadius: 7, padding: '7px 12px', fontSize: 13, fontWeight: 500, color: 'var(--l-sub)', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color .12s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
      >
        <span>{current.short}</span>
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--l-card)', border: '1px solid var(--l-card-border)', borderRadius: 8, overflow: 'hidden', minWidth: 120, boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.08)', zIndex: 200 }}>
          {LANGUAGES.map(lang => (
            <button key={lang.code} onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', color: lang.code === current.code ? 'var(--l-blue)' : 'var(--l-sub)', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {lang.label}
              {lang.code === current.code && (
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
