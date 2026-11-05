/* ══════════════════════════════════════════════════════════════════════════
   API compartida de Ritmo Music.

   La usan tanto `server/index.mjs` (npm start / npm run serve) como el
   middleware de Vite (`vite.config.js`), de modo que el buscador real de
   YouTube funciona igual en desarrollo (5173) y en preview (4173), sin
   necesidad de levantar un segundo servidor.

   Rutas:
     GET  /api/search?q=…          búsqueda real en YouTube
     GET  /api/suggest?q=…         sugerencias de YouTube
     GET  /api/lyrics?t=…&a=…      letras vía LRCLIB
     GET  /api/catalog             catálogo ampliado
     GET  /api/charts              rankings Top 50
     GET  /api/warm?q=…            caché caliente de búsquedas
     GET  /api/health              estado del servidor/actualizador
     POST /api/update              fuerza una actualización
     GET  /api/download?id=…       redirección de descarga
     GET  /api/resolve?title=…     resuelve una pista de YouTube
     GET  /api/admin/*             panel de administración
   ══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchYouTube, searchSuggestions } from './youtube.mjs';
import {
  runUpdate, status as updaterStatus, readJson, writeJson, CONFIG,
  guessGenre, CHART_TABS,
} from './updater.mjs';
/* `guessMoods` del actualizador es asíncrona; aquí se necesita la versión
   síncrona del clasificador para enriquecer la respuesta de búsqueda. */
import { guessMoods } from './ai-curator.mjs';
import { resolveTrack } from './resolver.mjs';
import {
  adminCategories, broadcast, categoryTracks, clearErrors, publicCategories,
  readErrors, recordError, removeCategory, saveCategory, subscribeEvents,
} from './live.mjs';
import {
  catalogTracks, homeFeed, matchesMood, readHistory, recordListen,
} from './home.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

/* ---------- Seguridad: cabeceras + rate limit por IP ---------- */
const ADMIN_TOKEN = (process.env.RITMO_ADMIN_TOKEN || '').trim();

function applyApiHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

const rlBuckets = new Map();
function rateLimit(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const now = Date.now();
  const windowMs = 60_000;
  const max = 240;
  let b = rlBuckets.get(ip);
  if (!b || now - b.start > windowMs) { b = { start: now, count: 0 }; rlBuckets.set(ip, b); }
  b.count += 1;
  if (b.count > max) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'demasiadas solicitudes, intenta en un minuto' }));
    return false;
  }
  return true;
}

function checkAdmin(req, res) {
  if (!ADMIN_TOKEN) return true; // si no hay token configurado, acceso libre (dev)
  const provided = (req.headers['x-admin-token'] || req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const q = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
  if (provided === ADMIN_TOKEN || q === ADMIN_TOKEN) return true;
  res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'token de administrador requerido' }));
  return false;
}

function sendJson(res, code, obj) {
  applyApiHeaders(res);
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

/* ---------- caché en memoria de búsquedas (5 min) ---------- */
const cache = new Map();
const TTL = 5 * 60 * 1000;

/* ══════════════════════════════════════════════════════════════════════════
   Marca blanca: el cliente solo recibe referencias internas de Sonora.

   Los resultados del proveedor se transforman en un contrato neutro:
     track_id · title · artist · album · cover_url · stream_url

   Las carátulas se sirven a través de `/api/cover/…` para que el navegador
   nunca muestre el dominio del proveedor, y `stream_url` es una referencia
   opaca que el reproductor resuelve internamente.
   ══════════════════════════════════════════════════════════════════════════ */

const b64url = (value) => Buffer.from(String(value), 'utf8').toString('base64url');

function decodeRef(value) {
  try {
    return Buffer.from(String(value || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function proxyCover(url) {
  if (!url) return '/icon-192.png';
  if (String(url).startsWith('/')) return url;
  if (!/^https:\/\//i.test(String(url))) return '/icon-192.png';
  return `/api/cover/${b64url(url)}`;
}

function sanitizeSearchResults(list, context = '') {
  if (!Array.isArray(list)) return [];
  /* El query de origen aporta una pista de estilo cuando el proveedor no la
     trae (p. ej. «reggaeton» → Reggaetón y Fiesta latina). El cliente afina
     después con BPM, energía y bailabilidad. */
  const contextGenre = context ? guessGenre(context) : '';
  /* El proveedor marca todo como «Ritmo»; ese valor es un marcador de marca,
     no un género. Solo se conserva un género real. */
  const GENERIC_GENRE = /^(?:ritmo|sonora|otros|other|music|m[úu]sica|varios|unknown|canal|lista)$/i;
  return list.map((item) => {
    if (!item) return null;
    const kind = item.kind || 'video';

    if (kind === 'channel') {
      const source = String(item.yt || '').replace(/^ch-/, '');
      if (!source) return null;
      return {
        track_id: `snr-ch_${b64url(source)}`,
        title: item.title || '',
        artist: 'Artista',
        album: 'Sonora',
        cover_url: proxyCover(item.thumb),
        stream_url: '',
        kind: 'channel',
        views: item.views || 0,
      };
    }

    if (kind === 'playlist') {
      const source = String(item.playlistId || item.yt || '').replace(/^pl-/, '');
      if (!source) return null;
      return {
        track_id: `snr-pl_${b64url(source)}`,
        title: item.title || '',
        artist: item.artist && item.artist !== 'Lista' ? item.artist : 'Sonora',
        album: 'Sonora',
        cover_url: proxyCover(item.thumb),
        stream_url: '',
        kind: 'playlist',
        views: item.views || 0,
      };
    }

    const source = String(item.yt || '').replace(/^yt-/, '');
    if (!source) return null;
    const artist = !item.artist || item.artist === 'Ritmo' ? 'Sonora Music' : item.artist;
    const ownGenre = String(item.genre || '').trim();
    const genre = (ownGenre && !GENERIC_GENRE.test(ownGenre) ? ownGenre : contextGenre) || undefined;
    const moods = Array.isArray(item.moods) && item.moods.length
      ? item.moods
      : (genre ? guessMoods(`${item.title || ''} ${item.artist || ''} ${context}`, genre) : undefined);
    return {
      track_id: `snr_${b64url(source)}`,
      title: item.title || '',
      artist,
      album: 'Sonora',
      cover_url: proxyCover(item.thumb || `https://i.ytimg.com/vi/${source}/hqdefault.jpg`),
      stream_url: `/api/stream/${b64url(source)}`,
      kind: 'video',
      genre,
      moods,
      duration: item.dur || item.duration || 0,
      views: item.views || 0,
    };
  }).filter(Boolean);
}

/* Carátula proxificada: el navegador solo ve `/api/cover/…`. */
function apiCover(res, pathname) {
  const remote = decodeRef(pathname.slice('/api/cover/'.length));
  let allowed = false;
  try {
    const u = new URL(remote);
    allowed = u.protocol === 'https:' &&
      /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/i.test(u.hostname);
  } catch { /* referencia no válida */ }
  if (!allowed) {
    res.writeHead(302, { Location: '/icon-192.png' });
    res.end();
    return;
  }
  res.writeHead(302, {
    Location: remote,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });
  res.end();
}

/* Referencia de reproducción opaca. El cliente la usa solo como identificador;
   nunca contiene una URL visible del proveedor. */
function apiStream(res, pathname) {
  const token = pathname.slice('/api/stream/'.length);
  const source = decodeRef(token);
  if (!/^[\w-]{11}$/.test(source)) {
    sendJson(res, 404, { error: 'referencia no válida' });
    return;
  }
  sendJson(res, 200, { ok: true, track_id: `snr_${token}` });
}

/* ══════════════════════════════════════════════════════════════════════════
   Búsqueda real (global)
   ══════════════════════════════════════════════════════════════════════════ */

function searchNorm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Une resultados sin duplicar la misma pista (mismo track_id). */
function mergeSearchResults(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const item of list || []) {
      const key = item?.track_id || `${item?.title}|${item?.artist}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Respaldo con el catálogo ya sincronizado: la búsqueda nunca queda vacía
    por un fallo temporal del proveedor externo. */
function catalogSearchFallback(q, limit = 40) {
  const catalog = readJson('catalog.json');
  const curated = readJson('curated.json');
  if ((!catalog || !catalog.tracks?.length) && !curated?.catalog?.length) return [];

  try {
    const pool = catalogTracks({ catalog, curated, coverProxy: proxyCover, limit: 2000 });
    const needle = searchNorm(q);
    if (!needle) return [];
    const terms = needle.split(' ').filter(Boolean);
    const scored = [];

    for (const track of pool) {
      const hay = searchNorm([
        track.title, track.artist, track.album, track.genre,
        ...(Array.isArray(track.moods) ? track.moods : []),
      ].join(' '));
      if (!hay.includes(needle)) continue;

      const title = searchNorm(track.title);
      const artist = searchNorm(track.artist);
      let score = terms.every((term) => hay.includes(term)) ? 0.5 : 0;
      if (title === needle || artist === needle) score += 3;
      else if (title.startsWith(needle) || artist.startsWith(needle)) score += 2;
      else if (title.includes(needle) || artist.includes(needle)) score += 1;
      scored.push({ track, score });
    }

    scored.sort((a, b) => b.score - a.score || (Number(b.track.views) || 0) - (Number(a.track.views) || 0));
    const raw = scored.slice(0, Math.max(1, Math.min(120, limit))).map(({ track }) => ({
      yt: String(track.yt || '').replace(/^yt-/, ''),
      title: track.title,
      artist: track.artist,
      album: track.album,
      thumb: track.thumb || track.cover_url,
      dur: track.dur || track.duration,
      views: track.views,
      genre: track.genre,
      moods: track.moods,
      kind: 'video',
    })).filter((item) => item.yt);

    return sanitizeSearchResults(raw, q);
  } catch {
    return [];
  }
}

/** Caché caliente de búsquedas ya resueltas (aunque no sea la consulta exacta). */
function warmSearchFallback(q) {
  const warm = readJson('warm.json');
  const entries = warm?.cache || {};
  const needle = q.toLowerCase();
  const exact = entries[q] || entries[needle];
  if (exact?.v?.length) return sanitizeSearchResults(exact.v, q);

  for (const [key, value] of Object.entries(entries)) {
    if (!value?.v?.length) continue;
    const k = key.toLowerCase();
    if (k.includes(needle) || needle.includes(k)) return sanitizeSearchResults(value.v, q);
  }
  return [];
}

/** Corta una promesa larga: el cliente recibe respuesta antes de rendirse. */
function withSearchBudget(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('búsqueda agotada')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function apiSearch(res, url) {
  const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim();
  if (!q) return sendJson(res, 400, { error: 'falta el parámetro q' });

  // `deep=0` (o ausente) = búsqueda rápida; `deep=1` = muchas más páginas.
  const deep = url.searchParams.get('deep') === '1';
  const limit = Math.min(160, Number(url.searchParams.get('limit')) || (deep ? 80 : 40));
  const pages = Math.min(12, Number(url.searchParams.get('pages')) || (deep ? 6 : 3));
  const key = `${q}|${limit}|${pages}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) {
    const results = sanitizeSearchResults(hit.v, q);
    return sendJson(res, 200, { query: q, deep, cached: true, source: 'sonora', count: results.length, results });
  }

  // Caché caliente del actualizador (solo para búsquedas normales)
  if (!deep) {
    const warm = readJson('warm.json');
    const warmHit = warm?.cache?.[q];
    if (warmHit?.v?.length) {
      cache.set(key, { t: warmHit.t, v: warmHit.v });
      const results = sanitizeSearchResults(warmHit.v, q);
      return sendJson(res, 200, { query: q, deep, cached: true, warm: true, source: 'sonora', count: results.length, results });
    }
  }

  let live = [];
  let liveError = null;
  try {
    /* El cliente espera como máximo 30 s. Si YouTube se atasca, devolvemos el
       respaldo local dentro de ese margen en vez de dejar la búsqueda vacía. */
    live = await withSearchBudget(
      searchYouTube(q, { limit, pages, music: true, retries: 2 }),
      deep ? 26000 : 16000,
    );
  } catch (err) {
    liveError = err;
  }

  let clean = live.length ? sanitizeSearchResults(live, q) : [];
  if (live.length) {
    cache.set(key, { t: Date.now(), v: live });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }

  /* Completamos con el catálogo sincronizado. Sirve tanto si el proveedor
     falló como si devolvió pocos resultados. */
  clean = mergeSearchResults(clean, catalogSearchFallback(q, limit)).slice(0, limit);
  if (clean.length) {
    return sendJson(res, 200, {
      query: q,
      deep,
      source: 'sonora',
      degraded: !live.length,
      count: clean.length,
      results: clean,
    });
  }

  /* Último recurso: resultados antiguos de esta consulta o de la caché
     caliente, para no romper la experiencia por un corte temporal. */
  const stale = hit?.v?.length ? sanitizeSearchResults(hit.v, q) : [];
  const recovered = mergeSearchResults(stale, warmSearchFallback(q)).slice(0, limit);
  if (recovered.length) {
    return sendJson(res, 200, {
      query: q,
      deep,
      source: 'sonora',
      cached: true,
      fallback: true,
      count: recovered.length,
      results: recovered,
    });
  }

  sendJson(res, 502, {
    error: 'no se pudo completar la búsqueda',
    detail: String(liveError?.message || 'sin resultados'),
  });
}

/* GET /api/suggest?q=… → sugerencias de búsqueda (autocompletado en vivo) */
async function apiSuggest(res, url) {
  const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return sendJson(res, 200, { query: q, suggestions: [] });
  try {
    const suggestions = await searchSuggestions(q);
    sendJson(res, 200, { query: q, source: 'sonora', suggestions });
  } catch {
    sendJson(res, 200, { query: q, source: 'sonora', suggestions: [] });
  }
}

/* GET /api/lyrics?t=…&a=… → letras vía LRCLIB */
async function apiLyrics(res, url) {
  const title = url.searchParams.get('t') || '';
  const artist = url.searchParams.get('a') || '';
  if (!title) return sendJson(res, 400, { error: 'falta el parámetro t' });
  try {
    const u = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'RitmoMusic/1.0' } });
    const list = await r.json();
    const best = Array.isArray(list) ? (list.find((x) => x.syncedLyrics) || list[0]) : null;
    if (!best) return sendJson(res, 404, { error: 'sin letra' });
    sendJson(res, 200, { synced: best.syncedLyrics || null, plain: best.plainLyrics || null });
  } catch (err) {
    sendJson(res, 502, { error: String(err.message || err) });
  }
}

async function apiDownload(res, url) {
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return sendJson(res, 400, { error: 'id invalido' });
  const audioUrl = 'https://www.youtube.com/watch?v=' + id;
  res.writeHead(302, { Location: audioUrl, 'Access-Control-Allow-Origin': '*' });
  res.end();
}

/* ══════════════════════════════════════════════════════════════════════════
   Panel de administración
   ══════════════════════════════════════════════════════════════════════════ */

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('cuerpo demasiado grande')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const CURATED_FILE = 'curated.json';

function readCurated() {
  const c = readJson(CURATED_FILE) || {};
  return {
    updatedAt: c.updatedAt || 0,
    catalog: Array.isArray(c.catalog) ? c.catalog : [],
    charts: c.charts && typeof c.charts === 'object' ? c.charts : {},
  };
}

function saveCurated(c) {
  c.updatedAt = Date.now();
  writeJson(CURATED_FILE, c);
  return c;
}

function normalizePick(raw, { tab } = {}) {
  const yt = raw.yt || raw.id;
  if (!yt) return null;
  const text = `${raw.title || ''} ${raw.artist || ''}`;
  const genre = tab || raw.genre || guessGenre(text);
  return {
    yt,
    id: 'yt-' + yt,
    title: raw.title || `YouTube · ${yt}`,
    artist: raw.artist || 'YouTube',
    album: raw.album || 'YouTube',
    genre,
    moods: Array.isArray(raw.moods) && raw.moods.length ? raw.moods : guessMoods(text, genre),
    dur: Number(raw.dur) || 0,
    views: Number(raw.views) || 0,
    thumb: raw.thumb || `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
    external: true,
    curated: true,
  };
}

function apiAdminCategories(res) {
  sendJson(res, 200, {
    charts: CHART_TABS,
    catalogQueries: CONFIG.catalogQueries,
    chartTabs: CONFIG.chartTabs.map((t) => ({
      id: t.id, label: t.label,
      queries: t.queries || [], artists: t.artists || [],
    })),
  });
}

function apiAdminPicks(res) {
  const curated = readCurated();
  const catalog = readJson('catalog.json') || { tracks: [], count: 0 };
  const charts = readJson('charts.json') || { tabs: [] };
  sendJson(res, 200, {
    curated,
    counts: {
      catalog: catalog.tracks?.length || 0,
      charts: charts.tabs?.reduce((n, t) => n + (t.tracks?.length || 0), 0) || 0,
      curatedCatalog: curated.catalog.length,
      curatedCharts: Object.values(curated.charts).reduce((n, a) => n + a.length, 0),
    },
  });
}

async function apiAdminPicksWrite(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: String(e.message || e) }); }

  const curated = readCurated();
  const add = body.add || {};
  const remove = body.remove || {};
  let addedCatalog = 0;
  let addedCharts = 0;
  let removedCatalog = 0;
  let removedCharts = 0;

  if (Array.isArray(add.catalog)) {
    const existing = new Set(curated.catalog.map((t) => t.yt));
    for (const raw of add.catalog) {
      const pick = normalizePick(raw, { tab: raw.genre });
      if (!pick || existing.has(pick.yt)) continue;
      curated.catalog.push(pick);
      existing.add(pick.yt);
      addedCatalog += 1;
    }
  }

  if (add.charts && typeof add.charts === 'object') {
    for (const [tab, list] of Object.entries(add.charts)) {
      if (!Array.isArray(list) || !list.length) continue;
      if (!Array.isArray(curated.charts[tab])) curated.charts[tab] = [];
      const existing = new Set(curated.charts[tab].map((t) => t.yt));
      for (const raw of list) {
        const pick = normalizePick(raw, { tab });
        if (!pick || existing.has(pick.yt)) continue;
        curated.charts[tab].push(pick);
        existing.add(pick.yt);
        addedCharts += 1;
      }
    }
  }

  if (Array.isArray(remove.catalog) && remove.catalog.length) {
    const del = new Set(remove.catalog);
    const before = curated.catalog.length;
    curated.catalog = curated.catalog.filter((t) => !del.has(t.yt));
    removedCatalog = before - curated.catalog.length;
  }

  if (remove.charts && typeof remove.charts === 'object') {
    for (const [tab, ids] of Object.entries(remove.charts)) {
      if (!Array.isArray(ids) || !ids.length || !Array.isArray(curated.charts[tab])) continue;
      const del = new Set(ids);
      const before = curated.charts[tab].length;
      curated.charts[tab] = curated.charts[tab].filter((t) => !del.has(t.yt));
      removedCharts += before - curated.charts[tab].length;
    }
  }

  saveCurated(curated);

  const catalogFile = readJson('catalog.json');
  if (catalogFile) {
    const picks = curated.catalog;
    const ids = new Set(picks.map((t) => t.yt));
    catalogFile.tracks = [...picks, ...(catalogFile.tracks || []).filter((t) => !ids.has(t.yt) && !t.curated)];
    catalogFile.count = catalogFile.tracks.length;
    catalogFile.curated = picks.length;
    catalogFile.updatedAt = Date.now();
    writeJson('catalog.json', catalogFile);
  }

  const chartsFile = readJson('charts.json');
  if (chartsFile?.tabs) {
    for (const tab of chartsFile.tabs) {
      const picks = curated.charts[tab.label] || curated.charts[tab.id] || [];
      const ids = new Set(picks.map((t) => t.yt));
      const rest = (tab.tracks || []).filter((t) => !ids.has(t.yt) && !t.curated);
      tab.tracks = [...picks, ...rest].slice(0, 50).map((tr, i) => ({ ...tr, rank: i + 1 }));
    }
    chartsFile.updatedAt = Date.now();
    writeJson('charts.json', chartsFile);
  }

  sendJson(res, 200, {
    ok: true,
    added: { catalog: addedCatalog, charts: addedCharts },
    removed: { catalog: removedCatalog, charts: removedCharts },
    curated,
  });
}

async function apiAdminSearch(res, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const deep = url.searchParams.get('deep') !== '0';
  const limit = Math.min(120, Number(url.searchParams.get('limit')) || (deep ? 60 : 25));
  if (!q) return sendJson(res, 400, { error: 'falta el parámetro q' });
  try {
    const results = await searchYouTube(q, { limit, pages: deep ? 4 : undefined, music: true });
    sendJson(res, 200, { query: q, source: 'youtube', count: results.length, results });
  } catch (err) {
    sendJson(res, 502, { error: 'no se pudo consultar YouTube', detail: String(err.message || err) });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   API v1: categorías dinámicas, pistas, eventos SSE y QA Robot
   ══════════════════════════════════════════════════════════════════════════ */

function withProxiedCategory(category) {
  return { ...category, cover: proxyCover(category.cover) };
}

function apiV1Categories(res) {
  const catalog = readJson('catalog.json') || { tracks: [] };
  const data = publicCategories(catalog);
  sendJson(res, 200, {
    ok: true,
    updatedAt: data.updatedAt,
    source: 'sonora',
    categories: data.categories.map(withProxiedCategory),
  });
}

function apiV1Tracks(res, url) {
  const categoryId = (url.searchParams.get('category_id') || '').trim();
  const mood = (url.searchParams.get('mood') || '').trim();
  const genre = (url.searchParams.get('genre') || '').trim();
  const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim();
  if (!categoryId && !mood && !genre && !q) {
    return sendJson(res, 400, { error: 'envía category_id, mood, genre o q' });
  }

  const limit = Math.max(1, Math.min(300, Number(url.searchParams.get('limit')) || 150));
  const catalog = readJson('catalog.json');
  const curated = readJson('curated.json');

  let tracks = [];
  let category = null;
  let updatedAt = 0;

  if (categoryId) {
    const result = categoryTracks(categoryId, {
      catalog, curated, limit: Math.max(limit, 120), coverProxy: proxyCover,
    });
    if (!result) return sendJson(res, 404, { error: 'categoría no encontrada o inactiva' });
    tracks = result.tracks;
    category = result.category;
    updatedAt = result.updatedAt;
  } else {
    /* Con mood hay que filtrar sobre el catálogo completo y recortar DESPUÉS;
       si se recorta antes, un chip como «Fiesta latina» pierde casi todas sus
       coincidencias porque viven en la categoría Latino. */
    tracks = catalogTracks({
      catalog, curated, coverProxy: proxyCover, genre, q, limit: mood ? 1200 : 300,
    });
  }

  if (mood) tracks = tracks.filter((track) => matchesMood(track, mood));
  tracks = tracks.slice(0, limit);

  sendJson(res, 200, {
    ok: true,
    category: category ? withProxiedCategory(category) : null,
    mood: mood || null,
    genre: genre || null,
    query: q || null,
    updatedAt,
    source: 'sonora',
    count: tracks.length,
    tracks,
  });
}

/* ── Inicio dinámico + historial de escucha ─────────────────────────────── */

function apiV1Home(res, url) {
  const userId = (url.searchParams.get('user_id') || url.searchParams.get('userId') || '').trim();
  const lang = (url.searchParams.get('lang') || 'es').trim();
  const mood = (url.searchParams.get('mood') || '').trim();
  const seedParam = Number(url.searchParams.get('seed'));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now();
  const limit = Math.max(8, Math.min(24, Number(url.searchParams.get('limit')) || 12));

  const feed = homeFeed({
    userId,
    lang,
    mood,
    seed,
    limit,
    catalog: readJson('catalog.json'),
    curated: readJson('curated.json'),
    coverProxy: proxyCover,
  });
  sendJson(res, 200, feed);
}

async function apiV1History(req, res, url) {
  if (req.method === 'GET') {
    const userId = (url.searchParams.get('user_id') || url.searchParams.get('userId') || '').trim();
    return sendJson(res, 200, { ok: true, source: 'sonora', ...readHistory(userId) });
  }
  let body;
  try { body = await readBody(req, 80_000); } catch (e) { return sendJson(res, 400, { error: String(e.message || e) }); }
  const saved = recordListen({
    userId: body.userId || body.user_id || '',
    track: body.track || body,
    categoryId: body.categoryId || body.category_id || '',
  });
  if (!saved) return sendJson(res, 400, { error: 'pista no válida' });
  sendJson(res, 202, { ok: true, source: 'sonora', ...saved });
}

/* ── Versión / actualización en vivo de la APK ──────────────────────────── */
const VERSION_FILE = 'version.json';

function readVersion() {
  let pkgVersion = '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    if (pkg?.version) pkgVersion = String(pkg.version);
  } catch { /* sin package.json */ }
  const saved = readJson(VERSION_FILE) || {};
  return {
    web: String(saved.web || pkgVersion),
    apk: {
      version: String(saved?.apk?.version || pkgVersion),
      url: String(saved?.apk?.url || ''),
      notes: String(saved?.apk?.notes || ''),
      mandatory: saved?.apk?.mandatory === true,
      updatedAt: Number(saved?.apk?.updatedAt) || 0,
    },
    updatedAt: Number(saved.updatedAt) || 0,
  };
}

function apiV1Version(res) {
  sendJson(res, 200, {
    ok: true,
    source: 'sonora',
    serverTime: Date.now(),
    api: 'v1',
    ...readVersion(),
  });
}

async function apiV1AdminVersion(req, res) {
  let body;
  try { body = await readBody(req, 40_000); } catch (e) { return sendJson(res, 400, { error: String(e.message || e) }); }
  const current = readVersion();
  const patch = body?.apk || body || {};
  const next = {
    web: String(body.web || current.web),
    apk: {
      version: String(patch.version || current.apk.version),
      url: String(patch.url || current.apk.url).slice(0, 500),
      notes: String(patch.notes || current.apk.notes).slice(0, 500),
      mandatory: patch.mandatory === true,
      updatedAt: Date.now(),
    },
    updatedAt: Date.now(),
  };
  writeJson(VERSION_FILE, next);
  broadcast('version', { reason: 'save', at: Date.now(), ...next });
  sendJson(res, 200, { ok: true, source: 'sonora', ...next });
}

function apiV1AdminCategories(res) {
  const catalog = readJson('catalog.json') || { tracks: [] };
  const data = adminCategories(catalog);
  sendJson(res, 200, {
    ok: true,
    ...data,
    source: 'sonora',
  });
}

async function apiV1AdminCategoryWrite(req, res) {
  let body;
  try { body = await readBody(req, 200_000); } catch (e) { return sendJson(res, 400, { error: String(e.message || e) }); }
  try {
    if (req.method === 'DELETE' || body.action === 'delete') {
      const id = body.id || body.category?.id;
      const removed = removeCategory(id);
      if (removed) broadcast('categories', { reason: 'delete', id, at: Date.now() });
      return sendJson(res, removed ? 200 : 404, { ok: removed, removed });
    }
    const raw = body.category || body;
    const category = saveCategory(raw);
    broadcast('categories', { reason: 'save', id: category.id, at: Date.now() });
    sendJson(res, 200, { ok: true, category });
  } catch (e) {
    sendJson(res, 400, { error: String(e.message || e) });
  }
}

function apiV1AdminErrors(res, url) {
  const limit = Number(url.searchParams.get('limit')) || 200;
  sendJson(res, 200, { ok: true, ...readErrors(limit), source: 'sonora' });
}

async function apiV1Telemetry(req, res) {
  let body;
  try { body = await readBody(req, 120_000); } catch (e) { return sendJson(res, 400, { error: String(e.message || e) }); }
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  const entry = recordError(body, { ip });
  broadcast('telemetry', {
    id: entry.id, at: entry.at, type: entry.type, severity: entry.severity,
    title: entry.title, artist: entry.artist, message: entry.message,
  });
  sendJson(res, 202, { ok: true, id: entry.id });
}

/* ══════════════════════════════════════════════════════════════════════════
   Entrada única: devuelve true si la petición era del API.
   ══════════════════════════════════════════════════════════════════════════ */

export async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return false;

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization',
    });
    res.end();
    return true;
  }

  /* Las carátulas son decenas de peticiones por pantalla: no deben consumir el
     cupo de la API ni provocar que la siguiente búsqueda reciba 429. */
  const isCover = pathname.startsWith('/api/cover/');
  if (!isCover && !rateLimit(req, res)) return true;

  if (pathname.startsWith('/api/admin/') || pathname.startsWith('/api/v1/admin/') || pathname === '/api/update') {
    if (!checkAdmin(req, res)) return true;
  }

  if (pathname === '/api/v1/categories') { apiV1Categories(res); return true; }
  if (pathname === '/api/v1/home' || pathname === '/api/v1/home/feed') { apiV1Home(res, url); return true; }
  if (pathname === '/api/v1/history') { await apiV1History(req, res, url); return true; }
  if (pathname === '/api/v1/version') { apiV1Version(res); return true; }
  if (pathname === '/api/v1/tracks') { apiV1Tracks(res, url); return true; }
  if (pathname === '/api/v1/events') { subscribeEvents(req, res); return true; }
  if (pathname === '/api/v1/telemetry/errors') {
    if (req.method === 'POST') await apiV1Telemetry(req, res);
    else sendJson(res, 405, { error: 'usa POST para reportar un error' });
    return true;
  }
  if (pathname === '/api/v1/admin/categories') {
    if (req.method === 'POST' || req.method === 'DELETE') await apiV1AdminCategoryWrite(req, res);
    else apiV1AdminCategories(res);
    return true;
  }
  if (pathname === '/api/v1/admin/version') {
    if (req.method === 'GET') apiV1Version(res);
    else await apiV1AdminVersion(req, res);
    return true;
  }
  if (pathname === '/api/v1/admin/errors') {
    if (req.method === 'DELETE') {
      clearErrors();
      broadcast('telemetry', { reason: 'clear', at: Date.now() });
      sendJson(res, 200, { ok: true });
    } else apiV1AdminErrors(res, url);
    return true;
  }

  if (pathname.startsWith('/api/cover/')) { apiCover(res, pathname); return true; }
  if (pathname.startsWith('/api/stream/')) { apiStream(res, pathname); return true; }
  if (pathname === '/api/search') { await apiSearch(res, url); return true; }
  if (pathname === '/api/suggest') { await apiSuggest(res, url); return true; }
  if (pathname === '/api/lyrics') { await apiLyrics(res, url); return true; }
  if (pathname === '/api/admin/search') { await apiAdminSearch(res, url); return true; }
  if (pathname === '/api/admin/categories') { apiAdminCategories(res); return true; }
  if (pathname === '/api/admin/picks') {
    if (req.method === 'POST') await apiAdminPicksWrite(req, res);
    else apiAdminPicks(res);
    return true;
  }
  if (pathname === '/api/catalog') {
    const data = readJson('catalog.json');
    if (data) sendJson(res, 200, data);
    else sendJson(res, 404, { error: 'aún no hay catálogo; ejecuta npm run update' });
    return true;
  }
  if (pathname === '/api/charts') {
    const data = readJson('charts.json');
    if (data) sendJson(res, 200, data);
    else sendJson(res, 404, { error: 'aún no hay gráficos; ejecuta npm run update' });
    return true;
  }
  if (pathname === '/api/warm') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const data = readJson('warm.json');
    if (!data) { sendJson(res, 404, { error: 'sin caché caliente' }); return true; }
    if (q) {
      const hit = data.cache?.[q];
      sendJson(res, 200, {
        updatedAt: data.updatedAt,
        query: q,
        found: Boolean(hit?.v?.length),
        results: sanitizeSearchResults(hit?.v || [], q),
      });
      return true;
    }
    sendJson(res, 200, { updatedAt: data.updatedAt, queries: data.queries, cache: data.cache || {} });
    return true;
  }
  if (pathname === '/api/update') {
    const force = url.searchParams.get('force') === '1' || req.method === 'POST';
    runUpdate({ force }).catch(() => {});
    sendJson(res, 202, { started: true, force, running: updaterStatus.running });
    return true;
  }
  if (pathname === '/api/download') { await apiDownload(res, url); return true; }
  if (pathname === '/api/resolve') {
    const title = url.searchParams.get('title') || '';
    const artist = url.searchParams.get('artist') || '';
    resolveTrack(title, artist)
      .then((r) => sendJson(res, 200, r))
      .catch(() => sendJson(res, 200, { ok: false }));
    return true;
  }
  if (pathname === '/api/health') {
    const meta = readJson('status.json');
    sendJson(res, 200, {
      ok: true,
      dist: fs.existsSync(DIST),
      uptime: Math.round(process.uptime()),
      source: 'sonora',
      updater: {
        intervalHours: +(CONFIG.intervalMs / 3600000).toFixed(2),
        runs: updaterStatus.runs,
        running: updaterStatus.running,
        lastRun: updaterStatus.lastRun || meta?.updatedAt || null,
        lastError: updaterStatus.lastError,
        nextRunAt: meta?.nextRunAt || null,
      },
    });
    return true;
  }

  sendJson(res, 404, { error: 'ruta de API no encontrada' });
  return true;
}
