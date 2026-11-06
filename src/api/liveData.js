/* ══════════════════════════════════════════════════════════════════════════
   Datos "en vivo" — los genera el actualizador automático del servidor.

   Mientras el catálogo curado (`src/data/catalog.js`) siempre está disponible,
   este módulo aporta lo que el servidor refresca solo cada pocas horas:

       GET /api/catalog  →  { tracks: [pista, …] }          cientos de canciones reales
       GET /api/charts   →  { tabs: [{ label, tracks }] }    Top 50 real por género
       GET /api/warm     →  { cache: { "consulta": [ … ] } } búsquedas ya resueltas

   Todo degrada con elegancia: si el servidor no está (por ejemplo abriendo `dist`
   como fichero), las funciones devuelven `null` y la app sigue con el catálogo
   local. Nada se rompe.

   La respuesta se cachea en memoria + `localStorage` (12 h) para que la app
   arranque al instante y no repita peticiones grandes en cada navegación.
   ══════════════════════════════════════════════════════════════════════════ */

import { mapSearchResults } from './youtubeSearch.js';

const TTL = 1000 * 60 * 60 * 12; // 12 h
const KEY = 'ritmo-livedata-v1';

let mem = null; // { t, catalog, charts, warm }
let revalidated = false;

function readAll({ allowStale = false } = {}) {
  if (mem && (allowStale || Date.now() - mem.t < TTL)) return mem;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && (allowStale || Date.now() - raw.t < TTL)) { mem = raw; return mem; }
  } catch { /* sin caché */ }
  return null;
}

/** Comprueba si el servidor tiene datos más nuevos que la caché y, si es así,
 *  la descarta. Barato (una llamada a /api/health) y solo una vez por sesión.
 *  Así nunca te quedas 12 h con gráficos/catálogo viejos tras una actualización. */
export async function revalidate() {
  if (revalidated) return false;
  revalidated = true;
  const d = readAll();
  if (!d) return false;                       // sin caché: se leerá del servidor de todas formas
  try {
    const h = await fetchJSON('/api/health');
    const serverAt = h?.updater?.lastRun || h?.updatedAt || 0;
    const mine = d.catalog?.updatedAt || d.charts?.updatedAt || 0;
    if (serverAt && mine && serverAt > mine + 60000) {  // margen de 1 min
      mem = null;
      try { localStorage.removeItem(KEY); } catch { /* noop */ }
      return true;                            // había datos nuevos: la caché se limpió
    }
  } catch { /* servidor ausente: se mantiene la caché local */ }
  return false;
}

function writeAll(patch) {
  const base = mem || readAll() || { t: Date.now(), catalog: null, charts: null, warm: null };
  mem = { ...base, ...patch, t: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* cuota */ }
}

/** Marca de tiempo de la última actualización del servidor (o null). */
export function liveUpdatedAt() {
  const d = readAll();
  return d?.catalog?.updatedAt || d?.charts?.updatedAt || null;
}

/** ¿Hay datos en vivo disponibles? */
export function hasLiveData() {
  const d = readAll();
  return Boolean(d && (d.catalog?.tracks?.length || d.charts?.tabs?.length));
}

/** Catálogo en vivo ya cacheado, de forma síncrona.
 *  Lo usa la cola de reproducción para no limitarse al catálogo curado.
 *  `allowStale` lo rescata cuando no hay red: mejor un catálogo de ayer que
 *  una pantalla vacía. */
export function cachedCatalogTracks({ allowStale = false } = {}) {
  const d = readAll({ allowStale });
  return Array.isArray(d?.catalog?.tracks) ? d.catalog.tracks : [];
}

/** Fuerza volver a leer del servidor (ignora la caché en memoria). */
export async function refreshLive() {
  mem = null;
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  await Promise.all([getCatalog(), getCharts(), getWarm()]);
}

async function fetchJSON(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ── Catálogo ampliado ─────────────────────────────────────────────────── */
export async function getCatalog() {
  const cached = readAll();
  if (cached?.catalog) { await revalidate(); }
  const c2 = readAll();
  if (c2?.catalog) return c2.catalog;
  try {
    const data = await fetchJSON('/api/catalog');
    const out = { updatedAt: data.updatedAt || Date.now(), tracks: data.tracks || [] };
    writeAll({ catalog: out });
    return out;
  } catch {
    return null;
  }
}

/* ── Gráficos reales ───────────────────────────────────────────────────── */
export async function getCharts() {
  const cached = readAll();
  if (cached?.charts) { await revalidate(); }
  const c2 = readAll();
  if (c2?.charts) return c2.charts;
  try {
    const data = await fetchJSON('/api/charts');
    const out = { updatedAt: data.updatedAt || Date.now(), tabs: data.tabs || [] };
    writeAll({ charts: out });
    return out;
  } catch {
    return null;
  }
}

/* Devuelve las pistas de una pestaña de gráficos (o []). */
export async function getChartTracks(label) {
  const charts = await getCharts();
  const tab = charts?.tabs?.find((x) => x.label === label || x.id === label);
  return tab?.tracks || [];
}

/* ── Caché caliente de búsquedas ───────────────────────────────────────── */
export async function getWarm() {
  const cached = readAll();
  if (cached?.warm) return cached.warm;
  try {
    const data = await fetchJSON('/api/warm');
    const out = { updatedAt: data.updatedAt || Date.now(), cache: data.cache || {} };
    writeAll({ warm: out });
    return out;
  } catch {
    return null;
  }
}

/* Búsqueda ya resuelta por el servidor (respuesta instantánea), o null. */
export async function warmLookup(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  try {
    const data = await fetchJSON(`/api/warm?q=${encodeURIComponent(q)}`);
    if (!data?.found || !data.results?.length) return null;
    return mapSearchResults(data.results);
  } catch {
    return null;
  }
}

/* Búsqueda resuelta que ya está en la caché local de 12 h. Es síncrona: sirve
   para pintar resultados al instante incluso antes de tocar la red. */
export function cachedWarmResults(query, { allowStale = true } = {}) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const d = readAll({ allowStale });
  const cache = d?.warm?.cache;
  if (!cache || typeof cache !== 'object') return [];

  const keys = Object.keys(cache);
  const exact = keys.find((k) => k.trim().toLowerCase() === q);
  let hit = exact ? cache[exact] : null;
  if (!hit?.v?.length) {
    const loose = keys.find((k) => {
      const kk = k.trim().toLowerCase();
      return cache[k]?.v?.length && (kk.includes(q) || q.includes(kk));
    });
    if (loose) hit = cache[loose];
  }
  return mapSearchResults(Array.isArray(hit?.v) ? hit.v : []);
}
