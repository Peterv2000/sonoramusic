/* ══════════════════════════════════════════════════════════════════════════
   QA del buscador híbrido (cliente).

   Comprueba lo que el usuario ve:
     · resultados locales inmediatos,
     · respaldo silencioso si la API remota no contesta en el presupuesto,
     · modo sin conexión con catálogo descargado,
     · caché antigua rescatada,
     · fusión sin canciones duplicadas.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  hybridSearchFallback,
  mergeTrackResults,
  searchLocalCatalog,
} from '../src/api/hybridSearch.js';

let failures = 0;

function check(name, ok, detail = '') {
  const line = `${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures += 1;
}

function setOnline(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: value },
    configurable: true,
    writable: true,
  });
}

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}

function slowFetch(ms) {
  return (url, opts = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(jsonResponse({ results: [] })), ms);
    opts.signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
}

function remoteTrack(id, title, artist) {
  return {
    track_id: Buffer.from(id).toString('base64url'),
    title,
    artist,
    album: 'Sonora',
    kind: 'video',
  };
}

/* 1) Catálogo local: coincide por título/artista sin tocar la red. */
const local = searchLocalCatalog('despacito');
check(
  'el catálogo local encuentra la canción al instante',
  local.length > 0 && local[0].yt === 'kJQP7kiw5Fk',
  `${local.length} resultados`,
);

/* 2) La fusión elimina duplicados aunque vengan de fuentes distintas. */
const merged = mergeTrackResults(
  [{ yt: 'abc12345678', id: 'yt-abc12345678', title: 'Uno' }],
  [{ yt: 'abc12345678', id: 'yt-abc12345678', title: 'Uno (remoto)' }],
  [{ yt: 'def12345678', id: 'yt-def12345678', title: 'Dos' }],
);
check('la fusión no duplica canciones', merged.length === 2, `${merged.length} pistas`);

/* 3) Sin conexión real: respaldo inmediato y mensaje offline. */
setOnline(false);
let offlineCalls = 0;
globalThis.fetch = async () => {
  offlineCalls += 1;
  throw new Error('sin red');
};
const offline = await hybridSearchFallback('despacito');
check(
  'sin conexión devuelve el catálogo descargado',
  offline.meta.offline === true && offline.meta.pending === false && offline.local.length > 0,
  `offline=${offline.meta.offline} · ${offline.local.length} locales`,
);
check('sin conexión no intenta golpear la red', offlineCalls === 0, `${offlineCalls} llamadas`);

/* 4) API remota lenta: a los 2.5 s (aquí 30 ms) salta el respaldo sin error. */
setOnline(true);
globalThis.fetch = slowFetch(400);
const updates = [];
const slow = await hybridSearchFallback('despacito', {
  budgetMs: 30,
  remoteTimeout: 80,
  onUpdate: (result) => updates.push(result),
});
check(
  'una API lenta no bloquea: respaldo degradado y sin error',
  slow.meta.pending === false && slow.meta.degraded === true && slow.local.length > 0,
  `pending=${slow.meta.pending} · degraded=${slow.meta.degraded} · ${slow.meta.elapsedMs} ms`,
);
check(
  'el esqueleto recibe primero el estado local y luego el respaldo',
  updates.length >= 2 && updates[0].meta.pending === true && updates.at(-1).meta.pending === false,
  `${updates.length} actualizaciones`,
);

/* 5) API remota rápida: se fusiona con el catálogo local y no lo duplica. */
setOnline(true);
globalThis.fetch = async () => jsonResponse({
  results: [
    remoteTrack('kJQP7kiw5Fk', 'Despacito', 'Luis Fonsi'),
    remoteTrack('zzz12345678', 'Tema remoto', 'Artista remoto'),
  ],
});
const fast = await hybridSearchFallback('despacito', { budgetMs: 500, remoteTimeout: 1000 });
const remoteIds = fast.global.map((item) => item.yt);
check(
  'la API rápida se integra en la respuesta unificada',
  fast.meta.pending === false && fast.meta.degraded === false && remoteIds.includes('zzz12345678'),
  `${fast.global.length} globales · ${fast.local.length} locales`,
);
check(
  'una canción local no se repite en los resultados globales',
  !remoteIds.includes('kJQP7kiw5Fk') && fast.merged.some((item) => item.yt === 'kJQP7kiw5Fk'),
  `globales: ${remoteIds.join(', ') || 'ninguno'}`,
);

/* 6) Caché antigua: sin red, se usa antes de rendirse. */
setOnline(false);
const cacheKey = 'consulta-cache-hibrida';
globalThis.localStorage = {
  _data: {
    'ritmo-ytsearch-v1': JSON.stringify({
      [cacheKey]: {
        t: Date.now() - 1000 * 60 * 60 * 48,
        v: [{
          yt: 'cached12345',
          id: 'yt-cached12345',
          kind: 'video',
          title: 'Canción cacheada',
          artist: 'Artista local',
          album: 'Sonora',
          dur: 200,
          thumb: '',
        }],
      },
    }),
  },
  getItem(key) { return this._data[key] || null; },
  setItem(key, value) { this._data[key] = value; },
  removeItem(key) { delete this._data[key]; },
};
globalThis.fetch = async () => { throw new Error('sin red'); };
const cached = await hybridSearchFallback(cacheKey);
check(
  'la caché antigua se rescata cuando no hay conexión',
  cached.meta.offline === true && cached.meta.cached === true && cached.global.length === 1,
  `${cached.global.length} resultados cacheados`,
);

if (failures) {
  console.error(`\n${failures} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\n✓ buscador híbrido resiliente OK');
