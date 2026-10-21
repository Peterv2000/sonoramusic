/* ══════════════════════════════════════════════════════════════════════════
   Servidor de Ritmo Music.

   Sirve la app (carpeta `dist`) y expone un mini-API:
     GET /api/search?q=…      → búsqueda real en YouTube (scraper, sin key)
     GET /api/lyrics?t=…&a=…  → letra vía LRCLIB (evita CORS en la web)
     GET /api/catalog         → catálogo ampliado (actualizado solo)
     GET /api/charts          → gráficos Top 50 (actualizados solos)
     GET /api/warm            → caché caliente de búsquedas populares
     GET /api/health          → estado (incluye el del actualizador)
     POST /api/update         → fuerza una actualización ahora

   El actualizador automático (`updater.mjs`) refresca catálogo, gráficos y
   caché cada pocas horas mientras el servidor está vivo.

   No requiere dependencias: usa sólo Node estándar (>=18).

       npm run serve       (desarrollo/producción local, puerto 4173)
   ══════════════════════════════════════════════════════════════════════════ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchYouTube } from './youtube.mjs';
import { startAutoUpdater, runUpdate, status as updaterStatus, readJson, CONFIG } from './updater.mjs';

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

async function apiSearch(res, query) {
  const q = (query || '').trim();
  if (!q) return sendJson(res, 400, { error: 'falta el parámetro q' });

  const hit = cache.get(q);
  if (hit && Date.now() - hit.t < TTL) {
    return sendJson(res, 200, { query: q, cached: true, results: hit.v });
  }

  // Caché caliente del actualizador (búsquedas populares pre-descargadas)
  const warm = readJson('warm.json');
  const warmHit = warm?.cache?.[q];
  if (warmHit?.v?.length) {
    cache.set(q, { t: warmHit.t, v: warmHit.v });
    return sendJson(res, 200, { query: q, cached: true, warm: true, results: warmHit.v });
  }

  try {
    const results = await searchYouTube(q);
    cache.set(q, { t: Date.now(), v: results });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    sendJson(res, 200, { query: q, count: results.length, results });
  } catch (err) {
    sendJson(res, 502, { error: 'no se pudo consultar YouTube', detail: String(err.message || err) });
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

  if (pathname === '/api/search') return apiSearch(res, url.searchParams.get('q'));
  if (pathname === '/api/lyrics') return apiLyrics(res, url);
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
