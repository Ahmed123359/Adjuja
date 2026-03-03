import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LandingPage from './pages/LandingPage';
import './index.css';

function Root() {
  const [page, setPage] = useState<'landing' | 'app'>('landing');
  if (page === 'app') return <App onGoLanding={() => setPage('landing')} />;
  return <LandingPage onEnterApp={() => setPage('app')} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
