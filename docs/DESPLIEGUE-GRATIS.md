# Publicar Sonora Music gratis (Web + APK)

Esta guía lleva la app a Internet **sin pagar hosting**. Hay dos caminos reales
en 2026; elige según lo que necesites:

| Plataforma | ¿Gratis de verdad? | ¿Duerme? | ¿Datos persistentes? | Tarjeta | Dificultad |
| --- | --- | --- | --- | --- | --- |
| **Render** (plan Free) | Sí | Sí, a los 15 min sin visitas | No (se borra al dormir/redesplegar) | Normalmente no | Muy fácil |
| **Oracle Cloud** (Always Free) | Sí, para siempre | No, 24/7 | Sí (volumen Docker) | Solo verificación | Media |
| Google Cloud `e2-micro` | Sí, dentro del límite | No | Sí | Solo verificación | Media |
| Koyeb | "Free", pero pide tarjeta y cobra el plan Pro al registrarte | — | — | Sí | Media |
| Fly.io / Railway / Heroku | Ya no tienen plan gratis real | — | — | Sí | — |
| Vercel / Netlify | Solo estático; este backend necesita Node y disco | — | — | No | — |

**Recomendación**

- Para probar y compartir el enlace hoy: **Render** (5 minutos, sin tarjeta).
- Para tener la app 24/7 con cambios del admin que no se pierdan: **Oracle
  Cloud Always Free** (una VM pequeña, también 0 €).

---

## 0. Subir el código a GitHub (obligatorio en ambos casos)

El repositorio todavía no tiene remoto configurado. Crea un repositorio vacío
en <https://github.com/new> llamado `sonora-music` (privado o público) y ejecuta
desde la carpeta `ritmo-music`:

```powershell
git remote add origin https://github.com/TU-USUARIO/sonora-music.git
git branch -M main
git push -u origin main
```

GitHub ya no acepta contraseñas por HTTPS. Cuando pida credenciales, usa un
**Personal Access Token** (GitHub → Settings → Developer settings → Tokens
(classic) → scope `repo`) como contraseña, o instala **GitHub Desktop** y pulsa
“Publish repository”.

> Cada `git push` a `main` vuelve a desplegar automáticamente en Render.

---

## 1. Opción rápida: Render Free (sin tarjeta)

### 1.1 Crear el servicio

1. Entra en <https://render.com> y regístrate con GitHub (el plan Free no suele
   pedir tarjeta; si te la pide, usa Oracle o Google Cloud).
2. **New +** → **Blueprint**.
3. Conecta el repositorio `sonora-music`.
4. Render lee `render.yaml` y muestra el servicio `sonora-music` con plan
   **Free**. Pulsa **Apply**.
5. Espera 2–4 minutos (instala dependencias y compila con Vite).

Si prefieres crearlo a mano: **New +** → **Web Service** → conecta el repo y
usa:

| Campo | Valor |
| --- | --- |
| Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `node server/index.mjs` |
| Health Check Path | `/api/health` |
| Instance Type | Free |
| `UPDATE_DISABLED` | `1` |
| `ADMIN_TOKEN` | un texto largo y secreto |

### 1.2 Comprobar que funciona

Tu URL será parecida a `https://sonora-music-xxxx.onrender.com`.

```text
https://TU-APP.onrender.com/api/health
https://TU-APP.onrender.com/api/v1/home
https://TU-APP.onrender.com/api/search?q=salsa
```

Abre la raíz en el móvil y en el ordenador. La primera visita tras 15 minutos
de inactividad tarda **~1 minuto** (Render está despertando el servicio); las
siguientes son inmediatas.

### 1.3 Panel de administración

`https://TU-APP.onrender.com/#/admin`

Si definiste `ADMIN_TOKEN`, el panel necesita ese token. Guárdalo una vez en el
navegador (F12 → Console):

```js
localStorage.setItem('ritmo-admin-token', 'EL_MISMO_TOKEN_DE_RENDER');
location.reload();
```

### 1.4 Limitaciones que debes conocer (plan Free)

- **Se duerme a los 15 min sin tráfico** y tarda ~1 min en despertar.
- **El disco es efímero**: al dormir, reiniciar o redesplegar se pierden
  `history.json`, las categorías editadas y `version.json`. El catálogo base
  (`server/data/catalog.json`) sí sobrevive porque está en Git.
- **750 horas de instancia al mes**. Un servicio encendido 24/7 consume ~744 h,
  así que solo cabe **un** servicio Free por cuenta.
- ~5 GB de tráfico saliente al mes. Es suficiente: el audio se reproduce en el
  cliente, el servidor solo sirve JSON y redirecciones de carátulas.
- Render puede reiniciar el servicio cuando quiera.

Para evitar el arranque lento, crea un monitor gratuito en
<https://cron-job.org> o <https://uptimerobot.com> que llame cada 10 minutos a
`https://TU-APP.onrender.com/api/health`. Eso mantiene el servicio despierto y
consume las 750 h (justo alcanza para un mes de 31 días).

> Para producción con datos persistentes usa Oracle (sección 2). Render Free es
> ideal para demos, pruebas con usuarios y enlaces temporales.

---

## 2. Opción 24/7 y persistente: Oracle Cloud Always Free

Oracle regala de por vida (sin fecha de caducidad) una VM ARM de hasta
**2 OCPU / 12 GB de RAM**, 200 GB de disco y 10 TB de salida al mes. Es de sobra
para Sonora. Pide tarjeta solo para verificar identidad (cargo temporal de ~1 $).

### 2.1 Crear la VM

1. Crea la cuenta en <https://www.oracle.com/cloud/free/> y elige tu región
   más cercana (esa será tu *home region*).
2. **Compute → Instances → Create instance**.
3. Configuración:
   - **Image**: Ubuntu 24.04 (o 22.04).
   - **Shape**: `VM.Standard.A1.Flex` (ARM) → 2 OCPU / 12 GB, o 1 OCPU / 6 GB.
   - **Boot volume**: 50–100 GB.
   - **Public IPv4 address**: asignar.
   - Descarga la clave SSH privada (`.key`).
4. Abre los puertos en **Networking → Virtual Cloud Networks → tu VCN →
   Security Lists → Default Security List** y añade reglas de entrada:

| Origen | Protocolo | Puerto |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |
| Tu IP | TCP | 22 |

> Si no aparece capacidad ARM (“out of host capacity”), prueba otro dominio de
> disponibilidad o espera; es un problema temporal habitual en Oracle.

### 2.2 Instalar Docker y arrancar Sonora

Conéctate (en Windows, desde PowerShell o Git Bash):

```bash
ssh -i ruta/a/tu-clave.key ubuntu@IP_PUBLICA
```

Dentro de la VM:

```bash
sudo apt update
sudo apt install -y git ufw
curl -fsSL https://get.docker.com | sudo sh

sudo usermod -aG docker $USER
newgrp docker
docker compose version

sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

git clone https://github.com/TU-USUARIO/sonora-music.git
cd sonora-music

# Token del panel admin (guárdalo)
echo "ADMIN_TOKEN=$(openssl rand -hex 24)" > .env

docker compose up -d --build
curl http://localhost:4173/api/health
```

La app ya responde en `http://IP_PUBLICA:4173`. El volumen `sonora-data`
conserva historial, categorías y versión entre reinicios.

### 2.3 HTTPS gratis con Caddy + DuckDNS

Los navegadores y la APK necesitan HTTPS. Caddy obtiene el certificado de
Let's Encrypt automáticamente.

1. Crea un subdominio gratis en <https://www.duckdns.org> (por ejemplo
   `sonora-tu`), apunta a la IP de la VM y copia el token.
2. Instala Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

3. Copia el proxy incluido en el repo y cambia el dominio:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # cambia sonora.duckdns.org por el tuyo
sudo systemctl reload caddy
```

4. Comprueba:

```text
https://sonora-tu.duckdns.org/api/health
```

Sin dominio propio también puedes usar `TU-IP.nip.io` (por ejemplo
`143.198.10.20.nip.io`): resuelve a tu IP y Caddy emite el certificado igual.

### 2.4 Actualizar la app

```bash
cd ~/sonora-music
git pull
docker compose up -d --build
```

### 2.5 Copia de seguridad (opcional, gratis)

```bash
docker run --rm -v sonora-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/sonora-data-$(date +%F).tgz /data
```

> Oracle puede reclamar VMs *Always Free* si durante 7 días están casi sin uso
> (CPU, red y memoria por debajo del 20 %). Una app con usuarios reales no
> tiene problema; para una demo olvidada, añade el mismo monitor de
> `cron-job.org` apuntando a `/api/health`.

---

## 3. Opción intermedia: Google Cloud `e2-micro`

Google regala **1 VM `e2-micro` al mes** (2 vCPU compartidas, 1 GB de RAM,
30 GB de disco) en `us-west1`, `us-central1` o `us-east1`, más 1 GB de salida.
Requiere cuenta de facturación con tarjeta, pero dentro de esos límites no cobra.

Pasos: crea una VM Ubuntu 24.04 `e2-micro` con IP pública y “Allow HTTP/HTTPS”,
y repite la sección 2.2–2.4. Con 1 GB de RAM, añade swap antes de compilar:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. APK Android apuntando a tu servidor

La APK empaqueta la web y la sirve desde `https://localhost`, así que las
llamadas relativas `/api/...` **no llegan a tu servidor** salvo que le indiques
la URL. La forma más simple (y la que hace que cada despliegue web actualice la
APK sin reinstalarla) es cargar la web remota.

Ya no edites `capacitor.config.json` a mano: el script de build escribe
`server.url` desde el entorno.

```powershell
# URL pública de la web (Vercel/Netlify)
$env:SONORA_APP_URL = "https://sonora.vercel.app"
# URL pública del API, por si compilas la APK con bundle local
$env:VITE_API_BASE_URL = "https://TU-API.onrender.com"

npm install
npm run apk:build
```

`apk:build` ejecuta `scripts/write-capacitor-config.mjs` → `vite build` →
`cap sync android` → Gradle. Guía completa: [STACK-DINAMICO.md](STACK-DINAMICO.md).

El APK de prueba queda en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Cópialo al móvil y actívalo con “Instalar apps desconocidas”. Para una versión
firmada, abre la carpeta `android` en **Android Studio** (gratis) → *Build →
Generate Signed App Bundle / APK*, crea un keystore y guárdalo fuera del repo.

Con `server.url`, cualquier cambio publicado en Vercel/Netlify (web) o en el
API se ve al instante en la APK; no hace falta regenerarla. A cambio, la app
necesita Internet para cargar la web remota. Si más adelante quieres la APK con
bundle local + actualizaciones por ZIP, hay que instalar
`@capgo/capacitor-updater`; el cliente ya no usa rutas relativas fijas: resuelve
el API con `VITE_API_BASE_URL` o con el override guardado en el dispositivo.

### Costes de la APK

| Concepto | Coste |
| --- | --- |
| Compilar con Android Studio / Gradle | 0 € |
| Distribuir el APK por enlace, WhatsApp o web | 0 € |
| Google Play Store | 25 $ **pago único** (no es gratis) |
| Dominio propio `.com` | ~10–15 €/año (opcional) |

---

## 5. Problemas típicos

| Síntoma | Causa / solución |
| --- | --- |
| “Application failed to respond” | El build falló. Revisa **Logs** en Render o `docker compose logs -f` en la VM. |
| Primer acceso tarda ~1 min | Render Free estaba dormido. Es normal; usa el monitor de la sección 1.4. |
| Las categorías del admin vuelven solas | Disco efímero de Render Free. Usa Oracle para persistencia. |
| Buscar no devuelve nada | Prueba `https://TU-APP/api/search?q=salsa`. Si responde, borra caché del navegador/servicio. |
| La APK sale en blanco | `server.url` mal escrita o sin Internet. Abre esa URL en el navegador del móvil. |
| Los cambios del admin no llegan en vivo | El proxy debe permitir SSE: Caddy usa `flush_interval -1` (incluido en `deploy/Caddyfile`). |
| Error 429 | Límite de 240 peticiones/min por IP. Detrás de Render/Caddy la IP real llega por `X-Forwarded-For`. |
| El buscador va lento la primera vez | El scraper de YouTube tarda 2–20 s; luego queda en caché. Si falla, responde con el catálogo local. |

---

## 6. Checklist final

- [ ] Repositorio subido a GitHub.
- [ ] `https://TU-APP/api/health` responde OK.
- [ ] `/api/v1/home` devuelve secciones y categorías.
- [ ] `/api/search?q=salsa` devuelve resultados.
- [ ] `#/admin` abre y guarda una categoría (con token si lo configuraste).
- [ ] La web carga en móvil y escritorio.
- [ ] `VITE_API_BASE_URL` configurada en Vercel/Netlify.
- [ ] `npm run apk:build` se ejecutó con `SONORA_APP_URL` (el script escribió `server.url`).
- [ ] APK instalada y reproduciendo audio.
- [ ] Monitor de disponibilidad configurado (Render Free).
- [ ] Copia de seguridad del volumen (Oracle).
