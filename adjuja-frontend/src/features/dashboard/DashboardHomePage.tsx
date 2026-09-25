// Tableau de bord d'accueil -- 2026-09-24.
//
// Structure, de haut en bas :
//
//   1. un bandeau de mesures unique (voir FigureBand) : quatre chiffres separes
//      par un filet, chacun rapporte a son total par une barre de proportion ;
//   2. une rangee d'analyse : la charge des 30 prochains jours, l'entonnoir du
//      pipeline, la consommation de l'abonnement ;
//   3. une rangee de travail : taches, appels d'offres recents, agenda.
//
// Le titre de l'ecran est dans la barre du haut, pas ici : l'ecrire aux deux
// endroits etait le defaut releve sur les versions precedentes. La page
// commence donc directement par la donnee.
//
// Tout ce qui est trace vient du serveur. Le produit ne conserve aucun
// historique par periode : il n'y a donc ni variation en pourcentage, ni courbe
// « 30 derniers jours » -- ce serait de l'invention. Le graphe regarde devant,
// ce qui est de toute facon la question que se pose l'utilisateur.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invalider, useRessource } from '../../shared/lib/cache';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock3, FileText, ListChecks } from 'lucide-react';
import { Button } from '../../shared/ui/Button';
import { Card, CardAction } from '../../shared/ui/Card';
import { checkCompanyProfile } from '../company/api';
import type { ProfileCheck } from '../../types';
import { fetchCalendar, fetchSummary } from './api';
import { AoTableCard, PlanCard, ProfileWarning, VeilleCard } from './components/ActivitySection';
import { AtRiskPanel } from './components/AtRiskPanel';
import { AreaChart, Funnel, Legend, type Serie, type Step } from './components/Charts';
import { FigureBand, type Figure } from './components/FigureBand';
import { isoDay, monthBounds } from './components/MonthCalendar';
import type { CalendarEvent, DashboardSummary } from './types';

type Props = {
  onGoTo?: (tab: 'marches' | 'taches' | 'veille' | 'entreprise') => void;
};

const STATUTS_ACTIFS = ['brouillon', 'en_attente', 'en_analyse', 'en_traitement'];

/** Le pipeline dans son ordre reel. L'entonnoir et la barre de repartition le
 *  suivent tous les deux : un AO descend de haut en bas, il ne remonte pas. */
const ORDRE_PIPELINE = ['brouillon', 'en_attente', 'en_analyse', 'en_traitement', 'termine'];

/** Une seule teinte qui s'eclaircit le long du pipeline, plus le rouge de
 *  l'erreur, qui est le seul statut demandant une action. */
const STATUT_COULEUR: Record<string, string> = {
  brouillon:     'var(--adj-s5)',
  en_attente:    'var(--adj-s4)',
  en_analyse:    'var(--adj-s3)',
  en_traitement: 'var(--adj-s2)',
  termine:       'var(--adj-pos)',
  erreur:        'var(--adj-neg)',
  abandonne:     'var(--adj-s6)',
};

const JOURS_HORIZON = 30;

export default function DashboardHomePage({ onGoTo }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  // Les quatre lectures passent par le cache : revenir sur cet ecran depuis un
  // autre onglet reaffiche tout immediatement, et revalide en fond.
  const { data: summary } = useRessource<DashboardSummary>('dashboard:summary', fetchSummary);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [horizon, setHorizon] = useState<CalendarEvent[]>([]);
  const { data: profileCheck } = useRessource<ProfileCheck>('company:profile-check', checkCompanyProfile);

  const [mois, setMois] = useState(() => new Date());
  const [jourChoisi, setJourChoisi] = useState<string>(() => isoDay(new Date()));

  const [erreur, setErreur] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // Un seul appel par mois affiche, borne a ses dates reelles : le serveur
  // refuse au-dela d'un trimestre, et rien ne justifie de demander plus large.
  const chargerCalendrier = useCallback((m: Date) => {
    const { from, to } = monthBounds(m);
    fetchCalendar(from, to).then(setEvents).catch(e => setErreur(message(e)));
  }, []);

  // Fenetre glissante du graphe : elle ne suit pas le mois affiche dans le
  // calendrier, sinon la courbe sauterait a chaque changement de mois.
  const chargerHorizon = useCallback(() => {
    const debut = new Date();
    const fin = new Date();
    fin.setDate(fin.getDate() + JOURS_HORIZON - 1);
    fetchCalendar(isoDay(debut), isoDay(fin)).then(setHorizon).catch(() => setHorizon([]));
  }, []);

  useEffect(() => { chargerCalendrier(mois); }, [mois, chargerCalendrier]);
  useEffect(() => { chargerHorizon(); }, [chargerHorizon]);

  /* ---------------------------------------------------------------- mesures */

  const parStatut = useMemo(() => summary?.ao_par_statut ?? {}, [summary]);
  const aoEnCours = STATUTS_ACTIFS.reduce((n, s) => n + (parStatut[s] ?? 0), 0);
  const aoTotal = summary?.ao_total ?? 0;
  const aoTermines = parStatut.termine ?? 0;
  const enRetard = summary?.taches_en_retard ?? 0;

  const mesTachesOuvertes = summary?.mes_taches_ouvertes ?? 0;
  const tachesEquipe = summary?.taches_ouvertes ?? 0;

  // Chaque nombre porte sa lecture : le denominateur est nomme, jamais un
  // pourcentage seul. « 1 » ne dit rien, « 1 sur 2 au total » se lit.
  const figures: Figure[] = [
    {
      key: 'encours',
      label: t('dashboard.home.stats.inProgress'),
      value: aoEnCours,
      Icon: FileText,
      note: aoTotal > 0 ? t('dashboard.home.stats.ofTotal', { total: aoTotal }) : undefined,
      onClick: () => onGoTo?.('marches'),
    },
    {
      key: 'termines',
      label: t('dashboard.home.stats.done'),
      value: aoTermines,
      Icon: CheckCircle2,
      note: aoTotal > 0 ? t('dashboard.home.stats.ofTotal', { total: aoTotal }) : undefined,
      onClick: () => onGoTo?.('marches'),
    },
    {
      key: 'miennes',
      label: t('dashboard.home.stats.myTasks'),
      value: mesTachesOuvertes,
      Icon: ListChecks,
      note: tachesEquipe > 0
        ? t('dashboard.home.stats.ofTeamTasks', { total: tachesEquipe })
        : t('dashboard.home.task.emptyAll'),
      onClick: () => onGoTo?.('taches'),
    },
    {
      key: 'retard',
      label: t('dashboard.home.stats.overdue'),
      value: enRetard,
      Icon: Clock3,
      tone: 'alert',
      note: enRetard > 0
        ? t('dashboard.home.stats.ofMyTasks', { total: mesTachesOuvertes })
        : t('dashboard.home.stats.nothingLate'),
      onClick: () => onGoTo?.('taches'),
    },
  ];

  /* ------------------------------------------------------------- graphiques */

  // Charge a venir : une valeur par jour sur la fenetre glissante, deux series.
  const { labels, series } = useMemo(() => {
    const jours: string[] = [];
    const d = new Date();
    for (let i = 0; i < JOURS_HORIZON; i++) {
      jours.push(isoDay(d));
      d.setDate(d.getDate() + 1);
    }
    const compte = (type: CalendarEvent['type']) =>
      jours.map(j => horizon.filter(e => e.date === j && e.type === type && e.statut !== 'faite').length);

    return {
      labels: jours.map(j =>
        new Date(`${j}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })),
      series: [
        { key: 'ao', label: t('dashboard.home.eventType.ao_deadline'), color: 'var(--adj-brand)', values: compte('ao_deadline') },
        { key: 'task', label: t('dashboard.home.eventType.task'), color: 'var(--adj-teal)', values: compte('task') },
      ] as Serie[],
    };
  }, [horizon, locale, t]);

  // Entonnoir : chaque etape porte le nombre d'AO qui l'ont ATTEINTE, donc
  // elle-meme plus toutes celles qui la suivent. Compter uniquement les AO
  // actuellement dans l'etape donnerait un « entonnoir » qui remonte.
  const etapes: Step[] = useMemo(() => {
    const atteints = ORDRE_PIPELINE.map((_, i) =>
      ORDRE_PIPELINE.slice(i).reduce((n, suivant) => n + (parStatut[suivant] ?? 0), 0));
    return ORDRE_PIPELINE.map((s, i) => ({
      key: s,
      label: t(`pipeline.status.${s}`, { defaultValue: s }),
      value: atteints[i],
      color: STATUT_COULEUR[s] ?? 'var(--adj-brand)',
    }));
  }, [parStatut, t]);

  /* ---------------------------------------------------------------- agendas */

  const aujourdhui = isoDay(new Date());
  const aVenir = events
    .filter(e => e.date >= aujourdhui && !(e.type === 'task' && e.statut === 'faite'))
    .sort((a, b) => a.date.localeCompare(b.date));
  const duJourChoisi = events.filter(e => e.date === jourChoisi);
  const jourEstAujourdhui = jourChoisi === aujourdhui;

  const totalHorizon = series.reduce((n, s) => n + s.values.reduce((a, b) => a + b, 0), 0);

  return (
    <div
      className="adj-app-bg adj-scroll"
      style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
    >
      <div style={{
        maxWidth: 'var(--adj-max)', margin: '0 auto',
        padding: 'var(--adj-5) var(--adj-6) var(--adj-10)',
        display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)',
      }}>
        {/* Les actions de l'ecran, alignees a droite au-dessus de la donnee.
            Le titre et la date sont dans la barre du haut, pas ici. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="md" onClick={() => onGoTo?.('veille')}>
            {t('dashboard.home.actions.browseVeille')}
          </Button>
          <Button variant="primary" size="md" onClick={() => onGoTo?.('taches')}>
            {t('dashboard.home.actions.openTasks')}
          </Button>
        </div>

        {erreur && (
          <div role="alert" style={{
            padding: 'var(--adj-3) var(--adj-4)', borderRadius: 'var(--adj-round-m)',
            background: 'var(--adj-neg-tint)', color: 'var(--adj-neg)',
            fontSize: 'var(--adj-t-sm)',
          }}>
            {erreur}
          </div>
        )}

        <ProfileWarning check={profileCheck ?? null} onFix={() => onGoTo?.('entreprise')} />

        <FigureBand figures={figures} />

        {/* --- Rangee d'analyse ------------------------------------------ */}
        <div className="adj-grid">
          <Card
            className="adj-1-2"
            title={t('dashboard.home.chart.loadTitle')}
            subtitle={t('dashboard.home.chart.loadSubtitle', { days: JOURS_HORIZON })}
            action={<Legend series={series} />}
            footer={t('dashboard.home.chart.loadTotal', { count: totalHorizon, days: JOURS_HORIZON })}
          >
            <AreaChart
              labels={labels}
              series={series}
              height={224}
              emptyLabel={t('dashboard.home.chart.loadEmpty')}
            />
          </Card>

          <Card
            className="adj-1-4"
            title={t('dashboard.home.chart.funnelTitle')}
            subtitle={t('dashboard.home.chart.funnelSubtitle')}
            action={<CardAction onClick={() => onGoTo?.('marches')}>{t('dashboard.home.activity.seeAll')}</CardAction>}
          >
            <Funnel steps={etapes} emptyLabel={t('dashboard.overview.noAos')} />
          </Card>

          {/* Deux panneaux courts empiles valent une colonne : elle atteint la
              hauteur des deux autres au lieu de laisser un vide dessous. */}
          <div className="adj-1-4" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)', minWidth: 0 }}>
            <VeilleCard onOpen={() => onGoTo?.('veille')} />
            <PlanCard />
          </div>
        </div>

        {/* --- Rangee de travail -----------------------------------------
            Deux panneaux seulement : le calendrier et les echeances vivent
            desormais dans la barre laterale, ou leur role est lisible et ou ils
            restent visibles sur tous les ecrans. */}
        <div className="adj-grid">
          <AtRiskPanel onOpenAo={() => onGoTo?.('marches')} span="adj-3-8" />

          <AoTableCard onOpenAo={() => onGoTo?.('marches')} span="adj-5-8" />
        </div>

      </div>
    </div>
  );
}
