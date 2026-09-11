import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { forgotPassword, resetPassword, getPasswordRules, type PasswordRules } from '../../api';
import AuthLayout from './components/AuthLayout';

type Props = { onSuccess: () => void; onGoLogin: () => void };

export default function ForgotPasswordPage({ onSuccess, onGoLogin }: Props) {
  const { t } = useTranslation();
  const [email,       setEmail]       = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [otpSent,     setOtpSent]     = useState(false);
  const [otp,         setOtp]         = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otpError,    setOtpError]    = useState('');
  const [rules,       setRules]       = useState<PasswordRules>({ min_length: 8, require_digit: true });

  useEffect(() => { getPasswordRules().then(setRules); }, []);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 13px', borderRadius: 10,
    border: '1px solid var(--l-card-border)', background: 'var(--l-surface-2, rgba(255,255,255,0.04))',
    color: 'var(--l-text)', fontSize: 13.5, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 4,
  };

  function focusRing(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--l-blue)';
  }
  function blurRing(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--l-card-border)';
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await forgotPassword(email);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.forgot.submitting'));
    } finally { setLoading(false); }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault(); setOtpError(''); setOtpLoading(true);
    try {
      await resetPassword(email, otp, newPassword);
      onSuccess();
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : t('auth.forgot.resetError'));
    } finally { setOtpLoading(false); }
  }

  // Etape 2 : code + nouveau mot de passe
  if (otpSent) {
    return (
      <AuthLayout>
        <Link to="/" style={{ display: 'block', margin: '0 auto 32px', width: 'fit-content' }}>
          <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 84, display: 'block' }} />
        </Link>

        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--l-blue-a)', border: '1px solid var(--l-card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 10px', letterSpacing: '-0.01em' }}>{t('auth.forgot.otpTitle')}</h2>
          <p style={{ fontSize: 14, color: 'var(--l-sub)', margin: '0 0 6px' }}>{t('auth.forgot.otpSent')}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--l-blue)', margin: '0 0 24px' }}>{email}</p>

          {otpError && (
            <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 12.5, textAlign: 'left' }}>
              {otpError}
            </div>
          )}

          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              type="text" inputMode="numeric" maxLength={6} autoFocus
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                border: '1px solid var(--l-card-border)', background: 'var(--l-surface-2, rgba(255,255,255,0.04))',
                color: 'var(--l-text)', fontSize: 24, fontWeight: 700, letterSpacing: '10px', textAlign: 'center',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--l-blue)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--l-card-border)'}
            />

            <div style={{ textAlign: 'left' }}>
              <label style={labelStyle}>
                {t('auth.forgot.newPassword')}{' '}
                <span style={{ color: 'var(--l-dim)', fontWeight: 400 }}>
                  {t('auth.register.passwordHint', {
                    min: rules.min_length,
                    digit: rules.require_digit ? t('auth.register.passwordDigit') : '',
                  })}
                </span>
              </label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder={t('auth.forgot.newPasswordPlaceholder')} minLength={rules.min_length} required style={inputStyle}
                onFocus={focusRing} onBlur={blurRing}
              />
            </div>

            <button type="submit" disabled={otpLoading || otp.length !== 6 || !newPassword}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: (otpLoading || otp.length !== 6 || !newPassword) ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: (otpLoading || otp.length !== 6 || !newPassword) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
              onMouseEnter={e => { if (!otpLoading && otp.length === 6 && newPassword) e.currentTarget.style.opacity = '.88'; }}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {otpLoading ? t('auth.forgot.resetting') : t('auth.forgot.resetSubmit')}
            </button>
          </form>

          <button onClick={onGoLogin}
            style={{ width: '100%', padding: '10px', marginTop: 12, borderRadius: 12, border: 'none', background: 'none', color: 'var(--l-sub)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t('auth.verify.goLogin')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  // Etape 1 : demande d'email
  return (
    <AuthLayout>
      <Link to="/" style={{ display: 'block', margin: '0 auto 32px', width: 'fit-content' }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 84, display: 'block' }} />
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 8px', letterSpacing: '-0.02em', textAlign: 'center' }}>{t('auth.forgot.title')}</h1>
      <p style={{ fontSize: 14, color: 'var(--l-sub)', margin: '0 0 24px', textAlign: 'center' }}>{t('auth.forgot.subtitle')}</p>

      {error && (
        <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>{t('auth.forgot.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={t('auth.forgot.emailPlaceholder')} required style={inputStyle}
            onFocus={focusRing} onBlur={blurRing}
          />
        </div>

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: loading ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '.88'; }}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {loading ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--l-sub)', margin: '24px 0 0' }}>
        <button onClick={onGoLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-blue)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', padding: 0 }}>
          {t('auth.forgot.backToLogin')}
        </button>
      </p>
    </AuthLayout>
  );
}
