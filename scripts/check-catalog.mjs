/* ══════════════════════════════════════════════════════════════════════════
   QA del catálogo dinámico y la rotación ponderada.

   Comprueba el contrato que usan Inicio, la APK y las pruebas en vivo:

     GET /api/v1/tracks?sort=random&limit=20   (sin filtros)
     GET /api/v1/tracks?sort=random&offset=…   (paginación)
     GET /api/v1/tracks?sort=popular           (orden estable)

   Y las dos capas de recomendación:

     · servidor: los géneros que el usuario escucha suben en la mezcla
       (sin repetir en exceso las canciones ya oídas);
     · cliente: el historial local puntúa afinidad y genera una cola única.
   ══════════════════════════════════════════════════════════════════════════ */

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/* ── 1. API: /api/v1/tracks sin filtros ─────────────────────────────────── */

import { handleApi } from '../server/api.mjs';
import { recordListen, weightedShuffleTracks } from '../server/home.mjs';

function makeRes() {
  return {
    status: 0,
    headers: {},
    chunks: [],
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(code, headers) {
      this.status = code;
      if (headers) Object.assign(this.headers, headers);
    },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    get body() { return this.chunks.join(''); },
  };
}

async function request(path, ip = '127.0.0.1') {
  const res = makeRes();
  const req = {
    method: 'GET',
    headers: { 'user-agent': 'sonora-catalog-qa' },
    socket: { remoteAddress: ip },
    url: path,
  };
  await handleApi(req, res, new URL('http://localhost' + path));
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* respuesta no JSON */ }
  return { status: res.status, json, body: res.body };
}

const first = await request('/api/v1/tracks?sort=random&limit=20&seed=101');
check(
  'GET /api/v1/tracks?sort=random&limit=20 responde 200',
  first.status === 200,
  `HTTP ${first.status}`,
);
check(
  'la mezcla aleatoria devuelve exactamente el límite pedido',
  Array.isArray(first.json?.tracks) && first.json.tracks.length === 20,
  `${first.json?.tracks?.length ?? 0} pistas`,
);
check(
  'cada pista tiene id, yt, título y género',
  (first.json?.tracks || []).every((t) => t.id && t.yt && t.title && t.genre),
);

const sameSeed = await request('/api/v1/tracks?sort=random&limit=20&seed=101');
check(
  'la misma semilla devuelve el mismo orden (reintentos estables)',
  JSON.stringify((first.json?.tracks || []).map((t) => t.id)) ===
    JSON.stringify((sameSeed.json?.tracks || []).map((t) => t.id)),
);

const nextSeed = await request('/api/v1/tracks?sort=random&limit=20&seed=909');
check(
  'otra semilla devuelve otro orden (Inicio no se congela)',
  JSON.stringify((first.json?.tracks || []).map((t) => t.id)) !==
    JSON.stringify((nextSeed.json?.tracks || []).map((t) => t.id)),
);

const offset = await request('/api/v1/tracks?sort=random&limit=10&offset=5&seed=303');
check(
  'offset + limit pagina sin repetir dentro de la página',
  offset.status === 200 &&
    offset.json?.tracks?.length === 10 &&
    new Set((offset.json.tracks || []).map((t) => t.id)).size === 10,
  `HTTP ${offset.status} · ${offset.json?.tracks?.length ?? 0} pistas`,
);

const pageA = await request('/api/v1/tracks?sort=id&limit=50&offset=0');
const pageB = await request('/api/v1/tracks?sort=id&limit=50&offset=50');
const idsA = new Set((pageA.json?.tracks || []).map((t) => t.id));
const duplicates = (pageB.json?.tracks || []).filter((t) => idsA.has(t.id));
check(
  'la descarga paginada con sort=id no repite pistas entre páginas',
  pageA.status === 200 && pageB.status === 200 && duplicates.length === 0,
  `${idsA.size} + ${pageB.json?.tracks?.length ?? 0} pistas · ${duplicates.length} repetidas`,
);

const popular = await request('/api/v1/tracks?sort=popular&limit=10');
const views = (popular.json?.tracks || []).map((t) => Number(t.views) || 0);
check(
  'sort=popular ordena de más a menos reproducido',
  popular.status === 200 && views.every((v, i) => i === 0 || views[i - 1] >= v),
  `HTTP ${popular.status}`,
);

/* ── 2. Servidor: la afinidad sube el género escuchado ──────────────────── */

const qaUser = `qa-catalog-${Date.now()}`;
const rockTracks = Array.from({ length: 30 }, (_, i) => ({
  id: `yt-rock-heard-${i}`,
  yt: `rockHeard${String(i).padStart(2, '0')}`, // 11 caracteres
  title: `Rock escuchado ${i}`,
  artist: `Artista Rock ${i}`,
  genre: 'Rock',
  views: 1_000_000,
}));
const unheardRock = Array.from({ length: 30 }, (_, i) => ({
  id: `yt-rock-new-${i}`,
  yt: `rockNew${String(i).padStart(4, '0')}`, // 11 caracteres
  title: `Rock nuevo ${i}`,
  artist: `Artista Nuevo ${i}`,
  genre: 'Rock',
  views: 1_000_000,
}));
const popTracks = Array.from({ length: 60 }, (_, i) => ({
  id: `yt-pop-${i}`,
  yt: `popTrack${String(i).padStart(3, '0')}`,
  title: `Pop ${i}`,
  artist: `Artista Pop ${i}`,
  genre: 'Pop',
  views: 1_000_000,
}));

for (const track of rockTracks) {
  recordListen({ userId: qaUser, track, categoryId: 'Rock' });
}

const pool = [...rockTracks, ...unheardRock, ...popTracks];
const picked = { rockNew: 0, pop: 0, rockHeard: 0 };
for (const seed of [11, 22, 33, 44, 55]) {
  const mix = weightedShuffleTracks(pool, { userId: qaUser, seed, limit: 60 });
  for (const track of mix) {
    if (String(track.id).includes('rock-new')) picked.rockNew += 1;
    else if (String(track.id).includes('rock-heard')) picked.rockHeard += 1;
    else picked.pop += 1;
  }
}
check(
  'el género escuchado domina la mezcla (más rock nuevo por pista que pop)',
  picked.rockNew / unheardRock.length > picked.pop / popTracks.length,
  `rock nuevo ${picked.rockNew}/${unheardRock.length} · pop ${picked.pop}/${popTracks.length}`,
);
check(
  'las canciones ya escuchadas bajan por novedad',
  picked.rockHeard < picked.rockNew,
  `rock oído ${picked.rockHeard} · rock nuevo ${picked.rockNew}`,
);

/* Regresión: `/api/catalog` puede devolver `moods` como objeto en pistas
   antiguas. La mezcla del servidor debe ignorarlo, no lanzar. */
let legacyMix = [];
let legacyError = '';
try {
  legacyMix = weightedShuffleTracks(
    [{ id: 'yt-legacy', yt: 'legacyMood', title: 'Legacy', genre: 'Pop', moods: {} }],
    { userId: qaUser, seed: 1, limit: 1 },
  );
} catch (e) {
  legacyError = e.message;
}
check(
  'la mezcla tolera pistas con moods en formato antiguo',
  !legacyError && legacyMix.length === 1,
  legacyError || `${legacyMix.length} pista`,
);

/* ── 3. Cliente: historial local, afinidad y cola sin repetidos ─────────── */

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const history = await import('../src/state/listeningHistory.js');
const catalogStore = await import('../src/api/catalogStore.js');

for (let i = 0; i < 12; i += 1) {
  history.recordLocalListen({
    id: `yt-local-rock-${i}`,
    yt: `localRock${String(i).padStart(2, '0')}`, // 11 caracteres
    title: `Rock local ${i}`,
    artist: 'Banda Local',
    genre: 'Rock',
    moods: ['Energía'],
    dur: 220,
  });
}

const rockAffinity = history.affinityScore({ genre: 'Rock', artist: 'Banda Local', moods: ['Energía'] });
const popAffinity = history.affinityScore({ genre: 'Pop', artist: 'Otro', moods: ['Romántico'] });
check(
  'el historial local eleva el género escuchado',
  rockAffinity > popAffinity,
  `rock ${rockAffinity.toFixed(2)} · pop ${popAffinity.toFixed(2)}`,
);

const localPool = [...unheardRock, ...popTracks];
const localMix = history.weightedShuffle(localPool, { seed: 777, limit: 20 });
check(
  'la mezcla local no repite pistas',
  localMix.length === 20 && new Set(localMix.map((t) => t.id)).size === 20,
  `${localMix.length} pistas`,
);

const recommendations = history.recommendFromHistory(localPool, { seed: 5, limit: 15 });
check(
  'las recomendaciones respetan el límite y no vienen vacías',
  recommendations.length > 0 && recommendations.length <= 15,
  `${recommendations.length} recomendaciones`,
);

/* ── 4. Respaldo sin red: caché/semilla siempre disponible ──────────────── */

globalThis.fetch = async () => {
  throw new Error('red caída (simulada)');
};

const offlinePool = catalogStore.catalogPool();
check(
  'sin API el catálogo en memoria sigue disponible',
  Array.isArray(offlinePool) && offlinePool.length > 0,
  `${offlinePool.length} pistas`,
);

const offlineLoad = await catalogStore.loadCatalog({ force: true });
check(
  'loadCatalog no lanza si la red falla',
  Array.isArray(offlineLoad) && offlineLoad.length > 0,
  `${offlineLoad.length} pistas`,
);

const offlineRecommendations = catalogStore.recommendTracks({ limit: 10, seed: 3 });
check(
  'las recomendaciones funcionan sin conexión',
  offlineRecommendations.length > 0 && offlineRecommendations.length <= 10,
  `${offlineRecommendations.length} pistas`,
);

if (failures) {
  console.error(`\n${failures} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\n✓ catálogo dinámico y rotación ponderada OK');
