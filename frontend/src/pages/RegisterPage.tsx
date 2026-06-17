import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { register, getPasswordRules, loginWithGoogle, type PasswordRules } from '../api';

declare const google: {
  accounts: { id: { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void } };
};

type Props = { onSuccess: () => void; onGoLogin: () => void };

export default function RegisterPage({ onSuccess, onGoLogin }: Props) {
  const { t } = useTranslation();
  const [nom,       setNom]       = useState('');
  const [prenom,    setPrenom]    = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [rules,     setRules]     = useState<PasswordRules>({ min_length: 8, require_digit: true });
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getPasswordRules().then(setRules); }, []);

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
    try {
      const isAdmin = await register({ nom, prenom, email, password });
      if (isAdmin) { onSuccess(); } else { setEmailSent(true); }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.register.submitting'));
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)',
    color: 'var(--l-text)', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 6,
  };

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
    background: 'var(--l-bg-alt)',
  };

  // Email verification screen
  if (emailSent) {
    return (
      <div style={pageStyle}>
        <div style={{ marginBottom: 32 }}>
          <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 32 }} />
        </div>

        <div style={{ width: '100%', maxWidth: 400, background: 'var(--l-card)', border: '1px solid var(--l-card-border)', borderRadius: 20, padding: '40px 36px', boxShadow: 'var(--l-card-shadow)', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--l-blue-a)', border: '1px solid var(--l-card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 10px', letterSpacing: '-0.01em' }}>{t('auth.verify.title')}</h2>
          <p style={{ fontSize: 14, color: 'var(--l-sub)', margin: '0 0 6px' }}>{t('auth.verify.sent')}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--l-blue)', margin: '0 0 16px' }}>{email}</p>
          <p style={{ fontSize: 13, color: 'var(--l-dim)', margin: '0 0 28px', lineHeight: 1.6 }}>
            {t('auth.verify.instruction')}
          </p>

          <button onClick={onGoLogin}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t('auth.verify.goLogin')}
          </button>
        </div>
      </div>
    );
  }

  // Register form
  return (
    <div style={pageStyle}>

      {/* Logo */}
      <div style={{ marginBottom: 32 }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 32 }} />
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--l-card)', border: '1px solid var(--l-card-border)', borderRadius: 20, padding: '40px 36px', boxShadow: 'var(--l-card-shadow)' }}>

        <h1 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', color: 'var(--l-text)', margin: '0 0 6px', letterSpacing: '-0.01em' }}>{t('auth.register.title')}</h1>
        <p style={{ fontSize: 14, textAlign: 'center', color: 'var(--l-sub)', margin: '0 0 28px' }}>{t('auth.register.subtitle')}</p>

        {error && (
          <div style={{ marginBottom: 20, padding: '11px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('auth.register.firstName')}</label>
              <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
                placeholder={t('auth.register.firstNamePlaceholder')} required style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('auth.register.lastName')}</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder={t('auth.register.lastNamePlaceholder')} required style={inputStyle}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>{t('auth.register.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={t('auth.register.emailPlaceholder')} required style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
            />
          </div>

          <div>
            <label style={labelStyle}>
              {t('auth.register.password')}{' '}
              <span style={{ color: 'var(--l-dim)', fontWeight: 400 }}>
                {t('auth.register.passwordHint', {
                  min: rules.min_length,
                  digit: rules.require_digit ? t('auth.register.passwordDigit') : '',
                })}
              </span>
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.register.passwordPlaceholder')} minLength={rules.min_length} required style={inputStyle}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
            />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: loading ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '.85'; }}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {loading ? t('auth.register.submitting') : t('auth.register.submit')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
          <span style={{ fontSize: 12, color: 'var(--l-dim)' }}>{t('auth.register.or')}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
        </div>

        <div ref={googleBtnRef} style={{ width: '100%', minHeight: 44 }} />

        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--l-sub)', margin: '24px 0 0' }}>
          {t('auth.register.hasAccount')}{' '}
          <button onClick={onGoLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-blue)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', padding: 0 }}>
            {t('auth.register.loginLink')}
          </button>
        </p>
      </div>
    </div>
  );
}
