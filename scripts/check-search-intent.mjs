/* ══════════════════════════════════════════════════════════════════════════
   QA del motor de coincidencia compartido.

   Comprueba que la búsqueda resiste lo que un artista famoso no demuestra:
   frases, estados de ánimo, errores de escritura, palabras incompletas,
   décadas y consultas sin ninguna coincidencia real.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  fallbackTracks,
  inferIntent,
  rankTracks,
  scoreTrackText,
} from '../shared/searchIntent.mjs';

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const TRACKS = [
  { id: 'yt-uno', yt: 'uno00000001', title: 'Despacito', artist: 'Luis Fonsi', genre: 'Reggaetón', moods: ['Fiesta latina', 'Fiesta'], views: 9000 },
  { id: 'yt-dos', yt: 'dos00000002', title: 'Bohemian Rhapsody', artist: 'Queen', genre: 'Rock', moods: ['Clásico'], views: 8000 },
  { id: 'yt-tres', yt: 'tres0000003', title: 'Llorar en silencio', artist: 'Ana', genre: 'Balada', moods: ['Triste', 'Romántico'], views: 1000 },
  { id: 'yt-sie', yt: 'sie00000007', title: 'Noche de amor', artist: 'Beto', genre: 'Balada', moods: ['Romántico'], views: 1200 },
  { id: 'yt-cua', yt: 'cua00000004', title: 'Estudio Lo-Fi', artist: 'Beats', genre: 'Lo-Fi', moods: ['Concentración', 'Relajado'], views: 500 },
  { id: 'yt-cin', yt: 'cin00000005', title: 'Fiesta Total', artist: 'DJ', genre: 'Cumbia', moods: ['Fiesta'], views: 3000 },
  { id: 'yt-sei', yt: 'sei00000006', title: 'Otra canción', artist: 'Nadie', genre: 'Pop', moods: ['Energía'], views: 200 },
  { id: 'yt-par', yt: 'par00000008', title: 'Party Hit', artist: 'DJ Max', genre: 'Pop', moods: ['Fiesta', 'Energía'], views: 9999 },
];

/* 1) Coincidencia exacta y por palabra incompleta. */
check('encuentra una canción por su título', rankTracks(TRACKS, 'despacito').matches[0]?.title === 'Despacito');
check(
  'tolera palabras incompletas',
  rankTracks(TRACKS, 'despac').matches.some((t) => t.title === 'Despacito'),
  rankTracks(TRACKS, 'despac').matches.map((t) => t.title).join(', '),
);

/* 2) Errores de escritura. */
check(
  'tolera errores de escritura',
  scoreTrackText(TRACKS[1], 'bohemian rapsodi') > 0,
  `score=${scoreTrackText(TRACKS[1], 'bohemian rapsodi')}`,
);

/* 3) Intención: las frases se traducen a géneros/moods. */
const sad = inferIntent('canciones para llorar');
check('«para llorar» infiere tristeza', sad.ids.includes('sad') && sad.moods.includes('Triste'), sad.ids.join('+'));
const study = inferIntent('música para estudiar');
check('«para estudiar» infiere concentración', study.ids.includes('focus'), study.ids.join('+'));
const rock80 = inferIntent('rock de los 80');
check('«rock de los 80» infiere rock clásico', rock80.genres.includes('Rock') && rock80.ids.includes('classic'), rock80.ids.join('+'));

/* 4) Relacionados por intención, aunque el texto no coincida. */
const sadRank = rankTracks(TRACKS, 'canciones para llorar');
check(
  'la intención trae canciones tristes aunque no digan «llorar»',
  sadRank.matches.some((t) => t.title === 'Llorar en silencio') &&
  sadRank.related.some((t) => t.genre === 'Balada'),
  `${sadRank.matches.length} exactas + ${sadRank.related.length} relacionadas`,
);

/* 5) Consultas imposibles: nunca vacío y sin duplicados. */
const nonsense = fallbackTracks(TRACKS, 'asdfgh qwerty', 20);
check(
  'una consulta sin coincidencias devuelve relleno popular',
  nonsense.length > 0,
  `${nonsense.length} pistas`,
);
check(
  'el relleno no repite canciones',
  new Set(nonsense.map((t) => t.yt)).size === nonsense.length,
  `${nonsense.length} únicas`,
);
const again = fallbackTracks(TRACKS, 'asdfgh qwerty', 20);
check(
  'el relleno es estable para la misma consulta',
  nonsense.map((t) => t.yt).join(',') === again.map((t) => t.yt).join(','),
);

/* 6) La intención manda sobre el relleno aleatorio. */
const sadFallback = fallbackTracks(TRACKS, 'canciones tristes para desahogarme', 10);
check(
  '«triste» prioriza el mood Triste y aparta el pop de fiesta',
  sadFallback.length > 0 &&
  sadFallback[0].moods.includes('Triste') &&
  !sadFallback.slice(0, 2).some((t) => t.title === 'Party Hit'),
  sadFallback.slice(0, 3).map((t) => `${t.title} [${t.moods.join('/')}]`).join(', '),
);

const party = fallbackTracks(TRACKS, 'algo movidito para la fiesta', 20);
check(
  'la fiesta prioriza cumbia/reggaetón antes que el relleno',
  party.slice(0, 2).some((t) => ['Cumbia', 'Reggaetón'].includes(t.genre)),
  party.slice(0, 2).map((t) => t.genre).join(', '),
);

if (failures) {
  console.error(`\n${failures} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\n✓ motor de coincidencia de búsqueda OK');
