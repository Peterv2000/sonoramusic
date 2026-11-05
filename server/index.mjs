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
import { startAutoUpdater, runUpdate } from './updater.mjs';
import { handleApi } from './api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 4173);
/* En contenedores se puede fijar HOST=0.0.0.0. Si no se define, Node escucha
   en todas las interfaces (IPv4 + IPv6), que también sirve para Render/Docker. */
const HOST = process.env.HOST || undefined;

/* ---------- Cabeceras de seguridad para los ficheros estáticos ---------- */
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

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

/* ---------- ficheros estáticos (SPA) ---------- */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // fallback SPA
  const file = path.join(DIST, rel);

  // Evita salir de dist
  if (!file.startsWith(DIST)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'prohibido' }));
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      fs.readFile(path.join(DIST, 'index.html'), (e2, index) => {
        if (e2) { res.writeHead(404); res.end('no encontrado'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
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

  applySecurityHeaders(res);

  // Todo el API vive en server/api.mjs y se comparte con Vite (dev/preview).
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'error interno del API' }));
      } else {
        res.end();
      }
    });
    return;
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
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
