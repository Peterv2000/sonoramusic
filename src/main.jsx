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
import './styles-modern.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { reportResourceError } from './api/telemetry.js';
import { startCatalogSync } from './api/catalogStore.js';

/* Catálogo dinámico: descarga el API y refresca al volver la conexión o cuando
   el administrador publica cambios (SSE). La app arranca al instante con la
   caché/semilla y se actualiza en segundo plano. */
startCatalogSync();

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

/* Fallback global: si una carátula de YouTube desaparece (404), se prueba la
   siguiente calidad del CDN (hqdefault → mqdefault → default) antes de caer al
   placeholder. El QA Robot registra el fallo vía installErrorGuard(). */
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#282828"/><text x="240" y="195" font-size="110" text-anchor="middle" fill="#606060">♪</text></svg>'
);
const THUMB_ORDER = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];

function base64UrlDecode(value) {
  try {
    const b64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return '';
  }
}

function base64UrlEncode(value) {
  try {
    return btoa(unescape(encodeURIComponent(String(value))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function nextThumbQuality(url) {
  const match = String(url).match(/\/(maxresdefault|sddefault|hqdefault|mqdefault|default)\.(jpe?g|webp|png)/i);
  if (!match) return '';
  const index = THUMB_ORDER.indexOf(match[1].toLowerCase());
  const next = THUMB_ORDER[index + 1];
  return next ? String(url).replace(match[0], `/${next}.${match[2]}`) : '';
}

/* Las carátulas pueden venir directas del CDN o a través de /api/cover/<b64>. */
function alternateThumb(src) {
  if (!src || src.startsWith('data:')) return '';
  try {
    const parsed = new URL(src, location.href);
    if (parsed.pathname.startsWith('/api/cover/')) {
      const original = base64UrlDecode(parsed.pathname.slice('/api/cover/'.length));
      const next = nextThumbQuality(original);
      return next ? `/api/cover/${base64UrlEncode(next)}` : '';
    }
    return nextThumbQuality(parsed.href);
  } catch {
    return '';
  }
}

function isYouTubeThumb(src) {
  try {
    const parsed = new URL(src, location.href);
    return parsed.pathname.startsWith('/api/cover/')
      || /(^|\.)ytimg\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function advanceThumb(el) {
  if (!el || el.dataset.fallback === 'done') return false;
  const current = el.getAttribute('src') || el.src || '';
  const next = alternateThumb(current);
  if (next && next !== el.src) {
    el.dataset.fallback = 'retry';
    el.src = next;
    return true;
  }
  el.dataset.fallback = 'done';
  el.src = PLACEHOLDER;
  return false;
}

document.addEventListener('error', (e) => {
  const el = e.target;
  if (el?.tagName !== 'IMG') return;
  advanceThumb(el);
}, true);

/* YouTube responde a un ID inexistente con una miniatura genérica de 120×90 y
   código 404. Chrome a veces la decodifica sin disparar `error`, así que también
   vigilamos la carga: cualquier miniatura real (hq/mq) mide al menos 320 px. */
document.addEventListener('load', (e) => {
  const el = e.target;
  if (el?.tagName !== 'IMG' || el.dataset.fallback === 'done') return;
  const src = el.currentSrc || el.src || '';
  if (!isYouTubeThumb(src)) return;
  if (el.naturalWidth && el.naturalWidth <= 160) {
    reportResourceError(el);
    advanceThumb(el);
  }
}, true);
