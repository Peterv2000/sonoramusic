import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './state/AppState.jsx';
import { PlayerProvider } from './player/PlayerContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { AdProvider } from './ads/AdManager.jsx';
import './styles.css';
import './styles-pro.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <AppProvider>
            <AdProvider>
              <PlayerProvider>
                <App />
              </PlayerProvider>
            </AdProvider>
          </AppProvider>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

/* PWA: registrar service worker solo en producción y en http(s) */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => { /* sin SW */ });
  });
}

/* Fallback global: si una carátula de YouTube desaparece (404), se sustituye
   por un placeholder en lugar de dejar un hueco roto. */
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#282828"/><text x="240" y="195" font-size="110" text-anchor="middle" fill="#606060">♪</text></svg>'
);
document.addEventListener('error', (e) => {
  const el = e.target;
  if (el?.tagName === 'IMG' && !el.dataset.fallback) {
    el.dataset.fallback = '1';
    el.src = PLACEHOLDER;
  }
}, true);
