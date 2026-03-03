import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { getMe, clearToken } from './api';
import type { User } from './types';
import './index.css';

type Page = 'loading' | 'landing' | 'login' | 'register' | 'app';

function Root() {
  const [page,    setPage]    = useState<Page>('loading');
  const [user,    setUser]    = useState<User | null>(null);

  // On mount : vérifie si un token valide existe déjà
  useEffect(() => {
    getMe()
      .then(u => { setUser(u); setPage('app'); })
      .catch(() => setPage('landing'));
  }, []);

  function handleAuthSuccess() {
    getMe()
      .then(u => { setUser(u); setPage('app'); })
      .catch(() => setPage('login'));
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    setPage('login');
  }

  if (page === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050914' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center animate-pulse"
          style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
          <span className="font-bold text-white text-base">O</span>
        </div>
      </div>
    );
  }

  if (page === 'login') {
    return <LoginPage onSuccess={handleAuthSuccess} onGoRegister={() => setPage('register')} />;
  }

  if (page === 'register') {
    return <RegisterPage onSuccess={handleAuthSuccess} onGoLogin={() => setPage('login')} />;
  }

  if (page === 'app' && user) {
    return (
      <App
        user={user}
        onGoLanding={() => setPage('landing')}
        onLogout={handleLogout}
      />
    );
  }

  // Landing
  return <LandingPage onEnterApp={() => setPage('login')} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
