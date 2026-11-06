/* ══════════════════════════════════════════════════════════════════════════
   Actualizaciones en vivo (Web + APK).

   El servidor publica la versión vigente en `GET /api/v1/version` y avisa por
   SSE (`version`) cuando el administrador la cambia. Aquí comprobamos esa
   versión al arrancar, cada 15 minutos y al volver a primer plano.

   · Web/PWA: fuerza la comprobación del service worker; la app nueva entra al
     recargar, sin reinstalar nada.
   · APK: si está instalado Capacitor Updater, descarga el bundle JS/CSS y lo
     activa en caliente. Si el plugin no existe, no se rompe nada: el chequeo
     queda registrado y se puede publicar la actualización por la tienda.
   ══════════════════════════════════════════════════════════════════════════ */

import { apiUrl, eventUrl } from './apiBase.js';

const CHECK_MS = 15 * 60 * 1000;

export function currentVersion() {
  try {
    return document.querySelector('meta[name="app-version"]')?.content || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export function isNativeApp() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function updaterPlugin() {
  try {
    return window.Capacitor?.Plugins?.CapacitorUpdater || null;
  } catch {
    return null;
  }
}

/** Compara versiones tipo 1.2.3 (tolera sufijos como -beta.1). */
export function compareVersions(a, b) {
  const parse = (v) => String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

/** Consulta la versión publicada y decide si hay actualización. */
export async function checkLiveUpdate() {
  const res = await fetch(apiUrl('/api/v1/version'), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const native = isNativeApp();
  let installed = currentVersion();
  if (native) {
    try {
      const cur = await updaterPlugin()?.current?.();
      if (cur?.version) installed = String(cur.version);
    } catch { /* sin plugin: usamos la versión del binario */ }
  }
  const target = native ? String(data?.apk?.version || data?.web || '') : String(data?.web || '');
  return {
    ...data,
    native,
    installed,
    target,
    update: Boolean(target) && compareVersions(target, installed) > 0,
    hasUpdater: Boolean(updaterPlugin()),
  };
}

/** Aplica una actualización nativa si Capacitor Updater está disponible. */
export async function applyNativeUpdate(info) {
  const updater = updaterPlugin();
  if (!updater) return { applied: false, reason: 'plugin-missing' };
  const url = info?.apk?.url;
  const version = info?.apk?.version || info?.target;
  if (!url || !version) return { applied: false, reason: 'no-url' };
  try {
    const downloaded = await updater.download({ url, version });
    if (!downloaded?.id) return { applied: false, reason: 'download-failed' };
    await updater.set({ id: downloaded.id });
    return { applied: true, id: downloaded.id };
  } catch (e) {
    return { applied: false, reason: String(e?.message || e) };
  }
}

async function refreshWeb() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update?.();
    if (reg?.waiting) {
      reg.waiting.postMessage?.({ type: 'SKIP_WAITING' });
      return { updated: true };
    }
  } catch { /* sin service worker */ }
  return { updated: false };
}

/** Comprueba y aplica la actualización correspondiente a la plataforma. */
export async function runLiveUpdate() {
  const info = await checkLiveUpdate();
  let result = { applied: false };
  if (info.native) {
    if (info.update) result = await applyNativeUpdate(info);
  } else if (info.update) {
    result = await refreshWeb();
  }
  try {
    window.dispatchEvent(new CustomEvent('sonora:update', { detail: { ...info, result } }));
  } catch { /* sin window */ }
  return { ...info, result };
}

/**
 * Vigila actualizaciones mientras la app está abierta. Devuelve la función de
 * limpieza. No interrumpe la reproducción: solo recarga si el bundle nativo
 * se activa y la app vuelve a primer plano.
 */
export function watchLiveUpdates() {
  if (typeof window === 'undefined') return () => {};
  let dead = false;
  let timer = null;
  let es = null;

  const run = () => { if (!dead) runLiveUpdate().catch(() => {}); };

  // Capacitor Updater exige confirmar que el bundle arrancó bien; si no, hace
  // rollback automático al anterior. Es inofensivo si el plugin no está.
  try { updaterPlugin()?.notifyAppReady?.(); } catch { /* sin plugin */ }

  run();
  timer = window.setInterval(run, CHECK_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  document.addEventListener('visibilitychange', onVisible);

  try {
    if (typeof EventSource !== 'undefined') {
      es = new EventSource(eventUrl('/api/v1/events'));
      es.addEventListener('version', run);
    }
  } catch { /* SSE no disponible */ }

  return () => {
    dead = true;
    try { window.clearInterval(timer); } catch { /* noop */ }
    document.removeEventListener('visibilitychange', onVisible);
    try { es?.close(); } catch { /* noop */ }
  };
}
