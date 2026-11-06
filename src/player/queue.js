/* ══════════════════════════════════════════════════════════════════════════
   Cola de reproducción estricta.

   Regla de oro: al avanzar sola (o al pulsar siguiente) nunca saltamos a un
   género distinto. El siguiente tema sale del mismo artista o, si no hay,
   del mismo género. Si no existe ninguno, la reproducción se detiene; no se
   rellena con canciones aleatorias de otro estilo.

   La bolsa combina el catálogo curado con el catálogo en vivo que el servidor
   deja en caché, para que una cumbia del catálogo ampliado siga sonando en
   cumbia y no salte a pop internacional.
   ══════════════════════════════════════════════════════════════════════════ */

import { TRACKS } from '../data/catalog.js';
import { cachedCatalogTracks } from '../api/liveData.js';
import { catalogPool } from '../api/catalogStore.js';

const GENERIC_GENRES = new Set(['', 'ritmo', 'sonora', 'otros', 'other', 'music', 'música', 'varios']);

export const norm = (value) => String(value || '').trim().toLowerCase();

export function artistKey(name) {
  return norm(name)
    .replace(/\s+(?:ft\.?|feat\.?|featuring)\s+.*$/, '')
    .replace(/\s+&\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function meaningfulGenre(genre) {
  return Boolean(genre) && !GENERIC_GENRES.has(norm(genre));
}

export function sameArtist(a, b) {
  const x = artistKey(a);
  const y = artistKey(b);
  return Boolean(x && y && x === y);
}

export function isStrictMatch(candidate, seed) {
  if (!candidate || !seed || candidate.id === seed.id) return false;
  if (sameArtist(candidate.artist, seed.artist)) return true;
  return meaningfulGenre(seed.genre) && norm(candidate.genre) === norm(seed.genre);
}

/* ── Filtro de candidatas para la radio ────────────────────────────────────
   El catálogo en vivo mezcla canciones con recopilatorios, mixes de horas y
   vídeos de letras. Nada de eso debe entrar en «A continuación»: rompe la
   experiencia y además hace imposible mantener el estilo. */
const JUNK_TITLE = /\b(?:top\s*\d+|top\s+(?:global|songs|hits|canciones|music|m[úu]sica)|megamix|non-?stop|compilation|recopilaci[oó]n|best of|greatest hits|full album|album completo|playlist|grandes\s+[eé]xitos|viejitas|medley|popurr[ií]|mix|old\s*school|#mix|\d+\s*(?:hour|hours|hora|horas)|(?:las?\s+)?\d+\s+(?:mejores|best)|making\s+of|vevo\s+footnotes|detr[áa]s\s+de\s+c[áa]maras|behind\s+the\s+scenes)\b/i;
const LOW_VALUE_TITLE = /\b(?:tutorial|how to|como hacer|review|unboxing|podcast|vlog|reaction|reacts|gameplay|walkthrough|trailer|karaoke|tribute)\b/i;
const LYRIC_TITLE = /\b(?:lyrics?|letra|letras|sub\s*(?:espa[ñn]ol|esp|english|ingl[ée]s)|traducid[oa]|subtitulad[oa])\b/i;
const JUNK_ARTIST = /(?:\bletras?\.?\s*4k\b|\blyrics?\s*(?:4k|channel|music)\b|\btop\s*lau\b|\bmixes?\s+(?:para|de)\b|\bdj\s*(?:carloss|vj)\b|\bhear this music\b|\bproducciones\b|\bcompilations?\b|\bplaylists?\b)/i;
const PLACEHOLDER_ARTISTS = new Set(['', 'sonora', 'sonora music', 'artista', 'artista desconocido', 'canal', 'lista', 'ritmo']);

/* El título es en realidad una lista de artistas del canal, no una canción. */
function looksLikeArtistOnly(title, artist) {
  const sides = title.split(/\sx\s/i);
  if (sides.length === 2 && title.length <= 48) {
    const words = (s) => norm(s).split(' ').filter((w) => w.length > 1);
    if (words(sides[0]).length + words(sides[1]).length >= 3) return true;
  }
  const titleTokens = norm(title).split(' ').filter((w) => w.length > 1);
  if (titleTokens.length < 2) return false;
  const artistNorm = norm(artist);
  if (!artistNorm) return false;
  return titleTokens.every((w) => artistNorm.includes(w));
}

/** ¿Sirve como pista reproducible de una cola automática? */
export function isQueueCandidate(track, { maxDuration = 900 } = {}) {
  if (!track) return false;
  const id = String(track.id || '');
  const yt = String(track.yt || '');
  if (!id && !yt) return false;
  if (/^(?:ch|pl)-/.test(yt) || /^yt-(?:ch|pl)-/.test(id)) return false;
  if (track.kind && track.kind !== 'video') return false;

  const title = String(track.title || '').trim();
  if (title.length < 2) return false;
  const rawArtist = String(track.artist || '');
  if (PLACEHOLDER_ARTISTS.has(norm(rawArtist)) || JUNK_ARTIST.test(rawArtist)) return false;

  if (JUNK_TITLE.test(title) || LOW_VALUE_TITLE.test(title) || LYRIC_TITLE.test(title)) return false;
  if (looksLikeArtistOnly(title, rawArtist)) return false;
  // Medleys con tres o más canciones en el título.
  if ((title.match(/\s\/\s/g) || []).length >= 2) return false;

  const dur = Number(track.dur || track.duration || 0);
  if (dur && (dur < 60 || dur > maxDuration)) return false;
  return true;
}

/* Une listas sin duplicar por id y descarta entradas incompletas. */
export function mergeTracks(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const track of list) {
      if (!track || !track.id || seen.has(track.id)) continue;
      seen.add(track.id);
      out.push(track);
    }
  }
  return out;
}

/* Catálogo completo disponible ahora mismo (curado + caché en vivo). */
export function globalPool() {
  try {
    // `catalogPool` incluye el catálogo del API fusionado + caché persistida.
    return mergeTracks(catalogPool(), cachedCatalogTracks({ allowStale: true }), TRACKS);
  } catch {
    return mergeTracks(TRACKS, cachedCatalogTracks({ allowStale: true }));
  }
}

/**
 * Temas afines a `seed`: primero mismo artista, después mismo género.
 * Nunca devuelve temas de otros géneros ni el propio tema.
 */
export function strictRelated(seed, { pool, limit = 20, exclude = [] } = {}) {
  if (!seed) return [];
  const all = mergeTracks(pool || globalPool());
  const blocked = new Set([seed.id, ...exclude]);
  const seen = new Set();
  const out = [];

  const push = (track) => {
    if (!track || blocked.has(track.id) || seen.has(track.id)) return;
    if (!isStrictMatch(track, seed)) return;
    seen.add(track.id);
    out.push(track);
  };

  // 1) Mismo artista (máxima afinidad).
  all.filter((track) => sameArtist(track.artist, seed.artist)).forEach(push);
  // 2) Mismo género, si el género es concreto (no "Ritmo"/"Otros").
  if (meaningfulGenre(seed.genre)) {
    all.filter((track) => norm(track.genre) === norm(seed.genre)).forEach(push);
  }

  return out.slice(0, limit);
}

/**
 * Elige el siguiente tema respetando el contexto de reproducción.
 *
 * - Primero busca un tema afín que ya esté después del índice actual.
 * - Si no hay, toma un afín del catálogo global que aún no esté en la lista.
 * - En modo aleatorio elige al azar entre todos los afines (sin salir del
 *   género/artista).
 * - Devuelve `null` cuando no hay ningún tema afín: preferimos parar antes
 *   que romper el estilo.
 */
export function pickStrictNext({
  current,
  contextList = [],
  index = -1,
  pool,
  visited,
  shuffleMode = false,
  random = Math.random,
}) {
  if (!current) return null;

  const basePool = mergeTracks(contextList, pool || globalPool());
  const candidates = strictRelated(current, { pool: basePool, limit: 500 });
  if (!candidates.length) return null;

  const isVisited = (track) => Boolean(visited?.has?.(track.id));
  const unvisited = candidates.filter((track) => !isVisited(track));

  if (shuffleMode) {
    const source = unvisited.length ? unvisited : candidates;
    return source[Math.floor(random() * source.length)] || source[0];
  }

  // Siguiente afín que ya venía en la lista, sin retroceder.
  if (Array.isArray(contextList) && index >= 0) {
    const ids = new Set(candidates.map((track) => track.id));
    const after = contextList
      .slice(index + 1)
      .filter((track) => track && ids.has(track.id));
    const fresh = after.find((track) => !isVisited(track));
    if (fresh) return fresh;
    if (after.length) return after[0];
  }

  // Temas afines del catálogo que todavía no forman parte de la lista.
  const inList = new Set(contextList.map((track) => track && track.id));
  const outside = candidates.filter((track) => !inList.has(track.id));
  const outsideFresh = outside.find((track) => !isVisited(track));
  if (outsideFresh) return outsideFresh;
  if (outside.length) return outside[0];

  return null;
}
