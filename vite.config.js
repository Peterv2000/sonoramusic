import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/api.mjs';

/* El buscador real de YouTube y el resto del API viven en `server/api.mjs`.
   Este plugin los monta también en Vite para que `npm run dev` y
   `npm run preview` tengan /api/search, /api/suggest, /api/catalog, etc.
   (antes solo funcionaban con `npm start` / `npm run serve`). */
function ritmoApi() {
  const middleware = (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) return next();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'petición inválida' }));
      return;
    }
    handleApi(req, res, url).catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'error interno del API' }));
      } else {
        res.end();
      }
    });
  };

  return {
    name: 'ritmo-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [react(), ritmoApi()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
    port: 5173,
  },
});
