// Champ de date -- 2026-09-25.
//
// Remplace `<input type="date">`, dont le calendrier est celui du système : sur
// Windows, une grille blanche à angles vifs, en anglais, qui ignore le thème
// sombre et n'a rien à voir avec le reste du produit. C'était le dernier
// contrôle à ne pas avoir été dessiné, après les listes déroulantes.
//
// Ce que le natif donnait et qu'il fallait réécrire :
//   - saisie au clavier possible sans ouvrir le calendrier ;
//   - fermeture sur Échap, sur clic extérieur ;
//   - valeur normalisée en AAAA-MM-JJ, quel que soit l'affichage.
//
// Ce qu'il ne donnait pas, et qui sert vraiment ici : des raccourcis vers les
// dates qu'on saisit réellement pour une échéance -- aujourd'hui, demain, dans
// une semaine.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

/** Découpe locale : `toISOString()` bascule sur UTC et décale d'un jour à
 *  l'ouest de Greenwich, ce qui ferait tomber une échéance la veille. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plusJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export function DateField({
  value, onChange, id, placeholder,
}: {
  /** AAAA-MM-JJ, ou chaîne vide. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  const [ouvert, setOuvert] = useState(false);
  const [mois, setMois] = useState(() => (value ? new Date(`${value}T00:00:00`) : new Date()));
  const zone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    // Rouvrir sur le mois de la valeur courante, pas sur le mois en cours :
    // corriger une échéance de mars ne doit pas repartir de septembre.
    if (value) setMois(new Date(`${value}T00:00:00`));

    const clic = (e: MouseEvent) => {
      if (!zone.current?.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche); };
  }, [ouvert, value]);

  const aujourdhui = isoDay(new Date());

  const cases = useMemo(() => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
    const decalage = (premier.getDay() + 6) % 7;          // semaine au lundi
    const debut = new Date(premier);
    debut.setDate(premier.getDate() - decalage);
    // Le nombre de semaines suit le mois : pas de ligne vide pour stabiliser
    // une hauteur dans un panneau flottant.
    const semaines = Math.ceil((decalage + dernier.getDate()) / 7);
    return Array.from({ length: semaines * 7 }, (_, i) => {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      return d;
    });
  }, [mois]);

  const affichage = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const nav: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 'var(--adj-round-s)',
    border: 'none', background: 'transparent',
    color: 'var(--adj-ink-3)', cursor: 'pointer',
  };

  const raccourci: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 'var(--adj-round-s)',
    border: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)',
    color: 'var(--adj-ink-2)', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 'var(--adj-t-xs)', whiteSpace: 'nowrap',
  };

  return (
    <div ref={zone} style={{ position: 'relative', width: '100%' }}>
      <button
        id={id}
        type="button"
        onClick={() => setOuvert(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className="adj-focusable adj-anim"
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          width: '100%', height: 42, padding: '0 12px',
          borderRadius: 'var(--adj-round-m)',
          border: `1px solid ${ouvert ? 'var(--adj-brand)' : 'var(--adj-edge)'}`,
          background: 'var(--adj-panel)',
          color: value ? 'var(--adj-ink)' : 'var(--adj-ink-4)',
          fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
          textAlign: 'left', cursor: 'pointer',
          transition: 'border-color .14s',
        }}
      >
        <CalendarDays size={16} strokeWidth={1.9} style={{ flexShrink: 0, color: 'var(--adj-ink-4)' }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {affichage || placeholder || t('dashboard.home.task.dueLabel')}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t('tasks.date.clear')}
            onClick={e => { e.stopPropagation(); onChange(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(''); }
            }}
            style={{ display: 'flex', flexShrink: 0, color: 'var(--adj-ink-4)', cursor: 'pointer' }}
          >
            <X size={14} strokeWidth={2} />
          </span>
        )}
      </button>

      {ouvert && (
        <div
          role="dialog"
          className="adj-pop"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 210,
            width: 288, padding: 'var(--adj-3)',
            background: 'var(--adj-panel)',
            border: '1px solid var(--adj-hairline)',
            borderRadius: 'var(--adj-round-m)',
            boxShadow: 'var(--adj-lift-3)',
          }}
        >
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 6, marginBottom: 10,
          }}>
            <span style={{
              fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
              color: 'var(--adj-ink)', textTransform: 'capitalize',
            }}>
              {new Date(mois.getFullYear(), mois.getMonth(), 1)
                .toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </span>
            <span style={{ display: 'flex', gap: 2 }}>
              <button type="button" style={nav} className="adj-focusable"
                aria-label={t('dashboard.home.prevMonth')}
                onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}>
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <button type="button" style={nav} className="adj-focusable"
                aria-label={t('dashboard.home.nextMonth')}
                onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}>
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </span>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
            {(t('dashboard.home.weekdays', { returnObjects: true }) as string[]).map((j, i) => (
              <span key={`${j}-${i}`} style={{
                paddingBottom: 6, textAlign: 'center',
                fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
                color: 'var(--adj-ink-4)',
              }}>
                {j.slice(0, 2)}
              </span>
            ))}

            {cases.map(jour => {
              const cle = isoDay(jour);
              const duMois = jour.getMonth() === mois.getMonth();
              const estChoisi = cle === value;
              const estAujourdhui = cle === aujourdhui;

              return (
                <button
                  key={cle}
                  type="button"
                  onClick={() => { onChange(cle); setOuvert(false); }}
                  className="adj-focusable adj-anim"
                  style={{
                    height: 34, borderRadius: 'var(--adj-round-s)',
                    border: `1px solid ${estAujourdhui && !estChoisi ? 'var(--adj-brand-edge)' : 'transparent'}`,
                    background: estChoisi ? 'var(--adj-brand)' : 'transparent',
                    color: estChoisi ? '#fff'
                      : duMois ? 'var(--adj-ink-2)' : 'var(--adj-ink-4)',
                    fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
                    fontWeight: (estChoisi || estAujourdhui ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
                    fontVariantNumeric: 'tabular-nums',
                    opacity: duMois ? 1 : 0.45,
                    cursor: 'pointer', padding: 0,
                  }}
                  onMouseEnter={e => { if (!estChoisi) e.currentTarget.style.background = 'var(--adj-panel-2)'; }}
                  onMouseLeave={e => { if (!estChoisi) e.currentTarget.style.background = 'transparent'; }}
                >
                  {jour.getDate()}
                </button>
              );
            })}
          </div>

          {/* Les trois dates qu'on saisit réellement pour une échéance. Le
              natif obligeait à naviguer jusqu'à elles. */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 'var(--adj-3)', paddingTop: 'var(--adj-3)',
            borderTop: '1px solid var(--adj-hairline)', flexWrap: 'wrap',
          }}>
            <button type="button" style={raccourci} className="adj-focusable"
              onClick={() => { onChange(plusJours(0)); setOuvert(false); }}>
              {t('dashboard.home.dueToday')}
            </button>
            <button type="button" style={raccourci} className="adj-focusable"
              onClick={() => { onChange(plusJours(1)); setOuvert(false); }}>
              {t('dashboard.home.dueTomorrow')}
            </button>
            <button type="button" style={raccourci} className="adj-focusable"
              onClick={() => { onChange(plusJours(7)); setOuvert(false); }}>
              {t('tasks.date.inAWeek')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
