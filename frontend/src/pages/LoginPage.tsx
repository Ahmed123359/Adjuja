import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { login, loginWithGoogle } from '../api';
import AuthLayout from '../components/auth/AuthLayout';

declare const google: {
  accounts: { id: { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void } };
};

type Props = { onSuccess: () => void; onGoRegister: () => void };

export default function LoginPage({ onSuccess, onGoRegister }: Props) {
  const { t } = useTranslation();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [searchParams] = useSearchParams();
  const justVerified = searchParams.get('verified') === 'true';
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && googleBtnRef.current) {
        clearInterval(interval);
        google.accounts.id.initialize({
          client_id: '283835865463-t0o734rbl4behuh80g3upc228eq572ur.apps.googleusercontent.com',
          callback: async (response: { credential: string }) => {
            setError(''); setLoading(true);
            try { await loginWithGoogle(response.credential); onSuccess(); }
            catch (err) { setError(err instanceof Error ? err.message : 'Erreur Google.'); }
            finally { setLoading(false); }
          },
        });
        google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black', size: 'large', width: 280,
          text: 'continue_with', shape: 'rectangular', logo_alignment: 'center',
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  /** Le bouton natif de Google (rendu par renderButton dans un iframe) ne peut pas
   * recevoir de padding/rayon/hauteur personnalisés via CSS -- c'est un iframe cross-origin.
   * On le garde monté mais invisible, et notre propre bouton (avec exactement le padding et
   * le style du reste du formulaire) déclenche son clic interne par-dessus. */
  function triggerGoogleButton() {
    const btn = googleBtnRef.current?.querySelector('div[role="button"]') as HTMLElement | null;
    btn?.click();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password); onSuccess(); }
    catch (err) { setError(err instanceof Error ? err.message : t('auth.login.submitting')); }
    finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px', borderRadius: 12,
    border: '1px solid var(--l-card-border)', background: 'var(--l-surface-2, rgba(255,255,255,0.04))',
    color: 'var(--l-text)', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 7,
  };

  return (
    <AuthLayout>
      <Link to="/" style={{ display: 'block', margin: '0 auto 32px', width: 'fit-content' }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 84, display: 'block' }} />
      </Link>

      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 8px', letterSpacing: '-0.02em', textAlign: 'center' }}>{t('auth.login.title')}</h1>
      <p style={{ fontSize: 14, color: 'var(--l-sub)', margin: '0 0 32px', textAlign: 'center' }}>{t('auth.login.subtitle')}</p>

      {justVerified && (
        <div style={{ marginBottom: 20, padding: '11px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#16a34a', fontSize: 13 }}>
          {t('auth.login.verified')}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 20, padding: '11px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={labelStyle}>{t('auth.login.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.login.emailPlaceholder')} required
            style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
          />
        </div>
        <div>
          <label style={labelStyle}>{t('auth.login.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.login.passwordPlaceholder')} required
            style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
          />
        </div>

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s', marginTop: 4 }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '.88'; }}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {loading ? t('auth.login.submitting') : t('auth.login.submit')}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--l-dim)' }}>{t('auth.login.or')}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
      </div>

      {/* Bouton natif Google, invisible : garde le flux OAuth fonctionnel sans imposer
          son propre style. Ne pas mettre display:none (casse le clic dans certains
          navigateurs) -- juste hors-flux et transparent. */}
      <div ref={googleBtnRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, overflow: 'hidden' }} />

      <button
        type="button"
        onClick={triggerGoogleButton}
        style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none', background: '#131314', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'opacity .15s' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.8 2.73v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.64z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        {t('auth.login.continueWithGoogle')}
      </button>

      <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--l-sub)', margin: '28px 0 0' }}>
        {t('auth.login.noAccount')}{' '}
        <button onClick={onGoRegister} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-blue)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', padding: 0 }}>
          {t('auth.login.createAccount')}
        </button>
      </p>
    </AuthLayout>
  );
}
