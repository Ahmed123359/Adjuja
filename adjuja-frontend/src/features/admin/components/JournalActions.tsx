// Journal des actions d'administration (table admin_actions) -- 2026-09-30.
//
// Qui a lancé quoi, quand, en simulation ou pour de vrai, et ce que ça a
// donné. Les refus (action déjà en cours, veille injoignable) y figurent
// aussi : une demande sans effet doit laisser une trace.

import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useRessource } from '../../../shared/lib/cache';
import { fetchJournal } from '../api';
import type { LigneJournal } from '../types';
import { resumeRapport } from './rapport';

const TON: Record<LigneJournal['statut'], string> = {
  lance: 'var(--adj-brand)',
  termine: 'var(--adj-pos)',
  echec: 'var(--adj-neg)',
  refuse: 'var(--adj-hold)',
};

const th: React.CSSProperties = {
  textAlign: 'left', padding: '0 var(--adj-4) 12px',
  fontSize: 'var(--adj-t-xs)', fontWeight: 600, color: 'var(--adj-ink-3)',
  borderBottom: '1px solid var(--adj-hairline)', whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '12px var(--adj-4)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)',
  verticalAlign: 'top', borderBottom: '1px solid var(--adj-hairline)',
};

function Mode({ l }: { l: LigneJournal }) {
  const { t } = useTranslation();
  const reel = l.params?.reel;
  if (typeof reel !== 'boolean') return <>-</>;
  const limite = typeof l.params?.limite === 'number' ? t('admin.journal.limite', { n: l.params.limite }) : '';
  return <>{t(reel ? 'admin.journal.reel' : 'admin.journal.simulation')}{limite && `, ${limite}`}</>;
}

function Statut({ l }: { l: LigneJournal }) {
  const { t } = useTranslation();
  return (
    <span style={{ color: TON[l.statut], fontWeight: 'var(--adj-w-semi)' as never, whiteSpace: 'nowrap' }}>
      {t(`admin.journal.statut.${l.statut}`)}
    </span>
  );
}

export function JournalActions() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const etroit = useIsMobile(900);
  const journal = useRessource('admin:actions', () => fetchJournal(50));

  const date = (iso: string) => new Date(iso).toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const nom = (l: LigneJournal) => t(`admin.actions.${l.action}.titre`, { defaultValue: l.action });

  if (journal.erreur && !journal.data) {
    return <p role="alert" style={{ margin: 0, color: 'var(--adj-neg)' }}>{journal.erreur.message}</p>;
  }
  if (!journal.data) return null;
  if (journal.data.length === 0) {
    return <p style={{ margin: 0, color: 'var(--adj-ink-2)' }}>{t('admin.journal.vide')}</p>;
  }

  if (etroit) {
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {journal.data.map(l => (
          <li key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--adj-4) 0', borderBottom: '1px solid var(--adj-hairline)' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--adj-3)' }}>
              <span style={{ fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>{nom(l)}</span>
              <Statut l={l} />
            </span>
            <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>
              {date(l.created_at)} · {l.admin_email} · <Mode l={l} />
            </span>
            <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>
              {resumeRapport(t, l.action, l.resultat, locale, l.params)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>{t('admin.journal.date')}</th>
          <th style={th}>{t('admin.journal.action')}</th>
          <th style={th}>{t('admin.journal.mode')}</th>
          <th style={th}>{t('admin.journal.par')}</th>
          <th style={th}>{t('admin.journal.statutCol')}</th>
          <th style={th}>{t('admin.journal.compteRendu')}</th>
        </tr>
      </thead>
      <tbody>
        {journal.data.map(l => (
          <tr key={l.id}>
            <td className="adj-fig" style={{ ...td, whiteSpace: 'nowrap' }}>{date(l.created_at)}</td>
            <td style={{ ...td, color: 'var(--adj-ink)' }}>{nom(l)}</td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}><Mode l={l} /></td>
            <td style={td}>{l.admin_email}</td>
            <td style={td}><Statut l={l} /></td>
            <td style={td}>{resumeRapport(t, l.action, l.resultat, locale, l.params)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
