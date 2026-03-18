import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import App from './App';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { getMe, clearToken } from './api';
import type { User } from './types';
import './index.css';

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
      .then(u  => { setUser(u); navigate('/app', { replace: true }); })
      .catch(() => navigate('/login', { replace: true }));
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate('/', { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050914' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center animate-pulse"
          style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
          <span className="font-bold text-white text-base">O</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<LandingPage onEnterApp={() => navigate(user ? '/app' : '/login')} />}
      />
      <Route
        path="/login"
        element={user ? <Navigate to="/app" replace /> : (
          <LoginPage
            onSuccess={handleAuthSuccess}
            onGoRegister={() => navigate('/register')}
            onGoBack={() => navigate('/')}
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
