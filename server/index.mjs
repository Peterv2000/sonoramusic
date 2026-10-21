/* ══════════════════════════════════════════════════════════════════════════
   Servidor de Ritmo Music.

   Sirve la app (carpeta `dist`) y expone un mini-API:
     GET /api/search?q=…      → búsqueda real en YouTube (scraper profundo, sin key)
     GET /api/suggest?q=…     → sugerencias de búsqueda (autocompletado en vivo)
     GET /api/lyrics?t=…&a=…  → letra vía LRCLIB (evita CORS en la web)
     GET /api/catalog         → catálogo ampliado (actualizado solo)
     GET /api/charts          → gráficos Top 50 (actualizados solos)
     GET /api/warm            → caché caliente de búsquedas populares
     GET /api/health          → estado (incluye el del actualizador)
     POST /api/update         → fuerza una actualización ahora
     GET /api/admin/categories → categorías/pestañas para el panel de admin
     GET /api/admin/search?q=… → búsqueda real para elegir qué subir
     GET/POST /api/admin/picks → leer/guardar la selección del administrador

   El actualizador automático (`updater.mjs`) refresca catálogo, gráficos y
   caché cada pocas horas mientras el servidor está vivo.

   No requiere dependencias: usa sólo Node estándar (>=18).

       npm run serve       (desarrollo/producción local, puerto 4173)
   ══════════════════════════════════════════════════════════════════════════ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchYouTube, searchSuggestions } from './youtube.mjs';
import {
  startAutoUpdater, runUpdate, status as updaterStatus, readJson, writeJson, CONFIG,
  guessGenre, guessMoods, CHART_TABS,
} from './updater.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------- caché en memoria de búsquedas (5 min) ---------- */
const cache = new Map();
const TTL = 5 * 60 * 1000;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

async function apiSearch(res, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return sendJson(res, 400, { error: 'falta el parámetro q' });

  // Búsqueda PROFUNDA: más resultados y más páginas. `deep=1` amplía sola.
  const deep = url.searchParams.get('deep') === '1' || url.searchParams.get('deep') === 'true';
  const limit = Math.min(120, Number(url.searchParams.get('limit')) || (deep ? 60 : 30));
  const pages = Math.min(10, Number(url.searchParams.get('pages')) || (deep ? 4 : undefined));
  const key = `${q}|${limit}|${pages || ''}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) {
    return sendJson(res, 200, { query: q, cached: true, count: hit.v.length, results: hit.v });
  }

  // Caché caliente del actualizador (solo para búsquedas normales)
  if (!deep) {
    const warm = readJson('warm.json');
    const warmHit = warm?.cache?.[q];
    if (warmHit?.v?.length) {
      cache.set(key, { t: warmHit.t, v: warmHit.v });
      return sendJson(res, 200, { query: q, cached: true, warm: true, count: warmHit.v.length, results: warmHit.v });
    }
  }

  try {
    const results = await searchYouTube(q, { limit, pages, music: true });
    cache.set(key, { t: Date.now(), v: results });
    if (cache.size > 150) cache.delete(cache.keys().next().value);
    sendJson(res, 200, { query: q, deep, count: results.length, results });
  } catch (err) {
    sendJson(res, 502, { error: 'no se pudo consultar YouTube', detail: String(err.message || err) });
  }
}

/* GET /api/suggest?q=… → sugerencias de búsqueda (autocompletado en vivo) */
async function apiSuggest(res, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return sendJson(res, 200, { query: q, suggestions: [] });
  try {
    const suggestions = await searchSuggestions(q);
    sendJson(res, 200, { query: q, suggestions });
  } catch (err) {
    sendJson(res, 200, { query: q, suggestions: [] });
  }
}

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

/* ══════════════════════════════════════════════════════════════════════════
   PANEL DE ADMINISTRACIÓN (`/api/admin/*`)

   Permite al administrador buscar en YouTube (por categoría o canción) y
   elegir qué subir al catálogo o a los gráficos. Lo elegido se guarda en
   `curated.json` y el actualizador automático lo respeta (va siempre primero).
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

/* Pistas "elegidas por el admin" ya normalizadas según destino. */
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

/* GET /api/admin/categories → categorías/pestañas disponibles para elegir */
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

/* GET /api/admin/picks → lo elegido hasta ahora + estado del catálogo/gráficos */
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

/* POST /api/admin/picks
   body: { add: { catalog?: [pista], charts?: { [tab]: [pista] } },
           remove: { catalog?: [yt], charts?: { [tab]: [yt] } } }
   Guarda la selección y la refleja al instante en catalog.json / charts.json. */
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

  /* Alta de catálogo */
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

  /* Alta en gráficos por pestaña */
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

  /* Bajas de catálogo */
  if (Array.isArray(remove.catalog) && remove.catalog.length) {
    const del = new Set(remove.catalog);
    const before = curated.catalog.length;
    curated.catalog = curated.catalog.filter((t) => !del.has(t.yt));
    removedCatalog = before - curated.catalog.length;
  }

  /* Bajas en gráficos por pestaña */
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

  /* Refleja los cambios AHORA MISMO en los ficheros que sirve la app */
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
      // Quita (a) las elegidas que ya no lo son y (b) cualquier pista inyectada
      // antes como `curated` que ya no forme parte de la selección actual.
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

/* GET /api/admin/search?q=…&limit=…&deep=1 → búsqueda profunda para el panel */
async function apiAdminSearch(res, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const deep = url.searchParams.get('deep') !== '0';
  const limit = Math.min(120, Number(url.searchParams.get('limit')) || (deep ? 60 : 25));
  if (!q) return sendJson(res, 400, { error: 'falta el parámetro q' });
  try {
    const results = await searchYouTube(q, { limit, pages: deep ? 4 : undefined, music: true });
    sendJson(res, 200, { query: q, count: results.length, results });
  } catch (err) {
    sendJson(res, 502, { error: 'no se pudo consultar YouTube', detail: String(err.message || err) });
  }
}

/* ---------- ficheros estáticos (SPA) ---------- */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // fallback SPA
  const file = path.join(DIST, rel);

  // Evita salir de dist
  if (!file.startsWith(DIST)) return sendJson(res, 403, { error: 'prohibido' });

  fs.readFile(file, (err, buf) => {
    if (err) {
      fs.readFile(path.join(DIST, 'index.html'), (e2, index) => {
        if (e2) { res.writeHead(404); res.end('no encontrado'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(index);
      });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const nocache = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': nocache ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (pathname === '/api/search') return apiSearch(res, url);
  if (pathname === '/api/suggest') return apiSuggest(res, url);
  if (pathname === '/api/lyrics') return apiLyrics(res, url);
  if (pathname === '/api/admin/search') return apiAdminSearch(res, url);
  if (pathname === '/api/admin/categories') return apiAdminCategories(res);
  if (pathname === '/api/admin/picks') {
    if (req.method === 'POST') return apiAdminPicksWrite(req, res);
    return apiAdminPicks(res);
  }
  if (pathname === '/api/catalog') {
    const data = readJson('catalog.json');
    return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: 'aún no hay catálogo; ejecuta npm run update' });
  }
  if (pathname === '/api/charts') {
    const data = readJson('charts.json');
    return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: 'aún no hay gráficos; ejecuta npm run update' });
  }
  if (pathname === '/api/warm') {
    // Con ?q=consulta devuelve solo esa búsqueda; sin ?q devuelve todo el índice
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const data = readJson('warm.json');
    if (!data) return sendJson(res, 404, { error: 'sin caché caliente' });
    if (q) {
      const hit = data.cache?.[q];
      return sendJson(res, 200, {
        updatedAt: data.updatedAt,
        query: q,
        found: Boolean(hit?.v?.length),
        results: hit?.v || [],
      });
    }
    return sendJson(res, 200, { updatedAt: data.updatedAt, queries: data.queries, cache: data.cache || {} });
  }
  if (pathname === '/api/update') {
    // POST (o GET) fuerza una actualización inmediata, fuera del temporizador
    const force = url.searchParams.get('force') === '1' || req.method === 'POST';
    runUpdate({ force }).catch(() => {});
    return sendJson(res, 202, { started: true, force, running: updaterStatus.running });
  }
  if (pathname === '/api/health') {
    const meta = readJson('status.json');
    return sendJson(res, 200, {
      ok: true,
      dist: fs.existsSync(DIST),
      uptime: Math.round(process.uptime()),
      updater: {
        intervalHours: +(CONFIG.intervalMs / 3600000).toFixed(2),
        runs: updaterStatus.runs,
        running: updaterStatus.running,
        lastRun: updaterStatus.lastRun || meta?.updatedAt || null,
        lastError: updaterStatus.lastError,
        nextRunAt: meta?.nextRunAt || null,
      },
    });
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`\n  ▶ Ritmo Music  http://localhost:${PORT}`);
  console.log(`  · buscador real:  http://localhost:${PORT}/api/search?q=bad+bunny`);
  console.log(`  · letras (LRCLIB): http://localhost:${PORT}/api/lyrics?t=Hello&a=Adele`);
  console.log(`  · catálogo auto:  http://localhost:${PORT}/api/catalog`);
  console.log(`  · gráficos auto:  http://localhost:${PORT}/api/charts`);
  console.log(`  · panel admin:    http://localhost:${PORT}/#/admin`);
  if (!fs.existsSync(DIST)) {
    console.warn('  ⚠️  Falta la carpeta dist/. Ejecuta antes:  npm run build\n');
  }
  if (process.env.UPDATE_DISABLED === '1') {
    console.log('  ⏸️  actualizador automático desactivado (UPDATE_DISABLED=1)\n');
  } else if (process.env.RITMO_BOOTSTRAP) {
    // `npm start`: una pasada inmediata (respetando frescura) + temporizador.
    const force = process.env.RITMO_BOOTSTRAP === 'force';
    runUpdate({ force }).catch(() => {}).finally(() => startAutoUpdater());
  } else {
    startAutoUpdater();
  }
});
