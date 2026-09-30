// Pièces communes aux écrans de l'administration -- 2026-10-01.
//
// Un seul endroit pour la forme des tableaux, des sections, des états vides,
// d'erreur et de chargement : chaque écran de l'administration se lit de la
// même façon, et un écran neuf n'invente pas sa propre variante.

import { useTranslation } from 'react-i18next';
import { AccesAdminRefuse } from '../api';

export const th: React.CSSProperties = {
  textAlign: 'left', padding: '0 var(--adj-4) 12px',
  fontSize: 'var(--adj-t-xs)', fontWeight: 600,
  color: 'var(--adj-ink-3)',
  borderBottom: '1px solid var(--adj-hairline)',
  verticalAlign: 'bottom', whiteSpace: 'nowrap',
};

export const td: React.CSSProperties = {
  padding: '14px var(--adj-4)', fontSize: 'var(--adj-t-sm)',
  color: 'var(--adj-ink-2)', verticalAlign: 'top',
  borderBottom: '1px solid var(--adj-hairline)',
};

export const nombre: React.CSSProperties = { ...td, textAlign: 'right', color: 'var(--adj-ink)' };

export function locale(langue: string): string {
  return langue === 'en' ? 'en-GB' : 'fr-FR';
}

/** Bloc titré d'un écran, séparé du précédent par un filet. */
export function Section({ titre, note, actions, children }: {
  titre: string; note?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)',
      paddingTop: 'var(--adj-6)', borderTop: '1px solid var(--adj-hairline)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
        <h2 style={{
          margin: 0, fontSize: 'var(--adj-t-md)', fontWeight: 'var(--adj-w-bold)' as never,
          color: 'var(--adj-ink)', lineHeight: 'var(--adj-lead-tight)' as never,
        }}>
          {titre}
        </h2>
        {actions}
      </div>
      {children}
      {note && (
        <p style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', lineHeight: 'var(--adj-lead-body)' as never }}>
          {note}
        </p>
      )}
    </section>
  );
}

export function MessageErreur({ erreur }: { erreur: Error }) {
  const { t } = useTranslation();
  return (
    <p role="alert" style={{ margin: 0, fontSize: 'var(--adj-t-base)', color: 'var(--adj-neg)' }}>
      {erreur instanceof AccesAdminRefuse ? t('admin.refuse') : erreur.message}
    </p>
  );
}

/** Ligne de chargement : la page garde sa structure, seul le contenu attend. */
export function Chargement() {
  const { t } = useTranslation();
  return <p style={{ margin: 0, color: 'var(--adj-ink-3)' }}>{t('admin.chargement')}</p>;
}

/** État vide : dit pourquoi la liste est vide, pas seulement qu'elle l'est. */
export function Vide({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: 0, padding: 'var(--adj-6) 0', color: 'var(--adj-ink-2)',
      fontSize: 'var(--adj-t-base)', lineHeight: 'var(--adj-lead-body)' as never,
    }}>
      {children}
    </p>
  );
}

/** « il y a 3 h » : l'âge compte plus que l'heure exacte, qui reste en
 *  info-bulle. */
export function Depuis({ iso }: { iso: string }) {
  const { t, i18n } = useTranslation();
  const d = lireDate(iso);
  if (!d) return <>{iso.slice(0, 10)}</>;
  const minutes = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  const texte = minutes < 60 ? t('admin.veille.depuis.minutes', { count: minutes })
    : minutes < 48 * 60 ? t('admin.veille.depuis.heures', { count: Math.round(minutes / 60) })
    : t('admin.veille.depuis.jours', { count: Math.round(minutes / 1440) });
  return <span title={d.toLocaleString(locale(i18n.language))}>{texte}</span>;
}

/** Date lisible depuis une chaîne ISO. Les dates des tables sont des chaînes :
 *  une ligne écrite à la main en SQL porte parfois le format de PostgreSQL
 *  (« 2026-09-12 09:49:46+00 »), que le navigateur ne sait pas lire. On
 *  retombe alors sur le jour seul, jamais sur « Invalid Date ». */
export function lireDate(iso: string): Date | null {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  const jour = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(jour.getTime()) ? null : jour;
}

export function DateCourte({ iso }: { iso: string | null }) {
  const { i18n } = useTranslation();
  const d = iso ? lireDate(iso) : null;
  if (!d) return <>{iso ? iso.slice(0, 10) : '-'}</>;
  return <>{d.toLocaleDateString(locale(i18n.language), { day: 'numeric', month: 'short', year: 'numeric' })}</>;
}

/** En-tête d'un écran de l'administration : titre, phrase qui dit ce qu'on y
 *  lit, actions à droite. Le contenu occupe toute la largeur (pas de colonne
 *  centrée entre deux marges vides, rejeté dans ui-context.md). */
export function PageAdmin({ titre, sousTitre, actions, children }: {
  titre: React.ReactNode; sousTitre?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="adj-pad-x" style={{
      padding: 'var(--adj-8) var(--adj-8) var(--adj-12)',
      display: 'flex', flexDirection: 'column', gap: 'var(--adj-6)', minWidth: 0,
    }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--adj-4)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{
            margin: 0, fontSize: 'var(--adj-t-xl)', fontWeight: 'var(--adj-w-bold)' as never,
            color: 'var(--adj-ink)', letterSpacing: '-0.02em', lineHeight: 'var(--adj-lead-tight)' as never,
          }}>
            {titre}
          </h1>
          {sousTitre && (
            <p style={{ margin: 0, fontSize: 'var(--adj-t-base)', color: 'var(--adj-ink-3)', lineHeight: 'var(--adj-lead-body)' as never }}>
              {sousTitre}
            </p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>{actions}</div>}
      </header>
      {children}
    </div>
  );
}
