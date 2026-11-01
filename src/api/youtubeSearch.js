/* ══════════════════════════════════════════════════════════════════════════
   Cliente de búsqueda real en YouTube.

   La web no puede leer youtube.com (CORS) ni incrustar su página de
   resultados (X-Frame-Options). Por eso la app habla con nuestro propio
   servidor, que scrapea YouTube:

       GET /api/search?q=…   →  { query, count, results: [pista, …] }

   Ese servidor es `server/index.mjs` (npm run serve) y es el mismo que sirve
   la app. En la APK (Capacitor) se apunta a la misma ruta `/api/search`, así
   que el comportamiento es idéntico.

   Si el API no está disponible (por ejemplo abriendo `dist` como fichero
   suelto), se degrada con elegancia: se avisa y se ofrece abrir YouTube.
   ══════════════════════════════════════════════════════════════════════════ */

const API = '/api/search';
const CACHE_KEY = 'ritmo-ytsearch-v1';
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 h
const DEFAULT_TIMEOUT = 12000;

const MEM = new Map();

/* Petición JSON con tiempo límite. Nunca deja una promesa colgada si el
   servidor no responde (móvil con mala señal, API caída, etc.). */
async function fetchJSON(path, { timeout = DEFAULT_TIMEOUT, ...opts } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await fetch(path, {
      ...opts,
      headers: { Accept: 'application/json', ...(opts.headers || {}) },
      signal: ctrl?.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
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
 * Busca a través de nuestro servidor y devuelve también el estado del error.
 * `deep` pide una búsqueda profunda (varias páginas → muchos más resultados).
 *
 * Nunca lanza: si YouTube o el servidor fallan, devuelve `{ items: [], error }`
 * para que la interfaz muestre un aviso limpio y pueda ofrecer reintentar.
 */
export async function searchYouTubeDetailed(query, { deep = false, limit, timeout } = {}) {
  const q = (query || '').trim();
  if (!q) return { items: [], error: null, cached: false };

  const key = deep ? q + '::deep' : q;
  const cached = readCache(key);
  if (cached) return { items: cached, error: null, cached: true };

  const params = new URLSearchParams({ q });
  if (deep) params.set('deep', '1');
  if (limit) params.set('limit', String(limit));

  try {
    const data = await fetchJSON(`${API}?${params}`, { timeout });
    const list = Array.isArray(data?.results) ? data.results : [];
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

/** Metadatos mínimos de una pista externa de YouTube. */
export function trackFromYouTubeId(id, title, artist, thumb) {
  return {
    yt: id,
    id: 'yt-' + id,
    title: title || `Audio · ${id}`,
    artist: artist || 'Ritmo',
    album: 'Ritmo',
    genre: 'Ritmo',
    moods: [],
    dur: 0,
    thumb: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
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
  const res = await fetch(path, {
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
