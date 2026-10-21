#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Arranque "todo en uno" de Ritmo Music.

       npm start            → actualiza el scraper y sirve la app (con temporizador)
       npm start -- --no-build   → no recompila (usa el `dist/` que ya exista)
       npm start -- --force-update → fuerza la actualización del scraper al arrancar

   Hace, en orden:
     1. Compila la web si falta `dist/` (o siempre, salvo --no-build).
     2. Pasa el actualizador automático (catálogo + gráficos + caché). Si los
        datos son recientes, no repite trabajo.
     3. Arranca el servidor, que además deja el temporizador activo: el scraper
        se refresca solo cada N horas mientras esté encendido.

   Es lo que hace que "el scraper se actualice solo" sin que toques nada.
   ══════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const force = args.includes('--force-update') || args.includes('-f');

const line = (m = '') => console.log(m);

line('');
line('  ▶ Ritmo Music — arranque');

/* 1. Compilar la web ------------------------------------------------------- */
const distIndex = path.join(ROOT, 'dist', 'index.html');
if (!noBuild) {
  line('  ▸ compilando la web…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    line('  ❌ la compilación falló; se cancela el arranque');
    process.exit(1);
  }
} else if (!fs.existsSync(distIndex)) {
  line('  ⚠️  --no-build pero no hay dist/; se compila igualmente');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(1);
}

/* 2. Actualizar el scraper y arrancar el servidor con temporizador --------- */
line('');
line('  ▸ actualizando el scraper…');
process.env.RITMO_BOOTSTRAP = force ? 'force' : 'auto';

// Importamos el servidor: él mismo arranca el temporizador automático.
await import(path.join(ROOT, 'server', 'index.mjs'));
