// Administration : fiche d'une organisation -- 2026-10-01.
//
// Tout ce qu'il faut pour répondre à un client ou agir sur son compte, dans
// l'ordre où on en a besoin : son offre et ce qu'il en consomme, ses membres,
// son activité. Chaque action qui change quelque chose passe par une
// confirmation qui dit exactement ce qui va se produire.
//
// Garde-fous (aussi vérifiés côté serveur) : on ne suspend ni un
// administrateur ni soi-même ; le bouton est remplacé par la raison.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { invalider, useRessource } from '../../../shared/lib/cache';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Select } from '../../../shared/ui/Select';
import type { User } from '../../auth/types';
import { changerOffre, fetchOrganisation, reactiverCompte, suspendreCompte } from '../api';
import type { CodeOffre, Consommation, Membre, OrganisationDetail } from '../types';
import { Chargement, DateCourte, Depuis, MessageErreur, PageAdmin, Section, Vide, locale, td, th } from '../components/ui';
import { Offre } from './ComptesPage';

const OFFRES: CodeOffre[] = ['free', 'starter', 'pro', 'enterprise'];
const DUREES = [1, 3, 6, 12, 24];

/* ------------------------------------------------------------ abonnement */

function Jauge({ libelle, c }: { libelle: string; c: Consommation }) {
  const { t } = useTranslation();
  const plein = c.limite !== null && c.utilise >= c.limite;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--adj-4)', padding: '10px 0', borderBottom: '1px solid var(--adj-hairline)' }}>
      <span style={{ color: 'var(--adj-ink-2)' }}>{libelle}</span>
      <span className="adj-fig" style={{ color: plein ? 'var(--adj-neg)' : 'var(--adj-ink)', fontWeight: 'var(--adj-w-semi)' as never }}>
        {c.limite === null
          ? t('admin.compte.illimite', { n: c.utilise })
          : t('admin.compte.surLimite', { n: c.utilise, limite: c.limite })}
      </span>
    </div>
  );
}

function Abonnement({ o, onChange }: { o: OrganisationDetail; onChange: (d: OrganisationDetail) => void }) {
  const { t, i18n } = useTranslation();
  const [offre, setOffre] = useState<CodeOffre>(o.abonnement.offre);
  const [duree, setDuree] = useState(12);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const a = o.abonnement;
  const fin = new Date(Date.now() + duree * 30 * 86400000).toLocaleDateString(locale(i18n.language), { day: 'numeric', month: 'long', year: 'numeric' });

  const appliquer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      onChange(await changerOffre(o.org_id, offre, duree));
      invalider('admin:comptes');
      invalider('admin:abonnements');
      invalider('admin:actions');
      setConfirmer(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Section titre={t('admin.compte.abonnement')}>
      <div className="adj-grid" style={{ gap: 'var(--adj-6)' }}>
        <div className="adj-1-2" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--adj-t-lg)', fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>{a.libelle}</span>
            <span className="adj-fig" style={{ color: 'var(--adj-ink-3)' }}>
              {a.prix_mensuel_mad ? t('admin.compte.prix', { prix: a.prix_mensuel_mad.toLocaleString(locale(i18n.language)) }) : t('admin.compte.gratuit')}
            </span>
          </div>
          <p style={{ margin: '8px 0 var(--adj-4)', color: a.statut === 'past_due' ? 'var(--adj-neg)' : 'var(--adj-ink-2)' }}>
            {a.statut ? t(`admin.abonnements.statut.${a.statut}`, { defaultValue: a.statut }) : t('admin.compte.sansAbonnement')}
            {a.echeance && <> · {t('admin.compte.jusquau')} <DateCourte iso={a.echeance} /></>}
            {a.fin_de_grace && a.statut === 'past_due' && <> · {t('admin.compte.grace')} <DateCourte iso={a.fin_de_grace} /></>}
          </p>
          <Jauge libelle={t('admin.compte.dossiersMois')} c={o.dossiers_mois} />
          <Jauge libelle={t('admin.compte.documents')} c={o.documents} />
          <Jauge libelle={t('admin.compte.membres')} c={{ utilise: o.membres.length, limite: o.membres_limite }} />
        </div>

        <div className="adj-1-2" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--adj-3)' }}>
          <span style={{ fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>{t('admin.compte.changerOffre')}</span>
          <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)', lineHeight: 'var(--adj-lead-body)' as never }}>
            {t('admin.compte.changerOffreAide')}
          </span>
          <div style={{ display: 'flex', gap: 'var(--adj-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ width: 180 }}>
              <Select value={offre} onChange={v => setOffre(v as CodeOffre)}
                options={OFFRES.map(c => ({ value: c, label: t(`admin.offres.${c}`) }))} />
            </span>
            {offre !== 'free' && (
              <span style={{ width: 150 }}>
                <Select value={String(duree)} onChange={v => setDuree(Number(v))}
                  options={DUREES.map(d => ({ value: String(d), label: t('admin.compte.mois', { count: d }) }))} />
              </span>
            )}
            <Button variant="primary" size="sm" onClick={() => setConfirmer(true)}>{t('admin.compte.appliquer')}</Button>
          </div>
        </div>
      </div>

      <Modal open={confirmer} onClose={() => setConfirmer(false)} title={t('admin.compte.confirmerOffre')}>
        <p style={{ margin: '0 0 var(--adj-5)', color: 'var(--adj-ink-2)', lineHeight: 'var(--adj-lead-body)' as never }}>
          {offre === 'free'
            ? t('admin.compte.retrograderTexte', { nom: o.nom })
            : t('admin.compte.activerTexte', { nom: o.nom, offre: t(`admin.offres.${offre}`), fin })}
        </p>
        {erreur && <p role="alert" style={{ margin: '0 0 var(--adj-4)', color: 'var(--adj-neg)' }}>{erreur}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--adj-3)' }}>
          <Button variant="ghost" onClick={() => setConfirmer(false)}>{t('admin.compte.annuler')}</Button>
          <Button variant="primary" loading={envoi} onClick={appliquer}>{t('admin.compte.confirmer')}</Button>
        </div>
      </Modal>
    </Section>
  );
}

/* ---------------------------------------------------------------- membres */

function ActionMembre({ m, moi, onFait }: { m: Membre; moi: User; onFait: () => void }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const [raison, setRaison] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (m.id === moi.id) return <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{t('admin.compte.vous')}</span>;
  if (m.admin) return <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{t('admin.compte.adminProtege')}</span>;

  const agir = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      if (m.suspendu_le) await reactiverCompte(m.id);
      else await suspendreCompte(m.id, raison.trim());
      invalider('admin:actions');
      invalider('admin:comptes');
      setOuvert(false);
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Button variant={m.suspendu_le ? 'secondary' : 'danger'} size="sm" onClick={() => setOuvert(true)}>
        {t(m.suspendu_le ? 'admin.compte.reactiver' : 'admin.compte.suspendre')}
      </Button>
      <Modal
        open={ouvert}
        onClose={() => setOuvert(false)}
        title={t(m.suspendu_le ? 'admin.compte.reactiverTitre' : 'admin.compte.suspendreTitre', { email: m.email })}
      >
        <p style={{ margin: '0 0 var(--adj-4)', color: 'var(--adj-ink-2)', lineHeight: 'var(--adj-lead-body)' as never }}>
          {t(m.suspendu_le ? 'admin.compte.reactiverTexte' : 'admin.compte.suspendreTexte')}
        </p>
        {!m.suspendu_le && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--adj-5)' }}>
            <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>{t('admin.compte.raison')}</span>
            <input
              value={raison}
              onChange={e => setRaison(e.target.value)}
              maxLength={500}
              className="adj-focusable"
              style={{
                height: 42, padding: '0 12px', borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-edge)',
                background: 'var(--adj-panel)', color: 'var(--adj-ink)', fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
              }}
            />
          </label>
        )}
        {erreur && <p role="alert" style={{ margin: '0 0 var(--adj-4)', color: 'var(--adj-neg)' }}>{erreur}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--adj-3)' }}>
          <Button variant="ghost" onClick={() => setOuvert(false)}>{t('admin.compte.annuler')}</Button>
          <Button variant={m.suspendu_le ? 'primary' : 'danger'} loading={envoi} onClick={agir}>
            {t(m.suspendu_le ? 'admin.compte.reactiver' : 'admin.compte.suspendre')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function EtatMembre({ m }: { m: Membre }) {
  const { t } = useTranslation();
  if (m.suspendu_le) return <span style={{ color: 'var(--adj-neg)', fontWeight: 'var(--adj-w-semi)' as never }}>{t('admin.compte.suspenduLe')} <DateCourte iso={m.suspendu_le} /></span>;
  if (!m.derniere_connexion) return <span style={{ color: 'var(--adj-ink-3)' }}>{t('admin.comptes.jamaisConnecte')}</span>;
  return <Depuis iso={m.derniere_connexion} />;
}

function Membres({ o, moi, onFait }: { o: OrganisationDetail; moi: User; onFait: () => void }) {
  const { t } = useTranslation();
  const etroit = useIsMobile(900);
  const role = (m: Membre) => [
    m.proprietaire ? t('admin.compte.proprietaire') : null,
    m.admin ? t('admin.compte.admin') : null,
    !m.email_verifie ? t('admin.compte.nonVerifie') : null,
  ].filter(Boolean).join(', ');

  if (etroit) {
    return (
      <Section titre={t('admin.compte.membresTitre', { count: o.membres.length })}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {o.membres.map(m => (
            <li key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--adj-4) 0', borderBottom: '1px solid var(--adj-hairline)' }}>
              <span style={{ fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>{m.nom || m.email}</span>
              <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{m.email}{role(m) && ` · ${role(m)}`}</span>
              <span style={{ fontSize: 'var(--adj-t-sm)' }}><EtatMembre m={m} /></span>
              <span><ActionMembre m={m} moi={moi} onFait={onFait} /></span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  return (
    <Section titre={t('admin.compte.membresTitre', { count: o.membres.length })}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>{t('admin.compte.col.membre')}</th>
            <th style={th}>{t('admin.compte.col.role')}</th>
            <th style={th}>{t('admin.compte.col.inscrit')}</th>
            <th style={th}>{t('admin.compte.col.connexion')}</th>
            <th style={{ ...th, textAlign: 'right' }}>{t('admin.compte.col.action')}</th>
          </tr>
        </thead>
        <tbody>
          {o.membres.map(m => (
            <tr key={m.id}>
              <td style={td}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ color: 'var(--adj-ink)', fontWeight: 'var(--adj-w-semi)' as never }}>{m.nom || m.email}</span>
                  <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{m.email}</span>
                </span>
              </td>
              <td style={td}>{role(m) || t('admin.compte.membre')}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}><DateCourte iso={m.cree_le} /></td>
              <td style={td}><EtatMembre m={m} /></td>
              <td style={{ ...td, textAlign: 'right' }}><ActionMembre m={m} moi={moi} onFait={onFait} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/* --------------------------------------------------------------- activité */

function Activite({ o }: { o: OrganisationDetail }) {
  const { t } = useTranslation();
  const statuts = Object.entries(o.dossiers_par_statut).sort((a, b) => b[1] - a[1]);
  return (
    <Section titre={t('admin.compte.activite')}>
      <p style={{ margin: 0, color: 'var(--adj-ink-2)', lineHeight: 'var(--adj-lead-body)' as never }}>
        {statuts.length
          ? statuts.map(([s, n]) => t('admin.compte.statutCompte', { n, statut: t(`pipeline.status.${s}`, { defaultValue: s }) })).join(', ')
          : t('admin.compte.aucunDossier')}
        {' · '}{t('admin.compte.generations', { count: o.generations_30j })}
      </p>
      {o.derniers_dossiers.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('admin.compte.col.dossier')}</th>
              <th style={th}>{t('admin.compte.col.statut')}</th>
              <th style={th}>{t('admin.compte.col.cree')}</th>
            </tr>
          </thead>
          <tbody>
            {o.derniers_dossiers.map(d => (
              <tr key={d.id}>
                <td style={td}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ color: 'var(--adj-ink)' }}>{d.objet || '-'}</span>
                    {d.reference && <span className="adj-fig" style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{d.reference}</span>}
                  </span>
                </td>
                <td style={td}>{t(`pipeline.status.${d.statut}`, { defaultValue: d.statut })}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><DateCourte iso={d.cree_le} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ écran */

export default function ComptePage({ moi }: { moi: User }) {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const fiche = useRessource(`admin:comptes:fiche:${orgId}`, () => fetchOrganisation(orgId));
  const [maj, setMaj] = useState<OrganisationDetail | null>(null);
  const o = maj ?? fiche.data;

  const retour = (
    <Link to="/admin/comptes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--adj-brand)', fontSize: 'var(--adj-t-sm)', textDecoration: 'none' }}>
      <ArrowLeft size={15} /> {t('admin.compte.retour')}
    </Link>
  );

  if (!o) {
    return (
      <PageAdmin titre={t('admin.compte.titre')} actions={retour}>
        {fiche.erreur && <MessageErreur erreur={fiche.erreur} />}
        {fiche.loading && <Chargement />}
        {!fiche.loading && !fiche.erreur && <Vide>{t('admin.compte.introuvable')}</Vide>}
      </PageAdmin>
    );
  }

  return (
    <PageAdmin
      titre={o.nom}
      sousTitre={<>{t('admin.compte.creeeLe')} <DateCourte iso={o.creee_le} /> · <Offre code={o.abonnement.offre} /></>}
      actions={retour}
    >
      <Abonnement o={o} onChange={setMaj} />
      <Membres o={o} moi={moi} onFait={() => { setMaj(null); fiche.refresh(); }} />
      <Activite o={o} />
    </PageAdmin>
  );
}
