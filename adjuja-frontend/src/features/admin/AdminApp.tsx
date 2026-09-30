// Administration de la plateforme : page à part (/admin) -- 2026-10-01.
//
// Demandé par l'utilisateur après avoir vu l'onglet du 2026-09-30 : « les
// choses ne sont pas bien organisées, l'admin doit scroller, l'administration
// mérite toute une autre page ». Spec : context/feature-spec/admin-panel/.
//
// Une barre latérale par thème, une URL par écran : chaque sujet a son écran,
// on n'empile plus tout dans une page à défiler, et un lien vers un compte ou
// un écran se partage. Seuls les modules livrés figurent dans la navigation :
// une entrée sans contenu promettrait une fonction qui n'existe pas.
//
// Rendu seulement pour un compte `is_platform_admin` (main.tsx) ; chaque
// route /api/v1/admin/* revérifie côté serveur.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Download, Gauge, KeyRound, LayoutGrid, ListChecks,
  LogOut, Menu, Radar, SlidersHorizontal, Users, X, type LucideIcon,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { User } from '../auth/types';
import TableauDeBordPage from './pages/TableauDeBordPage';
import ComptesPage from './pages/ComptesPage';
import ComptePage from './pages/ComptePage';
import AbonnementsPage from './pages/AbonnementsPage';
import { VeilleActionsPage, VeilleDcePage, VeilleRemplissagePage, VeilleSourcesPage } from './pages/VeillePages';
import AccesPage from './pages/AccesPage';
import JournalPage from './pages/JournalPage';

type Entree = { chemin: string; cle: string; Icon: LucideIcon; exact?: boolean };
type Groupe = { cle: string; entrees: Entree[] };

const NAVIGATION: Groupe[] = [
  { cle: 'pilotage', entrees: [{ chemin: '/admin', cle: 'tableau', Icon: LayoutGrid, exact: true }] },
  { cle: 'clients', entrees: [
    { chemin: '/admin/comptes', cle: 'comptes', Icon: Users },
    { chemin: '/admin/abonnements', cle: 'abonnements', Icon: CreditCard },
  ] },
  { cle: 'veille', entrees: [
    { chemin: '/admin/veille/sources', cle: 'sources', Icon: Radar },
    { chemin: '/admin/veille/remplissage', cle: 'remplissage', Icon: Gauge },
    { chemin: '/admin/veille/actions', cle: 'actions', Icon: SlidersHorizontal },
    { chemin: '/admin/veille/dce', cle: 'dce', Icon: Download },
  ] },
  { cle: 'securite', entrees: [
    { chemin: '/admin/acces', cle: 'acces', Icon: KeyRound },
    { chemin: '/admin/journal', cle: 'journal', Icon: ListChecks },
  ] },
];

/* ---------------------------------------------------------------- rail */

function Lien({ e, onChoisi }: { e: Entree; onChoisi: () => void }) {
  const { t } = useTranslation();
  const { Icon } = e;
  return (
    <NavLink
      to={e.chemin}
      end={e.exact}
      onClick={onChoisi}
      className="adj-focusable adj-anim"
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px',
        borderRadius: 'var(--adj-round-m)', textDecoration: 'none',
        background: isActive ? 'var(--adj-rail-on-bg)' : 'transparent',
        color: isActive ? 'var(--adj-rail-on)' : 'var(--adj-rail-ink-2)',
        fontSize: 'var(--adj-t-base)',
        fontWeight: (isActive ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
      })}
    >
      <Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t(`admin.nav.${e.cle}`)}
      </span>
    </NavLink>
  );
}

function Rail({ user, onLogout, onChoisi }: { user: User; onLogout: () => void; onChoisi: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <aside style={{
      width: 'var(--adj-rail-w)', flexShrink: 0, height: '100%',
      display: 'flex', flexDirection: 'column', background: 'var(--adj-rail)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 'var(--adj-topbar)', flexShrink: 0,
        padding: '0 18px', borderBottom: '1px solid var(--adj-rail-edge)', boxSizing: 'border-box',
      }}>
        <img src="/logo-adjuja-mark.png" alt="" aria-hidden width={40} height={40} style={{ display: 'block', flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{
            fontSize: 'var(--adj-t-md)', fontWeight: 'var(--adj-w-black)' as never,
            letterSpacing: '-0.02em', color: 'var(--adj-rail-ink)', lineHeight: 1,
          }}>ADJUJA</span>
          <span style={{ fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-rail-on)' }}>
            {t('admin.nav.marque')}
          </span>
        </span>
      </div>

      <nav className="adj-scroll" aria-label={t('admin.nav.marque')} style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 12px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {NAVIGATION.map(g => (
          <div key={g.cle} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{
              padding: '0 12px 6px', fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
              color: 'var(--adj-rail-ink-3)',
            }}>
              {t(`admin.nav.groupe.${g.cle}`)}
            </span>
            {g.entrees.map(e => <Lien key={e.chemin} e={e} onChoisi={onChoisi} />)}
          </div>
        ))}
      </nav>

      <div style={{ flexShrink: 0, padding: 12, borderTop: '1px solid var(--adj-rail-edge)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => navigate('/app')}
          className="adj-focusable"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px',
            borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-rail-edge)',
            background: 'transparent', color: 'var(--adj-rail-ink)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', textAlign: 'left',
          }}
        >
          <ArrowLeft size={17} strokeWidth={1.9} />
          {t('admin.nav.retourApp')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 0' }}>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-rail-ink-2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={user.email}>
            {user.email}
          </span>
          <button
            onClick={onLogout}
            aria-label={t('admin.nav.deconnexion')}
            title={t('admin.nav.deconnexion')}
            className="adj-focusable"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
              borderRadius: 'var(--adj-round-s)', border: 'none', background: 'transparent',
              color: 'var(--adj-rail-ink-2)', cursor: 'pointer',
            }}
          >
            <LogOut size={17} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------- coquille */

export default function AdminApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useTranslation();
  const mobile = useIsMobile(900);
  const [tiroir, setTiroir] = useState(false);
  const location = useLocation();

  // Changer d'écran ferme le tiroir et remonte en haut de la page.
  useEffect(() => { setTiroir(false); }, [location.pathname]);

  return (
    <div className="adj-app-bg" style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      {!mobile && <Rail user={user} onLogout={onLogout} onChoisi={() => {}} />}

      {mobile && tiroir && (
        <>
          <div className="adj-overlay" onClick={() => setTiroir(false)} style={{
            position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(8, 11, 28, 0.55)',
          }} />
          <div className="adj-drawer" style={{ position: 'fixed', inset: '0 auto 0 0', zIndex: 50 }}>
            <Rail user={user} onLogout={onLogout} onChoisi={() => setTiroir(false)} />
          </div>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {mobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, height: 56, flexShrink: 0, padding: '0 12px',
            borderBottom: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)',
          }}>
            <button
              onClick={() => setTiroir(o => !o)}
              aria-label={t('admin.nav.menu')}
              className="adj-focusable"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40,
                borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-hairline)',
                background: 'var(--adj-panel)', color: 'var(--adj-ink)', cursor: 'pointer',
              }}
            >
              {tiroir ? <X size={19} /> : <Menu size={19} />}
            </button>
            <span style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>{t('admin.nav.marque')}</span>
          </div>
        )}

        <main key={location.pathname} className="adj-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Routes>
            <Route index element={<TableauDeBordPage />} />
            <Route path="comptes" element={<ComptesPage />} />
            <Route path="comptes/:orgId" element={<ComptePage moi={user} />} />
            <Route path="abonnements" element={<AbonnementsPage />} />
            <Route path="veille" element={<Navigate to="/admin/veille/sources" replace />} />
            <Route path="veille/sources" element={<VeilleSourcesPage />} />
            <Route path="veille/remplissage" element={<VeilleRemplissagePage />} />
            <Route path="veille/actions" element={<VeilleActionsPage />} />
            <Route path="veille/dce" element={<VeilleDcePage />} />
            <Route path="acces" element={<AccesPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
