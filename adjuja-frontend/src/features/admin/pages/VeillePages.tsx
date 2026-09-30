// Administration : les quatre écrans de la veille -- 2026-10-01.
//
// L'écran unique du 2026-09-30 empilait sources, remplissage, actions,
// téléchargements et journal : il fallait défiler pour tout voir, et rien ne
// se distinguait. Un écran par question, chacun avec son adresse.

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { invalider, useRessource } from '../../../shared/lib/cache';
import { Button } from '../../../shared/ui/Button';
import { fetchDceEchecs, fetchVeilleSources } from '../api';
import { ActionsVeille } from '../components/ActionsVeille';
import { Chargement, MessageErreur, PageAdmin, Section, Vide, locale } from '../components/ui';
import { LigneDce, MatriceRemplissage, TableSources } from '../components/veille';

function useSources() {
  return useRessource('admin:veille:sources', fetchVeilleSources);
}

function Actualiser({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={onClick}>
      {t('admin.actualiser')}
    </Button>
  );
}

function CalculeA({ iso }: { iso: string | undefined }) {
  const { t, i18n } = useTranslation();
  if (!iso) return null;
  const heure = new Date(iso).toLocaleTimeString(locale(i18n.language), { hour: '2-digit', minute: '2-digit' });
  return <>{t('admin.veille.misAJour', { heure })}</>;
}

/* ------------------------------------------------------------- sources */

export function VeilleSourcesPage() {
  const { t } = useTranslation();
  const sources = useSources();
  return (
    <PageAdmin
      titre={t('admin.veille.sources.titre')}
      sousTitre={<>{t('admin.pages.sources')} <CalculeA iso={sources.data?.genere_le} /></>}
      actions={<Actualiser onClick={sources.refresh} />}
    >
      {sources.erreur && !sources.data && <MessageErreur erreur={sources.erreur} />}
      {sources.loading && <Chargement />}
      {sources.data && (
        <Section titre={t('admin.pages.parSource')} note={t('admin.veille.sources.note')}>
          <TableSources sources={sources.data.sources} />
        </Section>
      )}
    </PageAdmin>
  );
}

/* --------------------------------------------------------- remplissage */

export function VeilleRemplissagePage() {
  const { t } = useTranslation();
  const sources = useSources();
  const aos = sources.data?.sources.filter(s => s.table === 'ao') ?? [];
  const bdc = sources.data?.sources.filter(s => s.table === 'bdc') ?? [];
  const alerte = sources.data?.sources.some(s => s.remplissage.some(r => r.alerte)) ?? false;
  return (
    <PageAdmin
      titre={t('admin.veille.remplissage.titre')}
      sousTitre={t('admin.veille.remplissage.note')}
      actions={<Actualiser onClick={sources.refresh} />}
    >
      {sources.erreur && !sources.data && <MessageErreur erreur={sources.erreur} />}
      {sources.loading && <Chargement />}
      {alerte && (
        <p role="status" style={{
          margin: 0, padding: 'var(--adj-4)', borderRadius: 'var(--adj-round-m)',
          background: 'var(--adj-neg-tint)', color: 'var(--adj-neg)',
          fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
        }}>
          {t('admin.veille.remplissage.alerte')}{' '}
          <Link to="/admin/veille/actions" style={{ color: 'inherit' }}>{t('admin.pages.versRattrapage')}</Link>
        </p>
      )}
      {aos.length > 0 && (
        <Section titre={t('admin.pages.appelsOffres')}>
          <MatriceRemplissage sources={aos} />
        </Section>
      )}
      {bdc.length > 0 && (
        <Section titre={t('admin.veille.source.bdc')}>
          <MatriceRemplissage sources={bdc} />
        </Section>
      )}
    </PageAdmin>
  );
}

/* ------------------------------------------------------------- actions */

export function VeilleActionsPage() {
  const { t } = useTranslation();
  // Stable : ActionsVeille relance son suivi quand cette fonction change.
  const actionFinie = useCallback(() => {
    invalider('admin:veille');
    invalider('admin:actions');
  }, []);
  return (
    <PageAdmin
      titre={t('admin.actions.titre')}
      sousTitre={<>{t('admin.actions.note')} <Link to="/admin/journal" style={{ color: 'var(--adj-brand)' }}>{t('admin.pages.voirJournal')}</Link></>}
    >
      <ActionsVeille onFini={actionFinie} />
    </PageAdmin>
  );
}

/* ----------------------------------------------------------------- DCE */

export function VeilleDcePage() {
  const { t } = useTranslation();
  const dce = useRessource('admin:veille:dce', () => fetchDceEchecs(200));
  return (
    <PageAdmin
      titre={t('admin.veille.dce.titre')}
      sousTitre={t('admin.pages.dce')}
      actions={<Actualiser onClick={dce.refresh} />}
    >
      {dce.erreur && !dce.data && <MessageErreur erreur={dce.erreur} />}
      {dce.loading && <Chargement />}
      {dce.data && dce.data.total === 0 && <Vide>{t('admin.veille.dce.aucun')}</Vide>}
      {dce.data && dce.data.total > 0 && (
        <>
          <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
            {t('admin.veille.dce.compte', { affiches: dce.data.items.length, total: dce.data.total })}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--adj-hairline)' }}>
            {dce.data.items.map(e => <LigneDce key={`${e.table}-${e.id}`} e={e} />)}
          </ul>
        </>
      )}
    </PageAdmin>
  );
}
