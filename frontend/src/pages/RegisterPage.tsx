import { useState, useEffect, useRef } from 'react';
import { register, getPasswordRules, loginWithGoogle, type PasswordRules } from '../api';

declare const google: {
  accounts: { id: { initialize: (cfg: object) => void; renderButton: (el: HTMLElement, cfg: object) => void } };
};

type Props = {
  onSuccess: () => void;
  onGoLogin: () => void;
};

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
          theme: 'filled_black',
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
        onSuccess();  // admin → connexion directe
      } else {
        setEmailSent(true);  // freemium → vérification email
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'inscription.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
  };

  const btnStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px',
    borderRadius: 10,
    background: loading ? '#312e81' : 'linear-gradient(135deg,#4338ca,#6366f1)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.2s',
    opacity: loading ? 0.7 : 1,
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#050914' }}>
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="orb orb-1" /><div className="orb orb-2" /><div className="noise-overlay" />
        </div>
        <div className="relative z-10 w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
              <span className="font-display font-bold text-base text-white">O</span>
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Offr<span className="text-gradient">IA</span>
            </span>
          </div>
          <div className="rounded-2xl p-8 border border-white/[.08]"
            style={{ background: 'rgba(10,16,28,0.85)', backdropFilter: 'blur(20px)' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-display font-bold text-white text-lg mb-2">Vérifiez votre email</h2>
            <p className="text-slate-400 text-sm mb-1">
              Un lien de confirmation a été envoyé à
            </p>
            <p className="text-indigo-300 font-medium text-sm mb-4">{email}</p>
            <p className="text-slate-500 text-xs mb-6">
              Cliquez sur le lien dans l'email pour activer votre compte et accéder à vos <strong className="text-slate-300">3 générations gratuites</strong>.
            </p>
            <button onClick={onGoLogin}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-indigo-300 transition-colors hover:text-indigo-200"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
              Aller à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#050914' }}>
      {/* Orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="noise-overlay" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
            <span className="font-display font-bold text-base text-white">O</span>
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-white">
            Offr<span className="text-gradient">IA</span>
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 border border-white/[.08]"
          style={{ background: 'rgba(10,16,28,0.85)', backdropFilter: 'blur(20px)' }}
        >
          <h1 className="font-display font-bold text-white text-xl mb-1 text-center">Créer un compte</h1>
          <p className="text-slate-500 text-sm text-center mb-6">Rejoignez OffrIA gratuitement</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Prénom</label>
                <input
                  type="text"
                  value={prenom}
                  onChange={e => setPrenom(e.target.value)}
                  placeholder="Jean"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Nom</label>
                <input
                  type="text"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="Dupont"
                  required
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Mot de passe{' '}
                <span className="text-slate-600">
                  (min. {rules.min_length} caractères{rules.require_digit ? ', 1 chiffre' : ''})
                </span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={rules.min_length}
                required
                style={inputStyle}
              />
            </div>

            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>

          {/* Séparateur */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-slate-600">ou</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Bouton Google — rendu par le SDK GSI */}
          <div ref={googleBtnRef} style={{ width: '100%', minHeight: 44 }} />

          <p className="text-center text-sm text-slate-500 mt-5">
            Déjà un compte ?{' '}
            <button onClick={onGoLogin} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Se connecter
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}