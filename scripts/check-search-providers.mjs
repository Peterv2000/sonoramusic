/* ══════════════════════════════════════════════════════════════════════════
   QA de proveedores alternativos del buscador.

   Simula el bloqueo de YouTube (WEB + HTML) y comprueba que la búsqueda sigue
   devolviendo canciones usando:
     · el cliente ANDROID de InnerTube,
     · instancias públicas de Piped / Invidious,
     · sin duplicar resultados cuando dos fuentes traen el mismo vídeo.
   ══════════════════════════════════════════════════════════════════════════ */

import { searchYouTube } from '../server/youtube.mjs';

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

function videoRenderer(id, title) {
  return {
    videoRenderer: {
      videoId: id,
      title: { runs: [{ text: title }] },
      lengthText: { simpleText: '3:30' },
      ownerText: { runs: [{ text: 'Artista de prueba' }] },
      thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] },
    },
  };
}

function innerTubePage(ids) {
  return {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [{
              itemSectionRenderer: {
                contents: ids.map((id, i) => videoRenderer(id, `Canción ${i + 1}`)),
              },
            }],
          },
        },
      },
    },
  };
}

const isYouTube = (url) => /youtube\.com|youtu\.be/.test(url);
const isFederated = (url) => /piped|invidious/i.test(url);

/* 1) WEB y HTML bloqueados; el cliente ANDROID responde. */
const calls = [];
const androidIds = Array.from({ length: 12 }, (_, i) => `android${String(i).padStart(4, '0')}`);
globalThis.fetch = async (url, opts = {}) => {
  const target = String(url);
  calls.push(target);
  if (target.includes('youtubei/v1/search')) {
    const client = opts.headers?.['X-YouTube-Client-Name'];
    if (client === '3') return jsonResponse(innerTubePage(androidIds));
    throw new Error('WEB bloqueado (simulado)');
  }
  if (target.includes('youtube.com/results')) throw new Error('HTML bloqueado (simulado)');
  if (isFederated(target)) throw new Error('federado caído (simulado)');
  throw new Error('petición inesperada: ' + target);
};

const android = await searchYouTube('prueba android', { limit: 20, retries: 0, timeout: 1000 });
check(
  'el cliente ANDROID rescata la búsqueda cuando WEB está bloqueado',
  android.length === 12 && android.every((tr) => tr.yt.startsWith('android')),
  `${android.length} resultados`,
);
check(
  'se envió la cabecera del cliente ANDROID',
  calls.some((url) => url.includes('youtubei/v1/search')) && android[0]?.title === 'Canción 1',
  android[0]?.title || 'sin título',
);
check(
  'las pistas del proveedor alternativo traen duración y carátula',
  android.every((tr) => tr.dur === 210 && /^https:\/\//.test(tr.thumb)),
  `dur=${android[0]?.dur}`,
);

/* 2) YouTube entero caído; Piped e Invidious responden con solapamiento. */
const pipedIds = Array.from({ length: 8 }, (_, i) => `piped${String(i).padStart(6, '0')}`);
const invidiousIds = [
  ...pipedIds.slice(0, 2), // mismo vídeo en ambas fuentes → no debe duplicarse
  ...Array.from({ length: 6 }, (_, i) => `invid${String(i).padStart(6, '0')}`),
];
const pipedItems = pipedIds.map((id, i) => ({
  url: `/watch?v=${id}`,
  title: `Piped ${i + 1}`,
  uploaderName: 'Canal Piped',
  duration: 200 + i,
  thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  views: 1000 + i,
}));
const invidiousItems = invidiousIds.map((id, i) => ({
  videoId: id,
  title: `Invidious ${i + 1}`,
  author: 'Canal Invidious',
  lengthSeconds: 180 + i,
  videoThumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }],
  viewCount: 2000 + i,
}));

globalThis.fetch = async (url) => {
  const target = String(url);
  if (isFederated(target)) {
    if (/piped/i.test(target)) return jsonResponse({ items: pipedItems });
    return jsonResponse(invidiousItems);
  }
  if (isYouTube(target)) throw new Error('YouTube caído (simulado)');
  throw new Error('petición inesperada: ' + target);
};

const federated = await searchYouTube('prueba federada', { limit: 20, retries: 0, timeout: 1000 });
const uniqueIds = new Set(federated.map((tr) => tr.yt));
check(
  'Piped/Invidious mantienen la búsqueda si YouTube está caído',
  federated.length >= 12,
  `${federated.length} resultados`,
);
check(
  'las fuentes federadas se fusionan sin duplicar vídeos',
  uniqueIds.size === federated.length,
  `${uniqueIds.size} únicos de ${federated.length}`,
);
check(
  'los metadatos federados se normalizan (título, artista, duración)',
  federated.every((tr) => tr.title && tr.artist && tr.dur > 0 && tr.kind === 'video'),
  federated[0] ? `${federated[0].title} · ${federated[0].artist} · ${federated[0].dur}s` : 'sin resultados',
);

if (failures) {
  console.error(`\n${failures} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\n✓ proveedores alternativos de búsqueda OK');
