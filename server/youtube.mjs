/* ══════════════════════════════════════════════════════════════════════════
   Scraper de búsqueda de YouTube (sin API key, sin dependencias externas).

   Estrategia "profunda y en vivo":

     1. Se usa la API interna `youtubei` (la misma que usa la web de YouTube).
        Devuelve resultados ricos y, sobre todo, un `continuation` para pedir
        MÁS páginas → búsquedas profundas (no solo los primeros 20).
     2. Si la API interna falla (bloqueo, cambio de formato), se cae a raspar
        el HTML de `youtube.com/results` + `ytInitialData` (compatibilidad).
     3. Se pagina hasta cubrir `pages` páginas o llegar a `limit` pistas.
     4. Se busca tanto en YouTube normal COMO en YouTube Music (canciones),
        para cubrir "todo lo que aparece en YouTube".

   Se ejecuta SOLO en el servidor (Node) porque el navegador no puede leer
   youtube.com por CORS. El cliente llama a `/api/search?q=…&deep=…`.
   ══════════════════════════════════════════════════════════════════════════ */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* Clave pública de la API interna de YouTube (la usa la propia web/app).
   No es un secreto: viaja en el JS público de youtube.com. */
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/* Un cliente "WEB" estable. Se fija la versión que YouTube acepta hoy. */
const WEB_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20240401.00.00',
    hl: 'es',
    gl: 'ES',
    userAgent: UA,
  },
};

const MUSIC_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240401.01.00',
    hl: 'es',
    gl: 'ES',
    userAgent: UA,
  },
};

/* Cliente ANDROID: cuando la web bloquea la IP del servidor (Render/Railway),
   la app móvil suele seguir respondiendo. Es el primer proveedor alternativo. */
const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '19.09.37',
    androidSdkVersion: 30,
    hl: 'es',
    gl: 'ES',
    userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
  },
};

/* Instancias públicas de Piped/Invidious. Se consultan en paralelo y solo si
   YouTube no devolvió suficientes resultados: son la red de seguridad para
   servidores cuya IP está bloqueada por el proveedor principal. */
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
];
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
];

/** Busca en YouTube y devuelve una lista de pistas.
 *
 *  @param {string} query
 *  @param {object} [opts]
 *  @param {number} [opts.limit]   máximo de pistas a devolver (por defecto 40)
 *  @param {number} [opts.pages]   páginas a recorrer (búsqueda profunda). Por
 *                                 defecto se calcula desde `limit`.
 *  @param {boolean} [opts.music]  además, buscar en YouTube Music (canciones)
 *  @param {number} [opts.timeout] ms por petición
 *  @param {number} [opts.retries] reintentos con espera creciente
 */
export async function searchYouTube(query, {
  limit = 40, pages, music = true, timeout = 8000, retries = 1,
} = {}) {
  const q = (query || '').trim();
  if (!q) return [];

  // Nº de páginas: ~20 resultados por página.
  const wantPages = Math.max(1, Math.min(pages || Math.ceil(limit / 20) || 1, 10));
  /* Con 12 resultados ya hay una búsqueda usable; no se insiste más para no
     gastar el presupuesto del cliente (16 s) en proveedores caídos. */
  const minWant = Math.min(limit, 12);
  const altTimeout = Math.max(2500, Math.min(timeout, 5000));
  let out = [];
  let lastErr;

  for (let intento = 0; intento <= retries && out.length < minWant; intento++) {
    // 1) Proveedor principal (WEB InnerTube, paginado y con YouTube Music).
    try {
      out = mergeTracks(out, await deepSearch(q, { limit, pages: wantPages, music, timeout }));
    } catch (err) {
      lastErr = err;
    }
    if (out.length >= minWant) break;

    // 2) Proveedores alternativos en paralelo: ANDROID + Piped/Invidious.
    const [android, federated] = await Promise.allSettled([
      deepSearchAndroid(q, { limit, timeout: altTimeout }),
      searchFederated(q, { limit, timeout: altTimeout }),
    ]);
    if (android.status === 'fulfilled') out = mergeTracks(out, android.value);
    if (federated.status === 'fulfilled') out = mergeTracks(out, federated.value);
    if (out.length >= minWant) break;

    // 3) Último recurso dentro de YouTube: raspar el HTML.
    try {
      out = mergeTracks(out, await fetchSearchHtml(q, { limit, timeout: altTimeout }));
    } catch (err) {
      lastErr = lastErr || err;
    }
    if (out.length >= minWant || out.length) break;

    if (intento < retries) await sleep(600 * (intento + 1) + Math.random() * 300);
  }

  if (out.length) return out.slice(0, limit);
  throw lastErr || new Error('sin resultados del proveedor');
}

/** Une listas de pistas sin duplicar por `yt`. */
function mergeTracks(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const track of list) {
      if (!track) continue;
      const key = String(track.yt || track.id || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(track);
    }
  }
  return out;
}

/** El cliente numérico que espera la cabecera `X-YouTube-Client-Name`. */
function clientNumber(context) {
  const name = context?.client?.clientName;
  if (name === 'ANDROID') return '3';
  if (name === 'WEB_REMIX') return '67';
  return '1';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ══════════════════════════════════════════════════════════════════════════
   Búsqueda profunda con la API interna (paginada)
   ══════════════════════════════════════════════════════════════════════════ */

async function deepSearch(query, { limit, pages, music, timeout }) {
  const seen = new Set();
  const out = [];

  // 1) YouTube normal (varios tipos de renderer: vídeos, playlists, canales)
  await paginate({
    query, pages, limit, timeout, seen, out,
    endpoint: 'https://www.youtube.com/youtubei/v1/search?key=' + INNERTUBE_KEY,
    context: WEB_CONTEXT,
    includeChannels: true,
  });

  // 2) YouTube Music (mejores coincidencias de "canción" para el mismo texto)
  if (music && out.length < limit) {
    await paginate({
      query, pages: Math.min(pages, 2), limit, timeout, seen, out,
      endpoint: 'https://music.youtube.com/youtubei/v1/search?key=' + INNERTUBE_KEY,
      context: MUSIC_CONTEXT,
      includeChannels: false,
    });
  }

  return out.slice(0, limit);
}

/** Búsqueda con el cliente ANDROID (funciona cuando WEB bloquea la IP). */
async function deepSearchAndroid(query, { limit = 40, timeout = 5000 } = {}) {
  const seen = new Set();
  const out = [];
  await paginate({
    query,
    pages: Math.max(1, Math.min(2, Math.ceil(limit / 20))),
    limit,
    timeout,
    seen,
    out,
    endpoint: 'https://www.youtube.com/youtubei/v1/search?key=' + INNERTUBE_KEY,
    context: ANDROID_CONTEXT,
    includeChannels: true,
  });
  return out.slice(0, limit);
}

/* ══════════════════════════════════════════════════════════════════════════
   Proveedores federados (Piped / Invidious)

   Devuelven JSON ya listo, sin clave. Si una instancia cae, las demás siguen.
   Solo se usan cuando el proveedor principal no alcanza el mínimo.
   ══════════════════════════════════════════════════════════════════════════ */

async function fetchJson(url, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeDuration(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 3600 ? Math.round(n) : 0;
}

function makeExternalTrack(id, title, artist, dur, thumb, views) {
  if (!id || !title) return null;
  const duration = safeDuration(dur);
  if (!duration) return null;
  return {
    yt: id,
    id: 'yt-' + id,
    kind: 'video',
    title,
    artist: artist || 'Sonora Music',
    album: 'Sonora',
    genre: 'Sonora',
    moods: [],
    dur: duration,
    views: Number(views) || 0,
    thumb: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    external: true,
  };
}

function normalizePiped(item) {
  if (!item || item.type === 'channel' || item.type === 'playlist') return null;
  const fromUrl = String(item.url || '').match(/[?&]v=([\w-]{11})/);
  const id = item.videoId || (fromUrl && fromUrl[1]);
  return makeExternalTrack(
    id,
    item.title,
    item.uploaderName || item.uploader,
    item.duration,
    item.thumbnail,
    item.views,
  );
}

function normalizeInvidious(item) {
  if (!item || item.type === 'channel' || item.type === 'playlist') return null;
  const thumbs = Array.isArray(item.videoThumbnails) ? item.videoThumbnails : [];
  const thumb = thumbs.length ? thumbs[thumbs.length - 1]?.url : item.thumbnail;
  return makeExternalTrack(
    item.videoId,
    item.title,
    item.author,
    item.lengthSeconds,
    thumb,
    item.viewCount,
  );
}

async function searchPiped(instance, query, { limit, timeout }) {
  const data = await fetchJson(
    `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
    timeout,
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map(normalizePiped).filter(Boolean).slice(0, limit);
}

async function searchInvidious(instance, query, { limit, timeout }) {
  const data = await fetchJson(
    `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`,
    timeout,
  );
  const items = Array.isArray(data) ? data : [];
  return items.map(normalizeInvidious).filter(Boolean).slice(0, limit);
}

/** Consulta Piped e Invidious en paralelo. Nunca lanza: devuelve lo que llegue. */
async function searchFederated(query, { limit = 40, timeout = 5000 } = {}) {
  const jobs = [
    ...PIPED_INSTANCES.map((base) => searchPiped(base, query, { limit, timeout })),
    ...INVIDIOUS_INSTANCES.map((base) => searchInvidious(base, query, { limit, timeout })),
  ];
  const settled = await Promise.allSettled(jobs);
  let out = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') out = mergeTracks(out, result.value);
  }
  return out.slice(0, limit);
}

/** Recorre varias páginas de la API interna usando `continuation`. */
async function paginate({ query, pages, limit, timeout, seen, out, endpoint, context, includeChannels }) {
  const DEBUG = process.env.RITMO_DEBUG_SCRAPER === '1';
  let token;
  for (let page = 0; page < pages && out.length < limit; page++) {
    let data;
    try {
      data = await callInnerTube(endpoint, context, token, query, timeout);
    } catch (e) {
      if (DEBUG) console.log('[scraper] página', page, 'error:', e.message);
      break; // sin más páginas (o bloqueo suave): se corta y se devuelve lo que haya
    }
    if (!data) break;

    const { items, next } = parseSearchResults(data, { includeChannels });
    let nuevos = 0;
    for (const tr of items) {
      if (seen.has(tr.yt)) continue;
      seen.add(tr.yt);
      out.push(tr);
      nuevos++;
      if (out.length >= limit) break;
    }
    if (DEBUG) console.log('[scraper] página', page, '→', items.length, 'items,', nuevos, 'nuevos, next=', !!next);

    if (!next || nuevos === 0) break; // no hay más (o página repetida)
    token = next;
    await sleep(120 + Math.random() * 120); // cortesía entre páginas
  }
}

async function callInnerTube(endpoint, context, continuation, query, timeout) {
  const body = continuation
    ? { context, continuation }
    : { context, query, params: 'EgIQAQ%3D%3D' /* filtro: solo vídeos/canciones */ };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'X-YouTube-Client-Name': clientNumber(context),
        'X-YouTube-Client-Version': context.client.clientVersion,
        Origin: 'https://www.youtube.com',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Respaldo: raspado del HTML con ytInitialData
   ══════════════════════════════════════════════════════════════════════════ */

async function fetchSearchHtml(q, { limit, timeout }) {
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
  return parseSearchResults(data, { includeChannels: true }).items.slice(0, limit);
}

/* ---------- extracción del JSON embebido ---------- */
function extractInitialData(html) {
  const marker = 'ytInitialData';
  const at = html.indexOf(marker);
  if (at < 0) return null;

  const braceStart = html.indexOf('{', at);
  if (braceStart < 0) return null;

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

/* ══════════════════════════════════════════════════════════════════════════
   Recorrido del árbol de renderers + parsing
   ══════════════════════════════════════════════════════════════════════════ */

function collectRenderers(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 30) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectRenderers(item, out, depth + 1);
    return out;
  }
  for (const key of ['videoRenderer', 'compactVideoRenderer', 'playlistRenderer',
    'compactPlaylistRenderer', 'channelRenderer', 'gridVideoRenderer', 'reelItemRenderer']) {
    if (node[key]) out.push([key, node[key]]);
  }
  // Se recorre TODO el árbol (no solo claves `…Renderer`): YouTube anida los
  // resultados bajo `primaryContents`, `sectionListRenderer`, etc.
  for (const key of Object.keys(node)) {
    if (key === 'videoRenderer') continue;
    collectRenderers(node[key], out, depth + 1);
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

/** Texto "de la derecha" de un byline (el canal), ignorando el "· " y la fecha. */
function bylineChannel(node) {
  if (!node) return '';
  if (node.simpleText) return node.simpleText.split('·')[0].trim();
  if (Array.isArray(node.runs)) {
    const t = node.runs.map((r) => r.text || '').join('');
    return t.split('·')[0].trim();
  }
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
  const t = String(text || '').toLowerCase().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
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
  s = s.replace(/\s*[([{][^)\]}]*\b(?:official|oficial|music\s*video|video|vídeo|visualizer|audio|lyric[s]?|letra[s]?|hd|4k|remaster(?:ed)?|en\s*vivo|live)\b[^)\]}]*[)\]}]/gi, '');
  s = s.replace(/\s*\|\s*.*\b(?:official|oficial|music\s*video|lyric[s]?)\b.*$/gi, '');
  // Sufijo de álbum tipo "Canción | Nombre del álbum" (típico de los canales
  // oficiales). Se quita solo si la derecha NO parece otra canción/artista.
  s = s.replace(/\s*\|\s*(.{2,60})$/u, (m, right) =>
    (/[-–—:]|\bfeat\b|\bft\b/i.test(right) ? m : ''));
  s = s.replace(/\s*[-–—]?\s*(?:official\s*)?(?:music\s*)?(?:video|vídeo|audio|lyric[s]?\s*video)\s*$/gi, '');
  const a = String(artist || '').trim();
  if (a) {
    const e = esc(a);
    s = s.replace(new RegExp(`^\\s*${e}\\s*[-–—]\\s*`, 'i'), '');
    s = s.replace(new RegExp(`^\\s*${e}\\s*:\\s*`, 'i'), '');
    s = s.replace(new RegExp(`^\\s*${e}\\s*\\|\\s*`, 'i'), '');
  }
  s = s.replace(/^\s*([^\-–—|]{2,60}?)\s*[-–—]\s*(.{2,})$/u, (m, left, right) => {
    const lw = left.split(/\s+/).length;
    const featLike = /[x&×]|\bfeat\b|\bft\b/i.test(left);
    if (featLike) return right;
    if (a && new RegExp(esc(a), 'i').test(right) && right.split(/\s+/).length <= 3) return left;
    if (lw <= 3) return right;
    return m;
  });
  s = s.replace(/^\s*([^:]{2,40}?)\s*:\s*(.{2,})$/u, (m, left, right) => {
    if (left.split(/\s+/).length <= 4 && !/[:]/.test(left)) return right;
    return m;
  });
  s = s.replace(/\b(ft\.?|feat\.?)\s+([^,()|]+?)(?:\s+\1\s+\2)+/gi, '$1 $2');
  return s.replace(/\s+/g, ' ').trim();
}

/* ---------- parseo unificado de resultados ---------- */

/** Devuelve { items: [pista], next: continuationToken|null }. */
function parseSearchResults(data, { includeChannels = true } = {}) {
  const renderers = collectRenderers(data);
  const seen = new Set();
  const out = [];

  for (const [type, node] of renderers) {
    if (type === 'channelRenderer') {
      if (!includeChannels) continue;
      const id = node.channelId;
      if (!id) continue;
      const name = runsText(node.title);
      if (!name) continue;
      const tr = {
        yt: 'ch-' + id,
        id: 'yt-ch-' + id,
        kind: 'channel',
        title: name,
        artist: 'Canal',
        album: 'Ritmo',
        genre: 'Ritmo',
        moods: [],
        dur: 0,
        views: parseViews(runsText(node.videoCountText)),
        thumb: pickThumb(node.thumbnail) || '/icon-192.png',
        external: true,
      };
      if (seen.has(tr.yt)) continue;
      seen.add(tr.yt);
      out.push(tr);
      continue;
    }

    if (type === 'playlistRenderer' || type === 'compactPlaylistRenderer') {
      const listId = node.playlistId;
      if (!listId) continue;
      if (seen.has('pl-' + listId)) continue;
      const title = runsText(node.title);
      if (!title) continue;
      seen.add('pl-' + listId);
      out.push({
        yt: 'pl-' + listId,
        id: 'yt-pl-' + listId,
        kind: 'playlist',
        playlistId: listId,
        title,
        artist: runsText(node.shortBylineText) || bylineChannel(node.longBylineText) || 'Lista',
        album: 'Ritmo',
        genre: 'Ritmo',
        moods: [],
        dur: 0,
        views: parseViews(runsText(node.videoCountText)),
        thumb: pickThumb(node.thumbnail) || (node.videoId ? `https://i.ytimg.com/vi/${node.videoId}/hqdefault.jpg` : '/icon-192.png'),
        external: true,
      });
      continue;
    }

    // Vídeos (varios formatos)
    const id = node.videoId;
    if (!id || seen.has(id)) continue;
    const rawTitle = runsText(node.title);
    if (!rawTitle) continue;

    const dur = parseDuration(runsText(node.lengthText));
    if (dur === 0 || dur > 3600) continue; // fuera directos/estrenos y recopilaciones gigantes

    seen.add(id);
    const artist = bylineChannel(node.ownerText) || bylineChannel(node.longBylineText) ||
      runsText(node.shortBylineText) || 'Ritmo';

    out.push({
      yt: id,
      id: 'yt-' + id,
      kind: 'video',
      title: cleanTitle(rawTitle, artist) || rawTitle,
      rawTitle,
      artist,
      album: 'Ritmo',
      genre: 'Ritmo',
      moods: [],
      dur,
      views: parseViews(runsText(node.shortViewCountText) || runsText(node.viewCountText)),
      thumb: pickThumb(node.thumbnail) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      external: true,
    });
  }

  return { items: out, next: findContinuation(data) };
}

function pickThumb(node) {
  const thumbs = node?.thumbnail?.thumbnails || [];
  return thumbs.length ? thumbs[thumbs.length - 1].url : null;
}

/** Busca el token de «cargar más» del árbol (para la página 2+).
 *
 *  Importante: NO sirve cualquier `continuationCommand`. La respuesta trae
 *  varios (los filtros de «Shorts», «Canales», «Playlists»…). El bueno es el
 *  que cuelga de un `continuationItemRenderer` (el botón «mostrar más»).
 */
function findContinuation(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 20) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const t = findContinuation(item, depth + 1);
      if (t) return t;
    }
    return null;
  }

  // Token correcto: continuationItemRenderer → continuationEndpoint → token
  const itemTok = node.continuationItemRenderer
    ?.continuationEndpoint?.continuationCommand?.token;
  if (itemTok) return itemTok;

  for (const key of Object.keys(node)) {
    const t = findContinuation(node[key], depth + 1);
    if (t) return t;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Sugerencias (autocompletado en vivo)
   ══════════════════════════════════════════════════════════════════════════ */

/** Devuelve una lista de sugerencias de búsqueda de YouTube. */
export async function searchSuggestions(query, { timeout = 6000 } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const url = 'https://suggestqueries-clients6.youtube.com/complete/search' +
    `?client=youtube&ds=yt&hl=es&gl=ES&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const text = await res.text();
    // Respuesta JSONP: window.google.ac.h([...])
    const at = text.indexOf('(');
    const body = at >= 0 ? text.slice(at + 1, text.lastIndexOf(')')) : text;
    const json = JSON.parse(body);
    const list = json?.[1] || [];
    return list.map((x) => (Array.isArray(x) ? x[0] : x)).filter(Boolean).slice(0, 10);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export { cleanTitle, parseViews, parseDuration };
