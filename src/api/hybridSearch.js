/* ══════════════════════════════════════════════════════════════════════════
   Buscador híbrido y resiliente de Sonora.

   Objetivo: una sola respuesta limpia aunque la red falle.

     · Resultados locales (catálogo curado + catálogo descargado + caché).
     · Resultados globales de streaming (servidor propio).
     · Si el servidor no contesta en 2.5 s, se devuelve el respaldo local al
       instante y, si la respuesta remota llega después, se fusiona sin que el
       usuario vea errores de conexión.
     · Sin conexión real se muestra el catálogo descargado, no un cartel rojo.

   La interfaz nunca recibe excepciones de red: este módulo las convierte en
   metadatos (`degraded`, `offline`, `cached`, `pending`) y listas seguras.
   ══════════════════════════════════════════════════════════════════════════ */

import { TRACKS } from '../data/catalog.js';
import { cachedCatalogTracks, cachedWarmResults } from './liveData.js';
import { getCachedSearchResults, searchYouTubeDetailed } from './youtubeSearch.js';
import { fallbackTracks, rankTracks } from '../../shared/searchIntent.mjs';

/** Presupuesto máximo para la API remota antes de usar el respaldo local. */
export const REMOTE_BUDGET = 2500;

/* ── Utilidades ─────────────────────────────────────────────────────────── */

function norm(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identidad estable para no duplicar la misma canción entre fuentes. */
function trackKey(track) {
  const yt = String(track?.yt || '').replace(/^(yt-|yt-ch-|yt-pl-|ch-|pl-)/, '');
  if (yt) return 'yt:' + yt;
  if (track?.id != null && track.id !== '') return 'id:' + String(track.id);
  return 'txt:' + norm(`${track?.title || ''}|${track?.artist || ''}`);
}

/** Fusiona listas conservando el orden y eliminando duplicados. */
export function mergeTrackResults(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item) continue;
      const key = trackKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function trackHaystack(track) {
  const moods = Array.isArray(track?.moods) ? track.moods : [];
  return norm([track?.title, track?.artist, track?.album, track?.genre, ...moods].join(' '));
}

/**
 * Catálogo que ya vive en el dispositivo: canciones curadas + catálogo
 * descargado (aunque esté caducado) + pistas extra.
 */
function localPool(extraTracks = []) {
  return mergeTrackResults(
    Array.isArray(TRACKS) ? TRACKS : [],
    Array.isArray(extraTracks) ? extraTracks : [],
    cachedCatalogTracks({ allowStale: true }),
  );
}

/**
 * Búsqueda síncrona en el catálogo que ya vive en el dispositivo. Coincide por
 * título, artista, álbum, género, mood, con tolerancia a errores de escritura.
 */
export function searchLocalCatalog(query, extraTracks = []) {
  const term = norm(query);
  if (!term) return [];

  try {
    return rankTracks(localPool(extraTracks), query).matches;
  } catch {
    return [];
  }
}

/** Música parecida/popular para completar una búsqueda vacía o con pocos
    resultados. La interfaz la muestra como sugerencia, no como coincidencia. */
export function suggestedLocalCatalog(query, extraTracks = [], limit = 20) {
  const term = norm(query);
  if (!term) return [];

  try {
    return fallbackTracks(localPool(extraTracks), query, limit);
  } catch {
    return [];
  }
}

export function isOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

function now() {
  try {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * Construye el contrato unificado que consume la interfaz.
 * `global` nunca repite una canción que ya esté en `local`.
 */
function makeResult(query, localList, globalList, meta, suggestedList = []) {
  const local = mergeTrackResults(localList);
  const localKeys = new Set(local.map(trackKey));
  const global = mergeTrackResults(globalList).filter((item) => {
    if ((item?.kind || 'video') !== 'video') return true;
    return !localKeys.has(trackKey(item));
  });
  const globalKeys = new Set(global.map(trackKey));
  const suggested = mergeTrackResults(suggestedList).filter((item) => {
    const key = trackKey(item);
    return !localKeys.has(key) && !globalKeys.has(key);
  });
  const merged = mergeTrackResults(local, global, suggested);

  return {
    query,
    local,
    global,
    suggested,
    merged,
    meta: {
      offline: Boolean(meta.offline),
      degraded: Boolean(meta.degraded),
      cached: Boolean(meta.cached),
      pending: Boolean(meta.pending),
      suggested: suggested.length > 0,
      suggestedCount: suggested.length,
      source: meta.source || 'catalog',
      elapsedMs: Math.max(0, Math.round(meta.elapsedMs || 0)),
      budgetMs: meta.budgetMs != null ? meta.budgetMs : REMOTE_BUDGET,
      localCount: local.length,
      globalCount: global.length,
      total: merged.length,
    },
  };
}

/**
 * Busca de forma híbrida y progresiva.
 *
 * Devuelve una promesa que resuelve con la respuesta definitiva (remota o
 * respaldo). Si se pasa `onUpdate`, también se invoca:
 *   1. con los resultados locales/cacheados al instante (si los hay),
 *   2. al agotarse el presupuesto de 2.5 s con el respaldo,
 *   3. si el servidor responde más tarde, con la mezcla final.
 *
 * Nunca rechaza. `signal` cancela la petición remota al cambiar de consulta.
 */
export function hybridSearchFallback(query, {
  deep = false,
  limit,
  budgetMs = REMOTE_BUDGET,
  remoteTimeout = 30000,
  catalogTracks = [],
  signal,
  onUpdate,
} = {}) {
  const q = String(query || '').trim();
  const budget = Math.max(50, Number(budgetMs) || REMOTE_BUDGET);
  const started = now();
  const emit = (result) => {
    if (typeof onUpdate !== 'function') return;
    try { onUpdate(result); } catch { /* la interfaz nunca debe romper la búsqueda */ }
  };

  if (!q) {
    const empty = makeResult('', [], [], {
      pending: false,
      offline: isOffline(),
      source: 'catalog',
      elapsedMs: 0,
      budgetMs: budget,
    });
    return Promise.resolve(empty);
  }

  const local = searchLocalCatalog(q, catalogTracks);
  const cachedGlobal = mergeTrackResults(
    cachedWarmResults(q),
    getCachedSearchResults(q, { deep, allowStale: true }),
  );

  /* Si hay muy pocos resultados, completamos con música parecida/popular. La
     interfaz la pinta como «Sugerencias», así que nunca se confunde con una
     coincidencia exacta. */
  const MIN_RESULTS = 8;
  const suggestionsFor = (knownLocal, knownGlobal) => {
    if (mergeTrackResults(knownLocal, knownGlobal).length >= MIN_RESULTS) return [];
    try {
      return suggestedLocalCatalog(q, catalogTracks, 24);
    } catch {
      return [];
    }
  };

  /* Sin conexión real: respuesta inmediata y elegante. */
  if (isOffline()) {
    const offline = makeResult(q, local, cachedGlobal, {
      pending: false,
      degraded: true,
      cached: cachedGlobal.length > 0,
      offline: true,
      source: 'offline',
      elapsedMs: now() - started,
      budgetMs: budget,
    }, suggestionsFor(local, cachedGlobal));
    emit(offline);
    return Promise.resolve(offline);
  }

  /* Primero lo que ya tenemos: el usuario ve resultados sin esperar a la red. */
  const initial = makeResult(q, local, cachedGlobal, {
    pending: true,
    cached: cachedGlobal.length > 0,
    source: cachedGlobal.length ? 'cache' : 'catalog',
    elapsedMs: now() - started,
    budgetMs: budget,
  });
  emit(initial);

  const remote = searchYouTubeDetailed(q, {
    deep,
    limit,
    timeout: remoteTimeout,
    signal,
  }).then(
    (value) => ({ type: 'remote', value }),
    () => ({ type: 'remote', value: { items: [], error: 'unavailable', cached: false } }),
  );

  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ type: 'budget' }), budget);
  });

  return Promise.race([remote, deadline]).then((first) => {
    if (timer) clearTimeout(timer);
    const remoteResult = first.type === 'remote' ? first.value : null;

    /* La red respondió dentro del presupuesto (con o sin resultados). */
    if (remoteResult && !remoteResult.error) {
      const global = mergeTrackResults(cachedGlobal, remoteResult.items);
      const result = makeResult(q, local, global, {
        pending: false,
        degraded: !remoteResult.items.length && !remoteResult.cached,
        cached: Boolean(remoteResult.cached),
        offline: false,
        source: remoteResult.cached ? 'cache' : 'remote',
        elapsedMs: now() - started,
        budgetMs: budget,
      }, suggestionsFor(local, global));
      emit(result);
      return result;
    }

    /* Se agotó el presupuesto (o el servidor falló): respaldo silencioso. */
    const fallback = makeResult(q, local, cachedGlobal, {
      pending: false,
      degraded: true,
      cached: cachedGlobal.length > 0,
      offline: isOffline(),
      source: cachedGlobal.length ? 'cache' : 'catalog',
      elapsedMs: now() - started,
      budgetMs: budget,
    }, suggestionsFor(local, cachedGlobal));
    emit(fallback);

    /* Si la respuesta remota llega después, se fusiona sin molestar. */
    if (first.type === 'budget') {
      remote.then((late) => {
        if (signal?.aborted) return;
        if (late.type !== 'remote') return;
        if (late.value?.error || !late.value?.items?.length) return;
        const global = mergeTrackResults(cachedGlobal, late.value.items);
        const merged = makeResult(q, local, global, {
          pending: false,
          degraded: false,
          cached: Boolean(late.value.cached),
          offline: false,
          source: late.value.cached ? 'cache' : 'remote',
          elapsedMs: now() - started,
          budgetMs: budget,
        }, suggestionsFor(local, global));
        emit(merged);
      }).catch(() => { /* silencio: el respaldo ya está en pantalla */ });
    }

    return fallback;
  });
}
