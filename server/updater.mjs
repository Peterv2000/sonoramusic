/* ══════════════════════════════════════════════════════════════════════════
   Actualizador automático de Ritmo Music.

   Usa el scraper (`youtube.mjs`) para refrescar TODO sin intervención manual:

     · Catálogo ampliado  → busquedas por género, artista y novedades
     · Gráficos Top 50    → rankings reales por género
     · Caché caliente     → pre-cachea las búsquedas más usadas
     · Últimas búsquedas  → lo que los usuarios buscan se refresca solo

   Los datos se guardan como JSON en `server/data/`, sobreviven a los reinicios
   y se sirven por el API (`/api/catalog`, `/api/charts`, …) para que la web y
   la APK los lean.

   Uso:
     · Automático: el servidor lo arranca y refresca cada N horas.
     · Manual:     npm run update            (una pasada)
                   npm run update -- --force  (ignora el TTL y refresca ya)
   ══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchYouTube } from './youtube.mjs';
import { curateBatch } from './ai-curator.mjs';
import { guessGenre as aiGenre, guessMoods as aiMoods, titleGenre } from './ai-curator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

/* ── Qué se actualiza y cada cuánto ─────────────────────────────────────── */
export const CONFIG = {
  // Cada cuánto corre el ciclo completo (por defecto 6 h)
  // Actualización cada 10 min para máxima frescura
  intervalMs: Number(process.env.UPDATE_INTERVAL_MS || 10 * 60 * 1000),
  // Cuántas canciones se piden por cada consulta
  perQuery: 25,
  // Pausa entre consultas para no saturar YouTube (ms)
  pauseMs: Number(process.env.UPDATE_PAUSE_MS || 900),
  // Cuántas canciones como máximo guarda el catálogo ampliado
  maxCatalog: 2000,
  // Consultas del catálogo ampliado: géneros + artistas populares
  catalogQueries: [
    'top canciones pop 2026', 'top canciones rock clasico', 'top canciones latinas 2026',
    'top canciones reggaeton 2026', 'top canciones electronica', 'top canciones hip hop 2026',
    'top canciones r&b 2026', 'top canciones indie 2026', 'top canciones lofi chill',
    'top canciones kpop 2026', 'top canciones salsa bachata', 'top canciones cumbia',
    'Bad Bunny', 'Taylor Swift', 'The Weeknd', 'Dua Lipa', 'Karol G', 'Metallica',
    'Queen', 'Adele', 'Ed Sheeran', 'Bruno Mars', 'Coldplay', 'Billie Eilish',
    'Drake', 'Rihanna', 'Shakira', 'Imagine Dragons', 'Ariana Grande', 'Feid',
  ],
  // Consultas de los gráficos: cada una genera un ranking.
  // Se combinan dos fuentes por pestaña:
  //   · `queries`: búsquedas reales de "lo más escuchado" (aportan los éxitos actuales)
  //   · `artists`: artistas del género (aportan volumen y evitan listas de recopilatorios)
  chartTabs: [
    {
      id: 'global', label: 'Global',
      queries: ['canciones mas escuchadas del mundo 2026', 'top hits global 2026'],
      artists: ['The Weeknd', 'Ed Sheeran', 'Bruno Mars', 'Coldplay'],
    },
    {
      id: 'pop', label: 'Pop',
      queries: ['top pop songs 2026', 'mejores canciones pop 2026'],
      artists: ['Taylor Swift', 'Dua Lipa', 'Ariana Grande', 'Ed Sheeran', 'Billie Eilish'],
    },
    {
      id: 'rock', label: 'Rock',
      queries: ['best rock songs of all time', 'clasicos del rock'],
      artists: ['Metallica', 'Queen', 'Nirvana', 'AC/DC', 'Guns N Roses'],
    },
    {
      id: 'latino', label: 'Latino',
      queries: ['top canciones latinas 2026', 'exitos reggaeton 2026'],
      artists: ['Bad Bunny', 'Karol G', 'Feid', 'Shakira', 'Maluma'],
    },
    {
      id: 'electronica', label: 'Electrónica',
      queries: ['top electronic dance music 2026', 'best edm songs'],
      artists: ['David Guetta', 'Calvin Harris', 'Avicii', 'Martin Garrix', 'Kygo'],
    },
    {
      id: 'hiphop', label: 'Hip-Hop',
      queries: ['top hip hop songs 2026', 'best rap songs'],
      artists: ['Drake', 'Kanye West', 'Eminem', 'Kendrick Lamar', 'Travis Scott'],
    },
    {
      id: 'rnb', label: 'R&B',
      queries: ['best r&b songs', 'top rnb 2026'],
      artists: ['The Weeknd', 'SZA', 'Rihanna', 'Bruno Mars', 'Frank Ocean'],
    },
    {
      id: 'indie', label: 'Indie',
      queries: ['best indie songs', 'indie hits 2026'],
      artists: ['Imagine Dragons', 'Coldplay', 'Vance Joy', 'Tame Impala'],
    },
  ],
  // Búsquedas que se mantienen "calientes" en caché
  warmQueries: [
    'bad bunny', 'taylor swift', 'the weeknd', 'dua lipa', 'karol g', 'metallica',
    'queen', 'adele', 'ed sheeran', 'bruno mars', 'coldplay', 'billie eilish',
    'musica para estudiar', 'musica para entrenar', 'musica relajante',
  ],
};

/* ── Estado del actualizador ────────────────────────────────────────────── */
export const status = {
  running: false,
  lastRun: 0,
  lastDurationMs: 0,
  lastError: null,
  runs: 0,
  counts: { catalog: 0, charts: 0, warm: 0 },
};

/* ── Selección manual del administrador ─────────────────────────────────────
   Lo que el administrador elige desde la página /admin se guarda aparte
   (`curated.json`) y se MEZCLA al principio del catálogo y de los gráficos: así
   sobrevive a cada pasada automática, que solo añade canciones nuevas. */
function readCurated() {
  const c = readJson('curated.json') || { updatedAt: 0, catalog: [], charts: {} };
  return {
    updatedAt: c.updatedAt || 0,
    catalog: Array.isArray(c.catalog) ? c.catalog : [],
    charts: c.charts && typeof c.charts === 'object' ? c.charts : {},
  };
}

/* ── Utilidades de disco ────────────────────────────────────────────────── */
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeJson(name, obj) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 1), 'utf8');
  return file;
}

/* Lista de pestañas de gráficos disponible para el panel de administración. */
export const CHART_TABS = CONFIG.chartTabs.map((t) => ({ id: t.id, label: t.label }));

/* Las funciones de clasificación se reutilizan desde el API de administración. */
export { writeJson, guessGenre, guessMoods };

export function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

/* ── Normaliza el título (quita "(Official Video)", duplicados, etc.) ──── */
function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/* ── Títulos que delatan recopilatorios/mezclas (no son canciones) ─────── */
const COMPILATION = /top\s*\d|top\s+(global|songs|hits|canciones)|más escuchad|mas escuchad|playlist|mix\b|megamix|recopilac|las \d+ (mejores|mejores|canciones)|best of|greatest hits|nonstop|non-stop|hour|horas?\b|compilation|ranking|éxitos?\s+del|exitos?\s+del|lo más|lo mas|selección|selection\b|\bmix\b|dz|1 hour|2 hours?/i;

/* ── Descarta duplicados y pistas poco útiles ───────────────────────────── */
/* `strict` (para los gráficos) además descarta recopilatorios y mezclas,
   que en las búsquedas genéricas acaparan los primeros puestos. */
function dedupe(tracks, seen, strict = false) {
  const out = [];
  const maxDur = strict ? 900 : 1800;                           // gráficos: 15 min; catálogo: 30 min
  for (const tr of tracks) {
    if (!tr?.yt || seen.has(tr.yt)) continue;
    if (tr.dur < 60 || tr.dur > maxDur) continue;             // fuera previos cortos y mezclas largas
    if (strict && COMPILATION.test(tr.title)) continue;         // fuera recopilatorios (solo gráficos)
    const key = normTitle(tr.artist) + '|' + normTitle(tr.title);
    if (seen.has(key)) continue;
    seen.add(tr.yt);
    seen.add(key);
    out.push(tr);
  }
  return out;
}

/* ── Clasificador de género por palabras clave ────────────────────────────
   El urbano latino, la música popular y el regional mexicano se clasifican
   antes que «pop» y que el trap genérico. «Popular» contiene «pop», así que
   ese patrón jamás debe llegar a la regla de pop. */
const URBAN_LATIN_ARTISTS = /darell|myke towers|ñengo flow|nengo flow|farruko|bad bunny|karol g|feid|daddy yankee|anuel|ozuna|rauw|maluma|j balvin|arcangel|arcángel|sech|blessd|ryan castro|brytiago|nicky jam|wisin|yandel|don omar|jhayco|jhay cortez|quevedo|eladio carrion/i;
const REGIONAL_ARTISTS = /grupo firme|natanael cano|peso pluma|carin leon|carin león|christian nodal|calibre 50|tigres del norte|intocable|arrolladora|espinoza paz|pepe aguilar|alejandro fernandez|alejandro fernández|los temerarios|banda ms|los plebes|el fantasma|edwin luna|jenni rivera|vicente fernandez|vicente fernández|joan sebastian|joan sebastián|los bukis|marco antonio solis|marco antonio solís|jorge celedon|jorge celedón|peter manjarres|silvestre dangond|diomedes diaz|los betos|el andariego|los inquietos|los gigantes|los chiches|los diablitos/i;
const GENRE_RULES = [
  [/dembow/i, 'Dembow'],
  [/trap\s*latino|trap latino|trap\s*argentino/i, 'Trap Latino'],
  [/dancehall\s*latino|dancehall/i, 'Dancehall Latino'],
  [/urbano\s*latino|perreo/i, 'Urbano Latino'],
  [/reggaeton|reggaetón|mambo|urbano/i, 'Reggaetón'],
  [URBAN_LATIN_ARTISTS, 'Reggaetón'],
  [/salsa/i, 'Salsa'],
  [/bachata/i, 'Bachata'],
  [/cumbia/i, 'Cumbia'],
  [/merengue/i, 'Merengue'],
  [/vallenato|despecho/i, 'Vallenato'],
  [/regional mexicano|ranchera|mariachi|norteño|norteno|corrido|banda|popular/i, 'Popular'],
  [REGIONAL_ARTISTS, 'Popular'],
  [/rock|metallica|queen|nirvana|guns|acdc|ac\/dc|purple|muse|green day|linkin|foofighter|foo fighter/i, 'Rock'],
  [/electronic|dance|edm|house|techno|dubstep|alan walker|avicii|daft punk|tiesto|marshmello|calvin harris|david guetta|martin garrix/i, 'Electrónica'],
  [/trap/i, 'Trap'],
  [/hip hop|hip-hop|rap|drake|kendrick|eminem|macklemore|cardi|nicki|post malone|travis scott/i, 'Hip-Hop'],
  [/r&b|rnb|soul|the weeknd|frank ocean|sza|h.e.r|usher|chris brown/i, 'R&B'],
  [/indie|alternative|artic monkeys|arctic monkeys|lana del rey|tame impala|radiohead/i, 'Indie'],
  [/kpop|k-pop|bts|blackpink|twice|stray kids|newjeans|ive|aespa/i, 'K-Pop'],
  [/lofi|lo-fi|chill|study|relax|ambient|piano/i, 'Lo-Fi'],
  [/latin|latino|sabor/i, 'Latino'],
  [/pop|taylor swift|dua lipa|adele|ed sheeran|bruno mars|ariana|billie eilish|rihanna|katy perry|sia|shakira|coldplay|maroon/i, 'Pop'],
];

function guessGenre(text) {
  for (const [re, genre] of GENRE_RULES) if (re.test(text)) return genre;
  return 'Pop';
}

/* ── Etiqueta de estado de ánimo aproximada ─────────────────────────────── */
async function guessMoods(text, genre) { try { return await aiMoods(text, genre); } catch { return []; } }

/* ══════════════════════════════════════════════════════════════════════════
   TAREAS
   ══════════════════════════════════════════════════════════════════════════ */

/* Pausa entre consultas (evita que YouTube corte la conexión). */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* Detecta bloqueos temporales de YouTube para no encadenar fallos. */
let fallosSeguidos = 0;
const BLOQUEO_LIMITE = 5;

async function consultar(query, limit, log) {
  try {
    // Búsqueda profunda: varias páginas por consulta (más catálogo), pero
    // acotada para no saturar YouTube (pool de paginación con pausa).
    const pages = Math.max(1, Math.min(Math.ceil(limit / 20), 3));
    const found = await searchYouTube(query, { limit, pages, music: false });
    fallosSeguidos = 0;
    return found;
  } catch (err) {
    fallosSeguidos += 1;
    if (fallosSeguidos >= BLOQUEO_LIMITE) {
      throw new Error(`YouTube bloqueó temporalmente (${fallosSeguidos} fallos seguidos). Se reintentará en la próxima pasada.`);
    }
    log(`  ! «${query}» falló (${fallosSeguidos} seguidos): ${err.message}`);
    return [];
  } finally {
    await pause(CONFIG.pauseMs);
  }
}

/* 1. Catálogo ampliado: busca todos los géneros/artistas y guarda lo mejor */
async function updateCatalog(log) {
  const seen = new Set();
  const tracks = [];
  for (const q of CONFIG.catalogQueries) {
    const found = await consultar(q, CONFIG.perQuery, log);
    if (found.length) {
      const genre = guessGenre(q);
      /* `guessMoods` es asíncrona: sin `await` se guardaba una promesa y el
         JSON acababa con `moods: {}`, perdiendo la pista de estado de ánimo. */
      const fresh = await Promise.all(dedupe(found, seen).map(async (tr) => ({
        ...tr,
        /* La pista manda sobre la consulta: un «Bachata Mix» hallado buscando
           salsa es bachata, no salsa. */
        genre: titleGenre(tr.title) || genre,
        moods: await guessMoods(`${tr.title} ${tr.artist}`, genre),
      })));
      tracks.push(...fresh);
      log(`  · catálogo «${q}» → +${fresh.length} (total ${tracks.length})`);
    }
  }
  // Ordena por reproducciones y recorta
  tracks.sort((a, b) => (b.views || 0) - (a.views || 0));
  // Las elecciones manuales del administrador van SIEMPRE al principio y no
  // se recortan, así no desaparecen en la siguiente pasada automática.
  const curated = readCurated().catalog;
  const curatedIds = new Set(curated.map((t) => t.yt || t.id));
  const merged = [...curated, ...tracks.filter((t) => !curatedIds.has(t.yt || t.id))];
  const final = merged.slice(0, CONFIG.maxCatalog + curated.length);
  writeJson('catalog.json', {
    updatedAt: Date.now(),
    count: final.length,
    curated: curated.length,
    tracks: final,
  });
  return final.length;
}

/* 2. Gráficos: un ranking real por cada pestaña.
   Combina las búsquedas "lo más escuchado" con las canciones más vistas de los
   artistas del género, así el ranking nunca queda vacío aunque YouTube devuelva
   recopilatorios largos (que se filtran) en las búsquedas genéricas. */
async function updateCharts(log) {
  const tabs = [];
  for (const tab of CONFIG.chartTabs) {
    const seen = new Set();
    const found = [];

    for (const q of tab.queries || []) {
      const list = await consultar(q, 30, log);
      const { accepted: _a } = curateBatch(list, seen);
      found.push(..._a);
    }
    for (const artist of tab.artists || []) {
      const list = await consultar(artist, 12, log);
      found.push(...dedupe(list, seen, true));
    }

    if (found.length) {
      const list = found
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 50)
        .map((tr, i) => ({ ...tr, rank: i + 1, genre: titleGenre(tr.title) || guessGenre(`${tab.label} ${tr.artist} ${tr.title}`) }));
      tabs.push({ id: tab.id, label: tab.label, tracks: list });
      log(`  · gráficos «${tab.label}» → ${list.length} pistas`);
    }
  }
  // Mezcla las elecciones manuales del administrador por pestaña: van al
  // principio del ranking y sobreviven a las pasadas automáticas.
  const curatedCharts = readCurated().charts || {};
  for (const tab of tabs) {
    const picks = curatedCharts[tab.label] || curatedCharts[tab.id];
    if (!Array.isArray(picks) || !picks.length) continue;
    const ids = new Set(picks.map((t) => t.yt || t.id));
    tab.tracks = [...picks, ...tab.tracks.filter((t) => !ids.has(t.yt || t.id))]
      .slice(0, 50)
      .map((tr, i) => ({ ...tr, rank: i + 1 }));
  }
  writeJson('charts.json', { updatedAt: Date.now(), tabs });
  return tabs.reduce((n, t) => n + t.tracks.length, 0);
}

/* 3. Caché caliente: pre-cachea búsquedas populares */
async function warmCache(log) {
  const warm = {};
  for (const q of CONFIG.warmQueries) {
    const list = await consultar(q, CONFIG.perQuery, log);
    if (list.length) {
      warm[q] = { t: Date.now(), v: list };
      log(`  · caché «${q}» → ${list.length}`);
    }
  }
  writeJson('warm.json', { updatedAt: Date.now(), queries: Object.keys(warm).length, cache: warm });
  return Object.keys(warm).length;
}

/* ══════════════════════════════════════════════════════════════════════════
   CICLO COMPLETO
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ejecuta una pasada completa del actualizador.
 * @param {object} [opts]
 * @param {(msg:string)=>void} [opts.log]  función de log (por defecto console.log)
 * @param {boolean} [opts.force]           ignora el TTL de frescura
 * @returns {Promise<object>} resumen
 */
export async function runUpdate({ log = console.log, force = false } = {}) {
  if (status.running) {
    log('  ⏳ ya hay una actualización en curso; se omite esta pasada');
    return { skipped: true };
  }

  // Si no es forzada y los datos son recientes, no repite trabajo
  if (!force) {
    const prev = readJson('catalog.json');
    if (prev?.updatedAt && Date.now() - prev.updatedAt < CONFIG.intervalMs) {
      const mins = Math.round((Date.now() - prev.updatedAt) / 60000);
      log(`  ✓ datos recientes (hace ${mins} min); no hace falta actualizar`);
      return { fresh: true, ageMinutes: mins };
    }
  }

  status.running = true;
  status.lastError = null;
  const t0 = Date.now();
  log(`\n  🔄 actualización automática #${status.runs + 1} — ${new Date().toLocaleString()}`);

  try {
    log('  ▸ catálogo ampliado…');
    const nCatalog = await updateCatalog(log);

    log('  ▸ gráficos Top 50…');
    const nCharts = await updateCharts(log);

    log('  ▸ caché caliente…');
    const nWarm = await warmCache(log);

    status.runs += 1;
    status.lastRun = Date.now();
    status.lastDurationMs = Date.now() - t0;
    status.counts = { catalog: nCatalog, charts: nCharts, warm: nWarm };

    writeJson('status.json', {
      updatedAt: Date.now(),
      runs: status.runs,
      durationMs: status.lastDurationMs,
      counts: status.counts,
      // Actualización cada 10 min para máxima frescura automática
    nextRunAt: Date.now() + CONFIG.intervalMs,
    });

    log(`  ✅ listo en ${(status.lastDurationMs / 1000).toFixed(1)} s ` +
        `(catálogo ${nCatalog} · gráficos ${nCharts} · caché ${nWarm})\n`);
    return { ok: true, counts: status.counts, durationMs: status.lastDurationMs };
  } catch (err) {
    status.lastError = String(err.message || err);
    log(`  ❌ actualización falló: ${status.lastError}\n`);
    return { ok: false, error: status.lastError };
  } finally {
    status.running = false;
  }
}

/* ── Arranca el temporizador (lo llama el servidor) ─────────────────────── */
export function startAutoUpdater({ log = console.log } = {}) {
  const tick = async (motivo) => {
    try {
      const r = await runUpdate({ log });
      if (r?.fresh) log(`  ✓ datos frescos (hace ${r.ageMinutes} min)`);
    } catch (e) {
      log('  ❌ ' + e.message);
    }
    const next = new Date(Date.now() + CONFIG.intervalMs);
    log(`  ⏱️  próxima actualización automática: ${next.toLocaleString()}`);
  };

  // Primera pasada poco después de arrancar, sin bloquear el servidor.
  const firstDelay = Number(process.env.UPDATE_FIRST_DELAY_MS || 8000);
  setTimeout(() => tick('arranque'), firstDelay).unref?.();

  // Ciclo periódico. Si una pasada falla, la siguiente lo reintenta solo.
  const timer = setInterval(() => tick('periodo'), CONFIG.intervalMs);
  timer.unref?.();

  const horas = (CONFIG.intervalMs / 3600000).toFixed(1);
  log(`  ⏱️  actualizador automático activo (cada ${horas} h · primera en ${Math.round(firstDelay / 1000)} s)`);
  return timer;
}

/* ── Arranque "todo en uno": actualiza y luego sirve ────────────────────────
   Se usa desde `npm start`. Hace una pasada (respetando la frescura) y deja el
   temporizador activo, así que el scraper se mantiene al día sin intervención. */
export async function bootstrap({ log = console.log } = {}) {
  const r = await runUpdate({ log }).catch((e) => {
    log('  ❌ primera actualización: ' + e.message);
    return { ok: false };
  });
  return { result: r, timer: startAutoUpdater({ log }) };
}
