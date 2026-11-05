# Despliegue 24/7 y alta disponibilidad — Sonora Music

Esta guía describe cómo llevar Sonora Music a producción con Web + APK, sin
puntos únicos de fallo y con las categorías dinámicas, el QA Robot y la cola
inteligente funcionando en tiempo real.

## 1. Arquitectura recomendada

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Web (CDN)   │────▶│  Load balancer   │────▶│  API réplica A   │
│  Vercel /    │     │  health checks   │     ├──────────────────┤
│  Netlify     │     │                  │────▶│  API réplica B   │
└──────────────┘     └──────────────────┘     └────────┬─────────┘
        │                                               │
        │  SSE /api/v1/events                           │
        ▼                                               ▼
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  APK         │     │  Redis Pub/Sub   │◀───▶│  PostgreSQL      │
│  Capacitor   │     │  (eventos)       │     │  primario+réplica│
└──────────────┘     └──────────────────┘     └──────────────────┘
        │                                               │
        ▼                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  CDN de audio/carátulas (Cloudflare R2 + Bunny/CloudFront)        │
└──────────────────────────────────────────────────────────────────┘
```

En este repositorio el almacén es `server/data/*.json` para que todo funcione
sin infraestructura. En producción se sustituye por PostgreSQL + Redis usando
la misma interfaz de `server/live.mjs`:

| Función actual              | Producción                                              |
| --------------------------- | ------------------------------------------------------- |
| `readCategories/saveCategory` | tabla `categories` + caché Redis                      |
| `recordError/readErrors`    | tabla `telemetry_errors` (índice por `created_at`)      |
| `broadcast()` SSE           | Redis Pub/Sub → cada instancia reenvía a sus clientes   |
| `server/data/catalog.json`  | tabla `tracks` + búsqueda/índices                       |
| `/api/cover/*`              | CDN con caché inmutable                                 |

### Esquema mínimo de PostgreSQL

```sql
CREATE TABLE categories (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  tag         text,
  tag_en      text,
  color       text,
  icon        text,
  cover       text,
  genres      text[] NOT NULL DEFAULT '{}',
  queries     text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  sort        integer NOT NULL DEFAULT 100,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telemetry_errors (
  id          text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL,
  severity    text NOT NULL,
  message     text,
  code        text,
  track_id    text,
  title       text,
  artist      text,
  source      text,
  latency_ms  integer DEFAULT 0,
  platform    text,
  app_version text,
  context     jsonb
);
CREATE INDEX telemetry_errors_created_idx ON telemetry_errors (created_at DESC);
```

## 2. Variables de entorno

| Variable | Uso | Ejemplo |
| --- | --- | --- |
| `PORT` | Puerto del API/estático | `4173` |
| `ADMIN_TOKEN` | Protege `/api/v1/admin/*` y `/api/update`. Sin valor = abierto (solo desarrollo) | `cambia-esto` |
| `UPDATE_INTERVAL_MS` | Frecuencia del actualizador | `3600000` |
| `UPDATE_FIRST_DELAY_MS` | Retraso de la primera pasada | `8000` |
| `DATABASE_URL` | PostgreSQL (producción) | `postgres://…` |
| `REDIS_URL` | Pub/Sub y caché (producción) | `redis://…` |
| `CDN_BASE_URL` | Base de audio/carátulas | `https://cdn.sonora.app` |
| `PUBLIC_API_URL` | API para la APK si vive en otro dominio | `https://api.sonora.app` |

Nunca subas un `.env` real al repositorio. En Vercel/Netlify/Railway se
configuran en el panel del proyecto.

## 3. Web (Vercel o Netlify)

1. Build: `npm ci && npm run build` → salida `dist/`.
2. Rewrites:
   - `/api/*` → servicio del API (Railway/Render/Fly/Cloud Run).
   - `/*` → `/index.html` (la app usa `HashRouter`, así que no hace falta
     reescritura profunda, pero evita 404 en rutas antiguas).
3. Cache:
   - `assets/*` con `Cache-Control: public, max-age=31536000, immutable`.
   - `index.html` y `sw.js` con `Cache-Control: no-cache`.
4. El service worker se registra solo en producción y en `http(s)`.

Ejemplo de `netlify.toml`:

```toml
[build]
  command = "npm ci && npm run build"
  publish = "dist"

[[redirects]]
  from = "/api/*"
  to = "https://api.sonora.app/api/:splat"
  status = 200
  force = true
```

## 4. API redundante

- Despliega **dos o más réplicas** del mismo contenedor (`Dockerfile` incluido)
  detrás de un balanceador con health check en `GET /api/health`.
- El balanceador debe reintentar otra réplica ante `502/503/504`.
- `GET /api/v1/events` es SSE de larga duración:
  - configura *idle timeout* alto (≥ 120 s) y `proxy_buffering off`;
  - con varias réplicas, usa Redis Pub/Sub para que un cambio de categoría
    llegue a los clientes conectados a cualquier réplica;
  - si el balanceador no soporta SSE, expón `/api/v1/events` en una sola
    instancia o usa un servicio de eventos dedicado.
- Programa reinicios graduales (*rolling*), nunca apagues todas las réplicas a
  la vez.

### Docker

```bash
docker build -t sonora-api .
docker run -p 4173:4173 \
  -e ADMIN_TOKEN=tu-token \
  -e DATABASE_URL=postgres://… \
  -e REDIS_URL=redis://… \
  -v sonora-data:/app/server/data \
  sonora-api
```

Con `docker compose up --build` se levanta el API con un volumen persistente
para `server/data` (ver `docker-compose.yml`). Para producción, añade las
variables `DATABASE_URL` y `REDIS_URL` cuando migres el almacén JSON.

## 5. Base de datos y failover

- PostgreSQL gestionado (Neon, Supabase, RDS, Cloud SQL) con **réplica de
  lectura** en otra zona.
- Copias automáticas diarias + *point-in-time recovery*.
- La API escribe en el primario y lee catálogo/categorías de la réplica o de
  Redis. Si la réplica falla, el pool vuelve al primario.
- Migraciones versionadas (por ejemplo `db/migrations/*.sql`) ejecutadas antes
  de cada despliegue.
- Redis: modo replicado o gestionado (Upstash/ElastiCache). Si cae, la app debe
  seguir funcionando con la caché en memoria; los eventos SSE se degradan a
  refresco periódico.

## 6. Medios en CDN

1. Sube audio/carátulas a Cloudflare R2, S3 + CloudFront o Bunny Storage.
2. Sirve con `Cache-Control: public, max-age=31536000, immutable` y nombres
   con hash (`track-<hash>.m4a`).
3. Mantén `/api/cover/*` como proxy de compatibilidad, pero en producción
   devuelve directamente la URL del CDN (`CDN_BASE_URL/…`).
4. Configura *range requests* para audio y compresión para JSON.
5. Ten un bucket de respaldo en otra región; el QA Robot registra los 404/500
   para detectar medios caídos.

## 7. APK Android (Capacitor)

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

- Firma el APK/AAB con un keystore guardado fuera del repositorio.
- `capacitor.config.json` debe apuntar al dominio de producción.
- **Actualizaciones en vivo**: la app consulta `GET /api/v1/version` al
  arrancar, cada 15 minutos, al volver a primer plano y cuando el servidor
  emite el evento SSE `version`. El administrador publica desde
  `POST /api/v1/admin/version`:

  ```json
  {
    "apk": {
      "version": "1.4.2",
      "url": "https://cdn.sonora.app/bundles/sonora-1.4.2.zip",
      "notes": "Nueva portada y correcciones de audio",
      "mandatory": false
    }
  }
  ```

  Para que la APK pueda aplicar el bundle sin reinstalarse:

  1. Instala el plugin en el proyecto Android:
     `npm i @capgo/capacitor-updater && npx cap sync android`.
  2. Añade el plugin al `MainActivity` (o deja que Capacitor lo registre) y
     mantén la configuración de `capacitor.config.json`:
     `"CapacitorUpdater": { "autoUpdate": false, "resetWhenUpdate": true,
     "directUpdate": false }`. El chequeo lo dirige `src/api/liveUpdate.js`
     contra nuestra API; `autoUpdate` se deja apagado para no duplicar
     peticiones.
  3. Sube el ZIP del build web (`dist/`) al CDN y publica su URL/versión en el
     panel `#/admin` → **Versión**. No cambies el binario nativo: solo viaja
     JS/CSS.
  4. La app llama `download({ url, version })` y `set({ id })`; el bundle
     nuevo se activa en el siguiente arranque. `notifyAppReady()` se invoca al
     iniciar y, si el bundle no arranca, Capacitor Updater hace rollback.
  5. Mantén siempre la versión anterior publicada para poder revertir y no
     publiques cambios que requieran permisos o plugins nativos nuevos: esos
     sí necesitan un APK nuevo.

  Alternativa sin plugin: apunta `server.url` de Capacitor al dominio web y la
  APK cargará siempre la última versión (requiere red y pierde parte del modo
  offline).
- **Modo offline**: la app cachea catálogo, categorías y últimas carátulas en
  `localStorage`/Cache API. La cola inteligente sigue funcionando con el
  catálogo local y sincroniza al recuperar la red.
- Sube el APK/AAB a Google Play (interno → cerrado → producción) con
  implementación gradual.

## 8. QA Robot y observabilidad

- `POST /api/v1/telemetry/errors` recibe errores de reproducción, carátulas y
  latencia. El cliente los agrupa y deduplica; nunca bloquea la UI.
- Revisa el log en `#/admin` → **QA Robot**.
- Alertas recomendadas:
  - tasa de errores de reproducción > 2 % en 15 min;
  - latencia de inicio (primer play) p95 > 6 s;
  - 404 de carátulas/audio > 1 %;
  - SSE sin clientes conectados durante > 10 min (posible caída de red).
- Retención: 30 días en caliente, archiva a object storage después.

## 9. Comprobaciones antes de publicar

```bash
npm run check:queue
npm run check:i18n
npm run build
curl -s http://localhost:4173/api/health
curl -s http://localhost:4173/api/v1/categories
curl -s "http://localhost:4173/api/v1/tracks?category_id=Latino&limit=20"
```

Checklist:

- [ ] `/api/v1/categories` devuelve las categorías activas y sus contadores.
- [ ] `/api/v1/tracks?category_id=…` devuelve 10–20+ pistas limpias (sin mixes,
      recopilatorios ni vídeos de letras).
- [ ] Cambiar una categoría en `#/admin` se refleja en otra pestaña sin recargar.
- [ ] El widget de soporte muestra diagnóstico, permite reportar y borrar la
      caché local sin cerrar sesión.
- [ ] La radio no salta de español a inglés ni de Latino a pop/rock.
- [ ] El APK arranca sin conexión y reproduce la caché local.
- [ ] Publicar una versión en `#/admin` → **Versión** actualiza la web al
      recargar y ofrece el bundle nuevo a la APK sin reinstalar.
- [ ] `/api/health` responde en todas las réplicas.
