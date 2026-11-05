/* ══════════════════════════════════════════════════════════════════════════
   Inicio dinámico + historial de escucha (Sonora).

   El cliente ya no guarda secciones estáticas: pide `GET /api/v1/home/feed`
   y recibe categorías ordenadas por lo que el usuario escuchó recientemente,
   pistas rotadas (las no escuchadas suben), chips de estado de ánimo y todas
   las secciones de la portada (descubrimiento, mezclas, rankings, novedades,
   artistas, vídeos…). Cada visita usa una semilla distinta para que el inicio
   nunca se vea congelado.

   El historial se guarda en `server/data/history.json`; en producción esta
   capa se sustituye por PostgreSQL (`user_listening_history`) sin cambiar la
   forma de la respuesta.
   ══════════════════════════════════════════════════════════════════════════ */

import { readJson, writeJson } from './updater.mjs';
import { publicCategories, categoryTracks } from './live.mjs';
import { featuresFor } from '../src/player/audioFeatures.js';

const HISTORY_FILE = 'history.json';
const HISTORY_VERSION = 1;
const MAX_PER_USER = 240;
const MAX_USERS = 400;

const MOOD_CHIPS = [
  'Fiesta', 'Fiesta latina', 'Energía', 'Workout',
  'Romántico', 'Relajado', 'Triste', 'Concentración',
];

const norm = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asText = (value, max = 200) => String(value || '').slice(0, max);

/* ── PRNG determinista: la misma semilla produce la misma portada ───────── */
function hashString(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Historial ──────────────────────────────────────────────────────────── */

function readHistoryFile() {
  const data = readJson(HISTORY_FILE) || {};
  return {
    version: HISTORY_VERSION,
    updatedAt: asNumber(data.updatedAt),
    users: data.users && typeof data.users === 'object' ? data.users : {},
  };
}

function emptyUser() {
  return { updatedAt: 0, listens: [], weights: { categories: {}, genres: {}, artists: {}, moods: {} } };
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return emptyUser();
  return {
    updatedAt: asNumber(raw.updatedAt),
    listens: Array.isArray(raw.listens) ? raw.listens : [],
    weights: {
      categories: raw.weights?.categories && typeof raw.weights.categories === 'object' ? raw.weights.categories : {},
      genres: raw.weights?.genres && typeof raw.weights.genres === 'object' ? raw.weights.genres : {},
      artists: raw.weights?.artists && typeof raw.weights.artists === 'object' ? raw.weights.artists : {},
      moods: raw.weights?.moods && typeof raw.weights.moods === 'object' ? raw.weights.moods : {},
    },
  };
}

/** Historial público (solo lo necesario para pintar «Escuchar de nuevo»). */
export function readHistory(userId) {
  const data = readHistoryFile();
  const user = normalizeUser(data.users[String(userId || '')]);
  return {
    updatedAt: data.updatedAt,
    listens: user.listens.slice(0, 60),
  };
}

function bump(bucket, key, amount = 1) {
  const k = String(key || '').trim();
  if (!k) return;
  bucket[k] = Math.min(500, asNumber(bucket[k]) + amount);
}

function snapshot(track, categoryId) {
  if (!track) return null;
  const id = asText(track.id || track.track_id, 128);
  const yt = asText(track.yt, 32);
  if (!id && !yt) return null;
  return {
    id: id || `yt-${yt}`,
    yt,
    title: asText(track.title, 200),
    artist: asText(track.artist, 200),
    album: asText(track.album, 200),
    thumb: asText(track.thumb || track.cover_url || track.cover, 500),
    genre: asText(track.genre, 80),
    moods: Array.isArray(track.moods) ? track.moods.slice(0, 6).map((m) => asText(m, 40)) : [],
    dur: Math.max(0, asNumber(track.dur || track.duration)),
    views: Math.max(0, asNumber(track.views)),
    year: asNumber(track.year) || null,
    categoryId: asText(categoryId || track.categoryId, 80),
    at: Date.now(),
  };
}

/** Guarda una reproducción y actualiza los pesos de afinidad del usuario. */
export function recordListen({ userId, track, categoryId } = {}) {
  const uid = asText(userId, 80) || 'anon';
  const item = snapshot(track, categoryId);
  if (!item) return null;

  const data = readHistoryFile();
  const user = normalizeUser(data.users[uid]);

  // Evita duplicar la misma canción si el cliente reintenta en segundos.
  const last = user.listens[0];
  if (!(last && last.id === item.id && Date.now() - asNumber(last.at) < 12000)) {
    user.listens.unshift(item);
  }
  user.listens = user.listens.slice(0, MAX_PER_USER);

  bump(user.weights.categories, item.categoryId);
  bump(user.weights.genres, item.genre);
  bump(user.weights.artists, item.artist);
  for (const mood of item.moods) bump(user.weights.moods, mood, 0.5);
  user.updatedAt = Date.now();

  data.users[uid] = user;
  data.updatedAt = Date.now();

  // Limita el número de usuarios guardados (los más antiguos salen primero).
  const entries = Object.entries(data.users);
  if (entries.length > MAX_USERS) {
    entries.sort((a, b) => asNumber(b[1]?.updatedAt) - asNumber(a[1]?.updatedAt));
    data.users = Object.fromEntries(entries.slice(0, MAX_USERS));
  }

  writeJson(HISTORY_FILE, data);
  return { userId: uid, listen: item, listens: user.listens.length };
}

export function listeningWeights(userId) {
  const data = readHistoryFile();
  const user = normalizeUser(data.users[String(userId || '')]);
  return { user, weights: user.weights };
}

/* ── Utilidades de selección ────────────────────────────────────────────── */

function seenCounts(user) {
  const counts = new Map();
  for (const item of user?.listens || []) {
    const key = item.id || item.yt;
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function trackWeight(track, seen) {
  const base = 1 + Math.min(2.5, Math.log10(1 + asNumber(track.views)) * 0.35);
  const plays = seen.get(track.id || track.yt) || 0;
  // Lo no escuchado sube hasta 3×; lo repetido baja.
  return base / (1 + plays * 1.4);
}

function weightedTake(list, count, random, seen = new Map()) {
  const pool = (list || []).filter(Boolean).slice();
  const out = [];
  while (pool.length && out.length < count) {
    let total = 0;
    const weights = pool.map((track) => {
      const w = Math.max(0.05, trackWeight(track, seen));
      total += w;
      return w;
    });
    let hit = random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      hit -= weights[idx];
      if (hit <= 0) break;
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function dedupeById(lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const track of list || []) {
      if (!track) continue;
      const key = track.id || track.yt;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(track);
    }
  }
  return out;
}

function sortByViews(list) {
  return [...list].sort((a, b) => asNumber(b.views) - asNumber(a.views));
}

function uniqueArtists(tracks, limit = 12) {
  const map = new Map();
  for (const track of tracks) {
    const name = asText(track.artist, 120);
    if (!name) continue;
    const key = norm(name);
    if (!key) continue;
    const hit = map.get(key);
    if (!hit) {
      map.set(key, {
        id: `artist-${key.replace(/\s+/g, '-')}`,
        name,
        thumb: track.thumb,
        listeners: asNumber(track.views),
        tracks: [track],
      });
    } else {
      hit.tracks.push(track);
      if (!hit.thumb) hit.thumb = track.thumb;
      hit.listeners += asNumber(track.views);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.listeners - a.listeners || b.tracks.length - a.tracks.length)
    .slice(0, limit)
    .map((a) => ({ ...a, tracks: a.tracks.slice(0, 4) }));
}

/* ── Moods ──────────────────────────────────────────────────────────────── */

const MOOD_ALIASES = {
  fiesta: 'Fiesta',
  'fiesta latina': 'Fiesta latina',
  energia: 'Energía',
  energa: 'Energía',
  workout: 'Workout',
  romantico: 'Romántico',
  relajado: 'Relajado',
  triste: 'Triste',
  concentracion: 'Concentración',
  noche: 'Noche',
  clasico: 'Clásico',
};

const FEATURE_CACHE = new Map();
function featuresForCached(track) {
  if (!track) return null;
  const key = track.id || track.yt || `${track.title || ''}|${track.artist || ''}`;
  if (FEATURE_CACHE.has(key)) return FEATURE_CACHE.get(key);
  let value = null;
  try { value = featuresFor(track); } catch { value = null; }
  if (FEATURE_CACHE.size > 4000) FEATURE_CACHE.clear();
  FEATURE_CACHE.set(key, value);
  return value;
}

function moodTags(track) {
  const out = new Set();
  for (const raw of Array.isArray(track?.moods) ? track.moods : []) {
    const key = MOOD_ALIASES[norm(raw)];
    if (key) out.add(key);
  }
  const genre = norm(track?.genre);
  if (/reggaeton|dembow|trap latino|urbano latino|dancehall|salsa|bachata|cumbia|merengue/.test(genre)) {
    out.add('Fiesta latina');
    out.add('Fiesta');
  }
  if (/popular|vallenato|ranchera|regional|corrido|norte/.test(genre)) {
    out.add('Triste');
    out.add('Romántico');
  }
  if (/rock|metal|punk|electro|edm|hip hop|trap$/.test(genre)) out.add('Energía');
  if (/lofi|acoustic|balada/.test(genre)) out.add('Relajado');
  if (/balada|pop/.test(genre)) out.add('Romántico');
  if (/lofi|ambient|chill/.test(genre)) out.add('Concentración');

  /* El catálogo suele traer géneros genéricos («Ritmo») y moods vacíos. El
     mismo motor que usa la radio infiere subgénero, energía y estado de ánimo,
     de modo que cada chip filtra el catálogo completo, no solo los metadatos
     escritos a mano. */
  const f = featuresForCached(track);
  if (f) {
    const all = new Set([f.mood, ...(f.moods || [])].map(norm));
    const sub = norm(f.subgenre);
    if (f.family === 'latin' && /reggaeton|dembow|trap latino|urbano latino|dancehall|perreo/.test(sub)) {
      out.add('Fiesta latina');
      out.add('Fiesta');
    }
    if (all.has('fiesta') || all.has('noche') || (f.family === 'latin' && f.energy >= 0.8)) out.add('Fiesta');
    if (all.has('energia') || f.energy >= 0.8) out.add('Energía');
    if (all.has('workout') || f.energy >= 0.9) out.add('Workout');
    if (all.has('romantico') || /popular|vallenato|ranchera|banda|norteno|corrido|mariachi|despecho/.test(sub) || (f.family === 'pop' && f.energy < 0.6)) out.add('Romántico');
    if (all.has('relajado') || f.energy <= 0.42) out.add('Relajado');
    if (all.has('triste') || (f.family === 'pop' && f.energy < 0.45)) out.add('Triste');
    if (all.has('concentracion') || f.family === 'lofi' || f.energy <= 0.32) out.add('Concentración');
  }
  if (out.size === 0) out.add('Fiesta');
  return out;
}

export function normalizeMood(value) {
  return MOOD_ALIASES[norm(value)] || '';
}

/** ¿La pista pertenece al chip de estado de ánimo? */
export function matchesMood(track, mood) {
  const wanted = normalizeMood(mood);
  if (!wanted) return true;
  return moodTags(track).has(wanted);
}

function buildMoods(pool, seen, random) {
  return MOOD_CHIPS.map((label) => {
    const matches = pool.filter((track) => moodTags(track).has(label));
    return {
      label,
      count: matches.length,
      tracks: weightedTake(matches, 16, random, seen).slice(0, 12),
    };
  });
}

/* ── Secciones ──────────────────────────────────────────────────────────── */

function mixFromCategory(category, tracks, index, seen, random) {
  const rotated = weightedTake(tracks, 12, random, seen);
  if (!rotated.length) return null;
  return {
    id: `mix-${norm(category.id).replace(/\s+/g, '-')}`,
    title: category.label,
    desc: category.tag || '',
    descEn: category.tagEn || '',
    cover: rotated[0]?.thumb || category.cover,
    categoryId: category.id,
    tracks: rotated,
    sort: index,
  };
}

function stationFromGenre(genre, tracks, index, random, seen) {
  const rotated = weightedTake(tracks.filter((t) => norm(t.genre) === norm(genre)), 12, random, seen);
  if (rotated.length < 3) return null;
  return {
    id: `station-${norm(genre).replace(/\s+/g, '-')}`,
    title: genre,
    desc: `${rotated.length} canciones`,
    cover: rotated[0]?.thumb,
    tracks: rotated,
    sort: index,
  };
}

/**
 * Construye la portada completa.
 *
 * Opciones:
 *   userId, lang, seed, mood
 *   catalog, curated, coverProxy (los inyecta `server/api.mjs`)
 *   limit (pistas por categoría, 8–40)
 */
export function homeFeed({
  userId = '',
  lang = 'es',
  seed = Date.now(),
  mood = '',
  catalog,
  curated,
  coverProxy = (x) => x,
  limit = 12,
} = {}) {
  const uid = asText(userId, 80);
  const numericSeed = asNumber(seed) || hashString(`${uid}|${Date.now()}`);
  const random = mulberry32(numericSeed ^ hashString(uid || 'guest'));
  const { user, weights } = listeningWeights(uid);
  const seen = seenCounts(user);
  const perCategory = Math.max(8, Math.min(20, asNumber(limit, 12) || 12));

  const data = publicCategories(catalog);
  const catalogData = catalog && typeof catalog === 'object' ? catalog : { tracks: [] };
  const curatedData = curated && typeof curated === 'object' ? curated : { catalog: [] };

  // Pistas de cada categoría activa + rotación independiente.
  const categoryEntries = data.categories.map((category, index) => {
    const result = categoryTracks(category.id, {
      catalog: catalogData,
      curated: curatedData,
      limit: Math.max(48, perCategory * 4),
      coverProxy,
    });
    const tracks = result?.tracks || [];
    const tracksWithCategory = tracks.map((t) => ({ ...t, categoryId: category.id }));
    const historyScore = (weights.categories?.[category.id] || 0) * 9 +
      (category.genres || []).reduce((sum, g) => sum + (weights.genres?.[g] || weights.genres?.[norm(g)] || 0), 0) * 2;
    const jitter = random() * 0.9;
    return {
      category,
      index,
      tracks: tracksWithCategory,
      rotated: weightedTake(tracksWithCategory, perCategory, random, seen),
      score: historyScore + jitter,
    };
  });

  // Categorías con más historial primero; sin historial se respeta `sort`.
  categoryEntries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.category.sort - b.category.sort;
  });

  const pool = dedupeById(categoryEntries.map((entry) => entry.tracks));
  /* Los chips deben contar sobre TODO el catálogo, no sobre la muestra corta de
     cada categoría: así el número del chip coincide con lo que devuelve
     `/api/v1/tracks?mood=…` y el filtro nunca aparece vacío. */
  const moodPool = catalogTracks({
    catalog: catalogData,
    curated: curatedData,
    coverProxy,
    limit: 1200,
  });
  const charts = sortByViews(pool).slice(0, 10);
  const discovery = weightedTake(pool, 24, random, seen);
  const trends = weightedTake(sortByViews(pool), 12, random, seen);
  const newAdditions = weightedTake(pool, 8, random, seen);

  const categories = categoryEntries.map(({ category, tracks, rotated }) => ({
    ...category,
    tracks: rotated,
    count: tracks.length || category.count || 0,
  }));

  const mixes = categoryEntries
    .map((entry, i) => mixFromCategory(entry.category, entry.tracks, i, seen, random))
    .filter(Boolean)
    .slice(0, 6);

  const genreNames = [...new Set(pool.map((t) => t.genre).filter(Boolean))]
    .sort((a, b) => pool.filter((t) => t.genre === b).length - pool.filter((t) => t.genre === a).length);
  const stations = genreNames
    .map((genre, i) => stationFromGenre(genre, pool, i, random, seen))
    .filter(Boolean)
    .slice(0, 6);

  // «Novedades»: lo más reciente por año si existe; si no, los más vistos.
  const withYear = pool.filter((t) => asNumber(t.year) >= 2015);
  const releasesSource = (withYear.length >= 6 ? withYear : sortByViews(pool)).slice(0, 80);
  const releases = weightedTake(releasesSource, 6, random, seen).map((track, i) => ({
    id: `release-${i}-${hashString(track.id || track.title)}`,
    title: track.album && track.album !== 'Sonora' ? track.album : track.title,
    artist: track.artist,
    year: asNumber(track.year) || '',
    cover: track.thumb,
    tracks: [track, ...pool.filter((x) => x.artist === track.artist && x.id !== track.id)].slice(0, 4),
  }));

  const artists = uniqueArtists(pool, 8);
  const videos = weightedTake(charts.slice(0, 30), 6, random, seen);

  const recentPool = (user.listens || [])
    .map((item) => {
      const hit = pool.find((t) => (item.id && t.id === item.id) || (item.yt && t.yt === item.yt));
      return hit ? { ...hit, at: item.at } : null;
    })
    .filter(Boolean);
  const recent = dedupeById([recentPool]).slice(0, 20);

  // Afinidad: mezcla de lo escuchado + descubrimiento. Nunca vacío.
  const affinity = pool.filter((track) => {
    const genre = norm(track.genre);
    return asNumber(weights.genres?.[track.genre]) > 0 || asNumber(weights.genres?.[genre]) > 0 ||
      asNumber(weights.artists?.[track.artist]) > 0;
  });
  const quickPicks = weightedTake(affinity.length >= 6 ? affinity : pool, 8, random, seen);

  const selectedMood = MOOD_ALIASES[norm(mood)] || '';
  const moodTracks = selectedMood
    ? weightedTake(moodPool.filter((track) => moodTags(track).has(selectedMood)), 60, random, seen)
    : [];

  return {
    ok: true,
    source: 'sonora',
    generatedAt: Date.now(),
    seed: numericSeed,
    userId: uid,
    lang: lang === 'en' ? 'en' : 'es',
    updatedAt: data.updatedAt,
    categories,
    moods: buildMoods(moodPool, seen, random),
    selectedMood,
    moodTracks,
    sections: {
      recent,
      quickPicks,
      discovery,
      mixes,
      // El cliente usa `mixes` como respaldo de «Para ti»; no duplicamos el
      // mismo contenido dos veces en el JSON.
      forYou: [],
      releases,
      charts,
      newAdditions,
      trends,
      stations,
      artists,
      videos,
    },
  };
}

/** Catálogo completo (sin categorías) para búsquedas por mood/género. */
export function catalogTracks({
  catalog,
  curated,
  coverProxy = (x) => x,
  genre = '',
  q = '',
  limit = 120,
} = {}) {
  const data = publicCategories(catalog);
  const lists = [];
  for (const category of data.categories) {
    const result = categoryTracks(category.id, {
      catalog,
      curated,
      limit: 300,
      coverProxy,
    });
    if (result?.tracks?.length) lists.push(result.tracks.map((t) => ({ ...t, categoryId: category.id })));
  }
  let pool = dedupeById(lists);
  if (genre) {
    const wanted = norm(genre);
    pool = pool.filter((track) => norm(track.genre) === wanted || norm(track.genre).startsWith(wanted + ' '));
  }
  if (q) {
    const needle = norm(q);
    pool = pool.filter((track) => norm(`${track.title} ${track.artist}`).includes(needle));
  }
  return pool.slice(0, Math.max(1, Math.min(2000, asNumber(limit, 120) || 120)));
}

export const __testing = { MOOD_CHIPS, readHistoryFile, moodTags, weightedTake };
