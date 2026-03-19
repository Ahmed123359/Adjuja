import { useState, useEffect, useRef } from 'react';
import { register, getPasswordRules, loginWithGoogle, type PasswordRules } from '../api';

declare const google: {
  accounts: { id: { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void } };
};

type Props = {
  onSuccess: () => void;
  onGoLogin: () => void;
};

const NAVY  = '#1e3a8a';
const ROYAL = '#3b82f6';
const DARK  = '#0f172a';
const BODY  = '#475569';
const MUTED = '#64748b';
const BRD   = '#e2e8f0';

export default function RegisterPage({ onSuccess, onGoLogin }: Props) {
  const [nom,       setNom]       = useState('');
  const [prenom,    setPrenom]    = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [rules, setRules] = useState<PasswordRules>({ min_length: 8, require_digit: true });
  useEffect(() => { getPasswordRules().then(setRules); }, []);

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
      const isAdmin = await register({ nom, prenom, email, password });
      if (isAdmin) {
        onSuccess();
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription.");
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

  // ── Email sent state ───────────────────────────────────
  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#f8fafc' }}>
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
            <span className="font-display font-bold text-sm text-white">O</span>
          </div>
          <span className="font-display font-bold text-xl" style={{ color: DARK }}>OffrIA</span>
        </div>

        <div className="w-full max-w-sm bg-white rounded-2xl p-8 text-center"
          style={{ border: `1px solid ${BRD}`, boxShadow: '0 4px 24px rgba(30,58,138,0.07)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: `${ROYAL}15`, border: `1px solid ${ROYAL}40` }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              strokeWidth={1.8} style={{ color: ROYAL }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display font-bold text-xl mb-2" style={{ color: DARK }}>Vérifiez votre email</h2>
          <p className="text-sm mb-1" style={{ color: BODY }}>Un lien de confirmation a été envoyé à</p>
          <p className="font-semibold text-sm mb-4" style={{ color: ROYAL }}>{email}</p>
          <p className="text-xs mb-6" style={{ color: MUTED }}>
            Cliquez sur le lien dans l'email pour activer votre compte
            et accéder à votre <strong style={{ color: BODY }}>génération gratuite</strong>.
          </p>
          <button onClick={onGoLogin}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: NAVY, color: '#fff' }}>
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  // ── Register form ──────────────────────────────────────
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

        <h1 className="font-display font-bold text-xl text-center mb-1" style={{ color: DARK }}>Créer un compte</h1>
        <p className="text-sm text-center mb-6" style={{ color: MUTED }}>Rejoignez OffrIA gratuitement</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: BODY }}>Prénom</label>
              <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
                placeholder="Jean" required style={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: BODY }}>Nom</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Dupont" required style={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: BODY }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="vous@exemple.com" required style={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: BODY }}>
              Mot de passe{' '}
              <span style={{ color: MUTED, fontWeight: 400 }}>
                (min. {rules.min_length} car.{rules.require_digit ? ', 1 chiffre' : ''})
              </span>
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" minLength={rules.min_length} required style={inputCls} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: loading ? MUTED : NAVY, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: BRD }} />
          <span className="text-xs" style={{ color: MUTED }}>ou</span>
          <div className="flex-1 h-px" style={{ background: BRD }} />
        </div>

        <div ref={googleBtnRef} style={{ width: '100%', minHeight: 44 }} />

        <p className="text-center text-sm mt-5" style={{ color: MUTED }}>
          Déjà un compte ?{' '}
          <button onClick={onGoLogin} className="font-semibold transition-colors hover:underline"
            style={{ color: ROYAL }}>
            Se connecter
          </button>
        </p>
      </div>
    </div>
  );
}
