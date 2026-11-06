/* ══════════════════════════════════════════════════════════════════════════
   Historial de escucha local + recomendaciones por consumo.

   El servidor ya guarda el historial por usuario para la portada. Esta capa
   hace lo mismo en el dispositivo para tres cosas que deben funcionar incluso
   sin red:

     · puntuar géneros/artistas/moods/BPM que el usuario realmente escucha,
     · ordenar la rotación de Inicio y la cola con esa afinidad,
     · recordar las últimas canciones para «Escuchar de nuevo».

   El perfil es pequeño (pesos normalizados) y se guarda en localStorage.
   ══════════════════════════════════════════════════════════════════════════ */

import { featuresFor } from '../player/audioFeatures.js';

const KEY = 'sonora-listening-v1';
const VERSION = 1;
const MAX_RECENT = 60;
const MAX_PLAYS = 800;

const fold = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/* Las pistas llegan de varias fuentes (semilla, API, caché de /api/catalog,
   resultados de búsqueda). Algunas traen `moods` como objeto o texto; aquí
   siempre se normaliza a lista para que `reduce`/`map` nunca rompan el render. */
const moodsOf = (track) => (Array.isArray(track?.moods) ? track.moods : []);

function emptyProfile() {
  return {
    version: VERSION,
    updatedAt: 0,
    total: 0,
    genres: {},
    artists: {},
    categories: {},
    moods: {},
    languages: {},
    bpm: { sum: 0, count: 0 },
    plays: {},
    recent: [],
  };
}

function normalize(raw) {
  const base = emptyProfile();
  if (!raw || typeof raw !== 'object') return base;
  const bucket = (value) => (value && typeof value === 'object' ? { ...value } : {});
  return {
    version: VERSION,
    updatedAt: asNumber(raw.updatedAt),
    total: Math.max(0, asNumber(raw.total)),
    genres: bucket(raw.genres),
    artists: bucket(raw.artists),
    categories: bucket(raw.categories),
    moods: bucket(raw.moods),
    languages: bucket(raw.languages),
    bpm: {
      sum: Math.max(0, asNumber(raw.bpm?.sum)),
      count: Math.max(0, asNumber(raw.bpm?.count)),
    },
    plays: bucket(raw.plays),
    recent: Array.isArray(raw.recent) ? raw.recent.filter(Boolean).slice(0, MAX_RECENT) : [],
  };
}

/** Perfil actual (nunca lanza, siempre devuelve una estructura válida). */
export function listeningProfile() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return emptyProfile();
  }
}

function save(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch { /* cuota: el perfil vive también en memoria de la sesión */ }
  return profile;
}

function bump(bucket, key, amount = 1) {
  const k = String(key || '').trim();
  if (!k) return;
  const current = asNumber(bucket[k]);
  bucket[k] = Math.min(999, current + amount);
}

function snapshot(track, categoryId) {
  return {
    id: String(track.id || (track.yt ? `yt-${track.yt}` : '')),
    yt: String(track.yt || ''),
    title: String(track.title || ''),
    artist: String(track.artist || ''),
    album: String(track.album || ''),
    thumb: String(track.thumb || track.cover_url || ''),
    genre: String(track.genre || ''),
    moods: moodsOf(track).slice(0, 6),
    dur: asNumber(track.dur || track.duration),
    views: asNumber(track.views),
    year: asNumber(track.year) || null,
    categoryId: String(categoryId || track.categoryId || ''),
    at: Date.now(),
  };
}

/**
 * Registra una reproducción y actualiza los pesos de afinidad.
 * Devuelve el perfil resultante para poder encadenar.
 */
export function recordLocalListen(track, categoryId) {
  if (!track || (!track.id && !track.yt)) return listeningProfile();
  const profile = listeningProfile();
  const item = snapshot(track, categoryId);
  const features = featuresFor(track);

  bump(profile.genres, fold(track.genre || features?.genre));
  bump(profile.artists, fold(track.artist));
  bump(profile.categories, fold(categoryId || track.categoryId));
  for (const mood of moodsOf(track)) bump(profile.moods, fold(mood), 0.6);
  if (features?.language && features.language !== 'unknown') bump(profile.languages, features.language);
  if (features?.bpm) {
    profile.bpm.sum += features.bpm;
    profile.bpm.count += 1;
  }
  bump(profile.plays, item.id || item.yt);

  const last = profile.recent[0];
  if (!(last && last.id === item.id && Date.now() - asNumber(last.at) < 12000)) {
    profile.recent.unshift(item);
  }
  profile.recent = profile.recent.slice(0, MAX_RECENT);

  // El mapa de reproducciones no debe crecer sin límite.
  const playsEntry = Object.entries(profile.plays);
  if (playsEntry.length > MAX_PLAYS) {
    playsEntry.sort((a, b) => asNumber(b[1]) - asNumber(a[1]));
    profile.plays = Object.fromEntries(playsEntry.slice(0, MAX_PLAYS));
  }

  profile.total += 1;
  profile.updatedAt = Date.now();
  return save(profile);
}

/** ¿Cuántas veces se reprodujo esta pista? */
export function playCount(track, profile = listeningProfile()) {
  if (!track) return 0;
  return Math.max(
    asNumber(profile.plays[String(track.id || '')]),
    asNumber(profile.plays[String(track.yt || '')]),
    asNumber(profile.plays[`yt-${track.yt || ''}`]),
  );
}

/** BPM medio del consumo (0 si todavía no hay datos). */
export function averageBpm(profile = listeningProfile()) {
  const count = asNumber(profile.bpm?.count);
  return count ? asNumber(profile.bpm.sum) / count : 0;
}

/**
 * Afinidad 0..1 de una pista con el consumo histórico.
 * Mezcla género (lo que más pesa), artista, mood, categoría y BPM.
 */
export function affinityScore(track, profile = listeningProfile()) {
  if (!track) return 0;
  const max = (bucket) => Math.max(1, ...Object.values(bucket || {}).map((n) => asNumber(n)));
  const genre = asNumber(profile.genres?.[fold(track.genre)]) / max(profile.genres);
  const artist = asNumber(profile.artists?.[fold(track.artist)]) / max(profile.artists);
  const category = asNumber(profile.categories?.[fold(track.categoryId)]) / max(profile.categories);
  const moods = moodsOf(track);
  const mood = moods.reduce((sum, m) => sum + asNumber(profile.moods?.[fold(m)]), 0) /
    (Math.max(1, ...Object.values(profile.moods || {}).map((n) => asNumber(n))) * Math.max(1, moods.length));
  const targetBpm = averageBpm(profile);
  const bpm = targetBpm && featuresFor(track)?.bpm
    ? Math.max(0, 1 - Math.abs(featuresFor(track).bpm - targetBpm) / Math.max(targetBpm, 1))
    : 0;

  return Math.max(0, Math.min(1,
    genre * 0.42 + artist * 0.22 + category * 0.12 + mood * 0.12 + bpm * 0.12,
  ));
}

/* PRNG determinista (misma semilla → mismo orden, útil para pruebas). */
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

function hash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mezcla aleatoria ponderada (Weighted Shuffle).
 *
 * Cada pista recibe un peso por afinidad con el consumo + novedad (las muy
 * repetidas bajan). La semilla cambia en cada recarga, así Inicio rota de
 * verdad. Devuelve una lista nueva sin mutar la original.
 */
export function weightedShuffle(list, { profile = listeningProfile(), seed = Date.now(), limit, novelty = true } = {}) {
  const pool = (Array.isArray(list) ? list : []).filter(Boolean).slice();
  const out = [];
  const wanted = limit == null ? pool.length : Math.max(0, Math.min(pool.length, Number(limit) || 0));
  const random = mulberry32((asNumber(seed) || Date.now()) ^ hash(profile.updatedAt || 0));

  while (pool.length && out.length < wanted) {
    let total = 0;
    const weights = pool.map((track) => {
      const affinity = affinityScore(track, profile);
      const plays = playCount(track, profile);
      const repetition = novelty ? 1 / (1 + plays * 1.6) : 1;
      // Base mínima para que una pista nueva también pueda entrar.
      const weight = Math.max(0.04, (0.35 + affinity * 1.65) * repetition);
      total += weight;
      return weight;
    });
    let hit = random() * total;
    let index = 0;
    for (; index < pool.length - 1; index += 1) {
      hit -= weights[index];
      if (hit <= 0) break;
    }
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/**
 * Recomendaciones para «Para ti» / respaldo offline: prioriza afinidad, evita
 * lo recién escuchado y mantiene variedad de artistas.
 */
export function recommendFromHistory(pool, { limit = 20, profile = listeningProfile(), seed = Date.now(), exclude = [] } = {}) {
  const blocked = new Set(exclude.filter(Boolean));
  const candidates = (Array.isArray(pool) ? pool : []).filter((track) => track && !blocked.has(track.id));
  const ranked = candidates
    .map((track) => ({ track, score: affinityScore(track, profile) - (playCount(track, profile) ? 0.08 : 0) }))
    .sort((a, b) => b.score - a.score);

  // Toma una ventana de los mejores y mezcla para que no sea siempre igual.
  const window = ranked.slice(0, Math.max(limit * 3, 40)).map((entry) => entry.track);
  const shuffled = weightedShuffle(window, { profile, seed, limit });

  const out = [];
  const artistRun = [];
  for (const track of shuffled) {
    const artist = fold(track.artist);
    /* Nunca tres del mismo artista seguidas. Ojo: `[].every()` es `true`, por
       eso solo se aplica cuando ya hay dos canciones en la racha. */
    if (artist && artistRun.length >= 2 && artistRun.slice(-2).every((x) => x === artist)) continue;
    out.push(track);
    artistRun.push(artist);
    if (out.length >= limit) break;
  }
  return out;
}

/** Últimas canciones escuchadas (objetos completos, listos para pintar). */
export function recentListens(limit = 20) {
  return listeningProfile().recent.slice(0, limit);
}

/** Limpia el historial local (ajustes / privacidad). */
export function clearListeningHistory() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  return emptyProfile();
}

export const __testing = { emptyProfile, normalize, mulberry32, hash, fold };
