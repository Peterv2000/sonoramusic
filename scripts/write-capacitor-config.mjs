/* ══════════════════════════════════════════════════════════════════════════
   Configura la APK.

   Por defecto la APK usa el bundle local de `dist/` (sin `server.url`): abre
   al instante, aunque el servidor esté dormido o sin red, y llama al API por
   su URL absoluta (`VITE_API_BASE_URL`).

   Si se define `SONORA_APP_URL`, la APK carga la web remota en el WebView
   (útil para probar cambios sin reinstalar):

     SONORA_APP_URL=https://sonora.vercel.app npm run apk:build

   También acepta `CAPACITOR_SERVER_URL` como alias.
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
