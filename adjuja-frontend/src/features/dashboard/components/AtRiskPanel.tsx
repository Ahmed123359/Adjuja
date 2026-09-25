// Appels d'offres en danger -- 2026-09-25.
//
// Remplace la liste des tâches en haut du tableau de bord. Gérer des tâches est
// un travail à part entière, qui a désormais son écran ; le tableau de bord doit
// répondre à « qu'est-ce qui va me coûter un marché », pas servir de bloc-notes.
//
// Le serveur croise la date limite ET la progression, calculée selon le mode de
// l'AO (voir `context/feature-spec/dashboard-risque-validations/00-overview.md`).
// Le client ne connaît donc aucun seuil : il affiche le niveau reçu. C'est ce
// qui garantit que deux écrans ne classeront jamais le même dossier
// différemment.

import { useTranslation } from 'react-i18next';
import { useRessource } from '../../../shared/lib/cache';
import { Card, CardAction } from '../../../shared/ui/Card';
import { fetchAtRisk } from '../api';
import type { AtRiskItem, RiskLevel } from '../types';

const TEINTE: Record<RiskLevel, string> = {
  en_retard: 'var(--adj-neg)',
  critique:  'var(--adj-neg)',
  tendu:     'var(--adj-hold)',
};

const FOND: Record<RiskLevel, string> = {
  en_retard: 'var(--adj-neg-tint)',
  critique:  'var(--adj-neg-tint)',
  tendu:     'var(--adj-hold-tint)',
};

export function AtRiskPanel({ onOpenAo, span }: { onOpenAo?: () => void; span?: string }) {
  const { t } = useTranslation();
  // Cle partagee : revenir sur le tableau de bord reaffiche la liste sans
  // repasser par « Chargement... ».
  const { data, loading } = useRessource('dashboard:at-risk', () => fetchAtRisk(6));
  const items: AtRiskItem[] | null = loading ? null : (data?.items ?? []);
  const sansEcheance = data?.sans_echeance ?? 0;

  /** Le temps restant est écrit en relatif : c'est la seule chose qu'on veuille
   *  savoir d'une échéance, et aucune date brute ne la donne d'un coup d'oeil. */
  const delai = (jours: number) =>
    jours < 0 ? t('dashboard.home.dueLate', { count: Math.abs(jours) })
      : jours === 0 ? t('dashboard.home.dueToday')
      : jours === 1 ? t('dashboard.home.dueTomorrow')
      : t('dashboard.home.dueInDays', { count: jours });

  return (
    <Card
      className={span}
      title={t('dashboard.home.risk.title')}
      subtitle={t('dashboard.home.risk.subtitle')}
      count={items?.length}
      action={onOpenAo && <CardAction onClick={onOpenAo}>{t('dashboard.home.activity.seeAll')}</CardAction>}
      // Un AO actif sans date limite n'est pas notable : son risque n'est pas
      // calculable. Le taire le rendrait invisible, c'est pourquoi il est compté
      // ici plutôt qu'ignoré.
      footer={sansEcheance > 0 ? t('dashboard.home.risk.noDeadlineCount', { count: sansEcheance }) : undefined}
      flush
    >
      {items === null && (
        <p style={{ margin: 0, padding: 'var(--adj-5) var(--adj-pad)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
          {t('dashboard.home.loading')}
        </p>
      )}

      {items?.length === 0 && (
        <p style={{ margin: 0, padding: 'var(--adj-5) var(--adj-pad)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
          {t('dashboard.home.risk.empty')}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items?.map((ao, i) => (
          <li
            key={ao.ao_id}
            onClick={onOpenAo}
            className="adj-anim"
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--adj-3)',
              padding: '12px var(--adj-pad)',
              borderTop: i === 0 ? 'none' : '1px solid var(--adj-hairline)',
              cursor: onOpenAo ? 'pointer' : 'default',
              minWidth: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--adj-panel-3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Le niveau porte une couleur ET un mot : la couleur seule ne se
                lit pas en contraste forcé ni en daltonisme. */}
            <span style={{
              flexShrink: 0, padding: '3px 9px', borderRadius: 'var(--adj-round-s)',
              background: FOND[ao.niveau], color: TEINTE[ao.niveau],
              fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
              whiteSpace: 'nowrap',
            }}>
              {t(`dashboard.home.risk.level.${ao.niveau}`)}
            </span>

            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                title={ao.objet}
                style={{
                  fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-medium)' as never,
                  color: 'var(--adj-ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {ao.objet || ao.reference || '-'}
              </span>
              <span style={{
                fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {delai(ao.jours_restants)}
                {' · '}
                {t('dashboard.home.risk.done', { pct: ao.progression })}
                {ao.etape_courante && ` · ${t(`pipeline.steps.${ao.etape_courante}.title`, { defaultValue: ao.etape_courante })}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
