import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import type { User } from '../types';

type AppTab = 'offres' | 'marches' | 'outils' | 'veille';

type Props = {
  mainTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  user: User;
  onLogout: () => void;
  apiStatus: 'online' | 'offline' | 'connecting';
  onGoLanding?: () => void;
};

const NAV_ITEMS: { tab: AppTab; key: string; icon: string }[] = [
  {
    tab: 'offres',
    key: 'dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    tab: 'marches',
    key: 'tenders',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    tab: 'veille',
    key: 'veille',
    icon: 'M9.348 14.651a3.75 3.75 0 010-5.303m5.304-.001a3.75 3.75 0 010 5.304m-7.425 2.122a6.75 6.75 0 010-9.546m9.546.001a6.75 6.75 0 010 9.545M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  },
  {
    tab: 'outils',
    key: 'tools',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  },
];

export default function AppSidebar({ mainTab, onTabChange, user, onLogout, apiStatus }: Props) {
  const { t } = useTranslation();
  useTheme();

  const statusDot = { online: '#22c55e', offline: '#ef4444', connecting: '#f59e0b' }[apiStatus];

  const itemBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 10, border: 'none',
    fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
    width: '100%', textAlign: 'left', transition: 'background .12s, color .12s',
  };

  return (
    <aside style={{
      width: 208, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--l-card)', borderRight: '1px solid var(--l-card-border)',
      height: '100vh', position: 'relative', zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid var(--l-card-border)' }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 56 }} />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV_ITEMS.map(({ tab, key, icon }) => {
          const active = mainTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                ...itemBase,
                background: active ? 'var(--l-blue-a)' : 'transparent',
                color: active ? 'var(--l-blue)' : 'var(--l-sub)',
                fontWeight: active ? 600 : 500,
              }}
              onMouseEnter={e => {
                if (!active) { e.currentTarget.style.background = 'var(--l-input-bg)'; e.currentTarget.style.color = 'var(--l-text)'; }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = active ? 'var(--l-blue-a)' : 'transparent';
                e.currentTarget.style.color = active ? 'var(--l-blue)' : 'var(--l-sub)';
              }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <span style={{ flex: 1 }}>{t(`app.nav.${key}`)}</span>
              {active && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--l-blue)', flexShrink: 0 }} />}
            </button>
          );
        })}


      </nav>

      {/* User */}
      <div style={{ padding: '14px 10px', borderTop: '1px solid var(--l-card-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--l-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                {user.prenom?.[0]?.toUpperCase()}{user.nom?.[0]?.toUpperCase() ?? ''}
              </span>
            </div>
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: statusDot, border: '2px solid var(--l-card)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--l-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.prenom} {user.nom}
            </p>
          </div>
          <button
            onClick={onLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-dim)', padding: '4px', borderRadius: 6, transition: 'color .15s', flexShrink: 0, display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--l-dim)'}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
