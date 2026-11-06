/* ══════════════════════════════════════════════════════════════════════════
   Cliente de búsqueda global de Sonora.

   La app habla con nuestro propio servidor, que devuelve un contrato neutro
   de marca blanca:

       GET /api/search?q=…  →  { query, count, results: [
         { track_id, title, artist, album, cover_url, stream_url }, …
       ] }

   Aquí esos objetos se convierten en las pistas internas que ya usan el
   reproductor, la cola y el catálogo. El origen del audio nunca se muestra
   en la interfaz.

   Si el API no está disponible (por ejemplo abriendo `dist` como fichero
   suelto), `hybridSearchFallback` toma el relevo con el catálogo local.
   ══════════════════════════════════════════════════════════════════════════ */

import { apiUrl } from './apiBase.js';

const API = '/api/search';
const CACHE_KEY = 'ritmo-ytsearch-v1';
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 h
/* El servidor responde con respaldo local si YouTube se atasca (16 s rápido,
   26 s profundo). 30 s evita abortar justo antes de recibir esa respuesta. */
const DEFAULT_TIMEOUT = 30000;

const MEM = new Map();

/* ══════════════════════════════════════════════════════════════════════════
   Contrato neutro → pista interna.

   El servidor devuelve `track_id · title · artist · album · cover_url ·
   stream_url`. Aquí se reconstruye la forma que ya usan el reproductor, la
   cola y el catálogo (`yt`, `id`, `thumb`…). Esa traducción es interna: la
   interfaz nunca muestra el origen.
   ══════════════════════════════════════════════════════════════════════════ */

function b64urlDecode(value) {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    const s = raw.replace(/-/g, '+').replace(/_/g, '/');
    return atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  } catch {
    return '';
  }
}

function b64urlEncode(value) {
  try {
    return btoa(String(value || '')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

/** Convierte un resultado ya saneado en una pista interna. */
export function mapSearchResult(item) {
  if (!item) return null;

  // Compatibilidad: elementos guardados en caché con la forma antigua.
  if (item.yt && item.id) {
    return {
      ...item,
      thumb: item.thumb || item.cover_url || '',
      dur: Number(item.dur || item.duration || 0),
      source: 'sonora',
    };
  }

  const trackId = String(item.track_id || item.id || '');
  const kind = item.kind || 'video';
  let encoded = trackId;
  let idPrefix = 'yt-';
  let ytPrefix = '';
  if (trackId.startsWith('snr-ch_')) { encoded = trackId.slice(7); idPrefix = 'yt-ch-'; ytPrefix = 'ch-'; }
  else if (trackId.startsWith('snr-pl_')) { encoded = trackId.slice(7); idPrefix = 'yt-pl-'; ytPrefix = 'pl-'; }
  else if (trackId.startsWith('snr_')) { encoded = trackId.slice(4); }

  const source = b64urlDecode(encoded) || encoded;
  if (!source) return null;

  const thumb = item.cover_url || item.thumb ||
    (kind === 'video' ? `/api/cover/${b64urlEncode(`https://i.ytimg.com/vi/${source}/hqdefault.jpg`)}` : '');

  return {
    yt: ytPrefix + source,
    id: idPrefix + source,
    playlistId: kind === 'playlist' ? source : undefined,
    kind,
    title: item.title || 'Sonora',
    artist: item.artist || 'Sonora Music',
    album: item.album || 'Sonora',
    genre: item.genre || 'Sonora',
    moods: Array.isArray(item.moods) ? item.moods : [],
    dur: Number(item.duration || item.dur || 0),
    duration: Number(item.duration || item.dur || 0),
    views: item.views || 0,
    thumb,
    cover_url: item.cover_url || thumb,
    stream_url: item.stream_url || '',
    source: 'sonora',
    external: true,
  };
}

export function mapSearchResults(list) {
  if (!Array.isArray(list)) return [];
  return list.map(mapSearchResult).filter(Boolean);
}

/* Petición JSON con tiempo límite. Nunca deja una promesa colgada si el
   servidor no responde (móvil con mala señal, API caída, etc.).
   `signal` permite cancelar desde fuera (al cambiar de consulta o desmontar). */
async function fetchJSON(path, { timeout = DEFAULT_TIMEOUT, signal, ...opts } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  const relayAbort = () => { try { ctrl?.abort(); } catch { /* noop */ } };
  if (signal) {
    if (signal.aborted) relayAbort();
    else signal.addEventListener('abort', relayAbort, { once: true });
  }
  try {
    const res = await fetch(apiUrl(path), {
      ...opts,
      headers: { Accept: 'application/json', ...(opts.headers || {}) },
      signal: ctrl?.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', relayAbort);
  }
}

/* ---------- caché ---------- */
function readCache(q) {
  if (MEM.has(q)) return MEM.get(q);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const hit = all[q];
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      MEM.set(q, hit.v);
      return hit.v;
    }
  } catch { /* sin caché */ }
  return null;
}

function writeCache(q, v) {
  MEM.set(q, v);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[q] = { t: Date.now(), v };
    const keys = Object.keys(all);
    if (keys.length > 40) {
      keys.sort((a, b) => all[a].t - all[b].t)
        .slice(0, keys.length - 40)
        .forEach((k) => delete all[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* cuota */ }
}

/**
 * Resultados ya indexados de una consulta. Con `allowStale` también devuelve
 * entradas caducadas: es la red de seguridad cuando no hay conexión o el
 * proveedor tarda demasiado. Nunca lanza.
 */
export function getCachedSearchResults(query, { deep = false, allowStale = false } = {}) {
  const q = (query || '').trim();
  if (!q) return [];

  const key = deep ? q + '::deep' : q;
  if (MEM.has(key)) return MEM.get(key) || [];

  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const hit = all[key] || all[q];
    if (hit && (allowStale || Date.now() - hit.t < CACHE_TTL)) {
      const list = Array.isArray(hit.v) ? hit.v : [];
      MEM.set(key, list);
      return list;
    }
  } catch { /* sin caché */ }
  return [];
}

/**
 * Busca a través de nuestro servidor y devuelve también el estado del error.
 * `deep` pide una búsqueda profunda (varias páginas → muchos más resultados).
 *
 * Nunca lanza: si YouTube o el servidor fallan, devuelve `{ items: [], error }`
 * para que `hybridSearchFallback` decida el respaldo local sin romper la UI.
 */
export async function searchYouTubeDetailed(query, { deep = false, limit, timeout, signal } = {}) {
  const q = (query || '').trim();
  if (!q) return { items: [], error: null, cached: false };

  const key = deep ? q + '::deep' : q;
  const cached = readCache(key);
  if (cached) return { items: cached, error: null, cached: true };

  const params = new URLSearchParams({ q });
  // Enviar siempre el modo: sin esto el servidor hacía búsqueda profunda
  // incluso cuando el usuario solo quería resultados rápidos.
  params.set('deep', deep ? '1' : '0');
  if (limit) params.set('limit', String(limit));

  try {
    const data = await fetchJSON(`${API}?${params}`, { timeout, signal });
    const list = mapSearchResults(Array.isArray(data?.results) ? data.results : []);
    if (list.length) writeCache(key, list);
    return { items: list, error: null, cached: false };
  } catch (err) {
    const error = err?.name === 'AbortError' ? 'timeout' : 'unavailable';
    return { items: [], error, cached: false };
  }
}

/** Compatibilidad: devuelve solo la lista (siempre segura, nunca lanza). */
export async function searchYouTube(query, opts = {}) {
  return (await searchYouTubeDetailed(query, opts)).items;
}

/** Sugerencias de búsqueda (autocompletado en vivo). Nunca lanza. */
export async function suggestYouTube(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  try {
    const data = await fetchJSON(`/api/suggest?q=${encodeURIComponent(q)}`, { timeout: 7000 });
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}

/** Extrae un ID de vídeo de YouTube de un enlace o texto libre. */
export function parseYouTubeId(input) {
  const s = (input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Metadatos mínimos de una pista externa (enlace o referencia directa). */
export function trackFromYouTubeId(id, title, artist, thumb) {
  return {
    yt: id,
    id: 'yt-' + id,
    title: title || `Audio · ${id}`,
    artist: artist || 'Sonora Music',
    album: 'Sonora',
    genre: 'Sonora',
    moods: [],
    dur: 0,
    thumb: thumb || `/api/cover/${b64urlEncode(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`,
    source: 'sonora',
    external: true,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Cliente del PANEL DE ADMINISTRACIÓN (`/api/admin/*`).

   Sirve para que el administrador busque en YouTube (por categoría o canción),
   vea los resultados y elija cuáles subir al catálogo o a los gráficos. Nada
   de esto se cachea: el admin siempre quiere datos frescos.
   ══════════════════════════════════════════════════════════════════════════ */

async function adminJSON(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    headers: { Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

/** ¿El servidor tiene el panel de administración disponible? */
export async function adminAvailable() {
  try {
    await adminJSON('/api/admin/categories');
    return true;
  } catch {
    return false;
  }
}

/** Categorías, géneros y pestañas de gráficos disponibles para elegir. */
export function adminCategories() {
  return adminJSON('/api/admin/categories');
}

/** Búsqueda real para el panel (sin caché). */
export function adminSearch(query, limit = 25) {
  return adminJSON(`/api/admin/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

/** Lo elegido hasta ahora + contadores. */
export function adminPicks() {
  return adminJSON('/api/admin/picks');
}

/** Guarda altas/bajas. `payload = { add, remove }`. */
export function adminSave(payload) {
  return adminJSON('/api/admin/picks', { method: 'POST', body: JSON.stringify(payload) });
}
