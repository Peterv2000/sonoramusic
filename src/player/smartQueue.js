/* ══════════════════════════════════════════════════════════════════════════
   Cola inteligente («Radio de la canción»).

   A diferencia de la antigua regla «mismo artista primero», aquí puntuamos la
   afinidad real entre la canción activa y cada candidata:

     1. género / subgénero
     2. BPM (con fuerza especial dentro de ±15 %)
     3. energía (objetivo ±0.2) y bailabilidad
     4. mood y época

   Después ordenamos con diversidad de artistas: nunca más de dos canciones
   seguidas del mismo intérprete y una pequeña penalización cuando un artista
   ya aparece varias veces. Así una balada sigue en baladas y un reggaetón
   sigue en fiesta, aunque cambie el artista.
   ══════════════════════════════════════════════════════════════════════════ */

import { artistKey, globalPool, isQueueCandidate, mergeTracks } from './queue.js';
import { featuresFor, fold, songKey } from './audioFeatures.js';
import { affinityScore, listeningProfile } from '../state/listeningHistory.js';

/* Afinidad entre familias. 1 = mismo estilo; los valores intermedios permiten
   puentes naturales (pop ↔ R&B, latino ↔ hip-hop) sin saltar a otro mundo. */
const FAMILY_AFFINITY = {
  pop:        { pop: 1, rnb: 0.84, rock: 0.66, electronic: 0.7, latin: 0.68, hiphop: 0.58, lofi: 0.44, acoustic: 0.7, unknown: 0.55 },
  rock:       { pop: 0.66, rnb: 0.4, rock: 1, electronic: 0.54, latin: 0.34, hiphop: 0.42, lofi: 0.34, acoustic: 0.58, unknown: 0.55 },
  latin:      { pop: 0.68, rnb: 0.56, rock: 0.34, electronic: 0.56, latin: 1, hiphop: 0.72, lofi: 0.4, acoustic: 0.5, unknown: 0.55 },
  electronic: { pop: 0.7, rnb: 0.54, rock: 0.54, electronic: 1, latin: 0.56, hiphop: 0.56, lofi: 0.62, acoustic: 0.36, unknown: 0.55 },
  hiphop:     { pop: 0.58, rnb: 0.72, rock: 0.42, electronic: 0.56, latin: 0.72, hiphop: 1, lofi: 0.62, acoustic: 0.38, unknown: 0.55 },
  rnb:        { pop: 0.84, rnb: 1, rock: 0.4, electronic: 0.54, latin: 0.56, hiphop: 0.72, lofi: 0.58, acoustic: 0.54, unknown: 0.55 },
  lofi:       { pop: 0.44, rnb: 0.58, rock: 0.34, electronic: 0.62, latin: 0.4, hiphop: 0.62, lofi: 1, acoustic: 0.66, unknown: 0.5 },
  acoustic:   { pop: 0.7, rnb: 0.54, rock: 0.58, electronic: 0.36, latin: 0.5, hiphop: 0.38, lofi: 0.66, acoustic: 1, unknown: 0.55 },
  unknown:    { pop: 0.55, rnb: 0.55, rock: 0.55, electronic: 0.55, latin: 0.55, hiphop: 0.55, lofi: 0.5, acoustic: 0.55, unknown: 0.6 },
};

const WEIGHTS = {
  genre: 0.34,
  subgenre: 0.06,
  bpm: 0.22,
  energy: 0.20,
  dance: 0.08,
  mood: 0.06,
  era: 0.04,
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function familyAffinity(a, b) {
  if (!a || !b) return 0.5;
  if (a === b) return 1;
  return FAMILY_AFFINITY[a]?.[b] ?? FAMILY_AFFINITY[b]?.[a] ?? 0.45;
}

/** 1 dentro de ±15 %, cae de forma suave hasta 0 al 30 % de diferencia. */
export function bpmSimilarity(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  if (!x || !y) return 0.5;
  const diff = Math.abs(x - y) / Math.max(x, y);
  if (diff <= 0.15) return 0.75 + 0.25 * (1 - diff / 0.15);
  if (diff <= 0.3) return 0.75 * (1 - (diff - 0.15) / 0.15);
  return 0;
}

/** 1 en el centro, 0.75 dentro de ±0.2 y caída suave hasta ±0.45. */
export function proximitySimilarity(a, b, tolerance = 0.2) {
  const diff = Math.abs((Number(a) || 0) - (Number(b) || 0));
  if (diff <= tolerance) return 0.75 + 0.25 * (1 - diff / tolerance);
  const falloff = tolerance * 2.25;
  if (diff <= falloff) return 0.75 * (1 - (diff - tolerance) / (falloff - tolerance));
  return 0;
}

function moodSimilarity(seed, candidate) {
  /* `moods` puede llegar como objeto desde cachés antiguas: se normaliza antes
     de iterar para no romper la cola ni el render del reproductor. */
  const moodsOf = (track) => (Array.isArray(track?.moods) ? track.moods : []);
  const a = new Set([seed.mood, ...moodsOf(seed)].filter(Boolean));
  const b = new Set([candidate.mood, ...moodsOf(candidate)].filter(Boolean));
  if (!a.size || !b.size) return 0.5;
  if (seed.mood && seed.mood === candidate.mood) return 1;
  let overlap = 0;
  for (const mood of a) if (b.has(mood)) overlap += 1;
  return overlap ? 0.55 + 0.45 * (overlap / Math.max(a.size, b.size)) : 0.12;
}

function eraSimilarity(a, b) {
  if (!a?.year || !b?.year) return 0.55;
  return 1 - Math.min(1, Math.abs(a.year - b.year) / 30);
}

/** Puntuación global 0..1 entre el vector semilla y un candidato. */
export function scoreFeatures(seed, candidate) {
  if (!seed || !candidate) return 0;
  const genre = familyAffinity(seed.family, candidate.family);
  const subgenre = fold(seed.subgenre) === fold(candidate.subgenre) ? 1 : (seed.family === candidate.family ? 0.28 : 0);
  const bpm = bpmSimilarity(seed.bpm, candidate.bpm);
  const energy = proximitySimilarity(seed.energy, candidate.energy, 0.2);
  const dance = proximitySimilarity(seed.danceability, candidate.danceability, 0.22);
  const mood = moodSimilarity(seed, candidate);
  const era = eraSimilarity(seed, candidate);

  const raw = (
    WEIGHTS.genre * genre +
    WEIGHTS.subgenre * subgenre +
    WEIGHTS.bpm * bpm +
    WEIGHTS.energy * energy +
    WEIGHTS.dance * dance +
    WEIGHTS.mood * mood +
    WEIGHTS.era * era
  );

  /* Una pista sin señal de estilo no debe superar a una coincidencia real.
     El factor es suave: sigue sirviendo para completar la cola, pero queda
     por detrás de quien sí sabemos que encaja. */
  const trust = 0.9 + 0.1 * clamp01(Number(candidate.confidence) || 0);
  return Number((raw * trust).toFixed(4));
}

/* Grupos de subgénero con bloqueo duro. Un reggaetón no debe saltar a una
   balada latina, una ranchera no debe saltar a reggaetón y un merengue no debe
   saltar a reggaetón, aunque todos sean «latinos». */
const URBAN_LATIN = new Set(['reggaeton', 'dembow', 'trap latino', 'dancehall latino', 'urbano latino', 'perreo']);
const POPULAR_LATIN = new Set(['popular', 'ranchera', 'vallenato', 'banda', 'norteno', 'regional mexicano', 'corrido', 'mariachi', 'despecho']);
/* Merengue, salsa, bachata y cumbia comparten el mundo tropical/bailable: se
   parecen entre sí, pero nunca se mezclan con urbano ni con popular regional. */
const TROPICAL_LATIN = new Set(['merengue', 'salsa', 'bachata', 'cumbia', 'tropical']);

/* Subgéneros tan amplios que no permiten bloquear nada: si la semilla es
   «Latino» sin más, cualquier pista latina sigue siendo compatible. */
const GENERIC_SUBGENRES = new Set(['', 'latino', 'latin', 'musica latina', 'sonora', 'otros', 'other', 'unknown']);

function latinGroup(subgenre) {
  const key = fold(subgenre);
  if (!key) return '';
  if (URBAN_LATIN.has(key)) return 'urban';
  if (POPULAR_LATIN.has(key)) return 'popular';
  if (TROPICAL_LATIN.has(key)) return 'tropical';
  return '';
}

/** Filtro duro de idioma: español con español, inglés con inglés. */
export function languageCompatible(seed, candidate) {
  if (!seed?.language || seed.language === 'unknown') return true;
  if (seed.language === 'instrumental') return true;
  if (!candidate?.language) return false;
  if (candidate.language === 'instrumental') return true;
  if (candidate.language === 'unknown') {
    // Solo se admite una pista sin idioma detectable si pertenece con claridad
    // a la misma familia (p. ej. una pista latina sin letra reconocible).
    return Boolean(candidate.family && candidate.family === seed.family && candidate.family !== 'unknown');
  }
  return seed.language === candidate.language;
}

/** Filtro duro de género/región: nunca saltar a un mundo musical distinto. */
export function familyCompatible(seed, candidate) {
  if (!seed?.family || seed.family === 'unknown') return true;
  if (!candidate?.family || candidate.family === 'unknown') return false;
  if (seed.family === candidate.family) return true;
  if (seed.family === 'latin') {
    // El urbano latino comparte cadencia con el hip-hop, pero la música
    // popular/regional no debe mezclarse con ningún otro mundo.
    return candidate.family === 'hiphop' && latinGroup(seed.subgenre) === 'urban';
  }
  /* Sin más puentes: dentro de una sesión no se salta de familia. Pop y R&B
     pueden sonar parecido, pero son categorías distintas y el usuario pidió
     que la siguiente canción no cambie de género. */
  return false;
}

/** Filtro duro de subgénero: mismo estilo, no solo misma familia.
 *
 *  - Dentro del mundo latino se agrupa por urbano / popular / tropical. Así un
 *    merengue puede seguir en merengue, salsa o bachata (mismo mundo), pero
 *    nunca en reggaetón.
 *  - En el resto de familias basta con que la familia coincida (ya es un filtro
 *    duro); el subgénero solo afina la puntuación.
 */
export function subgenreCompatible(seed, candidate) {
  const s = fold(seed?.subgenre);
  const c = fold(candidate?.subgenre);
  if (!s || GENERIC_SUBGENRES.has(s)) return true;
  if (s === c) return true;
  if (seed?.family !== 'latin') return true;
  const group = latinGroup(seed.subgenre);
  if (!group) return false;
  return latinGroup(candidate?.subgenre) === group;
}

function candidateEntries(seed, candidates, exclude = []) {
  const seedFeatures = featuresFor(seed);
  const blockedIds = new Set([seed?.id, seed?.yt, ...exclude].filter(Boolean));
  const blockedSongs = new Set([songKey(seed)]);
  const out = [];

  for (const track of candidates || []) {
    if (!track) continue;
    if (!isQueueCandidate(track)) continue;
    if (blockedIds.has(track.id) || blockedIds.has(track.yt)) continue;
    const key = songKey(track);
    if (blockedSongs.has(key)) continue;
    blockedSongs.add(key);

    const features = featuresFor(track, seedFeatures);
    if (!features) continue;

    const languageOk = languageCompatible(seedFeatures, features);
    const familyOk = familyCompatible(seedFeatures, features);
    const subgenreOk = subgenreCompatible(seedFeatures, features);
    /* 2 = mismo subgénero exacto, 1 = mismo grupo (p. ej. merengue → salsa),
       0 = incompatible. Se usa para que el estilo exacto mande siempre. */
    const sameSubgenre = Boolean(fold(seedFeatures.subgenre))
      && fold(features.subgenre) === fold(seedFeatures.subgenre);
    const subgenreTier = sameSubgenre ? 2 : (subgenreOk ? 1 : 0);
    const bpmDiff = Math.abs(features.bpm - seedFeatures.bpm) / Math.max(seedFeatures.bpm, features.bpm);
    const energyDiff = Math.abs(features.energy - seedFeatures.energy);

    out.push({
      track,
      features,
      score: scoreFeatures(seedFeatures, features),
      languageOk,
      familyOk,
      subgenreOk,
      subgenreTier,
      strictOk: languageOk && familyOk && subgenreOk && bpmDiff <= 0.15 && energyDiff <= 0.24,
    });
  }
  return out;
}

function trackArtist(track) {
  return artistKey(track?.artist);
}

function sameTrackArtist(a, b) {
  const x = trackArtist(a);
  const y = trackArtist(b);
  return Boolean(x && y && x === y);
}

function trailingArtistRun(history, artist) {
  if (!artist) return 0;
  let run = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (trackArtist(history[i]) === artist) run += 1;
    else break;
  }
  return run;
}

/**
 * Ordena candidatas por afinidad y construye una cola diversa.
 *
 * `recent` es el historial reciente (de más antiguo a más nuevo) e incluye la
 * canción activa. Si no se pasa, la semilla cuenta como primera reproducción.
 */
export function buildSmartQueue(seed, candidates, {
  limit = 16,
  recent,
  exclude = [],
  minScore = 0,
  minCount = 0,
} = {}) {
  if (!seed) return [];
  const ranked = candidateEntries(seed, candidates, exclude);
  if (!ranked.length) return [];

  ranked.sort((a, b) => b.score - a.score || a.features.bpm - b.features.bpm);

  const history = Array.isArray(recent) && recent.length ? recent.slice(-8) : [];
  if (!history.length || history[history.length - 1]?.id !== seed.id) history.push(seed);
  /* Afinidad con el consumo real del usuario (historial local). Es un empujón
     pequeño: la similitud audio (género/BPM/energía) sigue mandando, pero la
     cola se inclina hacia lo que la persona escucha de verdad. */
  const profile = listeningProfile();
  const seedCategory = fold(seed.categoryId);
  /* Si hay suficientes pistas de la misma categoría, la cola se queda dentro
     de ella: así Rock no salta a Pop ni K-Pop a Latino. Solo se usa la familia
     como red de seguridad cuando la categoría es pequeña (Lo-Fi, Indie…) o
     sus pistas están mal etiquetadas. */
  const sameCategory = seedCategory
    ? ranked.filter((entry) => fold(entry.track.categoryId) === seedCategory)
    : [];
  const coherent = sameCategory.length >= 4 ? sameCategory : ranked;

  /* Etapas de selección. El subgénero exacto manda sobre el tempo: primero se
     agotan los merengues para una semilla de merengue y solo después se admite
     otra pista del mismo grupo (salsa, bachata, cumbia). Nunca se relajan
     idioma, familia ni subgénero; si no hay nada compatible, la cola queda
     vacía y el reproductor repite antes que saltar de género. */
  const stagePools = (pool) => {
    const usable = pool.filter((entry) => entry.languageOk && entry.familyOk && entry.subgenreOk);
    const exact = usable.filter((entry) => entry.subgenreTier >= 2);
    const group = usable.filter((entry) => entry.subgenreTier < 2);
    return [
      exact.filter((entry) => entry.strictOk),
      exact.filter((entry) => !entry.strictOk),
      group.filter((entry) => entry.strictOk),
      group.filter((entry) => !entry.strictOk),
    ].filter((list) => list.length);
  };

  let stages = stagePools(coherent);
  /* Red de seguridad: si la categoría no aporta ninguna candidata compatible,
     se intenta con el resto del catálogo, pero con los mismos filtros duros. */
  if (!stages.length && coherent !== ranked) stages = stagePools(ranked);

  const chosen = [];
  for (const pool of stages) {
    while (pool.length && chosen.length < limit) {
      const context = history.concat(chosen);
      // Hasta llegar al mínimo pedido aceptamos los mejores aunque no sean
      // perfectos; a partir de ahí solo entran candidatas por encima del corte.
      const floor = chosen.length < minCount ? Math.min(minScore, 0.32) : minScore;
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < pool.length; i++) {
        const entry = pool[i];
        if (entry.score < floor) continue;
        const artist = trackArtist(entry.track);
        const run = trailingArtistRun(context, artist);
        // Regla de oro: como máximo dos canciones seguidas del mismo artista.
        if (artist && run >= 2) continue;

        const uses = artist ? context.filter((t) => sameTrackArtist(t, entry.track)).length : 0;
        const uncertainty = entry.features.language === 'unknown' ? 0.03 : 0;
        const taste = affinityScore(entry.track, profile) * 0.12;
        const categoryDelta = seedCategory && entry.track.categoryId
          ? (fold(entry.track.categoryId) === seedCategory ? 0.08 : -0.02)
          : 0;
        const adjusted = entry.score + taste + categoryDelta - Math.min(0.14, uses * 0.018) - Math.min(0.04, run * 0.02) - uncertainty;
        if (adjusted > bestScore) {
          bestScore = adjusted;
          bestIdx = i;
        }
      }

      if (bestIdx < 0) break;
      chosen.push(pool[bestIdx].track);
      pool.splice(bestIdx, 1);
    }
    if (chosen.length >= limit) break;
  }

  return chosen;
}

/** Versión síncrona sobre el catálogo local (curada + caché en vivo). */
export function smartRelated(seed, { pool, limit = 20, recent, exclude = [] } = {}) {
  if (!seed) return [];
  const candidates = mergeTracks(pool || globalPool());
  return buildSmartQueue(seed, candidates, {
    limit,
    recent: Array.isArray(recent) && recent.length ? recent : [seed],
    exclude,
  });
}

/** Siguiente tema para autoplay, respetando la diversidad de artistas. */
export function pickSmartNext({
  current,
  candidates,
  recent,
  exclude = [],
}) {
  if (!current) return null;
  const list = buildSmartQueue(current, candidates, {
    limit: 1,
    recent: Array.isArray(recent) && recent.length ? recent : [current],
    exclude,
  });
  return list[0] || null;
}

/** Utilidad de diagnóstico: detecta tres o más temas seguidos del mismo artista. */
export function hasExcessiveArtistRun(tracks, max = 2) {
  let run = 0;
  let previous = '';
  for (const track of tracks || []) {
    const artist = trackArtist(track);
    if (artist && artist === previous) run += 1;
    else { previous = artist; run = 1; }
    if (run > max) return true;
  }
  return false;
}

/** Puntuación de una pista concreta frente a otra (para depurar/tests). */
export function scoreTracks(seed, candidate) {
  return scoreFeatures(featuresFor(seed), featuresFor(candidate, featuresFor(seed)));
}

export const queueWeights = { ...WEIGHTS };
export { clamp01 };
