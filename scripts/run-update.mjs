#!/usr/bin/env node
/* Ejecuta una pasada del actualizador automático desde la línea de comandos.
 *
 *   npm run update            → actualiza si los datos están viejos
 *   npm run update -- --force → fuerza la actualización aunque sean recientes
 *   npm run update -- --watch → se queda corriendo y refresca cada N horas
 *
 * Es exactamente el mismo motor que corre dentro del servidor, así que sirve
 * también para tareas programadas (GitHub Actions, cron de Linux, etc.).
 */
import { runUpdate, startAutoUpdater, status } from '../server/updater.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');
const watch = args.includes('--watch') || args.includes('-w');

const log = (m) => console.log(m);

const res = await runUpdate({ log, force });

if (watch) {
  log('  👀 modo vigilancia activo (Ctrl+C para salir)');
  startAutoUpdater({ log });
} else if (res?.ok) {
  process.exit(0);
} else if (res?.fresh) {
  process.exit(0);
} else {
  process.exit(1);
}
