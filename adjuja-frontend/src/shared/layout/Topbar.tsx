// Barre du haut -- 2e passe du 2026-09-24, sur la reference « console
// d'analyse ».
//
// Elle est blanche et bordee en bas, contrairement a la passe precedente ou
// elle partageait le fond : ici c'est elle qui tient le titre de l'ecran, pas
// la page. Le tableau de bord n'a donc plus d'en-tete propre, et le titre n'est
// plus ecrit deux fois.
//
// De gauche a droite : titre de l'ecran et sa ligne de contexte ; puis la
// recherche, la periode couverte, l'action d'export, l'utilisateur.
//
// La recherche est reelle : elle interroge les appels d'offres de
// l'organisation et propose les resultats sous le champ. Un champ de recherche
// decoratif est pire que pas de champ du tout.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import LanguageSelector from '../ui/LanguageSelector';
import { SearchPalette } from './SearchPalette';

export type AppTab = 'accueil' | 'offres' | 'marches' | 'taches' | 'outils' | 'veille' | 'entreprise';

type Props = {
  mainTab: AppTab;
  onOpenSidebar?: () => void;
  /** Ouvre l'ecran des appels d'offres : resultat de recherche ou creation. */
  onOpenAo?: () => void;
};

/* --------------------------------------------------------------------------
   Barre
   -------------------------------------------------------------------------- */

const ctrl: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 38, padding: '0 12px', flexShrink: 0,
  borderRadius: 'var(--adj-round-m)',
  border: '1px solid var(--adj-hairline)',
  background: 'var(--adj-panel)',
  color: 'var(--adj-ink-2)',
  fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
  fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'border-color .14s, color .14s',
};

export default function Topbar({ mainTab, onOpenSidebar, onOpenAo }: Props) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const [recherche, setRecherche] = useState(false);

  // Ctrl/Cmd + K : la convention de toutes les palettes de recherche.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setRecherche(true);
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);

  return (
    <header className="adj-pad-x" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--adj-3)',
      height: 'var(--adj-topbar)', flexShrink: 0,
      padding: '0 var(--adj-6)',
      minWidth: 0,
      background: 'var(--adj-panel)',
      borderBottom: '1px solid var(--adj-hairline)',
      position: 'relative', zIndex: 8,
    }}>
      {onOpenSidebar && (
        <button
          onClick={onOpenSidebar}
          aria-label={t('app.nav.openMenu')}
          className="adj-focusable"
          style={{
            display: 'flex', padding: 6, border: 'none', background: 'transparent',
            borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-2)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      )}

      <div style={{ minWidth: 0, flexShrink: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <h1 className="adj-page-title" style={{
          margin: 0,
          fontSize: 'var(--adj-t-xl)', fontWeight: 'var(--adj-w-bold)' as never,
          letterSpacing: '-0.02em', color: 'var(--adj-ink)', lineHeight: 1.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {t(`app.topbar.${mainTab}`)}
        </h1>
        <span className="adj-hide-sm" style={{
          fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {t(`app.topbar.sub.${mainTab}`, { defaultValue: '' })}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* La recherche n'est plus un champ occupant 280px en permanence pour un
          usage occasionnel : un bouton l'ouvre en palette. */}
      <button
        onClick={() => setRecherche(true)}
        className="adj-focusable adj-anim adj-btn-tight"
        style={{ ...ctrl, gap: 10, paddingRight: 8, color: 'var(--adj-ink-3)', flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--adj-edge)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--adj-hairline)'; }}
      >
        <Search size={16} strokeWidth={1.9} />
        <span className="adj-label-sm" style={{ flex: 1, textAlign: 'left', minWidth: 150 }}>
          {t('app.topbar.searchShort')}
        </span>
        {/* Le raccourci est ecrit sur le bouton : sans cela personne ne le
            decouvre. */}
        <kbd className="adj-hide-md" style={{
          flexShrink: 0, padding: '2px 6px', borderRadius: 'var(--adj-round-s)',
          background: 'var(--adj-panel-2)', border: '1px solid var(--adj-hairline)',
          color: 'var(--adj-ink-4)', fontFamily: 'inherit', fontSize: 'var(--adj-t-xs)',
        }}>
          ⌘K
        </kbd>
      </button>

      <button
        onClick={toggle}
        aria-label={theme === 'dark' ? t('app.nav.lightMode') : t('app.nav.darkMode')}
        title={theme === 'dark' ? t('app.nav.lightMode') : t('app.nav.darkMode')}
        className="adj-focusable adj-anim"
        style={{ ...ctrl, width: 38, padding: 0, flexShrink: 0 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--adj-brand-edge)'; e.currentTarget.style.color = 'var(--adj-brand)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--adj-hairline)'; e.currentTarget.style.color = 'var(--adj-ink-2)'; }}
      >
        {theme === 'dark' ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
      </button>

      <span style={{ flexShrink: 0 }}><LanguageSelector /></span>

      <SearchPalette
        open={recherche}
        onClose={() => setRecherche(false)}
        onOpenAo={onOpenAo}
      />
    </header>
  );
}
