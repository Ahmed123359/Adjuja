import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { login, loginWithGoogle } from '../api';

declare const google: {
  accounts: { id: { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void } };
};

type Props = {
  onSuccess:    () => void;
  onGoRegister: () => void;
};

const NAVY  = '#1e3a8a';
const ROYAL = '#3b82f6';
const DARK  = '#0f172a';
const BODY  = '#475569';
const MUTED = '#64748b';
const BRD   = '#e2e8f0';

export default function LoginPage({ onSuccess, onGoRegister }: Props) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [searchParams] = useSearchParams();
  const justVerified = searchParams.get('verified') === 'true';

  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && googleBtnRef.current) {
        clearInterval(interval);
        google.accounts.id.initialize({
          client_id: '283835865463-t0o734rbl4behuh80g3upc228eq572ur.apps.googleusercontent.com',
          callback: async (response: { credential: string }) => {
            setError('');
            setLoading(true);
            try {
              await loginWithGoogle(response.credential);
              onSuccess();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur Google.');
            } finally {
              setLoading(false);
            }
          },
        });
        google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: googleBtnRef.current.offsetWidth || 320,
          text: 'continue_with',
          shape: 'rectangular',
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${BRD}`,
    background: '#fff',
    color: DARK,
    fontSize: 14,
    outline: 'none',
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#f8fafc' }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
          <span className="font-display font-bold text-sm text-white">O</span>
        </div>
        <span className="font-display font-bold text-xl" style={{ color: DARK }}>OffrIA</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl p-8"
        style={{ border: `1px solid ${BRD}`, boxShadow: '0 4px 24px rgba(30,58,138,0.07)' }}>

        <h1 className="font-display font-bold text-xl text-center mb-1" style={{ color: DARK }}>Connexion</h1>
        <p className="text-sm text-center mb-6" style={{ color: MUTED }}>Accédez à votre espace OffrIA</p>

        {justVerified && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
            ✓ Email vérifié ! Connectez-vous pour accéder à votre génération gratuite.
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: BODY }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="vous@exemple.com" required style={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: BODY }}>Mot de passe</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required style={inputCls}
            />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: loading ? MUTED : NAVY, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: BRD }} />
          <span className="text-xs" style={{ color: MUTED }}>ou</span>
          <div className="flex-1 h-px" style={{ background: BRD }} />
        </div>

        <div ref={googleBtnRef} style={{ width: '100%', minHeight: 44 }} />

        <p className="text-center text-sm mt-5" style={{ color: MUTED }}>
          Pas encore de compte ?{' '}
          <button onClick={onGoRegister} className="font-semibold transition-colors hover:underline"
            style={{ color: ROYAL }}>
            Créer un compte
          </button>
        </p>
      </div>
    </div>
  );
}
