/* ══════════════════════════════════════════════════════════════════════════
   Configura la APK para que cargue la web pública (Vercel/Netlify).

   Sin `server.url`, una APK empaquetada abre `https://localhost` y falla: el
   catálogo, la búsqueda y el reproductor no tienen backend. Este script
   escribe esa URL desde el entorno antes de `cap sync`:

     SONORA_APP_URL=https://sonora.vercel.app npm run apk:build

   También acepta `CAPACITOR_SERVER_URL` como alias. Si no hay ninguna
   variable, se elimina `server.url` para que la APK use el bundle local
   (desarrollo con el móvil conectado por USB).
   ══════════════════════════════════════════════════════════════════════════ */

import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../capacitor.config.json', import.meta.url);
const appUrl = String(process.env.SONORA_APP_URL || process.env.CAPACITOR_SERVER_URL || '')
  .trim()
  .replace(/\/+$/, '');

const config = JSON.parse(await readFile(FILE, 'utf8'));
config.server = config.server && typeof config.server === 'object' ? config.server : {};

if (appUrl) {
  if (!/^https?:\/\//i.test(appUrl)) {
    console.error(`✗ SONORA_APP_URL debe empezar por http(s):// · recibido: ${appUrl}`);
    process.exit(1);
  }
  config.server.url = appUrl;
  config.server.cleartext = appUrl.startsWith('http://');
} else {
  delete config.server.url;
  delete config.server.cleartext;
}

await writeFile(FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(appUrl
  ? `✓ APK apuntando a ${appUrl}`
  : '✓ APK sin server.url (usará el bundle local de dist/)');
