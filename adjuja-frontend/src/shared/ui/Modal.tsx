// Fenêtre modale -- 2026-09-25.
//
// Écrite parce que le formulaire de tâche s'ouvrait DANS la carte « Tâches » :
// la liste était poussée de 300px vers le bas à chaque clic sur « Nouvelle
// tâche », et le reste du tableau de bord sautait avec elle. Un formulaire qui
// déplace le contenu qu'on était en train de lire n'a pas sa place en ligne.
//
// Ce qu'une modale doit faire, et que « une div en position fixed » ne fait pas :
//   - rendre le fond inerte, y compris au défilement (le body est verrouillé) ;
//   - se fermer sur Échap et sur le voile, jamais sur un clic à l'intérieur ;
//   - porter le focus à l'ouverture et le rendre à l'élément d'origine ensuite,
//     sinon la navigation au clavier repart du haut de la page ;
//   - retenir le focus tant qu'elle est ouverte, sinon Tab s'échappe derrière
//     le voile, sur des contrôles qu'on ne voit pas.

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Ligne de contexte sous le titre. */
  subtitle?: string;
  children: React.ReactNode;
  /** Largeur maximale du panneau. */
  width?: number;
};

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, subtitle, children, width = 560 }: Props) {
  const panneau = useRef<HTMLDivElement>(null);
  const origine = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    origine.current = document.activeElement as HTMLElement | null;

    // Le fond ne défile plus derrière la modale. La largeur de la barre de
    // défilement est compensée, sinon toute la page se décale de ~15px à
    // l'ouverture et l'écran « saute ».
    const { overflow, paddingRight } = document.body.style;
    const gouttiere = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gouttiere > 0) document.body.style.paddingRight = `${gouttiere}px`;

    const premier = panneau.current?.querySelector<HTMLElement>(FOCUSABLES);
    (premier ?? panneau.current)?.focus();

    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;

      // Piège à focus : Tab sur le dernier élément revient au premier, et
      // Maj+Tab sur le premier repart au dernier.
      const cibles = Array.from(panneau.current?.querySelectorAll<HTMLElement>(FOCUSABLES) ?? []);
      if (cibles.length === 0) return;
      const debut = cibles[0];
      const fin = cibles[cibles.length - 1];
      if (!e.shiftKey && document.activeElement === fin) { e.preventDefault(); debut.focus(); }
      else if (e.shiftKey && document.activeElement === debut) { e.preventDefault(); fin.focus(); }
    };

    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('keydown', touche);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      origine.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="adj-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--adj-4)',
        background: 'rgba(16, 21, 41, 0.5)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        ref={panneau}
        className="adj-pop"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          width: '100%', maxWidth: width,
          // La modale ne dépasse jamais la fenêtre : au-delà, c'est son corps
          // qui défile, pas la page.
          maxHeight: 'calc(100vh - var(--adj-8))',
          display: 'flex', flexDirection: 'column',
          background: 'var(--adj-panel)',
          border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)',
          boxShadow: 'var(--adj-lift-3)',
          outline: 'none',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 'var(--adj-3)', flexShrink: 0,
          padding: 'var(--adj-pad) var(--adj-pad) var(--adj-3)',
        }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontSize: 'var(--adj-t-md)', fontWeight: 'var(--adj-w-bold)' as never,
              letterSpacing: '-0.015em', color: 'var(--adj-ink)', lineHeight: 1.25,
            }}>
              {title}
            </h2>
            {subtitle && (
              <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>
                {subtitle}
              </span>
            )}
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label={title}
            className="adj-focusable adj-anim"
            style={{
              display: 'flex', flexShrink: 0, padding: 6, marginTop: -4, marginRight: -6,
              border: 'none', background: 'transparent', borderRadius: 'var(--adj-round-s)',
              color: 'var(--adj-ink-3)', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--adj-panel-2)'; e.currentTarget.style.color = 'var(--adj-ink)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--adj-ink-3)'; }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        <div className="adj-scroll" style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '0 var(--adj-pad) var(--adj-pad)',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
