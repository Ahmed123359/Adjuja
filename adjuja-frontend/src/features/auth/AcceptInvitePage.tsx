import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { previewInvite, acceptInvite, getPasswordRules, type PasswordRules, type InvitePreview } from '../../api';
import AuthLayout from './components/AuthLayout';

type Props = { onSuccess: () => void };

export default function AcceptInvitePage({ onSuccess }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [loading,  setLoading]  = useState(true);
  const [preview,  setPreview]  = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState('');

  const [nom,      setNom]      = useState('');
  const [prenom,   setPrenom]   = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState('');
  const [rules,     setRules]     = useState<PasswordRules>({ min_length: 8, require_digit: true });

  useEffect(() => { getPasswordRules().then(setRules); }, []);

  useEffect(() => {
    if (!token) { setLoadError(t('auth.invite.invalid')); setLoading(false); return; }
    previewInvite(token)
      .then(setPreview)
      .catch(err => setLoadError(err instanceof Error ? err.message : t('auth.invite.invalid')))
      .finally(() => setLoading(false));
  }, [token, t]);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 13px', borderRadius: 10,
    border: '1px solid var(--l-card-border)', background: 'var(--l-surface-2, rgba(255,255,255,0.04))',
    color: 'var(--l-text)', fontSize: 13.5, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--l-sub)', marginBottom: 4,
  };
  function focusRing(e: React.FocusEvent<HTMLInputElement>) { e.currentTarget.style.borderColor = 'var(--l-blue)'; }
  function blurRing(e: React.FocusEvent<HTMLInputElement>) { e.currentTarget.style.borderColor = 'var(--l-card-border)'; }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSubmitting(true);
    try {
      await acceptInvite(token, nom, prenom, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invite.acceptError'));
    } finally { setSubmitting(false); }
  }

  if (loading) {
    return (
      <AuthLayout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--l-card-border)', borderTopColor: 'var(--l-blue)', animation: 'spin 1s linear infinite' }} />
        </div>
      </AuthLayout>
    );
  }

  if (loadError || !preview) {
    return (
      <AuthLayout>
        <Link to="/" style={{ display: 'block', margin: '0 auto 32px', width: 'fit-content' }}>
          <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 84, display: 'block' }} />
        </Link>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 20, padding: '11px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 13 }}>
            {loadError || t('auth.invite.invalid')}
          </div>
          <Link to="/login" style={{ color: 'var(--l-blue)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            {t('auth.verify.goLogin')}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Link to="/" style={{ display: 'block', margin: '0 auto 24px', width: 'fit-content' }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 72, display: 'block' }} />
      </Link>

      <h1 style={{ fontSize: 21, fontWeight: 700, color: 'var(--l-text)', margin: '0 0 6px', letterSpacing: '-0.02em', textAlign: 'center' }}>
        {t('auth.invite.title', { name: preview.inviter_name })}
      </h1>
      <p style={{ fontSize: 13.5, color: 'var(--l-sub)', margin: '0 0 20px', textAlign: 'center' }}>
        {preview.email}
      </p>

      {error && (
        <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 12.5 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        <button type="submit" disabled={submitting}
          style={{ width: '100%', padding: '12px', marginTop: 4, borderRadius: 10, border: 'none', background: submitting ? 'var(--l-dim)' : 'var(--l-blue)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
          onMouseEnter={e => { if (!submitting) e.currentTarget.style.opacity = '.88'; }}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {submitting ? t('auth.invite.accepting') : t('auth.invite.accept')}
        </button>
      </form>
    </AuthLayout>
  );
}
