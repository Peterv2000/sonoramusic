/* ══════════════════════════════════════════════════════════════════════════
   Radio de la canción / cola inteligente.

   Dada la pista activa se calcula su vector de audio (género, subgénero, BPM,
   energía, bailabilidad, mood y época) y se combinan dos fuentes:

     · catálogo local (curado + caché en vivo), siempre disponible;
     · búsquedas por estilo y por artista, para ampliar la variedad.

   El resultado lo ordena `buildSmartQueue`, que prioriza misma vibra y limita
   a dos canciones seguidas por artista. Todo degrada con elegancia: si el
   servidor no responde, la cola local sigue sonando sin cortes.
   ══════════════════════════════════════════════════════════════════════════ */

import { searchYouTubeDetailed } from './youtubeSearch.js';
import { globalPool, isQueueCandidate, mergeTracks } from '../player/queue.js';
import { featuresFor, fold, isMeaningfulGenre, songKey } from '../player/audioFeatures.js';
import { buildSmartQueue } from '../player/smartQueue.js';

const CACHE = new Map();
const TTL = 1000 * 60 * 30; // 30 min
const MAX = 80;

/* Limpia sufijos de canal que no aportan al nombre del artista. */
function bareArtistName(value) {
  return String(value || '')
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .replace(/\s*vevo\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Descarta compilaciones, directos eternos y contenido que no es una canción. */
function usableResult(item, seed) {
  if (!isQueueCandidate(item)) return false;
  if (seed && ((item.id && item.id === seed.id) || (item.yt && item.yt === seed.yt))) return false;
  return true;
}

/* Consultas de estilo derivadas del vector de la canción, no del artista.
   Una balada busca baladas; un reggaetón busca fiesta latina. */
function styleQueries(features) {
  if (!features) return [];
  const low = features.energy < 0.48;
  const high = features.energy >= 0.72;
  const out = [];

  switch (features.family) {
    case 'latin': {
      /* Consultas estrictas por subgénero: el urbano latino solo busca urbano
         latino, la música popular solo busca popular/regional y el merengue
         solo busca merengue/tropical. Nunca consultas latinas amplias que
         devuelven reggaetón para cualquier ritmo. */
      const sub = fold(features.subgenre);
      if (sub === 'reggaeton') out.push('reggaeton', 'reggaeton urbano', 'latin urbano');
      else if (sub === 'trap latino') out.push('trap latino', 'trap latino 2024', 'urbano latino');
      else if (sub === 'dembow') out.push('dembow', 'dembow dominicano', 'urbano latino');
      else if (sub === 'dancehall latino') out.push('dancehall', 'dancehall latino', 'reggaeton');
      else if (sub === 'urbano latino') out.push('urbano latino', 'reggaeton urbano', 'latin urbano');
      else if (sub === 'merengue') out.push('merengue', 'merengue dominicano', 'merengue clasico');
      else if (sub === 'salsa') out.push('salsa clasica', 'salsa', 'salsa romantica');
      else if (sub === 'bachata') out.push('bachata', 'bachata romantica', 'bachata clasica');
      else if (sub === 'cumbia') out.push('cumbia', 'cumbia clasica', 'cumbia sonidera');
      else if (sub === 'popular') out.push('musica popular', 'ranchera', 'corrido');
      else if (sub === 'vallenato') out.push('vallenato', 'musica popular', 'despecho');
      else {
        /* Sin subgénero claro: se usa el género real de la pista antes que una
           lista genérica que devuelve reggaetón para cualquier ritmo latino. */
        const genre = fold(features.genre);
        if (genre && !/latino|latin|sonora/.test(genre)) out.push(`${features.genre} musica`);
        out.push(low ? 'latin romanticas' : 'latin party hits');
      }
      break;
    }
    case 'rock':
      out.push(low ? 'rock acustico' : 'rock clasico');
      out.push(high ? 'rock workout' : 'rock hits');
      break;
    case 'pop':
      out.push(low ? 'baladas romanticas' : 'pop hits');
      out.push(low ? 'acoustic love songs' : 'pop dance hits');
      break;
    case 'electronic':
      out.push('electronic dance hits');
      out.push(low ? 'chill electronic' : 'edm party');
      break;
    case 'hiphop':
      out.push('hip hop hits');
      out.push(low ? 'chill hip hop' : 'rap party hits');
      break;
    case 'rnb':
      out.push('r&b soul hits');
      out.push(low ? 'r&b love songs' : 'r&b party');
      break;
    case 'lofi':
      out.push('lofi chill beats', 'chillhop study');
      break;
    case 'acoustic':
      out.push(low ? 'acoustic love songs' : 'acoustic hits', 'folk acoustic');
      break;
    default:
      break;
  }

  if (features.mood === 'triste') out.push('canciones tristes');
  else if (features.mood === 'romantico') out.push('baladas romanticas');
  else if (features.mood === 'workout') out.push('workout music');
  else if (features.mood === 'concentracion') out.push('musica para estudiar');

  if (features.year && features.year < 2005) out.push(`${features.genre} clasico`);
  return out;
}

function buildQueries(track, features) {
  const artist = bareArtistName(track?.artist);
  const hint = features?.subgenre || '';
  const queries = [];
  if (artist) queries.push({ q: artist, hint: '' });
  for (const q of styleQueries(features)) queries.push({ q, hint });

  if (!queries.length) {
    const title = String(track?.title || '').trim();
    if (title) queries.push({ q: `${title} ${artist}`.trim(), hint: '' });
  }

  const seen = new Set();
  return queries
    .map(({ q, hint: h }) => ({ q: String(q || '').replace(/\s+/g, ' ').trim(), hint: h }))
    .filter(({ q }) => {
      const key = fold(q);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

/* Los resultados de búsqueda suelen llegar con `genre: 'Sonora'`, que no dice
   nada. Como sabemos para qué estilo se hizo la consulta, se etiqueta el
   resultado con ese subgénero. Así un tema de merengue no entra a la radio
   como «desconocido» (y termina descartado o confundido con otro género). */
function withStyleHint(item, hint) {
  if (!item || !hint || isMeaningfulGenre(item.genre)) return item;
  return { ...item, genre: hint };
}

/**
 * Cola inteligente para una canción. Devuelve entre 10 y 20 pistas de la
 * misma familia rítmica, con energía parecida y variedad de artistas.
 */
export async function fetchSmartRelatedQueue(track, { limit = 16, timeout = 12000, pool } = {}) {
  if (!track) return [];

  const wanted = Math.max(10, Math.min(20, Number(limit) || 16));
  const features = featuresFor(track);
  const key = `${songKey(track)}|${fold(features?.family)}|${fold(features?.subgenre)}|${fold(features?.mood)}|${fold(track.genre)}`;

  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v.slice(0, wanted);

  const local = mergeTracks(pool || globalPool()).filter(isQueueCandidate);
  const queries = buildQueries(track, features);

  let live = [];
  if (queries.length) {
    const settled = await Promise.allSettled(
      queries.map(async ({ q, hint }) => {
        const result = await searchYouTubeDetailed(q, { limit: MAX, timeout });
        return { hint, items: result?.items || [] };
      }),
    );
    const collected = [];
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value.items) {
        const tagged = withStyleHint(item, result.value.hint);
        if (usableResult(tagged, track)) collected.push(tagged);
      }
    }
    live = collected;
  }

  // El catálogo local va primero: si la misma canción aparece en una búsqueda,
  // `buildSmartQueue` conserva la versión con metadatos más ricos.
  const candidates = mergeTracks(local, live);
  const queue = buildSmartQueue(track, candidates, {
    limit: Math.max(wanted, 20),
    recent: [track],
    minScore: 0.5,
    minCount: Math.min(10, wanted),
  });

  CACHE.set(key, { t: Date.now(), v: queue });
  if (CACHE.size > 120) CACHE.delete(CACHE.keys().next().value);
  return queue.slice(0, wanted);
}

/** Compatibilidad con el nombre anterior. */
export async function fetchRelatedTracks(track, opts = {}) {
  return fetchSmartRelatedQueue(track, opts);
}
