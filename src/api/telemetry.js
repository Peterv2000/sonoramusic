/* ══════════════════════════════════════════════════════════════════════════
   QA Robot · auditoría silenciosa de fallos (Sonora).

   Captura errores de reproducción, carátulas y latencia, los envía al API
   (`POST /api/v1/telemetry/errors`) y deja que el reproductor se auto-recupere:
   fuente alternativa primero, siguiente canción después. Nunca bloquea la
   interfaz ni muestra mensajes técnicos al usuario.
   ══════════════════════════════════════════════════════════════════════════ */

import { apiUrl } from './apiBase.js';

const SEEN = new Map();
const WINDOW_MS = 15000;
const MAX_PER_MINUTE = 8;
let sentThisMinute = 0;
let minuteStart = Date.now();

function platform() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      return window.Capacitor.getPlatform?.() || 'app';
    }
  } catch { /* web */ }
  return 'web';
}

function appVersion() {
  try {
    return document.querySelector('meta[name="app-version"]')?.content || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function allow(key) {
  const now = Date.now();
  if (now - minuteStart > 60000) { minuteStart = now; sentThisMinute = 0; }
  if (sentThisMinute >= MAX_PER_MINUTE) return false;
  const last = SEEN.get(key) || 0;
  if (now - last < WINDOW_MS) return false;
  SEEN.set(key, now);
  if (SEEN.size > 80) SEEN.delete(SEEN.keys().next().value);
  sentThisMinute += 1;
  return true;
}

/**
 * Envía un diagnóstico al log administrativo.
 * Devuelve `true` si se aceptó para envío (aunque el servidor esté caído).
 */
export function reportIssue(payload = {}, { force = false } = {}) {
  const body = {
    type: payload.type || 'playback',
    severity: payload.severity || 'error',
    message: payload.message || 'fallo de reproducción',
    code: payload.code || '',
    trackId: payload.trackId || payload.track?.id || payload.track?.yt || '',
    title: payload.title || payload.track?.title || '',
    artist: payload.artist || payload.track?.artist || '',
    source: payload.source || payload.track?.source || '',
    latencyMs: payload.latencyMs || 0,
    url: payload.url || '',
    platform: platform(),
    appVersion: appVersion(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    context: payload.context || undefined,
  };
  const key = `${body.type}|${body.code}|${body.trackId}|${body.message}`;
  if (!force && !allow(key)) return false;

  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.('/api/v1/telemetry/errors', blob)) return true;
  } catch { /* beacon no disponible */ }

  fetch(apiUrl('/api/v1/telemetry/errors'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => { /* modo offline: se descarta sin afectar la reproducción */ });
  return true;
}

/** Error de una carátula o recurso visual (404/500, CORS, CDN caída). */
export function reportResourceError(target, { track } = {}) {
  if (!target) return;
  const url = target.currentSrc || target.src || '';
  if (!url) return;
  reportIssue({
    type: 'image',
    severity: 'warning',
    message: `recurso no cargado (${target.tagName || 'IMG'})`,
    url,
    track,
    context: { naturalWidth: target.naturalWidth || 0, naturalHeight: target.naturalHeight || 0 },
  });
}

/* Claves que NUNCA se borran: sesión, ajustes, biblioteca, volumen, historial
   de usuario y descargas. Borrar la caché es una reparación, no un reinicio. */
const PRESERVED_KEYS = new Set([
  'sonora-client-id',
  'ritmo_user',
  'ritmo_users',
  'ritmo-state-v1',
  'ritmo_vol',
  'ritmo-admin-token',
  'ritmo-crossfade-v1',
  'ritmo_ads_config',
  'ritmo_songs_count',
  'ritmo-ai-profile-v1',
]);

const CACHE_PREFIXES = [
  'sonora-home',
  'sonora-categories',
  'sonora-cache',
  'ritmo-livedata',
  'ritmo-lyrics',
  'ritmo-ytsearch',
  'ritmo-cache',
];

const PRESERVED_CACHES = new Set(['ritmo-v3', 'ritmo-offline-v1']);

/**
 * Borra la caché local de la app (feed, catálogo, letras, búsquedas y Cache
 * Storage), conservando sesión, ajustes, biblioteca y canciones descargadas.
 * Devuelve cuántas entradas se eliminaron.
 */
export async function clearLocalCaches() {
  let localKeys = 0;
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || PRESERVED_KEYS.has(key)) continue;
      const match = CACHE_PREFIXES.some((p) => key === p || key.startsWith(p))
        || /(^|[-_])cache([-_]|$)/i.test(key);
      if (match) doomed.push(key);
    }
    doomed.forEach((key) => {
      try { localStorage.removeItem(key); localKeys += 1; } catch { /* noop */ }
    });
  } catch { /* almacenamiento no disponible */ }

  let cacheKeys = 0;
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      const doomed = names.filter((name) => !PRESERVED_CACHES.has(name)
        && /(cache|sonora|ritmo)/i.test(name));
      const results = await Promise.all(doomed.map((name) => caches.delete(name).catch(() => false)));
      cacheKeys = results.filter(Boolean).length;
    }
  } catch { /* Cache Storage no disponible */ }

  return { localKeys, cacheKeys, total: localKeys + cacheKeys };
}

/** Diagnóstico del cliente para el widget de soporte. */
export async function runDiagnostics() {
  const started = Date.now();
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const connection = typeof navigator !== 'undefined'
    ? (navigator.connection?.effectiveType || navigator.connection?.type || '')
    : '';
  let api = false;
  let apiMs = 0;
  let apiError = '';
  try {
    const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
    apiMs = Date.now() - started;
    api = res.ok;
    if (!res.ok) apiError = `HTTP ${res.status}`;
  } catch (e) {
    apiMs = Date.now() - started;
    apiError = String(e?.message || e);
  }
  return {
    online,
    connection,
    api,
    apiMs,
    apiError,
    platform: platform(),
    appVersion: appVersion(),
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    at: Date.now(),
  };
}

/** Captura global de imágenes caídas. Devuelve la función de limpieza. */
export function installErrorGuard() {
  if (typeof window === 'undefined') return () => {};
  const onError = (event) => {
    const target = event?.target;
    if (target && target.tagName === 'IMG') reportResourceError(target);
  };
  window.addEventListener('error', onError, true);
  return () => window.removeEventListener('error', onError, true);
}
