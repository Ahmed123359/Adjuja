import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check } from 'lucide-react';

const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
] as const;

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all hover:bg-gray-50"
        style={{ borderColor: '#e2e8f0', color: '#64748b', background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }}
      >
        <span className="hidden md:inline">{current.label}</span>
        <span className="md:hidden">{current.code.toUpperCase()}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-36 rounded-xl overflow-hidden shadow-lg border"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', borderColor: '#e2e8f0', animation: 'fade-in-down 0.15s ease both' }}
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-gray-50"
              style={{ color: lang.code === current.code ? '#3b82f6' : '#475569' }}
            >
              <span className="flex-1">{lang.label}</span>
              {lang.code === current.code && <Check className="h-3.5 w-3.5 text-blue-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
