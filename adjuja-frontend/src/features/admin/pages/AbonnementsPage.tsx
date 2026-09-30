// Administration : abonnements -- 2026-10-01.
//
// Rangés par échéance, la plus proche d'abord : la question qu'on pose à cet
// écran est « qui arrive au bout de sa période, qui n'a pas payé ».

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useRessource } from '../../../shared/lib/cache';
import { Select } from '../../../shared/ui/Select';
import { fetchAbonnements } from '../api';
import type { AbonnementLigne } from '../types';
import { Chargement, DateCourte, MessageErreur, PageAdmin, Vide, td, th } from '../components/ui';
import { Offre } from './ComptesPage';

const STATUTS = ['active', 'past_due', 'canceled', 'trialing'];
const SEPT_JOURS = 7 * 86400000;

function Statut({ a }: { a: AbonnementLigne }) {
  const { t } = useTranslation();
  const proche = a.statut === 'active' && a.echeance && new Date(a.echeance).getTime() - Date.now() < SEPT_JOURS;
  const couleur = a.statut === 'past_due' ? 'var(--adj-neg)' : proche ? 'var(--adj-hold)' : 'var(--adj-ink-2)';
  return (
    <span style={{ color: couleur, fontWeight: (a.statut === 'past_due' || proche ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never }}>
      {t(`admin.abonnements.statut.${a.statut}`, { defaultValue: a.statut })}
      {proche && ` · ${t('admin.abonnements.bientot')}`}
    </span>
  );
}

export default function AbonnementsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const etroit = useIsMobile(900);
  const [statut, setStatut] = useState('');
  const liste = useRessource(`admin:abonnements:${statut}`, () => fetchAbonnements(statut || undefined));
  const ouvrir = (a: AbonnementLigne) => navigate(`/admin/comptes/${a.org_id}`);

  return (
    <PageAdmin
      titre={t('admin.nav.abonnements')}
      sousTitre={t('admin.pages.abonnements')}
      actions={
        <span style={{ width: 220 }}>
          <Select value={statut} onChange={setStatut} options={[
            { value: '', label: t('admin.abonnements.tous') },
            ...STATUTS.map(s => ({ value: s, label: t(`admin.abonnements.statut.${s}`) })),
          ]} />
        </span>
      }
    >
      {liste.erreur && !liste.data && <MessageErreur erreur={liste.erreur} />}
      {liste.loading && <Chargement />}
      {liste.data && liste.data.length === 0 && <Vide>{t(statut ? 'admin.abonnements.aucunFiltre' : 'admin.abonnements.aucun')}</Vide>}
      {liste.data && liste.data.length > 0 && (etroit ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--adj-hairline)' }}>
          {liste.data.map(a => (
            <li key={a.org_id}>
              <button onClick={() => ouvrir(a)} className="adj-focusable" style={{
                width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6,
                padding: 'var(--adj-4) 0', border: 'none', borderBottom: '1px solid var(--adj-hairline)',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
              }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--adj-3)' }}>
                  <span style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>{a.nom}</span>
                  <Offre code={a.offre} />
                </span>
                <span><Statut a={a} /> · {t('admin.compte.jusquau')} <DateCourte iso={a.echeance} /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('admin.comptes.col.organisation')}</th>
              <th style={th}>{t('admin.comptes.col.offre')}</th>
              <th style={th}>{t('admin.abonnements.col.statut')}</th>
              <th style={th}>{t('admin.abonnements.col.echeance')}</th>
              <th style={th}>{t('admin.abonnements.col.grace')}</th>
              <th style={th}>{t('admin.abonnements.col.fournisseur')}</th>
            </tr>
          </thead>
          <tbody>
            {liste.data.map(a => (
              <tr key={a.org_id} onClick={() => ouvrir(a)} onKeyDown={e => { if (e.key === 'Enter') ouvrir(a); }}
                tabIndex={0} className="adj-row adj-focusable" style={{ cursor: 'pointer' }}>
                <td style={{ ...td, color: 'var(--adj-ink)', fontWeight: 'var(--adj-w-semi)' as never }}>{a.nom}</td>
                <td style={td}><Offre code={a.offre} /></td>
                <td style={td}><Statut a={a} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><DateCourte iso={a.echeance} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><DateCourte iso={a.fin_de_grace} /></td>
                <td style={td}>{t(`admin.abonnements.fournisseur.${a.fournisseur}`, { defaultValue: a.fournisseur })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </PageAdmin>
  );
}
