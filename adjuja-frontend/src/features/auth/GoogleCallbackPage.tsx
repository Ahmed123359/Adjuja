import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginWithGoogleCode, consumeGoogleOAuthState } from '../../api';
import AuthLayout from './components/AuthLayout';

type Props = { onSuccess: () => void };

export default function GoogleCallbackPage({ onSuccess }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code  = searchParams.get('code');
    const state = searchParams.get('state');
    const expectedState = consumeGoogleOAuthState();

    if (searchParams.get('error')) {
      setError(t('auth.login.googleCallbackError'));
      return;
    }
    if (!code || !state || state !== expectedState) {
      setError(t('auth.login.googleCallbackError'));
      return;
    }

    loginWithGoogleCode(code)
      .then(onSuccess)
      .catch(err => setError(err instanceof Error ? err.message : t('auth.login.googleCallbackError')));
  }, [searchParams, onSuccess, t]);

  return (
    <AuthLayout>
      {error ? (
        <>
          <div style={{ marginBottom: 20, padding: '11px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--l-blue)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t('auth.login.submit')}
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--l-card-border)', borderTopColor: 'var(--l-blue)', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, color: 'var(--l-sub)', margin: 0 }}>{t('auth.login.googleCallbackLoading')}</p>
        </div>
      )}
    </AuthLayout>
  );
}
