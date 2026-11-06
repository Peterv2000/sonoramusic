# ▶ Ritmo Music

**Clone al estilo YouTube Music** — PWA instalable + APK Android (Capacitor), con reproducción real desde YouTube embebido, biblioteca, playlists, configuración completa y una **versión PRO** simulada lista para conectar pagos reales.

> ⚠️ **Demo no oficial.** No está afiliado a YouTube ni Google. La reproducción usa el *reproductor embebido oficial de YouTube* (IFrame API). Las funciones "✦ PRO" son un **simulacro** (sin cargos reales) pensado para enganchar Stripe / Google Play Billing después.

---

## 🚀 Arranque rápido (web)

```bash
npm install
npm run dev        # http://localhost:5173
```

**Versión de producción (PWA instalable):**

```bash
npm start          # compila + actualiza el scraper + sirve en http://localhost:4173
```

`npm start` es el modo "todo en uno": compila la web, pasa el actualizador del scraper y
arranca el servidor dejando el temporizador automático activo. Si solo quieres servir lo ya
compilado, usa `npm run build && npm run serve`.

Abre en Chrome/Edge → menú → **"Instalar Ritmo Music"**. Funciona offline (app shell cacheada por service worker).

> `npm run preview` también sirve `dist` y monta el API (buscador real de YouTube,
> catálogo y home) mediante `vite.config.js`. Para producción usa `npm run serve`.

> 🌐 **¿Listo para publicarlo?** Guía paso a paso 100 % gratis (Render y Oracle
> Cloud): **[docs/DESPLIEGUE-GRATIS.md](docs/DESPLIEGUE-GRATIS.md)**.

---

## 🔎 Búsqueda de cualquier canción o artista (scraper propio)

El catálogo local es **curado** (unas 44 canciones con IDs conocidos, para que todo suene
garantizado). Para encontrar **cualquier** canción/artista del mundo hay un buscador real
de YouTube, servido por nuestro propio backend:

```
GET /api/search?q=bad+bunny    →  { query, count, results: [ { yt, title, artist, dur, views, thumb } ] }
GET /api/lyrics?t=Hello&a=Adele →  { synced, plain }   (letras vía LRCLIB)
GET /api/health                 →  { ok, dist, uptime }
```

`server/youtube.mjs` **scrapea** la página de resultados de YouTube (extrae `ytInitialData`),
sin claves de API ni proxies de terceros. El navegador no puede hacerlo directamente porque
YouTube bloquea el acceso por CORS y prohíbe incrustar su página de resultados
(`X-Frame-Options: sameorigin`); por eso va por el servidor, que tarda ~1 s por búsqueda y
cachea los resultados 5 minutos.

Flujo en la app: si lo que buscas no está en el catálogo, el buscador consulta YouTube y
muestra los resultados reales bajo **«▶ YouTube · N canciones»** — los reproduces con un clic.

---

## 🔄 Actualizaciones automáticas (catálogo, gráficos y caché)

El scraper puede refrescar TODO solo, sin que toques nada. Hay un **actualizador** que corre
dentro del servidor:

```
GET /api/catalog   →  catálogo ampliado (cientos de canciones reales, por género y artista)
GET /api/charts    →  Gráficos Top 50 reales por género
GET /api/warm      →  búsquedas populares pre-descargadas (responden al instante)
GET /api/warm?q=…  →  una sola búsqueda de la caché (respuesta instantánea)
POST /api/update   →  fuerza una actualización ahora mismo
GET /api/health    →  estado del actualizador (última pasada, próxima, errores)
```

**Automático (recomendado):**

```bash
npm start                 # compila, actualiza el scraper y sirve la app
```

`npm start` hace una pasada al arrancar y deja el temporizador activo: refresca cada
**6 h** (configurable) mientras esté encendido, y guarda los datos en `server/data/*.json`,
que sobreviven a los reinicios. La app lee esos JSON.

**Automático en la nube (sin tener el PC encendido):** `ritmo-music/` es su **propio
repositorio git** (independiente del proyecto padre). El workflow
`.github/workflows/update-data.yml` corre solo cada 6 h en GitHub Actions, refresca los datos
y hace *commit* de los JSON. Así el catálogo y los gráficos siguen frescos aunque no arranques
nada en local (ideal para GitHub Pages / Vercel). Se puede lanzar a mano desde la pestaña
**Actions → Run workflow**.

> El frontend revisa la frescura al abrir: si el servidor tiene datos más nuevos que la caché
> local, la descarta sola y vuelve a pedirlos (no te quedas 12 h con gráficos viejos).

**Manual** (para forzarlo cuando quieras):

```bash
npm run update            # una pasada (respeta la frescura)
npm run update -- --force # fuerza la actualización ya
npm run update -- --watch # se queda vigilando y refresca cada 6 h
```

**Configuración** (en `server/updater.mjs` → `CONFIG`, o por variables de entorno):

| Variable | Para qué | Por defecto |
|---|---|---|
| `UPDATE_INTERVAL_MS` | cada cuánto corre | 6 h |
| `UPDATE_FIRST_DELAY_MS` | retardo de la primera pasada | 8 s |
| `UPDATE_PAUSE_MS` | pausa entre consultas (anti-bloqueo) | 900 ms |
| `UPDATE_DISABLED=1` | desactiva el temporizador | — |

Qué incluye cada pasada: consultas por **12 géneros + 30 artistas populares** para el
catálogo, **8 rankings Top 50** para los gráficos (cada uno combina búsquedas reales de
«lo más escuchado» con los artistas del género) y **15 búsquedas populares** para la caché.
Entre consulta y consulta hay una pausa (`UPDATE_PAUSE_MS`, 900 ms por defecto) y
reintentos con espera creciente, para no saturar YouTube ni provocar bloqueos temporales.

La app usa estos datos automáticamente:

- **Gráficos** → la página *Gráficos* muestra el ranking real con la etiqueta *actualizado solo*.
- **Buscador** → el catálogo ampliado se suma al curado, y las búsquedas de la caché
  caliente aparecen al instante con la etiqueta *instantáneo* (sin esperar al scraper).

Todo degrada con elegancia: si el servidor no está disponible, la app sigue funcionando
con el catálogo curado y los rankings locales.

---

## 🛠️ Panel de administración del scraper (`#/admin`)

Página para el administrador: busca en YouTube por **categoría o canción**, marca las que
quieras y elige **a dónde subirlas** (al catálogo o a un ranking concreto). Abre
`http://localhost:4173/#/admin` (también desde el menú lateral, bajo *Administración*, o desde
*Ajustes → Administración del scraper*).

```
GET  /api/admin/categories →  categorías y pestañas disponibles
GET  /api/admin/search?q=… →  búsqueda real de YouTube (sin caché)
GET  /api/admin/picks      →  lo subido a mano + contadores
POST /api/admin/picks      →  { add: { catalog: [...], charts: { Pop: [...] } },
                                remove: { catalog: [yt], charts: { Pop: [yt] } } }
```

Lo que subes se guarda en `server/data/curated.json` y **va siempre primero**: el actualizador
automático lo respeta y no lo borra (solo añade canciones nuevas por debajo). Los cambios se
reflejan **al instante** en `/api/catalog` y `/api/charts`, sin reiniciar el servidor.

> El panel necesita el servidor encendido (`npm start`). Si abres solo el `dist` como fichero,
> la página lo avisa y muestra el comando para arrancarlo.

### Categorías dinámicas, QA Robot y soporte

- `GET /api/v1/categories` y `GET /api/v1/tracks?category_id=…&sort=random&limit=20` alimentan
  la Web y la APK desde un almacén central, sin listas hardcodeadas en el cliente.
- El catálogo se descarga al arrancar, se cachea en `localStorage` y se refresca al volver la
  conexión o cuando el administrador publica cambios por SSE.
- La rotación es ponderada: cada recarga cambia el orden, suben los géneros que el usuario
  escucha y bajan las canciones repetidas. Se prueba con `npm run check:catalog`.
- `GET /api/v1/events` (SSE) avisa al instante cuando el administrador crea, oculta o elimina
  una categoría. La pestaña **Categorías** del panel las gestiona en vivo.
- El **QA Robot** registra errores de reproducción, carátulas y latencia en
  `/api/v1/telemetry/errors`. Se revisan en `#/admin` → **QA Robot**.
- El botón flotante de ayuda ofrece FAQs, diagnóstico de conexión y reporte de canciones con
  un toque, sin interrumpir la reproducción.

---

## ☁️ Despliegue 24/7 y alta disponibilidad

Stack recomendado: **Vercel/Netlify** (web) + **Render Free** (API 24/7) +
**Supabase** (catálogo, historial y licencias) + **UptimeRobot** (ping cada 10 min).

- Guía paso a paso: [`docs/STACK-DINAMICO.md`](docs/STACK-DINAMICO.md).
- Esquema de base de datos: [`docs/supabase-schema.sql`](docs/supabase-schema.sql).
- Producción avanzada (réplicas, Redis, CDN): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
docker compose up --build   # API + web estática con volumen persistente
```

---

## 📱 APK Android (Capacitor)

El proyecto **ya tiene la carpeta `android/` generada** y sincronizada.

> ℹ️ **La APK siempre muestra el catálogo actual.** El build escribe `server.url` con la web
> pública (`SONORA_APP_URL`); así, cada cambio publicado en Vercel/Netlify aparece en el móvil
> sin reinstalar el APK. El API público se configura con `VITE_API_BASE_URL`. Si no defines
> `SONORA_APP_URL`, la APK usa el bundle local de `dist/` y necesita esa misma variable
> compilada para buscar y cargar el catálogo.

### Opción A — Compilar en la nube (sin instalar nada) ✅ recomendada
Sube este repo a GitHub y abre la pestaña **Actions** → *"Build APK"*. La workflow produce el archivo **`ritmo-music-debug.apk`** como artefacto descargable.

### Opción B — Compilar en local
Requisitos: **Android Studio** (con SDK 34 + Build-Tools) y **JDK 17**.

```powershell
$env:SONORA_APP_URL = "https://sonora.vercel.app"
$env:VITE_API_BASE_URL = "https://sonora-api.onrender.com"
npm run apk:build      # config + build + cap sync + gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Para la APK firmada de producción:

```powershell
npm run apk:release    # requiere configurar un keystore en build.gradle
```

### Otras órdenes útiles
| Comando | Qué hace |
|---|---|
| `npm run apk:prepare` | Compila la web y sincroniza con Android |
| `npm run icons` | Regenera todos los iconos (PWA + Android) |
| `npx cap open android` | Abre el proyecto en Android Studio |

---

## ✨ Funciones

**Reproducción**
- Reproductor embebido de YouTube (oculto) con mini-player y pantalla completa
- Cola estilo Spotify: **«Reproducir a continuación»**, añadir, quitar y **vaciar la cola**
- Pestaña **Cola** siempre visible: canción actual + cola manual + **«A continuación de esta lista»** (las próximas canciones del contexto, con botón ＋ para encolarlas)
- Si la cola está vacía, ofrece **Iniciar emisora** o **Reproducir relacionadas** con un toque
- Aleatorio (con **aleatorio inteligente** PRO), repetir (todo/una), SeekBar, volumen
- **Música relacionada automática** al terminar la cola (autoplay)
- Radio automática por género/estado de ánimo desde cualquier canción
- **Letra sincronizada** real vía LRCLIB (se resalta la línea actual)
- **Modo vídeo** estilo YouTube Music: alterna audio ↔ vídeo en pantalla completa
- Controles en pantalla de bloqueo (MediaSession API)
- Temporizador de apagado, ecualizador con presets, crossfade y gapless (PRO)

**Catálogo**
- +40 éxitos curados (Pop, Rock, Latino, Electrónica, Hip-Hop, Lo-Fi) con nº de reproducciones
- Mezclas, **mezclas diarias**, emisoras, géneros y estados de ánimo
- **Descubrimiento semanal** (renueva cada lunes) y **Radar de novedades**
- **📈 Gráficos Top 50** con pestañas (Global, Pop, Rock, Latino, Electrónica, Hip-Hop) y movimiento de posiciones
- **🎬 Vídeos musicales**, novedades y artistas populares en Explorar
- Búsqueda local con **filtros** (Canciones, Vídeos, Álbumes, Artistas, Playlists, Emisoras)
- **Búsqueda real en todo YouTube** (scraper propio, ver arriba): cualquier artista o canción del mundo aparece bajo «▶ YouTube · N canciones» y suena con un clic
- **Pegar enlace/ID de YouTube** para reproducirlo directamente

**Páginas de artista y álbum**
- **Artista**: foto, oyentes mensuales, verificado, seguir/dejar de seguir, top canciones, discografía, artistas relacionados, emisora
- **Álbum**: carátula, año, duración total, guardar en biblioteca, descargar álbum, lista de pistas

**Biblioteca con pestañas** (estilo Spotify/Apple)
- Playlists · Álbumes · Artistas · Canciones · **Descargas** (con contadores)
- Canciones gustadas, historial con marcas de tiempo, playlists (crear/renombrar/eliminar/añadir)
- **Seguir artistas**, **guardar álbumes** y **descargar canciones/álbumes** (PRO)
- Persistencia total en `localStorage`

**Perfil con estadísticas (Wrapped / Replay)**
- Minutos, reproducciones, gustadas, playlists, descargas, artistas seguidos
- **✨ Tu 2026 en música**: artista y género más escuchados + top 5 canciones

**Configuración completa**
- Cuenta, suscripción, tema (oscuro/claro/sistema), idioma (ES/EN)
- Calidad de audio, **Lossless**, **Dolby Atmos**, gapless, aleatorio inteligente, ecualizador (presets)
- Normalización, crossfade, autoplay, filtro explícito, ahorro de datos
- **Vídeo y experiencia**: vídeo automático, Canvas, continuidad entre dispositivos, atajos a Letra y Cola
- **Dispositivos** (estilo Spotify Connect)
- Notificaciones, borrar historial/búsquedas, restablecer datos, acerca de

**Versión PRO (simulacro)**
- Paywall con planes **Mensual / Anual / Familiar**
- Activar, cancelar y "restaurar" suscripción
- Desbloquea: calidad alta, normalización, crossfade, temporizador, descargas, Lossless, Dolby Atmos, gapless, aleatorio inteligente, ecualizador, cuenta familiar
- ✦ Badge PRO en toda la app

**Extras**
- `npm run check:i18n` — verifica que todas las traducciones ES/EN estén completas
- Fallback automático de carátulas si YouTube devuelve 404

---

## 🔌 Conectar pagos reales (cuando quieras)

Todo el estado de la suscripción vive en `src/state/AppState.jsx` (`pro`). El punto de entrada es `src/pages/Pro.jsx` → función `subscribe()`.

- **Web:** sustituye el `setTimeout` por una llamada a Stripe Checkout.
- **APK:** usa `@capacitor/community/in-app-purchases` (Google Play Billing) y valida el estado en tu backend.

---

## 🧱 Stack

- **React 18 + Vite 5** — SPA con `HashRouter` (compatible con `file://` de Capacitor)
- **Capacitor 6** — wrapper Android nativo
- **YouTube IFrame API** — reproducción
- CSS propio con tema oscuro/claro (variables), mobile-first con bottom-nav y sidebar en escritorio

## 📁 Estructura

```
ritmo-music/
├── android/              # Proyecto Capacitor (ya generado)
├── public/               # manifest, sw.js, iconos
├── scripts/gen-icons.mjs # Generador de iconos (PWA + Android)
├── src/
│   ├── data/catalog.js   # Catálogo, mezclas, emisoras
│   ├── player/PlayerContext.jsx  # Motor de reproducción YouTube
│   ├── state/AppState.jsx        # Estado global + persistencia
│   ├── components/       # Sidebar, MiniPlayer, FullPlayer, widgets…
│   ├── pages/            # Home, Explorar, Biblioteca, Buscar, Pro…
│   └── styles.css
└── package.json
```
