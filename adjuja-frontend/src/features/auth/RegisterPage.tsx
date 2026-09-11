import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { register, verifyOtp, getPasswordRules, startGoogleLogin, type PasswordRules } from '../../api';
import AuthLayout from './components/AuthLayout';
import CustomSelect from '../../shared/ui/CustomSelect';

type Props = { onSuccess: () => void; onGoLogin: () => void };

export default function RegisterPage({ onSuccess, onGoLogin }: Props) {
  const { t } = useTranslation();
  const [nom,       setNom]       = useState('');
  const [prenom,    setPrenom]    = useState('');
  const [email,     setEmail]     = useState('');
  const [entreprise,       setEntreprise]       = useState('');
  const [secteurActivite,  setSecteurActivite]  = useState('');
  const [nbAoParAn,        setNbAoParAn]        = useState('');
  const [password,  setPassword]  = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [otp,       setOtp]       = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError,   setOtpError]   = useState('');
  const [rules,     setRules]     = useState<PasswordRules>({ min_length: 8, require_digit: true });

  useEffect(() => { getPasswordRules().then(setRules); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const isAdmin = await register({
        nom, prenom, email, password,
        entreprise, secteur_activite: secteurActivite,
        nb_ao_par_an: nbAoParAn === '' ? null : Number(nbAoParAn),
      });
      if (isAdmin) { onSuccess(); } else { setEmailSent(true); }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.register.submitting'));
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault(); setOtpError(''); setOtpLoading(true);
    try { await verifyOtp(email, otp); onSuccess(); }
    catch (err) { setOtpError(err instanceof Error ? err.message : t('auth.verify.otpError')); }
    finally { setOtpLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 13px', borderRadius: 10,
    border: '1px solid var(--l-card-border)', background: 'var(--l-surface-2, rgba(255,255,255,0.04))',
    color: 'var(--l-text)', fontSize: 13.5, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 4,
  };

  function focusRing(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = 'var(--l-blue)';
  }
  function blurRing(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = 'var(--l-card-border)';
  }

  // Email verification screen
  if (emailSent) {
    return (
      <AuthLayout>
        <Link to="/" style={{ display: 'block', margin: '0 auto 40px', width: 'fit-content' }}>
          <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 84, display: 'block' }} />
        </Link>

        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--l-blue-a)', border: '1px solid var(--l-card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 10px', letterSpacing: '-0.01em' }}>{t('auth.verify.title')}</h2>
          <p style={{ fontSize: 14, color: 'var(--l-sub)', margin: '0 0 6px' }}>{t('auth.verify.sent')}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--l-blue)', margin: '0 0 16px' }}>{email}</p>
          <p style={{ fontSize: 13, color: 'var(--l-dim)', margin: '0 0 24px', lineHeight: 1.6 }}>
            {t('auth.verify.instruction')}
          </p>

          {otpError && (
            <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 12.5, textAlign: 'left' }}>
              {otpError}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <button type="submit" disabled={otpLoading || otp.length !== 6}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: otpLoading || otp.length !== 6 ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: otpLoading || otp.length !== 6 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
              onMouseEnter={e => { if (!otpLoading && otp.length === 6) e.currentTarget.style.opacity = '.88'; }}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {otpLoading ? t('auth.verify.verifying') : t('auth.verify.confirm')}
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

  // Register form
  return (
    <AuthLayout>
      <Link to="/" style={{ display: 'block', margin: '0 auto 14px', width: 'fit-content' }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 64, display: 'block' }} />
      </Link>

      <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 4px', letterSpacing: '-0.02em', textAlign: 'center' }}>{t('auth.register.title')}</h1>
      <p style={{ fontSize: 13, color: 'var(--l-sub)', margin: '0 0 16px', textAlign: 'center' }}>{t('auth.register.subtitle')}</p>

      {error && (
        <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 12.5 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('auth.register.firstName')}</label>
            <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
              placeholder={t('auth.register.firstNamePlaceholder')} required style={inputStyle}
              onFocus={focusRing} onBlur={blurRing}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('auth.register.lastName')}</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)}
              placeholder={t('auth.register.lastNamePlaceholder')} required style={inputStyle}
              onFocus={focusRing} onBlur={blurRing}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('auth.register.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={t('auth.register.emailPlaceholder')} required style={inputStyle}
            onFocus={focusRing} onBlur={blurRing}
          />
        </div>

        <div>
          <label style={labelStyle}>{t('auth.register.companyName')}</label>
          <input type="text" value={entreprise} onChange={e => setEntreprise(e.target.value)}
            placeholder={t('auth.register.companyNamePlaceholder')} required style={inputStyle}
            onFocus={focusRing} onBlur={blurRing}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr]" style={{ gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('auth.register.sector')}</label>
            <CustomSelect
              value={secteurActivite}
              onChange={setSecteurActivite}
              placeholder={t('auth.register.sectorPlaceholder')}
              style={inputStyle}
              options={Object.entries(t('auth.register.sectorOptions', { returnObjects: true }) as Record<string, string>).map(
                ([code, label]) => ({ value: code, label })
              )}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('auth.register.aoPerYear')}</label>
            <input type="number" min={0} value={nbAoParAn} onChange={e => setNbAoParAn(e.target.value)}
              placeholder={t('auth.register.aoPerYearPlaceholder')} required style={inputStyle}
              onFocus={focusRing} onBlur={blurRing}
            />
          </div>
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
            onFocus={focusRing} onBlur={blurRing}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={e => setAcceptTerms(e.target.checked)}
            required
            style={{ marginTop: 2, width: 14, height: 14, accentColor: 'var(--l-blue)', cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, color: 'var(--l-sub)', lineHeight: 1.4 }}>
            {t('legal.acceptPrefix')}
            <Link to="/cgu" target="_blank" style={{ color: 'var(--l-blue)' }}>{t('legal.acceptCgu')}</Link>
            {t('legal.acceptAnd')}
            <Link to="/confidentialite" target="_blank" style={{ color: 'var(--l-blue)' }}>{t('legal.acceptPrivacy')}</Link>
          </span>
        </label>

        <button type="submit" disabled={loading || !acceptTerms || !secteurActivite}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: (loading || !acceptTerms || !secteurActivite) ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: (loading || !acceptTerms || !secteurActivite) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
          onMouseEnter={e => { if (!loading && acceptTerms && secteurActivite) e.currentTarget.style.opacity = '.88'; }}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {loading ? t('auth.register.submitting') : t('auth.register.submit')}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
        <span style={{ fontSize: 11, color: 'var(--l-dim)' }}>{t('auth.register.or')}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--l-card-border)' }} />
      </div>

      <button
        type="button"
        onClick={startGoogleLogin}
        style={{ width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none', background: '#131314', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'opacity .15s' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="16" height="16" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.8 2.73v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.64z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        {t('auth.register.continueWithGoogle')}
      </button>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--l-sub)', margin: '14px 0 0' }}>
        {t('auth.register.hasAccount')}{' '}
        <button onClick={onGoLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--l-blue)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
          {t('auth.register.loginLink')}
        </button>
      </p>
    </AuthLayout>
  );
}
