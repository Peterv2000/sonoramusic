/* ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
   offline.js ÔÇö descargas reales para reproducci├│n SIN CONEXI├ôN.

   Usa la Cache API del navegador (funciona en la PWA y en la app Android de
   Capacitor con el service worker activo). Cada canci├│n se guarda como un
   audio real en la cach├® `ritmo-offline-v1`, y su URL se sirve al reproductor
   desde `blob:` cuando no hay red.

   Todo degrada con elegancia: si la Cache API no est├í disponible, se marca la
   descarga como "simulada" para que la interfaz siga funcionando.
   ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ */

import { apiUrl } from './apiBase.js';

const CACHE = 'ritmo-offline-v1';

export function offlineSupported() {
  return typeof caches !== 'undefined' && typeof fetch !== 'undefined';
}

const urlFor = (id) => `/api/download?id=${encodeURIComponent(id)}`;

/** ┬┐Est├í ya guardada esta canci├│n? */
export async function isOffline(id) {
  if (!offlineSupported()) return false;
  try {
    const c = await caches.open(CACHE);
    return Boolean(await c.match(urlFor(id)));
  } catch { return false; }
}

/** Lista de ids guardados offline. */
export async function listOffline() {
  if (!offlineSupported()) return [];
  try {
    const c = await caches.open(CACHE);
    const keys = await c.keys();
    return keys
      .map((k) => new URL(k.url).searchParams.get('id'))
      .filter(Boolean);
  } catch { return []; }
}

/**
 * Descarga y guarda el audio real de una canci├│n.
 * @param {string} id  id de la pista (videoId)
 * @param {(pct:number)=>void} [onProgress]
 * @returns {Promise<'stored'|'simulated'|'error'>}
 */
export async function downloadTrack(id, onProgress) {
  if (!offlineSupported()) return 'simulated';
  try {
    onProgress?.(5);
    const res = await fetch(apiUrl(urlFor(id)), { headers: { Accept: 'audio/*' } });
    if (!res.ok) return 'simulated';
    // Leemos por trozos para poder reportar progreso.
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body?.getReader?.();
    let received = 0;
    const chunks = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) onProgress?.(Math.min(99, Math.round((received / total) * 100)));
      }
    }
    const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'audio/mp4' });
    if (!blob.size) return 'simulated';
    const c = await caches.open(CACHE);
    await c.put(urlFor(id), new Response(blob, { headers: { 'Content-Type': blob.type } }));
    onProgress?.(100);
    return 'stored';
  } catch { return 'error'; }
}

/** Borra una descarga. */
export async function removeOffline(id) {
  if (!offlineSupported()) return;
  try {
    const c = await caches.open(CACHE);
    await c.delete(urlFor(id));
  } catch { /* noop */ }
}

/** Borra todas las descargas. */
export async function clearOffline() {
  if (!offlineSupported()) return;
  try { await caches.delete(CACHE); } catch { /* noop */ }
}

/**
 * Devuelve una URL reproducible: si est├í offline, un blob local; si no, null
 * (para que el reproductor use su fuente normal).
 */
export async function offlineSrc(id) {
  if (!offlineSupported()) return null;
  try {
    const c = await caches.open(CACHE);
    const hit = await c.match(urlFor(id));
    if (!hit) return null;
    const blob = await hit.blob();
    return URL.createObjectURL(blob);
  } catch { return null; }
}
