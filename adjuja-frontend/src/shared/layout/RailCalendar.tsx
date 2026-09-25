// Calendrier des échéances, dans la barre latérale -- 2026-09-25.
//
// Il vivait dans une carte du tableau de bord, où son rôle n'était pas lisible :
// à côté d'un tableau d'AO et d'une liste de tâches, une grille de mois passe
// pour un widget. Ici sa fonction est évidente -- il est toujours là, et il ne
// répond qu'à une question : qu'est-ce qui tombe bientôt.
//
// Ce n'est donc pas le MonthCalendar repeint en sombre. Les différences sont
// celles du rôle :
//   - aucune sélection de jour, aucun détail au clic dans la grille : la grille
//     repère, la liste en dessous dit quoi ;
//   - cinq semaines au lieu de six, calées sur le mois réel : on ne garde pas
//     une ligne vide pour stabiliser une hauteur, la place est comptée ici ;
//   - un seul point par jour chargé, pas un par type : à 26px de case, trois
//     points deviennent une tache.
//
// Il charge ses propres données. Le tableau de bord n'est pas son propriétaire :
// la barre reste affichée sur tous les écrans, y compris ceux qui ne chargent
// aucun calendrier.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchCalendar } from '../../features/dashboard/api';
import { isoDay, monthBounds } from '../../features/dashboard/components/MonthCalendar';
import type { CalendarEvent } from '../../features/dashboard/types';

/** Teintes sur fond sombre : celles du thème clair n'y tiennent pas le
 *  contraste. Une remise d'AO est bleue, une tâche en retard rouge, une tâche à
 *  venir ambre, une tâche faite s'efface. */
function teinte(e: CalendarEvent, aujourdhui: string): string {
  if (e.type === 'ao_deadline') return '#5FA0F5';
  if (e.statut === 'faite') return 'var(--adj-rail-ink-3)';
  return e.date < aujourdhui ? '#F4726B' : '#E0A346';
}

export function RailCalendar({ onOpenDay }: { onOpenDay?: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  const [mois, setMois] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const charger = useCallback((m: Date) => {
    const { from, to } = monthBounds(m);
    // La barre est présente sur tous les écrans : si l'appel échoue, elle se
    // vide au lieu de faire tomber la navigation.
    fetchCalendar(from, to).then(setEvents).catch(() => setEvents([]));
  }, []);

  useEffect(() => { charger(mois); }, [mois, charger]);

  const aujourdhui = isoDay(new Date());

  const { cases, parJour } = useMemo(() => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const dernier = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
    const decalage = (premier.getDay() + 6) % 7;        // semaine au lundi
    const debut = new Date(premier);
    debut.setDate(premier.getDate() - decalage);

    // Le nombre de semaines suit le mois : février sur 4 lignes n'en occupe pas 6.
    const semaines = Math.ceil((decalage + dernier.getDate()) / 7);

    const grille = Array.from({ length: semaines * 7 }, (_, i) => {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      return d;
    });

    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);

    return { cases: grille, parJour: map };
  }, [mois, events]);

  // La liste ne redit pas la grille : elle donne les trois prochaines échéances,
  // avec leur intitulé, ce qu'une pastille ne peut pas porter.
  const aVenir = useMemo(
    () => events
      .filter(e => e.date >= aujourdhui && !(e.type === 'task' && e.statut === 'faite'))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6),
    [events, aujourdhui],
  );

  const nav: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 'var(--adj-round-s)',
    border: 'none', background: 'transparent',
    color: 'var(--adj-rail-ink-2)', cursor: 'pointer',
  };

  return (
    <section style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100%',
      padding: '16px 14px 14px',
      borderTop: '1px solid var(--adj-rail-edge)',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 6, marginBottom: 10,
      }}>
        <span style={{
          minWidth: 0,
          fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
          color: 'var(--adj-rail-ink)', textTransform: 'capitalize',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {new Date(mois.getFullYear(), mois.getMonth(), 1)
            .toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </span>
        <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            type="button" style={nav} className="adj-focusable"
            aria-label={t('dashboard.home.prevMonth')}
            onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-rail-ink)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-rail-ink-2)'; }}
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>
          <button
            type="button" style={nav} className="adj-focusable"
            aria-label={t('dashboard.home.nextMonth')}
            onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-rail-ink)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-rail-ink-2)'; }}
          >
            <ChevronRight size={15} strokeWidth={2} />
          </button>
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
        {(t('dashboard.home.weekdays', { returnObjects: true }) as string[]).map((j, i) => (
          <span key={`${j}-${i}`} style={{
            paddingBottom: 7, textAlign: 'center',
            fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
            color: 'var(--adj-rail-ink-3)',
          }}>
            {j.slice(0, 2)}
          </span>
        ))}

        {cases.map(jour => {
          const cle = isoDay(jour);
          const duMois = jour.getMonth() === mois.getMonth();
          const duJour = parJour.get(cle) ?? [];
          const estAujourdhui = cle === aujourdhui;

          // Un jour sans échéance n'est pas cliquable : il n'y a rien à ouvrir.
          const cliquable = duJour.length > 0;

          return (
            <span
              key={cle}
              title={cliquable ? duJour.map(e => e.titre).join('\n') : undefined}
              onClick={cliquable ? onOpenDay : undefined}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: 38, borderRadius: 'var(--adj-round-s)',
                fontSize: 'var(--adj-t-sm)',
                fontWeight: (estAujourdhui ? 'var(--adj-w-bold)' : 'var(--adj-w-normal)') as never,
                fontVariantNumeric: 'tabular-nums',
                background: estAujourdhui ? 'var(--adj-brand)' : 'transparent',
                color: estAujourdhui ? '#fff'
                  : duMois ? 'var(--adj-rail-ink-2)' : 'var(--adj-rail-ink-3)',
                opacity: duMois ? 1 : 0.4,
                cursor: cliquable ? 'pointer' : 'default',
              }}
            >
              {jour.getDate()}
              {duJour.length > 0 && !estAujourdhui && (
                <span aria-hidden style={{
                  position: 'absolute', bottom: 5,
                  width: 5, height: 5, borderRadius: '50%',
                  background: teinte(duJour[0], aujourdhui),
                }} />
              )}
            </span>
          );
        })}
      </div>

      <ul className="adj-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        listStyle: 'none', margin: '16px 0 0', padding: 0,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {aVenir.length === 0 && (
          <li style={{
            fontSize: 'var(--adj-t-xs)', color: 'var(--adj-rail-ink-3)',
            lineHeight: 1.5,
          }}>
            {t('dashboard.home.noUpcoming')}
          </li>
        )}
        {aVenir.map((e, i) => {
          const jours = Math.round(
            (new Date(`${e.date}T00:00:00`).getTime() - new Date(`${aujourdhui}T00:00:00`).getTime()) / 86400000,
          );
          const relatif = jours === 0 ? t('dashboard.home.dueToday')
            : jours === 1 ? t('dashboard.home.dueTomorrow')
            : t('dashboard.home.dueInDays', { count: jours });

          return (
            <li
              key={`${e.type}-${e.task_id ?? e.ao_id ?? i}`}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}
            >
              <span aria-hidden style={{
                width: 4, alignSelf: 'stretch', flexShrink: 0,
                borderRadius: 2, background: teinte(e, aujourdhui),
              }} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                <span
                  title={e.titre}
                  style={{
                    fontSize: 'var(--adj-t-sm)', color: 'var(--adj-rail-ink)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {e.titre}
                </span>
                <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-rail-ink-3)' }}>
                  {relatif}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
