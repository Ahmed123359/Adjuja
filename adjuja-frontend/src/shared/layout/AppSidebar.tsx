// Barre laterale -- 2026-09-25.
//
// Rail sombre sur fond de travail clair : c'est le contraste qui separe la
// navigation de la donnee, sans avoir a tracer de bordure epaisse.
//
//   - en haut la marque, logo et nom centres ;
//   - la navigation, serree : l'element actif porte un lisere bleu colle au
//     bord du rail, un fond bleu dilue et un texte bleu. Trois marqueurs pour un
//     seul element, parce qu'il doit se trouver sans etre cherche ;
//   - **le calendrier des echeances** occupe tout le bas. Il etait une carte du
//     tableau de bord, ou son role n'etait pas lisible : a cote d'un tableau
//     d'AO et d'une liste de taches, une grille de mois passe pour un widget.
//     Ici il est toujours la et ne repond qu'a une question, ce qui tombe
//     bientot. C'est aussi ce qui remplit le rail, jusque-la vide sous cinq
//     liens ;
//   - en bas l'utilisateur, avec l'etat du service en pastille sur son avatar.
//
// Le bloc de telemetrie (« Service en ligne / API / verifie a ») a ete retire :
// quatre lignes de supervision sous la navigation, c'est une information qu'on
// consulte une fois par mois occupant la place de celle qu'on lit tous les jours.
// L'etat reste accessible par la pastille et son infobulle.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ChevronDown, LayoutGrid, ListChecks, LogOut, Radar, ScrollText, ShieldCheck, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { RailCalendar } from './RailCalendar';
import type { User } from '../../types';

import type { AppTab } from './tabs';
export type { AppTab };

type Props = {
  mainTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  user: User;
  onLogout: () => void;
  apiStatus: 'online' | 'offline' | 'connecting';
  onGoLanding?: () => void;
  collapsible?: boolean;
};

type Item = { tab: AppTab; key: string; Icon: LucideIcon };

const PILOTAGE: Item[] = [
  { tab: 'accueil',  key: 'dashboard', Icon: LayoutGrid },
  { tab: 'marches',  key: 'tenders',   Icon: ScrollText },
  { tab: 'taches',   key: 'tasks',     Icon: ListChecks },
  { tab: 'veille',   key: 'veille',    Icon: Radar },
  { tab: 'outils',   key: 'tools',     Icon: Wrench },
];

const ENTREPRISE: Item[] = [
  { tab: 'entreprise', key: 'company', Icon: Building2 },
];



const STATUS_COLOR: Record<Props['apiStatus'], string> = {
  online:     '#34D399',
  offline:    '#F87171',
  connecting: '#FBBF24',
};

function NavButton({ item, active, onClick, label }: {
  item: Item; active: boolean; onClick: () => void; label: string;
}) {
  const { Icon } = item;
  return (
    <button
      onClick={onClick}
      className="adj-focusable adj-anim"
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', height: 40,
        padding: '0 12px 0 14px',
        borderRadius: 'var(--adj-round-m)',
        border: 'none',
        background: active ? 'var(--adj-rail-on-bg)' : 'transparent',
        color: active ? 'var(--adj-rail-on)' : 'var(--adj-rail-ink-2)',
        fontFamily: 'inherit', fontSize: 'var(--adj-t-base)',
        fontWeight: (active ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
        textAlign: 'left', cursor: 'pointer',
        transition: 'background .14s, color .14s',
      }}
      onMouseEnter={e => {
        if (active) return;
        e.currentTarget.style.background = 'rgba(255,255,255,.04)';
        e.currentTarget.style.color = 'var(--adj-rail-ink)';
      }}
      onMouseLeave={e => {
        if (active) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--adj-rail-ink-2)';
      }}
    >
      {/* Lisere d'element actif : colle au bord gauche du rail, pas du bouton,
          d'ou le decalage negatif. */}
      {active && (
        <span aria-hidden style={{
          position: 'absolute', left: -10, top: 5, bottom: 5,
          width: 2, borderRadius: '0 2px 2px 0',
          background: 'var(--adj-rail-on)',
        }} />
      )}
      <Icon size={18} strokeWidth={active ? 2.1 : 1.7} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

export default function AppSidebar({ mainTab, onTabChange, user, onLogout, apiStatus }: Props) {
  const { t } = useTranslation();
  useTheme();

  const [menuOuvert, setMenuOuvert] = useState(false);
  const blocUser = useRef<HTMLDivElement>(null);

  // Le menu se ferme au clic exterieur et a Echap, sinon il reste ouvert
  // derriere la navigation.
  useEffect(() => {
    if (!menuOuvert) return;
    const clic = (e: MouseEvent) => {
      if (!blocUser.current?.contains(e.target as Node)) setMenuOuvert(false);
    };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche); };
  }, [menuOuvert]);

  const navigate = useNavigate();
  const initiales = `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase() || '?';

  return (
    <aside
      style={{
        width: 'var(--adj-rail-w)', flexShrink: 0, height: '100vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--adj-rail)',
        position: 'relative', zIndex: 10,
      }}
    >
      {/* --- Marque --- */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        height: 'var(--adj-topbar)', flexShrink: 0, boxSizing: 'border-box',
        padding: '0 16px',
        borderBottom: '1px solid var(--adj-rail-edge)',
      }}>
        {/* Le logo porte deja son propre fond arrondi : l'enfermer dans une
            pastille bleue en dessinait un second. Il est pose tel quel.

            La source est logo-adjuja-mark.png et non logo-adjuja.png : l'original
            de 4167px a du vide transparent tout autour, et surtout DISSYMETRIQUE
            (1024px en haut, 827px en bas). La marque y occupait 56 % de la boite,
            d'ou deux defauts a la fois : elle paraissait petite alors que la
            boite etait grande, et son centre optique tombait 2 a 3 px sous celui
            du texte, ce qui decalait visiblement les deux colonnes. Le fichier
            recadre sur la marque, cale dans un carre exact, supprime les deux. */}
        <img
          src="/logo-adjuja-mark.png"
          alt=""
          aria-hidden
          width={46}
          height={46}
          style={{ display: 'block', flexShrink: 0 }}
        />
        <span style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          minWidth: 0, gap: 3,
        }}>
          <span style={{
            fontSize: 'var(--adj-t-lg)', fontWeight: 'var(--adj-w-black)' as never,
            letterSpacing: '-0.025em', color: 'var(--adj-rail-ink)',
            lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            ADJUJA
          </span>
          <span style={{
            fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
            letterSpacing: '.02em',
            color: 'var(--adj-rail-ink-3)', whiteSpace: 'nowrap',
          }}>
            {t('app.nav.tagline')}
          </span>
        </span>
      </div>

      {/* --- Navigation --- */}
      <nav style={{
        flexShrink: 0,
        padding: '14px 12px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {PILOTAGE.map(item => (
            <NavButton
              key={item.tab}
              item={item}
              active={mainTab === item.tab}
              onClick={() => onTabChange(item.tab)}
              label={t(`app.nav.${item.key}`)}
            />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            padding: '0 12px 6px',
            fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--adj-rail-ink-3)',
          }}>
            {t('app.nav.sectionSettings')}
          </span>
          {ENTREPRISE.map(item => (
            <NavButton
              key={item.tab}
              item={item}
              active={mainTab === item.tab}
              onClick={() => onTabChange(item.tab)}
              label={t(`app.nav.${item.key}`)}
            />
          ))}
          {/* Administration : page à part (/admin), affichée aux seuls comptes
              de ADMIN_EMAILS. Ce n'est qu'un affichage, chaque route revérifie. */}
          {user.is_platform_admin && (
            <NavButton
              item={{ tab: 'accueil', key: 'admin', Icon: ShieldCheck }}
              active={false}
              onClick={() => navigate('/admin')}
              label={t('app.nav.admin')}
            />
          )}
        </div>
      </nav>

      <div className="adj-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <RailCalendar onOpenDay={() => onTabChange('accueil')} />
      </div>

      {/* --- Utilisateur --- */}
      <div
        ref={blocUser}
        style={{ position: 'relative', flexShrink: 0, padding: 12, borderTop: '1px solid var(--adj-rail-edge)' }}
      >
        {menuOuvert && (
          <div
            role="menu"
            style={{
              position: 'absolute', bottom: 'calc(100% - 2px)', left: 10, right: 10,
              background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
              borderRadius: 'var(--adj-round-m)', boxShadow: 'var(--adj-lift-3)',
              padding: 4, zIndex: 20,
            }}
          >
            <span style={{
              display: 'block', padding: '5px 8px 7px',
              fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.email}
            </span>
            <button
              role="menuitem"
              onClick={() => { setMenuOuvert(false); onLogout(); }}
              className="adj-focusable"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '7px 8px', border: 'none', borderRadius: 'var(--adj-round-s)',
                background: 'transparent', color: 'var(--adj-neg)',
                fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
                fontWeight: 'var(--adj-w-medium)' as never, cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--adj-neg-tint)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <LogOut size={16} strokeWidth={1.9} />
              {t('app.nav.logout')}
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOuvert(o => !o)}
          className="adj-focusable adj-anim"
          aria-haspopup="menu"
          aria-expanded={menuOuvert}
          style={{
            display: 'flex', alignItems: 'center', gap: 11, width: '100%',
            padding: 10, border: '1px solid var(--adj-rail-edge)',
            borderRadius: 'var(--adj-round-l)',
            background: menuOuvert ? 'rgba(255,255,255,.07)' : 'var(--adj-rail-deep)',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            transition: 'background .14s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.07)'; }}
          onMouseLeave={e => { if (!menuOuvert) e.currentTarget.style.background = 'var(--adj-rail-deep)'; }}
        >
          <span style={{ position: 'relative', flexShrink: 0 }}>
            <span style={{
              width: 40, height: 40, borderRadius: 'var(--adj-round-m)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--adj-brand)', color: '#fff',
              fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-bold)' as never,
            }}>
              {initiales}
            </span>
            <span
              title={t(`app.status.${apiStatus}`, { defaultValue: apiStatus })}
              style={{
                position: 'absolute', right: -2, bottom: -2,
                width: 10, height: 10, borderRadius: '50%',
                background: STATUS_COLOR[apiStatus],
                border: '2px solid var(--adj-rail-deep)',
              }}
            />
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
              color: 'var(--adj-rail-ink)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.prenom} {user.nom}
            </span>
            <span style={{
              fontSize: 'var(--adj-t-xs)', color: 'var(--adj-rail-ink-3)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.email}
            </span>
          </span>
          <ChevronDown
            size={16} strokeWidth={2}
            color="var(--adj-rail-ink-3)"
            style={{ flexShrink: 0, transform: menuOuvert ? 'rotate(180deg)' : 'none', transition: 'transform .16s' }}
          />
        </button>
      </div>
    </aside>
  );
}
