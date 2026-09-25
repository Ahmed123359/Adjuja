// Calendrier mensuel, écrit à la main : une grille de sept colonnes, et aucune
// bibliothèque de calendrier n'est installée dans le projet.
//
// Détails qui le sortent du calendrier par défaut :
//   - six semaines pleines, donc une hauteur stable d'un mois à l'autre : rien
//     ne saute sous le calendrier quand on change de mois ;
//   - les jours des mois voisins sont gris plutôt qu'absents, la grille n'est
//     jamais trouée ;
//   - aujourd'hui est une pastille pleine, le jour choisi un cadre ;
//   - en colonne étroite, un point par type d'événement ; en pleine largeur,
//     l'intitulé tronqué, pour savoir sans cliquer.

import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '../types';

type Props = {
  month: Date;
  events: CalendarEvent[];
  selected: string | null;
  onSelect: (date: string) => void;
  onMonthChange: (month: Date) => void;
  /** Colonne étroite : cases réduites, points au lieu d'intitulés. */
  compact?: boolean;
};

const MAX_CHIPS = 2;

export function isoDay(d: Date): string {
  // Découpe locale : toISOString() bascule sur UTC et décale d'un jour à l'ouest
  // de Greenwich, ce qui ferait tomber une échéance la veille.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthBounds(month: Date): { from: string; to: string } {
  return {
    from: isoDay(new Date(month.getFullYear(), month.getMonth(), 1)),
    to:   isoDay(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
  };
}

export function eventTone(e: CalendarEvent, today: string): string {
  if (e.type === 'ao_deadline') return 'var(--adj-brand)';
  if (e.statut === 'faite') return 'var(--adj-ink-4)';
  return e.date < today ? 'var(--adj-neg)' : 'var(--adj-hold)';
}

const navBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 28, minWidth: 28, padding: '0 var(--adj-2)', borderRadius: 'var(--adj-round-s)',
  border: '1px solid var(--adj-edge)', background: 'var(--adj-panel)',
  color: 'var(--adj-ink-3)', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 'var(--adj-t-sm)', lineHeight: 1, whiteSpace: 'nowrap',
};

export function MonthCalendar({ month, events, selected, onSelect, onMonthChange, compact }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const today = isoDay(new Date());

  const premier = new Date(month.getFullYear(), month.getMonth(), 1);
  const decalage = (premier.getDay() + 6) % 7;          // semaine au lundi
  const debut = new Date(premier);
  debut.setDate(premier.getDate() - decalage);

  const cases = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(debut);
    d.setDate(debut.getDate() + i);
    return d;
  });

  const parJour = new Map<string, CalendarEvent[]>();
  for (const e of events) parJour.set(e.date, [...(parJour.get(e.date) ?? []), e]);

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--adj-3)', marginBottom: 'var(--adj-3)', flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
          color: 'var(--adj-ink-2)', textTransform: 'capitalize',
        }}>
          {premier.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </span>

        <span style={{ display: 'flex', gap: 4 }}>
          <button type="button" style={navBtn} className="adj-focusable"
            aria-label={t('dashboard.home.prevMonth')}
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            {'‹'}
          </button>
          <button type="button" style={navBtn} className="adj-focusable"
            onClick={() => onMonthChange(new Date())}>
            {t('dashboard.home.today')}
          </button>
          <button type="button" style={navBtn} className="adj-focusable"
            aria-label={t('dashboard.home.nextMonth')}
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            {'›'}
          </button>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
        {(t('dashboard.home.weekdays', { returnObjects: true }) as string[]).map((j, i) => (
          <div key={`${j}-${i}`} style={{
            padding: '0 0 6px', textAlign: 'center',
            fontSize: 10, fontWeight: 'var(--adj-w-semi)' as never,
            color: 'var(--adj-ink-4)', textTransform: 'uppercase', letterSpacing: '.06em',
          }}>
            {j}
          </div>
        ))}

        {cases.map(jour => {
          const cle = isoDay(jour);
          const duMois = jour.getMonth() === month.getMonth();
          const duJour = parJour.get(cle) ?? [];
          const estAujourdhui = cle === today;
          const estChoisi = cle === selected;

          return (
            <button
              key={cle}
              type="button"
              onClick={() => onSelect(cle)}
              className="adj-anim adj-focusable"
              style={{
                minHeight: compact ? 40 : 72,
                display: 'flex', flexDirection: 'column',
                gap: compact ? 3 : 4,
                alignItems: compact ? 'center' : 'stretch',
                justifyContent: compact ? 'center' : 'flex-start',
                textAlign: compact ? 'center' : 'left',
                padding: compact ? '5px 0' : 'var(--adj-2)',
                borderRadius: 'var(--adj-round-s)',
                cursor: 'pointer', fontFamily: 'inherit',
                background: estChoisi ? 'var(--adj-brand-tint)' : 'transparent',
                border: `1px solid ${estChoisi ? 'var(--adj-brand-edge)' : 'transparent'}`,
                opacity: duMois ? 1 : 0.42,
                transition: 'background .12s',
              }}
              onMouseEnter={e => { if (!estChoisi) e.currentTarget.style.background = 'var(--adj-panel-3)'; }}
              onMouseLeave={e => { if (!estChoisi) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                alignSelf: compact ? 'center' : 'flex-start',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 22, height: 22, padding: '0 5px', borderRadius: 999,
                fontSize: 'var(--adj-t-xs)',
                fontWeight: (estAujourdhui ? 'var(--adj-w-bold)' : 'var(--adj-w-medium)') as never,
                fontFeatureSettings: 'var(--adj-num)' as never,
                background: estAujourdhui ? 'var(--adj-brand)' : 'transparent',
                color: estAujourdhui ? '#fff' : duMois ? 'var(--adj-ink-2)' : 'var(--adj-ink-4)',
              }}>
                {jour.getDate()}
              </span>

              {compact && duJour.length > 0 && (
                <span style={{ display: 'flex', gap: 3 }}>
                  {[...new Set(duJour.map(e => eventTone(e, today)))].slice(0, 3).map(teinte => (
                    <span key={teinte} style={{ width: 5, height: 5, borderRadius: '50%', background: teinte }} />
                  ))}
                </span>
              )}

              {!compact && duJour.slice(0, MAX_CHIPS).map((e, k) => (
                <span
                  key={`${e.type}-${e.task_id ?? e.ao_id ?? k}`}
                  title={e.titre}
                  style={{
                    display: 'block', minWidth: 0,
                    padding: '2px 5px',
                    borderLeft: `2px solid ${eventTone(e, today)}`,
                    borderRadius: 3,
                    background: 'var(--adj-panel-2)',
                    fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {e.titre}
                </span>
              ))}

              {!compact && duJour.length > MAX_CHIPS && (
                <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', paddingLeft: 5 }}>
                  +{duJour.length - MAX_CHIPS}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
