import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { login, loginWithGoogle } from '../api';

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
          theme: 'outline', size: 'large',
          width: googleBtnRef.current.offsetWidth || 280,
          text: 'continue_with', shape: 'rectangular',
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await login(email, password); onSuccess(); }
    catch (err) { setError(err instanceof Error ? err.message : t('auth.login.submitting')); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--l-bg-alt)' }}>

      {/* Logo */}
      <div style={{ marginBottom: 32 }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 32 }} />
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--l-card)', border: '1px solid var(--l-card-border)', borderRadius: 20, padding: '40px 36px', boxShadow: 'var(--l-card-shadow)' }}>

        <h1 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', color: 'var(--l-text)', margin: '0 0 6px', letterSpacing: '-0.01em' }}>{t('auth.login.title')}</h1>
        <p style={{ fontSize: 14, textAlign: 'center', color: 'var(--l-sub)', margin: '0 0 28px' }}>{t('auth.login.subtitle')}</p>

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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 6 }}>{t('auth.login.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.login.emailPlaceholder')} required
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)', color: 'var(--l-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 6 }}>{t('auth.login.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.login.passwordPlaceholder')} required
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)', color: 'var(--l-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
            />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: loading ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '.85'; }}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {loading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
          <span style={{ fontSize: 12, color: 'var(--l-dim)' }}>{t('auth.login.or')}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
        </div>

        <div ref={googleBtnRef} style={{ width: '100%', minHeight: 44 }} />

        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--l-sub)', margin: '24px 0 0' }}>
          {t('auth.login.noAccount')}{' '}
          <button onClick={onGoRegister} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-blue)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', padding: 0 }}>
            {t('auth.login.createAccount')}
          </button>
        </p>
      </div>
    </div>
  );
}
