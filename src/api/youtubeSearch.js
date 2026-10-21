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

const MEM = new Map();

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

/** Busca en YouTube a través de nuestro servidor. */
export async function searchYouTube(query) {
  const q = (query || '').trim();
  if (!q) return [];

  const cached = readCache(q);
  if (cached) return cached;

  try {
    const res = await fetch(`${API}?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data.results) ? data.results : [];
    if (list.length) writeCache(q, list);
    return list;
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
    title: title || `YouTube · ${id}`,
    artist: artist || 'YouTube',
    album: 'YouTube',
    genre: 'YouTube',
    moods: [],
    dur: 0,
    thumb: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    external: true,
  };
}
