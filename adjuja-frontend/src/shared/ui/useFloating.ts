// Position d'une surface flottante (liste deroulante, selecteur) -- 2026-09-27.
//
// La surface est rendue dans un portail, en position fixe, calee sur son
// declencheur. En position absolue dans son parent, elle etait rognee par tout
// panneau en `overflow: hidden` (la `Card` du socle), ou etirait la page au lieu
// de flotter. Elle s'ouvre vers le haut quand la place manque en bas de la
// fenetre, et suit le defilement de n'importe quel conteneur.

import { useLayoutEffect, useState } from 'react';

export type FloatingPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  /** Hauteur maximale disponible dans le sens d'ouverture. */
  max: number;
};

export function useFloating(
  anchor: React.RefObject<HTMLElement | null>,
  open: boolean,
  voulu = 260,
): FloatingPos | null {
  const [pos, setPos] = useState<FloatingPos | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const placer = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const ecart = 6, marge = 12;
      const bas = window.innerHeight - r.bottom - ecart - marge;
      const haut = r.top - ecart - marge;
      const versLeHaut = bas < Math.min(voulu, 200) && haut > bas;
      setPos(versLeHaut
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + ecart, max: Math.min(voulu, haut) }
        : { left: r.left, width: r.width, top: r.bottom + ecart, max: Math.min(voulu, bas) });
    };
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => {
      window.removeEventListener('scroll', placer, true);
      window.removeEventListener('resize', placer);
    };
  }, [anchor, open, voulu]);

  return pos;
}

/** Style de base d'une surface flottante positionnee par `useFloating`. */
export function floatingStyle(pos: FloatingPos): React.CSSProperties {
  return {
    position: 'fixed',
    left: pos.left,
    width: pos.width,
    top: pos.top,
    bottom: pos.bottom,
    maxHeight: pos.max,
    zIndex: 1000,
    boxSizing: 'border-box',
  };
}
