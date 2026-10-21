/* ══════════════════════════════════════════════════════════════════════════
   Scraper de búsqueda de YouTube (sin API key, sin dependencias externas).

   Extrae `ytInitialData` de la página de resultados de YouTube y construye
   una lista de canciones con título, canal, duración, ID y miniatura.

   Se ejecuta SOLO en el servidor (Node) porque el navegador no puede leer
   youtube.com por CORS. El cliente llama a `/api/search?q=…`.
   ══════════════════════════════════════════════════════════════════════════ */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Busca en YouTube y devuelve una lista de pistas.
 *  Reintenta con espera creciente ante fallos transitorios (bloqueos suaves). */
export async function searchYouTube(query, { limit = 30, timeout = 12000, retries = 2 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];

  let lastErr;
  for (let intento = 0; intento <= retries; intento++) {
    try {
      return await fetchSearch(q, { limit, timeout });
    } catch (err) {
      lastErr = err;
      // Espera creciente antes de reintentar (700ms, 1400ms, …)
      if (intento < retries) await sleep(700 * (intento + 1) + Math.random() * 400);
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSearch(q, { limit, timeout }) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es&gl=ES`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let html;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const data = extractInitialData(html);
  if (!data) throw new Error('sin ytInitialData (posible bloqueo temporal)');
  return parseVideoRenderers(data).slice(0, limit);
}

/* ---------- extracción del JSON embebido ---------- */
function extractInitialData(html) {
  const marker = 'ytInitialData';
  const at = html.indexOf(marker);
  if (at < 0) return null;

  const braceStart = html.indexOf('{', at);
  if (braceStart < 0) return null;

  // Recorrido contando llaves, respetando cadenas y escapes.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(braceStart, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/* ---------- recorrido del árbol de renderers ---------- */
function collectVideoRenderers(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return out;
  }
  if (node.videoRenderer) out.push(node.videoRenderer);
  for (const key of Object.keys(node)) {
    if (key === 'videoRenderer') continue;
    collectVideoRenderers(node[key], out);
  }
  return out;
}

/* ---------- utilidades de texto ---------- */
function runsText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return '';
}

function parseDuration(text) {
  if (!text) return 0;
  const p = String(text).split(':').map((n) => parseInt(n, 10) || 0);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return 0;
}

function parseViews(text) {
  const t = String(text || '').toLowerCase().replace(/\u00a0/g, ' ');
  const m = t.match(/([\d.,]+)\s*(mil|millones?|mill|k|m|b)?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n)) return 0;
  const u = m[2] || '';
  if (u === 'k' || u === 'mil' || u === 'mill') n *= 1e3;
  else if (u === 'm' || u === 'millón' || u === 'millones') n *= 1e6;
  else if (u === 'b') n *= 1e9;
  return Math.round(n) || 0;
}

/** Limpia sufijos de vídeo y el prefijo "Artista - " del título. */
function cleanTitle(title, artist) {
  const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let s = String(title);
  // Sufijos entre paréntesis/corchetes: (Official Video), [Official Music Video], (Lyric Video)…
  s = s.replace(/\s*[([{][^)\]}]*\b(?:official|oficial|music\s*video|video|vídeo|visualizer|audio|lyric[s]?|hd|4k|remaster(?:ed)?|en\s*vivo|live)\b[^)\]}]*[)\]}]/gi, '');
  // Sufijos con barra: "… | Official Music Video"
  s = s.replace(/\s*\|\s*.*\b(?:official|oficial|music\s*video|lyric[s]?)\b.*$/gi, '');
  // Sufijo suelto al final: "Song Official Video"
  s = s.replace(/\s*[-–—]?\s*(?:official\s*)?(?:music\s*)?(?:video|vídeo|audio|lyric[s]?\s*video)\s*$/gi, '');
  // Prefijo "Artista - " cuando coincide con el canal/artista
  const a = String(artist || '').trim();
  if (a) {
    const e = esc(a);
    s = s.replace(new RegExp(`^\\s*${e}\\s*[-–—]\\s*`, 'i'), '');
    // Variante con dos puntos: "Metallica: Whiskey in the Jar" (canal = Metallica)
    s = s.replace(new RegExp(`^\\s*${e}\\s*:\\s*`, 'i'), '');
    // Variante "Metallica – " ya cubierta arriba; también "Metallica | "
    s = s.replace(new RegExp(`^\\s*${e}\\s*\\|\\s*`, 'i'), '');
  }
  // Prefijo genérico "Artista1 x Artista2 - Canción" / "Artista & Otro - Canción".
  // Solo si lo que queda a la derecha parece el título real (evita cortar
  // canciones que legítimamente llevan guion, p. ej. "Love - Remastered").
  s = s.replace(/^\s*([^\-–—|]{2,60}?)\s*[-–—]\s*(.{2,})$/u, (m, left, right) => {
    const lw = left.split(/\s+/).length;
    const featLike = /[x&×]|\bfeat\b|\bft\b/i.test(left);
    // Cortamos si: parece lista de artistas (feat/x/&), o la izquierda tiene
    // pinta de nombre de artista (1-3 palabras). Con 4 palabras solo si no
    // parece ya el propio título (evita "Love - Remastered" y similares).
    if (featLike) return right;
    // Forma inversa "Canción - Artista": si la derecha es el artista, sobra ella.
    if (a && new RegExp(esc(a), 'i').test(right) && right.split(/\s+/).length <= 3) return left;
    if (lw <= 3) return right;
    return m;
  });
  // Prefijo genérico "Artista: Canción" (canales oficiales usan mucho los dos
  // puntos). Solo si la izquierda es corta (1-4 palabras) y sin dos puntos ya.
  s = s.replace(/^\s*([^:]{2,40}?)\s*:\s*(.{2,})$/u, (m, left, right) => {
    if (left.split(/\s+/).length <= 4 && !/[:]/.test(left)) return right;
    return m;
  });
  // "ft. X ft. X" duplicado → "ft. X"
  s = s.replace(/\b(ft\.?|feat\.?)\s+([^,()|]+?)(?:\s+\1\s+\2)+/gi, '$1 $2');
  return s.replace(/\s+/g, ' ').trim();
}

function parseVideoRenderers(data) {
  const renderers = collectVideoRenderers(data);
  const seen = new Set();
  const out = [];

  for (const v of renderers) {
    const id = v.videoId;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const rawTitle = runsText(v.title);
    if (!rawTitle) continue;

    const dur = parseDuration(runsText(v.lengthText));
    // Fuera directos/estrenos y vídeos gigantes (recopilaciones de horas)
    if (dur === 0 || dur > 3600) continue;

    const thumbs = v.thumbnail?.thumbnails || [];
    const best = thumbs.length ? thumbs[thumbs.length - 1].url : null;
    const artist = runsText(v.ownerText) || runsText(v.longBylineText) || 'YouTube';

    out.push({
      yt: id,
      id: 'yt-' + id,
      title: cleanTitle(rawTitle, artist) || rawTitle,
      artist,
      album: 'YouTube',
      genre: 'YouTube',
      moods: [],
      dur,
      views: parseViews(runsText(v.shortViewCountText) || runsText(v.viewCountText)),
      thumb: best || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      external: true,
    });
  }

  return out;
}
