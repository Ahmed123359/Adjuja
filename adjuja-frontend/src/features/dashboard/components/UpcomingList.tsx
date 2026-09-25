// Prochaines échéances, sous le calendrier.
//
// Le calendrier dit quand, cette liste dit quoi : les deux se répondent au lieu
// de se répéter. C'est elle qui porte le détail, ce qui permet au calendrier de
// rester compact dans une colonne étroite.
//
// Détail qui compte : le temps est écrit en relatif (« dans 3 jours », « en
// retard de 6 jours ») à côté de la date. C'est la seule chose qu'on veuille
// vraiment savoir d'une échéance, et aucune date brute ne la donne d'un coup
// d'oeil.

import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '../types';

export function UpcomingList({
  events, emptyLabel, onSelectDay, max = 6,
}: {
  events: CalendarEvent[];
  emptyLabel: string;
  onSelectDay?: (date: string) => void;
  max?: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const today = new Date().toISOString().slice(0, 10);

  if (!events.length) {
    return (
      <p style={{ margin: 0, padding: 'var(--adj-2) 0', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {events.slice(0, max).map((e, i) => {
        const enRetard = e.type === 'task' && e.date < today && e.statut !== 'faite';
        const teinte = e.type === 'ao_deadline' ? 'var(--adj-brand)'
          : enRetard ? 'var(--adj-neg)' : 'var(--adj-hold)';

        const jours = Math.round(
          (new Date(`${e.date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000,
        );
        const relatif = jours === 0 ? t('dashboard.home.dueToday')
          : jours === 1 ? t('dashboard.home.dueTomorrow')
          : jours > 1 ? t('dashboard.home.dueInDays', { count: jours })
          : t('dashboard.home.dueLate', { count: Math.abs(jours) });

        const d = new Date(`${e.date}T00:00:00`);

        return (
          <li
            key={`${e.type}-${e.task_id ?? e.ao_id ?? i}`}
            className="adj-row"
            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--adj-hairline)' }}
          >
            <button
              type="button"
              onClick={() => onSelectDay?.(e.date)}
              className="adj-focusable"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--adj-3)',
                width: '100%', padding: '9px 0', textAlign: 'left',
                border: 'none', background: 'transparent',
                cursor: onSelectDay ? 'pointer' : 'default',
                fontFamily: 'inherit', minWidth: 0,
              }}
            >
              <span style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                minWidth: 38, padding: '2px 0', borderLeft: `2px solid ${teinte}`,
                paddingLeft: 8, lineHeight: 1.1, flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: 'var(--adj-font)', fontSize: 16,
                  fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)',
                  fontFeatureSettings: 'var(--adj-num)' as never,
                }}>
                  {d.getDate()}
                </span>
                <span style={{ fontSize: 10, color: 'var(--adj-ink-3)', textTransform: 'uppercase' }}>
                  {d.toLocaleDateString(locale, { month: 'short' }).replace('.', '')}
                </span>
              </span>

              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span
                  title={e.titre}
                  style={{
                    fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {e.titre}
                </span>
                <span style={{ fontSize: 'var(--adj-t-xs)', color: enRetard ? 'var(--adj-neg)' : 'var(--adj-ink-3)' }}>
                  {t(`dashboard.home.eventType.${e.type}`)}
                  {' · '}{relatif}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
