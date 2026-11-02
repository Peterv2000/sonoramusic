/* ══════════════════════════════════════════════════════════════════════════
   Recomendaciones dinámicas.

   Dada la pista que está sonando, busca en segundo plano canciones del mismo
   artista y de estilos asociados. El resultado alimenta la cola automática
   de Sonora para que la reproducción nunca se detenga al acabar una canción.

   Todo degrada con elegancia: si el servidor no responde, devuelve [] y el
   reproductor sigue funcionando con el catálogo local.
   ══════════════════════════════════════════════════════════════════════════ */

import { searchYouTubeDetailed } from './youtubeSearch.js';
import { meaningfulGenre, norm } from '../player/queue.js';

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

function sameArtistLoose(a, b) {
  const x = norm(bareArtistName(a));
  const y = norm(bareArtistName(b));
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

/* Clave canónica para no repetir la misma canción aunque venga de otra fuente
   (mismo título con «feat.», versión de vídeo o artista colaborador). */
function songKey(item) {
  const title = String(item?.title || '')
    .toLowerCase()
    .replace(/\s*[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s+(?:feat|ft)\.?\s+.*$/i, ' ')
    .replace(/\s*[-–—]\s*(?:official|video|audio|lyric|letra|en vivo).*$/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const artist = norm(String(item?.artist || '').split(/\s+(?:y|and|&|feat|ft)\s+|[,/]/i)[0]);
  return `${title}|${artist}`;
}

/**
 * Pistas afines a `track`.
 *
 * 1. Consulta al artista (máxima afinidad).
 * 2. Consulta artista + título (versiones, directos, colaboraciones).
 * 3. Si el género es concreto, una mezcla del estilo.
 *
 * Los resultados del mismo artista van primero; después se completa con el
 * resto de coincidencias, siempre sin repetir la pista actual.
 */
export async function fetchRelatedTracks(track, { limit = 24, timeout = 12000 } = {}) {
  if (!track) return [];

  const artist = bareArtistName(track.artist);
  const title = String(track.title || '').trim();
  const genre = String(track.genre || '').trim();
  const key = `${norm(artist)}|${norm(title)}|${norm(genre)}`;

  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v.slice(0, limit);

  const queries = [];
  if (artist) queries.push(artist);
  if (artist && title) queries.push(`${artist} ${title}`);
  else if (title) queries.push(title);
  if (meaningfulGenre(genre)) queries.push(`${genre} mix`);

  const uniqueQueries = [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 3);
  if (!uniqueQueries.length) return [];

  const settled = await Promise.allSettled(
    uniqueQueries.map((q) => searchYouTubeDetailed(q, { limit: MAX, timeout })),
  );

  const all = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') all.push(...(result.value?.items || []));
  }

  const seen = new Set([track.id, track.yt].filter(Boolean));
  const seenSongs = new Set([songKey(track)]);
  const same = [];
  const other = [];

  for (const item of all) {
    if (!item) continue;
    if (item.kind && item.kind !== 'video') continue;
    if (seen.has(item.id) || (item.yt && seen.has(item.yt))) continue;
    const keySong = songKey(item);
    if (seenSongs.has(keySong)) continue;
    seen.add(item.id);
    if (item.yt) seen.add(item.yt);
    seenSongs.add(keySong);
    if (sameArtistLoose(item.artist, artist)) same.push(item);
    else other.push(item);
  }

  const out = [...same, ...other].slice(0, MAX);
  CACHE.set(key, { t: Date.now(), v: out });
  if (CACHE.size > 120) CACHE.delete(CACHE.keys().next().value);
  return out.slice(0, limit);
}
