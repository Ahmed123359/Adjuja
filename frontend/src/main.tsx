import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import App from './App';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { getMe, clearToken, startCheckout, CHECKOUT_INTENT_KEY } from './api';
import type { User } from './types';
import './index.css';
import './i18n';

function AppRouter() {
  const navigate  = useNavigate();
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(u  => { setUser(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleAuthSuccess() {
    getMe()
      .then(async u => {
        setUser(u);

        // Intention de checkout mémorisée depuis la page pricing (avant login/register) :
        // on continue vers le paiement au lieu d'atterrir sur le dashboard, pour ne pas
        // perdre "je voulais Starter" en route -- voir PricingSection.tsx::handleStarterClick.
        const plan = localStorage.getItem(CHECKOUT_INTENT_KEY);
        if (plan) {
          localStorage.removeItem(CHECKOUT_INTENT_KEY);
          try {
            const { redirect_url } = await startCheckout(plan);
            window.location.href = redirect_url;
            return;
          } catch {
            // CMI pas configuré ou autre échec : l'utilisateur atterrit normalement dans
            // l'app, où la carte Abonnement du dashboard explique l'erreur.
          }
        }

        navigate('/app', { replace: true });
      })
      .catch(() => navigate('/login', { replace: true }));
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate('/', { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080B1C' }}>
        <img src="/logo-adjuja.png" alt="ADJUJA" className="h-12 w-auto object-contain animate-pulse" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<LandingPage onEnterApp={() => navigate(user ? '/app' : '/login')} onGoRegister={() => navigate('/register')} />}
      />
      <Route
        path="/login"
        element={user ? <Navigate to="/app" replace /> : (
          <LoginPage
            onSuccess={handleAuthSuccess}
            onGoRegister={() => navigate('/register')}
          />
        )}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/app" replace /> : (
          <RegisterPage
            onSuccess={handleAuthSuccess}
            onGoLogin={() => navigate('/login')}
          />
        )}
      />
      <Route
        path="/app/*"
        element={user ? (
          <App
            user={user}
            onGoLanding={() => navigate('/')}
            onLogout={handleLogout}
          />
        ) : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  </React.StrictMode>
);
