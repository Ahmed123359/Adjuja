// Mesures de tete -- 2026-09-25.
//
// Cartes separees, une par mesure. La version en bandeau unique (colonnes
// separees par un filet) ne tenait pas : quatre nombres a un chiffre y flottaient
// dans des colonnes de 400px.
//
// Contenu d'une carte, et rien de plus :
//     icone au trait + libelle
//     le nombre, en grand
//     la lecture : son denominateur nomme, ou ce qu'il faut en comprendre
//
// Pas de barre de progression. Une part de 100 % sur un total de 1 ne dit rien,
// et quatre jauges cote a cote faisaient du haut d'ecran un mur de barres.

import type { LucideIcon } from 'lucide-react';

export type Figure = {
  key:   string;
  label: string;
  value: number | string;
  Icon:  LucideIcon;
  /** La lecture du nombre : son denominateur nomme, jamais un pourcentage seul. */
  note?: string;
  /** Colore le nombre : reserve a ce qui demande une action. */
  tone?: 'plain' | 'alert';
  onClick?: () => void;
};

export function FigureBand({ figures }: { figures: Figure[] }) {
  return (
    <div className="adj-grid">
      {figures.map(f => {
        const cliquable = !!f.onClick;
        const alerte = f.tone === 'alert' && f.value !== 0;
        const { Icon } = f;

        return (
          <div
            key={f.key}
            role={cliquable ? 'button' : undefined}
            tabIndex={cliquable ? 0 : undefined}
            onClick={f.onClick}
            onKeyDown={cliquable ? e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.onClick?.(); }
            } : undefined}
            className={cliquable ? 'adj-anim adj-focusable adj-1-4 adj-kpi' : 'adj-1-4 adj-kpi'}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: 'var(--adj-4) var(--adj-5)',
              background: 'var(--adj-panel)',
              border: '1px solid var(--adj-hairline)',
              borderRadius: 'var(--adj-round-l)',
              boxShadow: 'var(--adj-lift-1)',
              minWidth: 0,
              cursor: cliquable ? 'pointer' : 'default',
              transition: 'border-color .14s, box-shadow .14s',
            }}
            onMouseEnter={cliquable ? e => {
              e.currentTarget.style.borderColor = 'var(--adj-edge)';
              e.currentTarget.style.boxShadow = 'var(--adj-lift-2)';
            } : undefined}
            onMouseLeave={cliquable ? e => {
              e.currentTarget.style.borderColor = 'var(--adj-hairline)';
              e.currentTarget.style.boxShadow = 'var(--adj-lift-1)';
            } : undefined}
          >
            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
              <Icon
                size={17}
                strokeWidth={1.9}
                color={alerte ? 'var(--adj-neg)' : 'var(--adj-brand)'}
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <span style={{
                minWidth: 0,
                fontSize: 'var(--adj-t-sm)',
                fontWeight: 'var(--adj-w-medium)' as never,
                color: 'var(--adj-ink-3)',
                lineHeight: 1.3,
              }}>
                {f.label}
              </span>
            </span>

            <span className="adj-fig" style={{
              fontSize: 'var(--adj-t-num)',
              fontWeight: 'var(--adj-w-black)' as never,
              lineHeight: 1,
              letterSpacing: '-0.035em',
              // Un zero est une reponse, pas une absence : le griser jusqu'a
              // l'illisible (--adj-ink-4) le faisait passer pour un champ vide.
              color: alerte ? 'var(--adj-neg)'
                : f.value === 0 ? 'var(--adj-ink-3)' : 'var(--adj-ink)',
            }}>
              {f.value}
            </span>

            {f.note && (
              <span
                title={f.note}
                style={{
                  fontSize: 'var(--adj-t-xs)',
                  color: alerte ? 'var(--adj-neg)' : 'var(--adj-ink-3)',
                  lineHeight: 1.35,
                }}
              >
                {f.note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
