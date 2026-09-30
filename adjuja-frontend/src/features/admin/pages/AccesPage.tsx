// Administration : qui a accès au panneau -- 2026-10-01.
//
// Lecture seule, par décision de l'utilisateur (2026-09-30) : la liste vient
// de ADMIN_EMAILS (.env) et ne se modifie que par un redéploiement, pour
// qu'aucune faille web ne puisse jamais créer un administrateur. L'écran dit
// donc comment ajouter quelqu'un, au lieu d'offrir un bouton qui mentirait.

import { useTranslation } from 'react-i18next';
import { useRessource } from '../../../shared/lib/cache';
import { fetchAcces } from '../api';
import { Chargement, Depuis, MessageErreur, PageAdmin, Section, Vide, td, th } from '../components/ui';

export default function AccesPage() {
  const { t } = useTranslation();
  const acces = useRessource('admin:acces', fetchAcces);
  const a = acces.data;

  const etat = (x: NonNullable<typeof a>['administrateurs'][number]) => {
    if (!x.compte_existe) return <span style={{ color: 'var(--adj-hold)' }}>{t('admin.acces.pasDeCompte')}</span>;
    if (!x.email_verifie) return <span style={{ color: 'var(--adj-hold)' }}>{t('admin.acces.nonVerifie')}</span>;
    if (!x.actif) return <span style={{ color: 'var(--adj-neg)' }}>{t('admin.acces.suspendu')}</span>;
    return <span style={{ color: 'var(--adj-pos)', fontWeight: 'var(--adj-w-semi)' as never }}>{t('admin.acces.actif')}</span>;
  };

  return (
    <PageAdmin titre={t('admin.nav.acces')} sousTitre={t('admin.pages.acces')}>
      {acces.erreur && !a && <MessageErreur erreur={acces.erreur} />}
      {acces.loading && <Chargement />}
      {a && (
        <>
          <Section titre={t('admin.acces.administrateurs')} note={t('admin.acces.commentAjouter')}>
            {a.administrateurs.length === 0 ? <Vide>{t('admin.acces.aucun')}</Vide> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>{t('admin.acces.col.email')}</th>
                    <th style={th}>{t('admin.acces.col.etat')}</th>
                    <th style={th}>{t('admin.acces.col.connexion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.administrateurs.map(x => (
                    <tr key={x.email}>
                      <td style={{ ...td, color: 'var(--adj-ink)' }}>{x.email}</td>
                      <td style={td}>{etat(x)}</td>
                      <td style={td}>{x.derniere_connexion ? <Depuis iso={x.derniere_connexion} /> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section titre={t('admin.acces.inscription')}>
            <p style={{ margin: 0, color: 'var(--adj-ink-2)', lineHeight: 'var(--adj-lead-body)' as never }}>
              {a.inscription_sur_invitation
                ? t('admin.acces.surInvitation', { count: a.adresses_autorisees.length })
                : t('admin.acces.ouverte')}
            </p>
            {a.inscription_sur_invitation && (
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--adj-ink-2)' }}>
                {a.adresses_autorisees.map(e => <li key={e}>{e}</li>)}
              </ul>
            )}
          </Section>
        </>
      )}
    </PageAdmin>
  );
}
