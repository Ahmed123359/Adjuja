// Liste déroulante du produit -- 2026-09-25.
//
// Écrite parce que les formulaires utilisaient le `<select>` natif : sur Windows
// il se rend avec le style du système, gris, carré, avec une liste blanche qui
// ignore le thème sombre. C'est le seul contrôle de l'interface qui trahissait
// qu'il n'avait pas été dessiné.
//
// `CustomSelect` existe déjà mais s'appuie sur les tokens `--l-*` du site
// vitrine, et sert les écrans veille et landing. Le repeindre les casserait :
// celui-ci est son équivalent sur le socle `--adj-*`.
//
// Un select maison doit rendre ce que le natif donnait gratuitement, sinon c'est
// une régression déguisée en décoration :
//   - ouverture au clavier (Entrée, Espace, flèches), déplacement par flèches,
//     validation par Entrée, abandon par Échap ;
//   - fermeture au clic extérieur ;
//   - `aria-expanded` / `role="listbox"` / `aria-selected`, faute de quoi un
//     lecteur d'écran ne voit qu'un bouton ;
//   - l'option active suivie au clavier, et ramenée dans la vue au défilement.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useFloating, floatingStyle } from './useFloating';

export type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Libellé affiché quand rien n'est choisi. */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
};

export function Select({ value, onChange, options, placeholder, id, disabled }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [survol, setSurvol] = useState(0);
  const zone = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);

  const courant = options.find(o => o.value === value) ?? null;

  useEffect(() => {
    if (!ouvert) return;
    // L'option active est celle du choix courant, pas la première.
    const i = options.findIndex(o => o.value === value);
    setSurvol(i >= 0 ? i : 0);
  }, [ouvert, value, options]);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (!zone.current?.contains(cible) && !liste.current?.contains(cible)) setOuvert(false);
    };
    document.addEventListener('mousedown', clic);
    return () => document.removeEventListener('mousedown', clic);
  }, [ouvert]);

  // Liste rendue en portail, en position fixe (voir ./useFloating) : en
  // position absolue, elle etait rognee par les `Card` en overflow hidden.
  const pos = useFloating(zone, ouvert);

  // Une liste plus haute que sa fenêtre laisserait l'option active hors champ
  // quand on la rejoint au clavier.
  useEffect(() => {
    if (!ouvert) return;
    liste.current?.querySelector<HTMLElement>('[data-actif="1"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [ouvert, survol]);

  const touche = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!ouvert) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOuvert(true);
      }
      return;
    }

    if (e.key === 'Escape') { e.preventDefault(); setOuvert(false); return; }
    if (e.key === 'Tab') { setOuvert(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSurvol(i => Math.min(i + 1, options.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSurvol(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Home') { e.preventDefault(); setSurvol(0); return; }
    if (e.key === 'End') { e.preventDefault(); setSurvol(options.length - 1); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const choix = options[survol];
      if (choix) { onChange(choix.value); setOuvert(false); }
    }
  };

  return (
    <div ref={zone} style={{ position: 'relative', width: '100%' }}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOuvert(o => !o)}
        onKeyDown={touche}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        className="adj-focusable adj-anim"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', height: 42, padding: '0 12px',
          borderRadius: 'var(--adj-round-m)',
          border: `1px solid ${ouvert ? 'var(--adj-brand)' : 'var(--adj-edge)'}`,
          background: 'var(--adj-panel)',
          color: courant ? 'var(--adj-ink)' : 'var(--adj-ink-4)',
          fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
          textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color .14s',
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {courant ? courant.label : placeholder}
        </span>
        <ChevronDown
          size={16} strokeWidth={2}
          style={{
            flexShrink: 0, color: 'var(--adj-ink-4)',
            transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
          }}
        />
      </button>

      {ouvert && pos && createPortal(
        <div
          ref={liste}
          role="listbox"
          className="adj-scroll adj-pop"
          style={{
            ...floatingStyle(pos),
            background: 'var(--adj-panel)',
            border: '1px solid var(--adj-hairline)',
            borderRadius: 'var(--adj-round-m)',
            boxShadow: 'var(--adj-lift-3)',
            padding: 4, overflowY: 'auto',
          }}
        >
          {options.map((o, i) => {
            const choisi = o.value === value;
            const actif = i === survol;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={choisi}
                data-actif={actif ? '1' : '0'}
                onMouseEnter={() => setSurvol(i)}
                onClick={() => { onChange(o.value); setOuvert(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 10px', borderRadius: 'var(--adj-round-s)',
                  cursor: 'pointer',
                  background: actif ? 'var(--adj-brand-tint)' : 'transparent',
                  color: choisi ? 'var(--adj-brand)' : 'var(--adj-ink-2)',
                  fontSize: 'var(--adj-t-sm)',
                  fontWeight: (choisi ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.label}
                </span>
                {choisi && <Check size={15} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
