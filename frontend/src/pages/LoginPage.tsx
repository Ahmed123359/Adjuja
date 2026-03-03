import { useState } from 'react';
import { login } from '../api';

type Props = {
  onSuccess:    () => void;
  onGoRegister: () => void;
};

export default function LoginPage({ onSuccess, onGoRegister }: Props) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

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
          <h1 className="font-display font-bold text-white text-xl mb-1 text-center">Connexion</h1>
          <p className="text-slate-500 text-sm text-center mb-6">Accédez à votre espace OffrIA</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={inputStyle}
              />
            </div>

            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Pas encore de compte ?{' '}
            <button onClick={onGoRegister} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Créer un compte
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
