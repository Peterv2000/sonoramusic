# Sonora dinámico 24/7 · Supabase + Render + Vercel + APK

Esta guía describe la arquitectura que usa hoy la app: catálogo global en el
servidor, portada y búsqueda en vivo, rotación ponderada y una APK que carga la
última versión sin reinstalarse.

```
┌──────────────────────┐        HTTPS        ┌──────────────────────────┐
│ Web (Vercel/Netlify) │ ─────────────────▶ │ API 24/7 (Render Free)    │
│ React + Vite + PWA   │ ◀───── SSE ─────── │ Node · /api/v1/*          │
└──────────┬───────────┘                     └────────────┬─────────────┘
           │                                              │
           │ misma URL pública                            │ catálogo global
           ▼                                              ▼
┌──────────────────────┐                     ┌──────────────────────────┐
│ APK (Capacitor)      │                     │ Supabase / PostgreSQL    │
│ server.url = web     │                     │ (o JSON persistente)     │
└──────────────────────┘                     └──────────────────────────┘
```

## 1. Qué es dinámico y qué se cachea

| Pieza | Endpoint / almacén | Respaldo sin red |
| --- | --- | --- |
| Catálogo | `GET /api/v1/tracks?sort=random&limit=20` | `localStorage['sonora-catalog-v3']` + semilla offline |
| Categorías | `GET /api/v1/categories` | `localStorage['sonora-categories-v2']` |
| Portada | `GET /api/v1/home/feed?seed=…` | feed local con rotación ponderada |
| Búsqueda | `GET /api/search?q=…` | catálogo cacheado + resultados guardados |
| Historial | `POST /api/v1/history` | `localStorage['sonora-listening-v1']` |
| Cambios en vivo | `GET /api/v1/events` (SSE) | refresco al recuperar conexión |

La rotación usa una **mezcla aleatoria ponderada**: cada recarga cambia el
orden, suben los géneros/artistas que el usuario escucha y bajan las canciones
ya repetidas. El servidor hace lo mismo con `user_id`; el cliente lo replica con
su historial local para que funcione sin conexión.

### Contrato de catálogo

```http
GET /api/v1/tracks?sort=random&limit=20
GET /api/v1/tracks?sort=random&limit=20&seed=12345&user_id=cliente-abc
GET /api/v1/tracks?category_id=Latino&sort=random&limit=30
GET /api/v1/tracks?mood=Fiesta&sort=random&limit=20
GET /api/v1/tracks?sort=popular&limit=50&offset=50
```

`sort` acepta `random`, `popular`, `recent` y `title`. Sin filtros ya no
devuelve error: es el contrato que usan Inicio, la APK y `npm run check:catalog`.

## 2. Base de datos global (Supabase Free)

1. Crea un proyecto en <https://supabase.com> (plan Free, sin tarjeta).
2. Abre **SQL Editor** y ejecuta `docs/supabase-schema.sql`.
3. Copia de **Project Settings → API**:
   - `SUPABASE_URL` → `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` → solo en el servidor (nunca en Vercel ni en la APK).

El esquema incluye `categories`, `tracks`, `user_listening_history`,
`company_licenses` y `telemetry_errors`, con RLS: lectura pública del catálogo
activo y escritura exclusiva del servidor.

> **Estado actual del repositorio:** la API sigue leyendo/escribiendo
> `server/data/*.json` para que el proyecto arranque sin credenciales. El
> esquema de Supabase y las variables están listos para el adaptador de
> almacenamiento; el contrato HTTP no cambia al activarlo. Si despliegas en
> Render Free, el disco es efímero: configura Supabase antes de usar el panel
> de administración en producción.

MongoDB Atlas Free es una alternativa válida: colecciones `categories`,
`tracks`, `listening_history`, `company_licenses` y `telemetry_errors` con los
mismos campos. El cliente no cambia.

## 3. API 24/7 en Render Free

1. Sube el repo a GitHub.
2. Render → **New → Blueprint** → selecciona el repo (lee `render.yaml`).
3. Variables del servicio:

| Variable | Valor |
| --- | --- |
| `ADMIN_TOKEN` | token largo y privado (Render puede generarlo) |
| `UPDATE_DISABLED` | `1` en Free para no gastar CPU con el scraper |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clave de servicio (solo servidor) |

4. Comprueba:

```text
https://TU-API.onrender.com/api/health
https://TU-API.onrender.com/api/v1/tracks?sort=random&limit=20
https://TU-API.onrender.com/api/v1/categories
```

5. **Mantenerlo despierto:** en <https://uptimerobot.com> crea un monitor HTTP(s)
   cada **10 minutos** apuntando a `https://TU-API.onrender.com/api/health`.
   El plan Free de Render duerme a los 15 minutos sin tráfico; el ping evita el
   arranque lento de ~1 minuto.

## 4. Web en Vercel o Netlify

1. Importa el repo. Build: `npm ci && npm run build`. Salida: `dist/`.
2. Variable de entorno del frontend:

```text
VITE_API_BASE_URL=https://TU-API.onrender.com
```

3. Cada `git push` a `main` redespliega la web automáticamente.
4. Comprueba en DevTools → Network que las peticiones van a la URL de Render
   (no a `/api/...` del dominio de Vercel).

La app resuelve la base del API en este orden:

1. `window.__SONORA_API_BASE__` (cambio en caliente desde la consola).
2. `localStorage['sonora-api-base']`.
3. `VITE_API_BASE_URL` compilada.
4. Rutas relativas (desarrollo local con `npm run serve`).

## 5. APK Android

La APK debe cargar la web pública; así el catálogo, la búsqueda y los cambios
del administrador aparecen **sin reinstalar**.

```powershell
# La web publicada que cargará la APK (Vercel/Netlify)
$env:SONORA_APP_URL = "https://sonora.vercel.app"
# El API público que usará el bundle si algún día compilas sin server.url
$env:VITE_API_BASE_URL = "https://TU-API.onrender.com"

npm run apk:build
```

`npm run apk:build` ejecuta `scripts/write-capacitor-config.mjs`, que escribe
`server.url` en `capacitor.config.json`, compila la web y sincroniza Android.
El APK de prueba queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Sin `SONORA_APP_URL`, la APK usa el bundle local de `dist/` y necesita
`VITE_API_BASE_URL` compilada para hablar con el backend. Para una versión
firmada, abre `android/` en Android Studio → *Build → Generate Signed App
Bundle / APK* y guarda el keystore fuera del repositorio.

## 6. Comprobaciones antes de publicar

```powershell
npm run check:i18n
npm run check:queue
npm run check:search
npm run check:hybrid
npm run check:catalog
npm run build
```

Prueba manual:

- [ ] Inicio muestra canciones distintas al recargar (rotación ponderada).
- [ ] Buscar una canción y pulsarla reproduce al instante y llena “A continuación”.
- [ ] Con el móvil en modo avión aparece el catálogo descargado, sin pantallas de error.
- [ ] Al volver la conexión, el catálogo se refresca solo.
- [ ] Un stream 404/500 cambia de fuente sin detener la música ni mostrar un toast.
- [ ] La APK instalada muestra las canciones nuevas sin reinstalarse.
