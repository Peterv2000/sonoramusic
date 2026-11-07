/* ══════════════════════════════════════════════════════════════════════════
   Vectores de audio de una canción.

   El catálogo curado ya trae género, moods, año y duración. Las búsquedas en
   vivo, en cambio, suelen llegar solo con título, artista y carátula. Este
   módulo completa esa información de forma determinista:

     · género / subgénero          (reglas por texto + metadatos)
     · bpm / tempo                 (familia + mood + huella estable)
     · energía y bailabilidad      (0.0 – 1.0)
     · mood principal y época

   No hace falta un servicio externo de análisis: cuando no hay datos reales se
   infieren de forma estable a partir de la propia canción. Dos canciones del
   mismo estilo y con el mismo mood terminan con vectores parecidos, que es lo
   que necesita la cola inteligente para no saltar de una balada a reggaetón.
   ══════════════════════════════════════════════════════════════════════════ */

import { TRACKS } from '../data/catalog.js';

const GENERIC_GENRES = new Set([
  '', 'sonora', 'sonora music', 'ritmo', 'otros', 'other', 'music', 'musica',
  'música', 'varios', 'unknown', 'artista', 'artista desconocido', 'youtube',
  'album', 'álbum', 'lista',
]);

export const fold = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* Título canónico: quita sufijos de vídeo y colaboraciones para comparar la
   misma canción aunque venga de una búsqueda, una playlist o el catálogo. */
const TITLE_NOISE = /\s*[([][^)\]]*\b(?:official|oficial|music\s*video|video|vídeo|visualizer|audio|lyric[s]?|letra[s]?|hd|4k|remaster(?:ed)?|en\s*vivo|live)\b[^)\]]*[)\]]/gi;

export function cleanTitle(value) {
  return String(value || '')
    .replace(TITLE_NOISE, ' ')
    .replace(/\s*[-–—]\s*(?:official|oficial|video|vídeo|audio|lyric[s]?|letra[s]?|en\s*vivo|live|remaster(?:ed)?).*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function songKey(item) {
  const title = fold(cleanTitle(item?.title))
    .replace(/\b(?:feat|ft)\b.*$/, '')
    .trim();
  const artist = fold(String(item?.artist || '').split(/\s+(?:y|and|&|feat|ft)\s+|[,/]/i)[0]);
  return `${title}|${artist}`;
}

const meaningfulGenre = (genre) => {
  const g = fold(genre);
  return Boolean(g) && !GENERIC_GENRES.has(g);
};

/* ── Índice del catálogo para reconocer canciones vistas en búsquedas ───── */
const BY_ID = new Map();
const BY_SONG = new Map();
const BY_TITLE = new Map();
/* Títulos ya normalizados. `findCatalogTrack` recorre el catálogo por cada
   pista candidata y normalizar con regex + NFD es caro; así se hace una sola
   vez al arrancar en lugar de en cada selección de canción. */
const CATALOG_ENTRIES = [];

for (const track of TRACKS) {
  if (track.id) BY_ID.set(String(track.id), track);
  if (track.yt) BY_ID.set(String(track.yt), track);
  BY_SONG.set(songKey(track), track);
  const foldedTitle = fold(cleanTitle(track.title));
  BY_TITLE.set(foldedTitle, track);
  CATALOG_ENTRIES.push({ track, title: foldedTitle });
}

function artistLoose(a, b) {
  const x = fold(a);
  const y = fold(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

function findCatalogTrack(track) {
  if (!track) return null;
  const direct = BY_ID.get(String(track.id || '')) || BY_ID.get(String(track.yt || ''));
  if (direct) return direct;

  const bySong = BY_SONG.get(songKey(track));
  if (bySong) return bySong;

  const title = fold(cleanTitle(track.title));
  if (!title) return null;
  const byTitle = BY_TITLE.get(title);
  if (byTitle) return byTitle;

  // Búsqueda tolerante: «Artist - Song (Official Video)» o título con extras.
  // `CATALOG_ENTRIES` ya trae los títulos normalizados (antes se recalculaban
  // 43 veces por cada pista consultada).
  for (const entry of CATALOG_ENTRIES) {
    const ct = entry.title;
    if (ct.length < 3) continue;
    const titleHit = title === ct || title.startsWith(ct + ' ') || title.endsWith(' ' + ct);
    if (!titleHit) continue;
    if (!track.artist || artistLoose(track.artist, entry.track.artist)) return entry.track;
  }
  return null;
}

/* Metadatos del catálogo cuando la misma canción llega desde una búsqueda. */
function withCatalogMetadata(track) {
  if (!track) return track;
  const hit = findCatalogTrack(track);
  if (!hit) return track;
  const moods = Array.isArray(track.moods) && track.moods.length ? track.moods : hit.moods;
  return {
    ...track,
    genre: meaningfulGenre(track.genre) ? track.genre : hit.genre,
    moods: Array.isArray(moods) ? moods : [],
    year: Number(track.year) || hit.year,
    dur: Number(track.dur || track.duration) || hit.dur || 0,
    views: Number(track.views) || hit.views || 0,
  };
}

/* ── Familias musicales ─────────────────────────────────────────────────── */
const FAMILY_RULES = [
  [/reggaeton|reggaetón|dembow|perreo|salsa|bachata|cumbia|merengue|vallenato|regional mexicano|\bbanda\b|\bcorrido\b|\blatin|latino|urbano|dancehall|trap\s*latino|flamenco|despecho|ranchera|mariachi|norte[nñ]o|\bpopular\b/, 'latin'],
  [/lo.?fi|chill\s*hop|ambient|study\s*beats|sleep\s*beats/, 'lofi'],
  [/electron|edm|\bhouse\b|techno|trance|dubstep|drum\s*and\s*bass|synth|dance\s*music/, 'electronic'],
  [/hip.?hop|\brap\b|\btrap\b|\bdrill\b|grime/, 'hiphop'],
  [/\br\s*&\s*b\b|\brnb\b|\bsoul\b|\bfunk\b/, 'rnb'],
  [/\brock\b|metal|punk|indie|grunge|alternative|alternativo/, 'rock'],
  [/\bpop\b|balad|ballad/, 'pop'],
  [/jazz|blues|classical|clasica|clásica|country|folk|acoustic|acústic/, 'acoustic'],
];

const ARTIST_HINTS = [
  [/bad bunny|karol g|feid|daddy yankee|\banuel\b|ozuna|rauw|maluma|j balvin|arcangel|arcángel|myke towers|sech|blessd|ryan castro|brytiago|shakira|luis fonsi|juanes|marc anthony|romeo santos|prince royce|don omar|wisin|yandel|nicky jam|jhayco|jhay cortez|darell|ñengo flow|nengo flow|farruko|quevedo|eladio carrion|eladio carrión|dei v|j quiles|lenny tavarez|lenny tavárez|grupo firme|natanael cano|peso pluma|carin leon|carin león|christian nodal|calibre 50|tigres del norte|intocable|jenni rivera|vicente fernandez|vicente fernández|joan sebastian|joan sebastián|los bukis|marco antonio solis|marco antonio solís|jorge celedon|jorge celedón|peter manjarres|silvestre dangond|diomedes diaz|el andariego/i, 'latin'],
  [/queen|nirvana|guns n|metallica|ac\/?dc|deep purple|led zeppelin|pink floyd|foo fighters|linkin park|green day|offspring|ramones|muse|u2|oasis|radiohead|arctic monkeys|the strokes|survivor|smash mouth|a-ha|imagine dragons|coldplay/i, 'rock'],
  [/avicii|alan walker|daft punk|tiesto|marshmello|calvin harris|david guetta|martin garrix|kygo|armin|hardwell|skrillex|deadmau5|zedd/i, 'electronic'],
  [/macklemore|drake|kendrick|eminem|cardi|nicki|post malone|travis scott|jay-z|nas|21 savage|future|lil /i, 'hiphop'],
  [/the weeknd|frank ocean|sza|h\.e\.r|usher|chris brown|alicia keys|john legend/i, 'rnb'],
  [/ed sheeran|adele|taylor swift|bruno mars|katy perry|maroon 5|dua lipa|sia|pharrell|one republic|onerepublic|justin bieber|selena gomez|ariana grande|billie eilish|olivia rodrigo|sabrina carpenter|michael jackson|psy/i, 'pop'],
  [/lofi girl|chillhop|ambient|study/i, 'lofi'],
];

const FAMILY_LABEL = {
  pop: 'Pop',
  rock: 'Rock',
  latin: 'Latino',
  electronic: 'Electrónica',
  hiphop: 'Hip-Hop',
  rnb: 'R&B',
  lofi: 'Lo-Fi',
  acoustic: 'Acústico',
  unknown: 'Sonora',
};

const BASE_BPM = {
  pop: 112, rock: 126, latin: 96, electronic: 124, hiphop: 90,
  rnb: 96, lofi: 78, acoustic: 84, unknown: 108,
};

const BASE_ENERGY = {
  pop: 0.62, rock: 0.78, latin: 0.79, electronic: 0.76, hiphop: 0.72,
  rnb: 0.52, lofi: 0.22, acoustic: 0.34, unknown: 0.52,
};

const BASE_DANCE = {
  pop: 0.68, rock: 0.48, latin: 0.9, electronic: 0.78, hiphop: 0.76,
  rnb: 0.66, lofi: 0.36, acoustic: 0.38, unknown: 0.55,
};

const MOOD_RULES = [
  [/fiesta latina|fiesta|party|dance|bailar|club|perreo|celebra/, 'fiesta'],
  [/romant|amor|love|heart|beso|enamor/, 'romantico'],
  [/triste|sad|llorar|desamor|heartbreak|melancol/, 'triste'],
  [/relaj|chill|calm|sleep|dormir|acoustic|piano|suave/, 'relajado'],
  [/energia|energía|energy|power|motivaci|intens/, 'energia'],
  [/workout|gym|entren|cardio/, 'workout'],
  [/noche|night|dark|nocturn/, 'noche'],
  [/concentr|focus|study|estudi|trabajo/, 'concentracion'],
  [/clasic|clásic|classic|retro|oldies|nostalg/, 'clasico'],
];

const MOOD_BPM = {
  fiesta: 14, energia: 10, workout: 16, noche: 2, clasico: 0,
  romantico: -12, relajado: -20, triste: -22, concentracion: -18,
};

const MOOD_ENERGY = {
  fiesta: 0.17, energia: 0.21, workout: 0.25, noche: 0.04, clasico: 0.01,
  romantico: -0.18, relajado: -0.25, triste: -0.22, concentracion: -0.2,
};

const MOOD_DANCE = {
  fiesta: 0.11, energia: 0.04, workout: 0.08, noche: 0.03, clasico: 0,
  romantico: -0.12, relajado: -0.2, triste: -0.16, concentracion: -0.18,
};

/* ── Idioma ───────────────────────────────────────────────────────────────
   La cola no debe saltar de una canción en español a una en inglés. El
   catálogo no trae idioma, así que se deduce de forma determinista con el
   título, el artista, el género y el subgénero. */
const ES_WORDS = new Set([
  'que', 'por', 'para', 'con', 'sin', 'del', 'las', 'los', 'una', 'uno', 'como',
  'amor', 'corazon', 'vida', 'noche', 'cielo', 'beso', 'quiero', 'perdon',
  'mujer', 'hombre', 'nina', 'nino', 'llorar', 'tomar', 'borracho', 'amante',
  'sueno', 'fuego', 'lluvia', 'cama', 'puerta', 'calle', 'despecho', 'traicion',
  'ranchera', 'banda', 'vallenato', 'cumbia', 'salsa', 'bachata', 'corrido',
  'norteno', 'mexicano', 'hoy', 'siempre', 'nunca', 'otra', 'vez', 'pero',
  'porque', 'cuando', 'donde', 'quien', 'todos', 'todo', 'nada', 'bien',
  'solo', 'muy', 'estoy', 'estas', 'esta', 'eres', 'somos', 'tengo', 'tienes',
  'dime', 'dame', 'ven', 'corazon', 'alma', 'besar', 'besame', 'olvidar',
  'olvide', 'duele', 'dolor', 'llanto', 'triste', 'feliz', 'fiesta', 'baila',
  'bailar', 'ritmo', 'sabor', 'pueblo', 'tierra', 'madre', 'padre', 'hijo',
  'hermano', 'amiga', 'amigo', 'senora', 'senor', 'senorita', 'guapa', 'linda',
  'bonita', 'preciosa', 'reina', 'princesa', 'diablo', 'angel', 'luna', 'sol',
]);
const EN_WORDS = new Set([
  'the', 'you', 'your', 'love', 'heart', 'night', 'baby', 'girl', 'boy',
  'and', 'with', 'without', 'when', 'what', 'why', 'how', 'dont', 'cant',
  'wont', 'isnt', 'are', 'was', 'were', 'been', 'she', 'they', 'this', 'that',
  'from', 'for', 'all', 'just', 'like', 'know', 'never', 'always', 'again',
  'tonight', 'dance', 'fire', 'rain', 'dream', 'world', 'time', 'life',
  'good', 'bad', 'stay', 'home', 'alone', 'together', 'feel', 'need', 'want',
  'say', 'said', 'tell', 'told', 'look', 'eyes', 'hands', 'down', 'over',
  'under', 'into', 'through', 'back', 'away', 'more', 'less', 'one', 'two',
  'three', 'my', 'me', 'we', 'our', 'they', 'them', 'there', 'here', 'where',
  'because', 'could', 'would', 'should', 'make', 'take', 'give', 'hold',
  'keep', 'let', 'got', 'get', 'her', 'his', 'him', 'its', 'not', 'now',
]);
const PT_WORDS = new Set([
  'voce', 'nao', 'saudade', 'coracao', 'beijo', 'noite', 'dia', 'com', 'uma',
  'para', 'meu', 'minha', 'amor', 'saudades', 'chorar', 'felicidade', 'mundo',
  'sempre', 'nunca', 'deus', 'mulher', 'homem', 'menina', 'menino',
]);

const ES_ARTIST = /bad bunny|karol g|feid|daddy yankee|\banuel\b|ozuna|rauw|maluma|j balvin|arcangel|arcángel|myke towers|sech|blessd|ryan castro|nicky jam|wisin|yandel|don omar|jhayco|jhay cortez|darell|ñengo flow|nengo flow|farruko|quevedo|eladio carrion|eladio carrión|dei v|j quiles|lenny tavarez|lenny tavárez|shakira|luis fonsi|juanes|marc anthony|romeo santos|prince royce|enrique iglesias|julio iglesias|cristian castro|ha\*?ash|camila|mana|maná|juan gabriel|jose jose|josé josé|chayanne|ricky martin|thalia|thalía|paulina rubio|gloria estefan|celia cruz|olga ta[nñ]on|carlos vives|fonseca|silvestre dangond|diomedes|los betos|andariego|jenni rivera|vicente fernandez|vicente fernández|joan sebastian|joan sebastián|marco antonio solis|marco antonio solís|los bukis|grupo firme|natanael cano|peso pluma|junior h|carin leon|carin león|christian nodal|banda ms|calibre 50|gerardo ortiz|ariel camacho|los tigres del norte|intocable|la arrolladora|espinoza paz|pepe aguilar|alejandro fernandez|alejandro fernández|luis miguel|selena|los angeles azules|los ángeles azules|sonora dinamita|los hermanos zuleta|los inquietos|jorge celedon|jorge celedón|peter manjarres|peter manjarres|silvestre|los gigantes|los chiches|los diablitos|los charritos|los temerarios|banda el recodo|banda los recoditos|los plebes del rancho|los elementos|el fantasma|edwin luna|alberto pedraza|el andariego/i;
const EN_ARTIST = /ed sheeran|adele|queen|nivana|nirvana|guns n|metallica|ac[\/ ]?dc|deep purple|led zeppelin|pink floyd|foo fighters|linkin park|green day|offspring|ramones|muse\b|u2\b|oasis|radiohead|arctic monkeys|the strokes|survivor|smash mouth|a-ha|imagine dragons|coldplay|avicii|alan walker|daft punk|tiesto|marshmello|calvin harris|david guetta|martin garrix|kygo|armin|hardwell|skrillex|deadmau5|zedd|drake|kendrick|eminem|macklemore|cardi|nicki|post malone|travis scott|jay-z|nas\b|21 savage|future|lil |the weeknd|frank ocean|sza|h\.e\.r|usher|chris brown|alicia keys|john legend|taylor swift|bruno mars|katy perry|maroon 5|dua lipa|sia\b|pharrell|one republic|onerepublic|justin bieber|selena gomez|ariana grande|billie eilish|olivia rodrigo|sabrina carpenter|michael jackson|psy\b|billie|beatles|rolling stones|elton john|beyonce|beyoncé|rihanna|miley cyrus|demi lovato|shawn mendes|camila cabello|halsey|lorde|lord huron|passenger|hozier|lewis capaldi|sam smith|harry styles|post malone/i;

function wordScore(words, set) {
  let hits = 0;
  for (const word of words) if (set.has(word)) hits += 1;
  return hits;
}

const LANGUAGE_BY_GENRE = [
  [/regional mexicano|ranchera|banda|norte[nñ]o|corrido|vallenato|cumbia|salsa|bachata|merengue|reggaet[oó]n|dembow|perreo|latino|urbano|despecho|popular/i, 'es'],
];

function detectLanguage(track, family, subgenre) {
  const explicit = fold(track?.language);
  if (/^(?:es|spa|spanish|espanol|español)$/.test(explicit)) return { language: 'es', confidence: 0.98 };
  if (/^(?:en|eng|english|ingles|inglés)$/.test(explicit)) return { language: 'en', confidence: 0.98 };
  if (/^(?:pt|por|portuguese|portugues|portugués)$/.test(explicit)) return { language: 'pt', confidence: 0.98 };

  const title = String(track?.title || '');
  const artist = String(track?.artist || '');
  const text = fold(`${cleanTitle(title)} ${artist} ${track?.album || ''}`);
  if (/\b(?:instrumental|karaoke|orquesta)\b/.test(text)) return { language: 'instrumental', confidence: 0.8 };

  const words = text.split(' ').filter(Boolean);
  let es = wordScore(words, ES_WORDS);
  let en = wordScore(words, EN_WORDS);
  let pt = wordScore(words, PT_WORDS);

  if (/[áéíóúñ¿¡]/i.test(title)) es += 2;
  if (ES_ARTIST.test(artist)) es += 5;
  if (EN_ARTIST.test(artist)) en += 4;
  if (/^[a-z0-9 '&.,!?-]+$/i.test(title) && /\b(?:de|la|el|que|mi|te|me)\b/.test(fold(title))) es += 1;

  const genreText = `${track?.genre || ''} ${subgenre || ''}`;
  if (family === 'latin') es += 4;
  const genreHit = LANGUAGE_BY_GENRE.find(([re]) => re.test(genreText));
  if (genreHit && genreHit[1] === 'es') es += 2;

  const total = es + en + pt;
  if (!total) {
    // Una pista latina sin palabras reconocibles sigue siendo española casi
    // siempre; el resto queda como idioma desconocido (se permite, con cautela).
    return family === 'latin'
      ? { language: 'es', confidence: 0.62 }
      : { language: 'unknown', confidence: 0.2 };
  }
  if (es >= en && es >= pt) return { language: 'es', confidence: Math.min(0.98, 0.55 + es * 0.06) };
  if (en >= pt) return { language: 'en', confidence: Math.min(0.98, 0.55 + en * 0.06) };
  return { language: 'pt', confidence: Math.min(0.98, 0.55 + pt * 0.06) };
}

function stableHash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* Ruido determinista y simétrico: la misma canción siempre da el mismo valor. */
function jitter(value, spread) {
  const n = (stableHash(value) % 1000) / 1000; // 0..1
  return (n * 2 - 1) * spread;
}

const clamp01 = (n) => Math.max(0.02, Math.min(0.98, n));
const round = (n, step = 1) => Math.round(n / step) * step;

function normalizeMood(value) {
  const text = fold(value);
  if (!text) return '';
  for (const [re, key] of MOOD_RULES) if (re.test(text)) return key;
  return '';
}

function moodList(track, haystack) {
  const out = [];
  const add = (key) => { if (key && !out.includes(key)) out.push(key); };

  if (Array.isArray(track?.moods)) {
    for (const raw of track.moods) add(normalizeMood(raw));
  }
  for (const [re, key] of MOOD_RULES) {
    if (re.test(haystack)) add(key);
  }
  return out;
}

function detectFamily(track, haystack) {
  if (meaningfulGenre(track?.genre)) {
    const g = fold(track.genre);
    for (const [re, family] of FAMILY_RULES) if (re.test(g)) return family;
  }
  /* El artista es una señal más fiable que una palabra suelta del título:
     «Lollipop» de Darell no debe caer en pop por contener «pop». Primero
     artistas reconocidos; después, el resto de metadatos. */
  for (const [re, family] of ARTIST_HINTS) {
    if (re.test(String(track?.artist || ''))) return family;
  }
  for (const [re, family] of FAMILY_RULES) {
    if (re.test(haystack)) return family;
  }
  return 'unknown';
}

const REGIONAL_HINT = /regional mexicano|ranchera|mariachi|banda|corrido|norte[nñ]o|grupo firme|natanael cano|peso pluma|carin le[oó]n|christian nodal|calibre 50|tigres del norte|intocable|arrolladora|espinoza paz|pepe aguilar|alejandro fern[aá]ndez|los temerarios|recodo|ms de|los plebes|el fantasma|edwin luna|jenni rivera|vicente fern[aá]ndez|joan sebasti[aá]n|los bukis|marco antonio sol[ií]s/i;
const DESPECHO_HINT = /despecho|popular|andariego|los betos|los inquietos|los gigantes|los chiches|diablitos|jorge celed[oó]n|peter manjarres|silvestre dangond|diomedes d[ií]az|vallenato/i;

const URBAN_HINT = /dembow|trap\s*latino|trap\s*argentino|dancehall|urbano\s*latino|perreo|reggaeton|reggaetón|bad bunny|karol g|feid|daddy yankee|\banuel\b|ozuna|rauw|maluma|j balvin|arcangel|arcángel|myke towers|sech|blessd|nicky jam|wisin|yandel|don omar|jhayco|jhay cortez|darell|ñengo flow|nengo flow|farruko|quevedo|eladio carrion|eladio carrión|dei v|j quiles|lenny tavarez|lenny tavárez/i;
const POPULAR_HINT = /popular|ranchera|mariachi|banda|norte[nñ]o|regional mexicano|corrido|grupo firme|natanael cano|peso pluma|carin le[oó]n|christian nodal|calibre 50|tigres del norte|intocable|arrolladora|espinoza paz|pepe aguilar|alejandro fern[aá]ndez|los temerarios|recodo|ms de|los plebes|el fantasma|edwin luna|jenni rivera|vicente fern[aá]ndez|joan sebasti[aá]n|los bukis|marco antonio sol[ií]s/i;

function detectSubgenre(family, track, haystack, energy) {
  const g = fold(track?.genre);
  const all = `${g} ${haystack}`;
  if (/dembow/.test(all)) return 'Dembow';
  if (/trap\s*latino|trap\s*argentino|trap latino/.test(all)) return 'Trap Latino';
  if (/dancehall/.test(all)) return 'Dancehall Latino';
  if (/urbano\s*latino|perreo/.test(all)) return 'Urbano Latino';
  if (URBAN_HINT.test(all)) return 'Reggaetón';
  if (/salsa/.test(g) || /\bsalsa\b/.test(haystack)) return 'Salsa';
  if (/bachata/.test(g) || /\bbachata\b/.test(haystack)) return 'Bachata';
  if (/cumbia/.test(g) || /\bcumbia\b/.test(haystack)) return 'Cumbia';
  if (/merengue/.test(g) || /\bmerengue\b/.test(haystack)) return 'Merengue';
  if (/vallenato/.test(g) || /\bvallenato\b/.test(haystack) || DESPECHO_HINT.test(all)) return 'Vallenato';
  if (POPULAR_HINT.test(all)) return 'Popular';

  switch (family) {
    case 'pop':
      return energy < 0.45 ? 'Balada' : 'Pop';
    case 'rock':
      return /alternativ|indie|grunge/.test(g + ' ' + haystack) ? 'Rock alternativo' : 'Rock';
    case 'latin': return 'Latino';
    case 'electronic': return 'Electrónica';
    case 'hiphop': return 'Hip-Hop';
    case 'rnb': return 'R&B';
    case 'lofi': return 'Lo-Fi';
    case 'acoustic': return 'Acústico';
    default: return meaningfulGenre(track?.genre) ? track.genre : 'Sonora';
  }
}

function inferYear(track) {
  const direct = Number(track?.year);
  if (direct >= 1900 && direct <= 2035) return direct;
  const match = `${track?.title || ''} ${track?.album || ''}`.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Infiere el vector de audio de una pista.
 *
 * Devuelve:
 *   { genre, family, subgenre, bpm, energy, danceability, mood, moods,
 *     year, era, confidence, explicit }
 */
const FEATURE_CACHE = new WeakMap();

/* Firma de campos primitivos: si una pista se enriquece en sitio (por ejemplo
   al fusionar catálogo + API), el vector se recalcula en vez de quedarse
   obsoleto. Concatenar cadenas es mucho más barato que volver a inferir. */
function featureSignature(track) {
  const moods = Array.isArray(track.moods) ? track.moods.join(',') : '';
  return [
    track.id || '', track.yt || '', track.title || '', track.artist || '',
    track.album || '', track.genre || '', moods, track.year || '',
    track.bpm || track.tempo || '', track.energy ?? '', track.danceability ?? '',
  ].join('\u0001');
}

export function inferAudioFeatures(input) {
  if (!input || typeof input !== 'object') return computeAudioFeatures(input);
  const signature = featureSignature(input);
  const cached = FEATURE_CACHE.get(input);
  if (cached && cached.signature === signature) return cached.features;
  const features = computeAudioFeatures(input);
  FEATURE_CACHE.set(input, { signature, features });
  return features;
}

function computeAudioFeatures(input) {
  const track = withCatalogMetadata(input) || {};
  const title = cleanTitle(track.title);
  const haystack = fold(`${title} ${track.artist || ''} ${track.album || ''} ${track.genre || ''} ${Array.isArray(track.moods) ? track.moods.join(' ') : ''}`);

  const family = detectFamily(track, haystack);
  const moods = moodList(track, haystack);
  const primary = moods[0] || '';

  const explicitBpm = Number(track.bpm || track.tempo);
  const explicitEnergy = Number(track.energy);
  const explicitDance = Number(track.danceability);
  const hasBpm = Number.isFinite(explicitBpm) && explicitBpm > 0;
  const hasEnergy = Number.isFinite(explicitEnergy) && explicitEnergy >= 0 && explicitEnergy <= 1;
  const hasDance = Number.isFinite(explicitDance) && explicitDance >= 0 && explicitDance <= 1;

  const moodBpm = MOOD_BPM[primary] || 0;
  const moodEnergy = MOOD_ENERGY[primary] || 0;
  const moodDance = MOOD_DANCE[primary] || 0;

  let bpm = hasBpm
    ? explicitBpm
    : BASE_BPM[family] + moodBpm + jitter(`${title}|${track.artist}|bpm`, 5);
  // Los temas muy lentos y los muy rápidos necesitan un rango creíble.
  if (/lofi|chill|sleep|study/.test(haystack)) bpm = Math.min(bpm, 88);
  if (/workout|gym|party|fiesta/.test(haystack)) bpm = Math.max(bpm, 96);
  bpm = Math.round(Math.max(58, Math.min(190, bpm)));

  let energy = hasEnergy
    ? explicitEnergy
    : BASE_ENERGY[family] + moodEnergy + jitter(`${title}|${track.artist}|energy`, 0.06);
  energy = clamp01(energy);

  let danceability = hasDance
    ? explicitDance
    : BASE_DANCE[family] + moodDance + jitter(`${title}|${track.artist}|dance`, 0.05);
  danceability = clamp01(danceability);

  // Si no había ninguna pista de mood, se deduce de la intensidad resultante.
  const finalMoods = [...moods];
  const finalMood = primary || (energy > 0.76 ? 'fiesta' : energy > 0.6 ? 'energia' : energy < 0.34 ? 'relajado' : 'noche');
  if (!finalMoods.includes(finalMood)) finalMoods.unshift(finalMood);

  const subgenre = detectSubgenre(family, track, haystack, energy);
  const year = inferYear(track);
  const era = year ? `${Math.floor(year / 10) * 10}s` : 'actual';
  const lang = detectLanguage(track, family, subgenre);

  let confidence = 0.3;
  if (meaningfulGenre(track.genre)) confidence += 0.24;
  if (moods.length) confidence += Math.min(0.22, moods.length * 0.06);
  if (year) confidence += 0.08;
  if (family !== 'unknown') confidence += 0.12;
  if (/reggaeton|balad|rock|pop|reggaetón|salsa|cumbia|trap|rap|electron|lo.?fi/.test(haystack)) confidence += 0.08;
  if (lang.language !== 'unknown') confidence += 0.05;
  confidence = Math.min(1, confidence);

  const genre = meaningfulGenre(track.genre) ? String(track.genre).trim() : (FAMILY_LABEL[family] || 'Sonora');

  return {
    genre,
    family,
    subgenre,
    language: lang.language,
    languageConfidence: Number(lang.confidence.toFixed(2)),
    bpm,
    energy: Number(energy.toFixed(3)),
    danceability: Number(danceability.toFixed(3)),
    mood: finalMood,
    moods: finalMoods.slice(0, 6),
    year,
    era,
    confidence: Number(confidence.toFixed(3)),
    explicit: { bpm: hasBpm, energy: hasEnergy, danceability: hasDance },
  };
}

/**
 * Igual que `inferAudioFeatures`, pero cuando la canción no tiene ninguna
 * señal de estilo (ni género, ni moods, ni artista reconocible) se apoya en la
 * pista semilla para estimar tempo, energía y bailabilidad.
 *
 * Importante: NO se copian género, familia ni mood de la semilla. Si se
 * copiaran, cualquier desconocida pasaría por un clon perfecto de la canción
 * activa y desplazaría a las coincidencias reales. La incertidumbre se queda
 * en el vector (`confidence` baja) y la puntuación la penaliza.
 */
export function featuresFor(track, hint = null) {
  if (!track) return null;
  const base = inferAudioFeatures(track);
  if (!hint || base.family !== 'unknown' || base.confidence >= 0.55) return base;

  const blended = { ...base };
  const noise = `${track.yt || track.id || track.title}|hint`;

  if (!base.explicit.bpm && Number(hint.bpm) > 0) {
    blended.bpm = Math.round(hint.bpm + jitter(`${noise}-bpm`, 9));
  }
  if (!base.explicit.energy && Number.isFinite(Number(hint.energy))) {
    blended.energy = Number(clamp01(hint.energy + jitter(`${noise}-energy`, 0.09)).toFixed(3));
  }
  if (!base.explicit.danceability && Number.isFinite(Number(hint.danceability))) {
    blended.danceability = Number(clamp01(hint.danceability + jitter(`${noise}-dance`, 0.08)).toFixed(3));
  }
  return blended;
}

/** Distancia simple (0 = idéntico) útil para depurar y para la interfaz. */
export function featureDistance(a, b) {
  if (!a || !b) return 1;
  const bpm = Math.min(1, Math.abs(a.bpm - b.bpm) / Math.max(60, a.bpm));
  return Number(((Math.abs(a.energy - b.energy) + Math.abs(a.danceability - b.danceability) + bpm) / 3).toFixed(3));
}

export const isMeaningfulGenre = meaningfulGenre;
export const familyLabel = (family) => FAMILY_LABEL[family] || FAMILY_LABEL.unknown;
