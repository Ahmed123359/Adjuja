// Compte rendu d'une action de la veille, en une phrase. Partagé par le suivi
// d'une action et le journal : un même résultat se lit pareil aux deux
// endroits. La forme de `resultat` est celle que renvoie la veille
// (adjuja-watcher/app/modules/maintenance.py, tâches de scrape).

import type { TFunction } from 'i18next';

type R = Record<string, unknown>;

const n = (v: unknown, locale: string): string =>
  typeof v === 'number' ? v.toLocaleString(locale) : '0';

export function resumeRapport(
  t: TFunction, action: string, r: R | null, locale: string, params: R | null = null,
): string {
  // Actions sur les comptes : le sens est dans les paramètres.
  if (action === 'changer-offre' && params) {
    const offre = t(`admin.offres.${String(params.plan_code)}`, { defaultValue: String(params.plan_code) });
    const echeance = typeof r?.echeance === 'string'
      ? new Date(r.echeance).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
      : null;
    return echeance ? t('admin.actions.rapport.offreJusquau', { offre, echeance }) : t('admin.actions.rapport.offre', { offre });
  }
  if ((action === 'suspendre' || action === 'reactiver') && params) {
    const raison = typeof params.raison === 'string' && params.raison ? ` (${params.raison})` : '';
    return `${String(params.email ?? '')}${raison}`;
  }
  if (!r) return '';
  if (typeof r.erreur === 'string') return r.erreur;
  if (typeof r.raison === 'string') return r.raison;

  if (action === 'scrape-ao' || action === 'scrape-bdc') {
    if (r.status === 'skipped') return t('admin.actions.rapport.scrapeIgnore');
    return t('admin.actions.rapport.scrape', { n: n(r.total_saved, locale) });
  }

  if (action === 'rattrapage-details') {
    if (!r.reel) {
      const parSource = Object.entries((r.par_source as Record<string, number>) ?? {})
        .map(([s, k]) => `${t(`admin.veille.source.${s}`, { defaultValue: s })} ${k}`)
        .join(', ');
      return t('admin.actions.rapport.rattrapageSimulation', {
        n: n(r.a_completer, locale), detail: parSource || '-', min: n(r.duree_estimee_min, locale),
      });
    }
    return t('admin.actions.rapport.rattrapageReel', {
      faits: n(r.completes, locale), illisibles: n(r.pages_illisibles, locale),
      sans: n(r.sans_estimation_ni_caution, locale),
    });
  }

  if (action === 'enrichir-analyses') {
    if (!r.reel) {
      return t('admin.actions.rapport.enrichirSimulation', {
        n: n(r.a_enrichir, locale), total: n(r.deja_analyses, locale),
        entree: n(r.jetons_entree_estimes, locale), sortie: n(r.jetons_sortie_estimes, locale),
        modele: String(r.modele ?? ''),
      });
    }
    return t('admin.actions.rapport.enrichirReel', {
      faits: n(r.enrichis, locale), ignores: n(Array.isArray(r.ignores) ? r.ignores.length : 0, locale),
    });
  }

  return '';
}

/** Détails d'une ré-analyse : les AO ignorés et pourquoi. */
export function ignores(r: R | null): { ao_id: number; raison: string }[] {
  return Array.isArray(r?.ignores) ? (r!.ignores as { ao_id: number; raison: string }[]) : [];
}
