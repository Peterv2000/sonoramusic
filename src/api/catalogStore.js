/* ══════════════════════════════════════════════════════════════════════════
   Catálogo dinámico (Sonora).

   Fuente de verdad: el API (`GET /api/v1/tracks`). El catálogo estático ya no
   manda: aquí se descarga el catálogo real, se guarda en `localStorage` y se
   fusiona en memoria en `src/data/catalog.js`. Si la red falla se usa la
   caché (aunque esté caducada) y, como último recurso, la semilla offline.

   Contrato que consume:
     GET /api/v1/tracks?sort=random&limit=20
     GET /api/v1/tracks?category_id=…&sort=random
     GET /api/v1/tracks?mood=…&sort=random

   La rotación usa `weightedShuffle` del historial local, de modo que cada
   recarga muestra un orden distinto y sube los géneros que el usuario escucha.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { TRACKS, mergeCatalogTracks } from '../data/catalog.js';
import { apiUrl, absMedia, eventUrl } from './apiBase.js';
import { recordLocalListen, listeningProfile, weightedShuffle, recommendFromHistory } from '../state/listeningHistory.js';

const CACHE_KEY = 'sonora-catalog-v3';
const TTL = 1000 * 60 * 5;
const PAGE = 300;
const MAX_PAGES = 4;

let memory = null;           // { t, tracks, source, updatedAt }
let hydrated = false;        // ¿ya se fusionó la caché/API en TRACKS?
let inflight = null;
let syncStarted = false;
const subscribers = new Set();

function safeRead() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw && Array.isArray(raw.tracks) && raw.tracks.length) return raw;
  } catch { /* sin caché */ }
  return null;
}

function safeWrite(tracks, meta = {}) {
  const payload = { t: Date.now(), updatedAt: meta.updatedAt || Date.now(), source: meta.source || 'api', tracks };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* cuota */ }
  return payload;
}

function notify(snapshot) {
  for (const fn of subscribers) {
    try { fn(snapshot); } catch { /* suscriptor caído */ }
  }
}

/** Restaura la caché en memoria una sola vez (arranque instantáneo/offline). */
function restoreCache() {
  if (hydrated) return;
  hydrated = true;
  const hit = safeRead();
  if (hit?.tracks?.length) {
    mergeCatalogTracks(hit.tracks);
    memory = { t: hit.t || 0, tracks: hit.tracks, source: hit.source || 'cache', updatedAt: hit.updatedAt || 0 };
  }
}

/* Normaliza la respuesta del API a la forma interna. */
export function normalizeApiTrack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const yt = String(raw.yt || (String(raw.id || '').startsWith('yt-') ? String(raw.id).slice(3) : ''));
  if (!yt) return null;
  const thumb = absMedia(String(raw.thumb || raw.cover_url || `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`));
  const dur = Number(raw.dur || raw.duration || 0);
  return {
    ...raw,
    id: String(raw.id || `yt-${yt}`),
    yt,
    title: String(raw.title || ''),
    artist: String(raw.artist || 'Sonora Music'),
    album: String(raw.album || 'Sonora'),
    genre: String(raw.genre || 'Sonora'),
    moods: Array.isArray(raw.moods) ? raw.moods.filter(Boolean) : [],
    dur,
    duration: dur,
    views: Number(raw.views) || 0,
    year: Number(raw.year) || null,
    thumb,
    cover_url: String(raw.cover_url || thumb),
    source: raw.source || 'sonora',
    external: raw.external !== false,
  };
}

/** Una página del catálogo con filtros y orden del servidor. */
export async function fetchTracks({
  sort = 'random',
  limit = 20,
  offset = 0,
  categoryId = '',
  mood = '',
  genre = '',
  q = '',
  seed = 0,
  userId = '',
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (categoryId) params.set('category_id', categoryId);
  if (mood) params.set('mood', mood);
  if (genre) params.set('genre', genre);
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (seed) params.set('seed', String(seed));
  if (userId) params.set('user_id', userId);

  const res = await fetch(apiUrl(`/api/v1/tracks?${params}`), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    tracks: (Array.isArray(data.tracks) ? data.tracks : []).map(normalizeApiTrack).filter(Boolean),
    updatedAt: Number(data.updatedAt) || 0,
    category: data.category || null,
    count: Number(data.count) || 0,
  };
}

/** Descarga el catálogo completo paginando (máx. 1.200 pistas). */
async function fetchAllPages({ signal } = {}) {
  const all = [];
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { tracks } = await fetchTracks({
      /* `id` es un orden estable: paginar con `recent` (años nulos) puede
         duplicar o saltar pistas entre páginas. */
      sort: 'id',
      limit: PAGE,
      offset: page * PAGE,
      signal,
    });
    for (const track of tracks) {
      if (seen.has(track.yt)) continue;
      seen.add(track.yt);
      all.push(track);
    }
    if (tracks.length < PAGE) break;
  }
  return all;
}

/**
 * Carga/refresca el catálogo dinámico.
 *
 * - Devuelve la caché al instante si es reciente (TTL 5 min).
 * - Si la red falla, conserva caché (aunque sea vieja) y la semilla offline.
 * - Fusiona el resultado en `TRACKS` para todos los consumidores.
 */
export async function loadCatalog({ force = false, signal } = {}) {
  restoreCache();
  if (!force && memory && Date.now() - memory.t < TTL) return catalogPool();

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const tracks = await fetchAllPages({ signal });
      if (!tracks.length) throw new Error('catálogo vacío');
      mergeCatalogTracks(tracks);
      memory = safeWrite(tracks, { source: 'api' });
      hydrated = true;
      notify(catalogSnapshot());
      return catalogPool();
    } catch (err) {
      // Caché persistida (aunque esté caducada) y, si no hay, semilla offline.
      const hit = safeRead();
      if (hit?.tracks?.length) {
        mergeCatalogTracks(hit.tracks);
        memory = memory || { t: hit.t || 0, tracks: hit.tracks, source: 'cache', updatedAt: hit.updatedAt || 0 };
      }
      notify(catalogSnapshot());
      return catalogPool();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Catálogo disponible ahora mismo, sin tocar la red. */
export function catalogPool({ allowStale = true } = {}) {
  restoreCache();
  if (memory?.tracks?.length) return TRACKS.slice();
  if (allowStale) {
    const hit = safeRead();
    if (hit?.tracks?.length) {
      mergeCatalogTracks(hit.tracks);
      memory = { t: hit.t, tracks: hit.tracks, source: 'cache', updatedAt: hit.updatedAt };
    }
  }
  return TRACKS.slice();
}

export function catalogSnapshot() {
  return {
    size: TRACKS.length,
    source: memory?.source || 'seed',
    updatedAt: memory?.updatedAt || 0,
    cachedAt: memory?.t || 0,
  };
}

/**
 * Pistas para una vista (Inicio, categoría, mood) con rotación ponderada.
 * Si el API no responde usa el catálogo en caché/semilla filtrado en cliente.
 */
export async function fetchLiveTracks({
  categoryId = '',
  mood = '',
  genre = '',
  q = '',
  sort = 'random',
  limit = 20,
  seed = Date.now(),
  userId = '',
  signal,
} = {}) {
  try {
    const data = await fetchTracks({ categoryId, mood, genre, q, sort, limit, seed, userId, signal });
    if (data.tracks.length) {
      mergeCatalogTracks(data.tracks);
      return { ...data, source: 'api' };
    }
  } catch { /* respaldo local */ }

  const pool = catalogPool();
  const needle = String(q || '').trim().toLowerCase();
  let list = pool.filter((track) => {
    if (categoryId && track.categoryId !== categoryId) return false;
    if (genre && String(track.genre || '').toLowerCase() !== String(genre).toLowerCase()) return false;
    if (mood && !(Array.isArray(track.moods) ? track.moods : [])
      .some((m) => String(m).toLowerCase() === String(mood).toLowerCase())) return false;
    if (needle && !`${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  if (sort === 'random') list = weightedShuffle(list, { seed, limit });
  else list = list.slice(0, limit);
  return { tracks: list, updatedAt: 0, category: null, count: list.length, source: 'cache' };
}

/** Recomendaciones por consumo (historial local), sin depender del servidor. */
export function recommendTracks({ limit = 20, seed = Date.now(), exclude = [] } = {}) {
  return recommendFromHistory(catalogPool(), {
    limit,
    seed,
    profile: listeningProfile(),
    exclude,
  });
}

/** Guarda una escucha en el historial local (además del envío al servidor). */
export function recordCatalogListen(track, categoryId) {
  return recordLocalListen(track, categoryId);
}

/* ── Suscripción / sincronización en vivo ───────────────────────────────── */

export function subscribeCatalog(fn) {
  if (typeof fn !== 'function') return () => {};
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * Arranca la sincronización: refresca al volver la conexión y cuando el
 * administrador publica cambios por SSE. Idempotente.
 */
export function startCatalogSync() {
  if (syncStarted || typeof window === 'undefined') return () => {};
  syncStarted = true;

  const refresh = () => { loadCatalog({ force: true }).catch(() => {}); };
  const onOnline = () => refresh();
  window.addEventListener('online', onOnline);

  let es = null;
  try {
    if (typeof EventSource !== 'undefined') {
      es = new EventSource(eventUrl('/api/v1/events'));
      es.addEventListener('catalog', refresh);
      es.addEventListener('categories', refresh);
      es.addEventListener('version', () => { loadCatalog({ force: true }).catch(() => {}); });
    }
  } catch { /* sin SSE */ }

  loadCatalog({ force: true }).catch(() => {});

  return () => {
    syncStarted = false;
    window.removeEventListener('online', onOnline);
    try { es?.close(); } catch { /* noop */ }
  };
}

/* ── Hooks ──────────────────────────────────────────────────────────────── */

/** Hook de catálogo general (pistas + estado de sincronización). */
export function useCatalog({ load = true } = {}) {
  const [snapshot, setSnapshot] = useState(() => catalogSnapshot());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const update = () => { if (mounted.current) setSnapshot(catalogSnapshot()); };
    const off = subscribeCatalog(update);
    if (load) loadCatalog().then(update).catch(() => {});
    return () => { mounted.current = false; off(); };
  }, [load]);

  return { ...snapshot, tracks: catalogPool(), refresh: () => loadCatalog({ force: true }) };
}

/**
 * Hook de pistas dinámicas para Inicio/Categorías/Explorar.
 * Refresca al cambiar de filtro y usa el respaldo local sin mostrar errores.
 */
export function useLiveTracks({
  categoryId = '',
  mood = '',
  genre = '',
  q = '',
  sort = 'random',
  limit = 20,
  enabled = true,
} = {}) {
  const [tracks, setTracks] = useState(() => {
    if (!enabled) return [];
    return catalogPool().slice(0, limit);
  });
  const [loading, setLoading] = useState(Boolean(enabled));
  const [source, setSource] = useState('cache');
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) { setTracks([]); setLoading(false); return undefined; }
    const id = ++requestRef.current;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setLoading(true);
    fetchLiveTracks({
      categoryId, mood, genre, q, sort, limit,
      seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
      signal: ctrl?.signal,
    })
      .then((data) => {
        if (id !== requestRef.current) return;
        setTracks(data.tracks);
        setSource(data.source || 'api');
      })
      .catch(() => {
        if (id === requestRef.current) setSource('cache');
      })
      .finally(() => {
        if (id === requestRef.current) setLoading(false);
      });

    return () => {
      try { ctrl?.abort(); } catch { /* noop */ }
    };
  }, [categoryId, mood, genre, q, sort, limit, enabled, nonce]);

  return { tracks, loading, source, refresh: () => setNonce((n) => n + 1) };
}

export const __testing = { normalizeApiTrack, fetchAllPages };
