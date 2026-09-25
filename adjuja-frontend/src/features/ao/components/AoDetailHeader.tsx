// En-tete du dossier -- 2026-09-25.
//
// L'ancien en-tete portait la reference, l'acheteur, un badge de statut et une
// corbeille. Il manquait les deux faits qui decident de tout sur cet ecran :
//
//   1. **l'echeance**, et surtout le temps qui reste. C'est la seule contrainte
//      non negociable d'un marche public : passe la date, le dossier ne vaut
//      plus rien. Elle etait absente de la page du dossier alors que le tableau
//      de bord la classe deja par risque ;
//   2. **ou l'on en est**, en clair : « etape 2 sur 7 ». Le rail d'etapes le
//      montre, mais il faut le parcourir pour le savoir, et il disparait en
//      mode express.
//
// Les deux sont donc dans l'en-tete, toujours visibles, quel que soit le mode.

import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarClock, Trash2 } from 'lucide-react';
import type { AoResponse } from '../types';

const TON: Record<string, { fg: string; bg: string }> = {
  brouillon:     { fg: 'var(--adj-ink-3)', bg: 'var(--adj-mute-tint)' },
  en_attente:    { fg: 'var(--adj-ink-3)', bg: 'var(--adj-mute-tint)' },
  en_analyse:    { fg: 'var(--adj-brand)', bg: 'var(--adj-brand-tint)' },
  en_traitement: { fg: 'var(--adj-brand)', bg: 'var(--adj-brand-tint)' },
  termine:       { fg: 'var(--adj-pos)',   bg: 'var(--adj-pos-tint)' },
  erreur:        { fg: 'var(--adj-neg)',   bg: 'var(--adj-neg-tint)' },
  abandonne:     { fg: 'var(--adj-ink-4)', bg: 'var(--adj-mute-tint)' },
};

export function AoDetailHeader({
  ao, etape, total, onBack, onDelete,
}: {
  ao: AoResponse;
  /** Rang de l'etape courante, en mode accompagne. Absent en express. */
  etape?: number | null;
  total?: number | null;
  onBack: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const ton = TON[ao.statut] ?? TON.brouillon;

  const echeance = (() => {
    if (!ao.date_limite) return null;
    const d = new Date(`${ao.date_limite.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const jours = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    const relatif = jours < 0 ? t('dashboard.home.dueLate', { count: Math.abs(jours) })
      : jours === 0 ? t('dashboard.home.dueToday')
      : jours === 1 ? t('dashboard.home.dueTomorrow')
      : t('dashboard.home.dueInDays', { count: jours });
    return {
      texte: d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
      relatif,
      // Le rouge est reserve au depassement et a l'imminence : le mettre des
      // trente jours le rendrait invisible quand il compte.
      urgent: jours <= 2,
      passe: jours < 0,
    };
  })();

  const bouton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, flexShrink: 0,
    borderRadius: 'var(--adj-round-m)',
    border: '1px solid var(--adj-hairline)',
    background: 'var(--adj-panel)', color: 'var(--adj-ink-2)',
    cursor: 'pointer', transition: 'color .14s, border-color .14s',
  };

  return (
    <header style={{
      flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 'var(--adj-3)', flexWrap: 'wrap',
      padding: 'var(--adj-4) var(--adj-6)',
      background: 'var(--adj-panel)',
      borderBottom: '1px solid var(--adj-hairline)',
    }}>
      <button
        onClick={onBack}
        aria-label={t('pipeline.detail.back')}
        title={t('pipeline.detail.back')}
        className="adj-focusable adj-anim"
        style={bouton}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-ink)'; e.currentTarget.style.borderColor = 'var(--adj-edge)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-ink-2)'; e.currentTarget.style.borderColor = 'var(--adj-hairline)'; }}
      >
        <ArrowLeft size={18} strokeWidth={2} />
      </button>

      <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-2)', flexWrap: 'wrap' }}>
          <span className="adj-fig" style={{
            fontSize: 'var(--adj-t-md)', fontWeight: 'var(--adj-w-bold)' as never,
            color: 'var(--adj-ink)', letterSpacing: '-0.015em',
          }}>
            {ao.reference || t('pipeline.detail.noRef')}
          </span>
          <span style={{
            padding: '3px 9px', borderRadius: 'var(--adj-round-s)',
            background: ton.bg, color: ton.fg,
            fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never, whiteSpace: 'nowrap',
          }}>
            {t(`pipeline.status.${ao.statut}`, { defaultValue: ao.statut })}
          </span>
          {typeof etape === 'number' && typeof total === 'number' && total > 0 && (
            <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', whiteSpace: 'nowrap' }}>
              {t('pipeline.detail.stepOf', { step: etape, total })}
            </span>
          )}
        </span>
        {ao.acheteur && (
          <span title={ao.acheteur} style={{
            fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ao.acheteur}
          </span>
        )}
      </div>

      {/* L'echeance a sa place dans l'en-tete, pas dans une carte plus bas :
          c'est elle qui dit s'il faut se depecher. */}
      {echeance && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '7px 12px', borderRadius: 'var(--adj-round-m)',
          background: echeance.urgent ? 'var(--adj-neg-tint)' : 'var(--adj-panel-2)',
          color: echeance.urgent ? 'var(--adj-neg)' : 'var(--adj-ink-2)',
        }}>
          <CalendarClock size={16} strokeWidth={1.9} style={{ flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span style={{ fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never }}>
              {echeance.relatif}
            </span>
            <span style={{ fontSize: 'var(--adj-t-xs)', opacity: 0.75 }}>
              {echeance.texte}
            </span>
          </span>
        </span>
      )}

      <button
        onClick={onDelete}
        aria-label={t('pipeline.list.delete')}
        title={t('pipeline.list.delete')}
        className="adj-focusable adj-anim"
        style={bouton}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-neg)'; e.currentTarget.style.borderColor = 'var(--adj-neg)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-ink-2)'; e.currentTarget.style.borderColor = 'var(--adj-hairline)'; }}
      >
        <Trash2 size={17} strokeWidth={1.9} />
      </button>
    </header>
  );
}
