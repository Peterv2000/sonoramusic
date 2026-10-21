/* Letras sincronizadas vía LRCLIB (API libre y gratuita, sin clave).
 * Documentación: https://lrclib.net/docs
 * Si falla la red, devolvemos null y la UI muestra un estado degradado. */

const CACHE_KEY = 'ritmo-lyrics-v1';
const cache = (() => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
})();

let pending = null;

function persist() {
  try {
    const keys = Object.keys(cache);
    // Mantener la caché pequeña (200 entradas)
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((k) => delete cache[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* sin espacio */ }
}

/**
 * Busca la letra de una canción.
 * @returns {Promise<{plain: string, synced: Array<{time:number, text:string}>}|null>}
 */
export async function fetchLyrics(title, artist) {
  const key = `${(title || '').toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}`;
  if (cache[key]) return cache[key];

  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    pending = fetch(url, { headers: { Accept: 'application/json' } });
    const res = await pending;
    if (!res.ok) throw new Error(String(res.status));
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) { cache[key] = null; persist(); return null; }

    // Elegir la mejor coincidencia: con letra sincronizada primero
    const best =
      rows.find((r) => r.syncedLyrics && r.instrumental !== true) ||
      rows.find((r) => r.plainLyrics && r.instrumental !== true) ||
      rows[0];

    const result = {
      plain: best.plainLyrics || '',
      synced: parseSynced(best.syncedLyrics || ''),
      instrumental: !!best.instrumental,
    };
    cache[key] = result;
    persist();
    return result;
  } catch {
    return null; // sin red / bloqueado: degradar en silencio
  } finally {
    pending = null;
  }
}

/** "[00:12.34] línea" → [{time, text}] */
export function parseSynced(raw) {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      if (!m) return null;
      return { time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() };
    })
    .filter((x) => x && x.text);
}

/** Índice de la línea activa para un tiempo dado (búsqueda binaria). */
export function activeLineIndex(synced, time) {
  if (!synced?.length) return -1;
  let lo = 0, hi = synced.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (synced[mid].time <= time + 0.25) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
