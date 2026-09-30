// Administration : comptes et organisations -- 2026-10-01.
//
// Une ligne par organisation effective (un utilisateur seul est sa propre
// organisation) : c'est l'unité qui paie, qui a une offre et des membres.
// La ligne mène à la fiche, où se font les actions.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useRessource } from '../../../shared/lib/cache';
import { Button } from '../../../shared/ui/Button';
import { Select } from '../../../shared/ui/Select';
import { fetchOrganisations } from '../api';
import type { CodeOffre, EtatCompte, OrganisationLigne } from '../types';
import { Chargement, DateCourte, Depuis, MessageErreur, PageAdmin, Vide, nombre, td, th } from '../components/ui';

const OFFRES: CodeOffre[] = ['free', 'starter', 'pro', 'enterprise'];
const ETATS: EtatCompte[] = ['actif', 'inactif', 'suspendu'];

export function Offre({ code }: { code: string }) {
  const { t } = useTranslation();
  const payante = code !== 'free';
  return (
    <span style={{ color: payante ? 'var(--adj-ink)' : 'var(--adj-ink-3)', fontWeight: (payante ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never }}>
      {t(`admin.offres.${code}`, { defaultValue: code })}
    </span>
  );
}

function Etat({ o }: { o: OrganisationLigne }) {
  const { t } = useTranslation();
  if (o.suspendue) return <span style={{ color: 'var(--adj-neg)', fontWeight: 'var(--adj-w-semi)' as never }}>{t('admin.comptes.etat.suspendu')}</span>;
  if (!o.derniere_connexion) return <span style={{ color: 'var(--adj-ink-3)' }}>{t('admin.comptes.jamaisConnecte')}</span>;
  return <Depuis iso={o.derniere_connexion} />;
}

export default function ComptesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const etroit = useIsMobile(900);

  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [offre, setOffre] = useState<CodeOffre | ''>('');
  const [etat, setEtat] = useState<EtatCompte | ''>('');
  const [page, setPage] = useState(1);

  // La recherche part 300 ms après la dernière frappe, pas à chaque lettre.
  useEffect(() => {
    const id = window.setTimeout(() => { setRecherche(saisie); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [saisie]);

  const liste = useRessource(
    `admin:comptes:${recherche}|${offre}|${etat}|${page}`,
    () => fetchOrganisations({ recherche, offre, etat, page }),
  );
  const d = liste.data;
  const ouvrir = (o: OrganisationLigne) => navigate(`/admin/comptes/${o.org_id}`);
  const filtre = Boolean(recherche || offre || etat);

  return (
    <PageAdmin titre={t('admin.nav.comptes')} sousTitre={t('admin.pages.comptes')}>
      <div className="adj-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
        <span className="adj-toolbar-wide" style={{ position: 'relative', flex: '0 1 340px', minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
            <Search size={16} strokeWidth={1.9} color="var(--adj-ink-4)" />
          </span>
          <input
            value={saisie}
            onChange={e => setSaisie(e.target.value)}
            placeholder={t('admin.comptes.recherche')}
            aria-label={t('admin.comptes.recherche')}
            className="adj-focusable"
            style={{
              width: '100%', height: 42, padding: '0 12px 0 36px', boxSizing: 'border-box',
              borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-edge)',
              background: 'var(--adj-panel)', color: 'var(--adj-ink)',
              fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', outline: 'none',
            }}
          />
        </span>
        <span style={{ width: 190 }}>
          <Select
            value={offre}
            onChange={v => { setOffre(v as CodeOffre | ''); setPage(1); }}
            options={[{ value: '', label: t('admin.comptes.toutesOffres') }, ...OFFRES.map(o => ({ value: o, label: t(`admin.offres.${o}`) }))]}
          />
        </span>
        <span style={{ width: 190 }}>
          <Select
            value={etat}
            onChange={v => { setEtat(v as EtatCompte | ''); setPage(1); }}
            options={[{ value: '', label: t('admin.comptes.tousEtats') }, ...ETATS.map(e => ({ value: e, label: t(`admin.comptes.etat.${e}`) }))]}
          />
        </span>
      </div>

      {liste.erreur && !d && <MessageErreur erreur={liste.erreur} />}
      {liste.loading && <Chargement />}
      {d && d.total === 0 && <Vide>{t(filtre ? 'admin.comptes.aucunFiltre' : 'admin.comptes.aucun')}</Vide>}

      {d && d.total > 0 && (etroit ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--adj-hairline)' }}>
          {d.items.map(o => (
            <li key={o.org_id}>
              <button onClick={() => ouvrir(o)} className="adj-focusable adj-row" style={{
                width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6,
                padding: 'var(--adj-4) 0', border: 'none', borderBottom: '1px solid var(--adj-hairline)',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--adj-3)' }}>
                  <span style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>{o.nom}</span>
                  <Offre code={o.offre} />
                </span>
                <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{o.proprietaire_email}</span>
                <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>
                  {t('admin.comptes.resumeMobile', { membres: o.membres, dossiers: o.dossiers_total })} · <Etat o={o} />
                </span>
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
              <th style={{ ...th, textAlign: 'right' }}>{t('admin.comptes.col.membres')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('admin.comptes.col.dossiersMois')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('admin.comptes.col.dossiersTotal')}</th>
              <th style={th}>{t('admin.comptes.col.derniereConnexion')}</th>
              <th style={th}>{t('admin.comptes.col.creee')}</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map(o => (
              <tr
                key={o.org_id}
                onClick={() => ouvrir(o)}
                onKeyDown={e => { if (e.key === 'Enter') ouvrir(o); }}
                tabIndex={0}
                className="adj-row adj-focusable"
                style={{ cursor: 'pointer' }}
              >
                <td style={td}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ color: 'var(--adj-ink)', fontWeight: 'var(--adj-w-semi)' as never }}>{o.nom}</span>
                    <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{o.proprietaire_email}</span>
                  </span>
                </td>
                <td style={td}><Offre code={o.offre} /></td>
                <td className="adj-fig" style={nombre}>{o.membres}</td>
                <td className="adj-fig" style={nombre}>{o.dossiers_mois}</td>
                <td className="adj-fig" style={nombre}>{o.dossiers_total}</td>
                <td style={td}><Etat o={o} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><DateCourte iso={o.creee_le} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {d && d.total > d.par_page && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
          <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
            {t('admin.comptes.pagination', {
              debut: (d.page - 1) * d.par_page + 1, fin: Math.min(d.page * d.par_page, d.total), total: d.total,
            })}
          </span>
          <span style={{ display: 'flex', gap: 'var(--adj-2)' }}>
            <Button variant="secondary" size="sm" icon={<ChevronLeft size={15} />} disabled={d.page <= 1} onClick={() => setPage(p => p - 1)}>
              {t('admin.comptes.precedent')}
            </Button>
            <Button variant="secondary" size="sm" disabled={d.page * d.par_page >= d.total} onClick={() => setPage(p => p + 1)}>
              {t('admin.comptes.suivant')} <ChevronRight size={15} />
            </Button>
          </span>
        </div>
      )}
    </PageAdmin>
  );
}
