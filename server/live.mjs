/* ══════════════════════════════════════════════════════════════════════════
   Catálogo dinámico + telemetría + eventos en vivo (Sonora).

   En producción esta capa se sustituye por PostgreSQL/MongoDB y un bus de
   eventos (Redis Pub/Sub, NATS o similar). En este repositorio usa el mismo
   almacén JSON centralizado que el resto de `server/data`, de modo que el
   panel de administración, la web y la APK consumen exactamente la misma
   fuente de verdad, sin categorías hardcodeadas en el cliente.
   ══════════════════════════════════════════════════════════════════════════ */

import { readJson, writeJson } from './updater.mjs';
import { GENRE_RULES } from './ai-curator.mjs';

const CATEGORIES_FILE = 'categories.json';
const ERRORS_FILE = 'errors.json';
const MAX_ERRORS = 800;

const norm = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const GENERIC_GENRES = new Set([
  '', 'ritmo', 'sonora', 'sonora music', 'otros', 'other', 'music', 'musica',
  'música', 'varios', 'unknown', 'youtube', 'album', 'álbum', 'lista', 'canal',
]);

/* Semilla inicial. A partir de aquí TODO se gestiona desde el panel admin y se
   persiste en `categories.json`; el cliente nunca vuelve a leer esta lista. */
const DEFAULT_CATEGORIES = [
  {
    id: 'Pop', label: 'Pop', tag: 'Hits que no dejan de sonar',
    tagEn: 'Hits that never stop', color: '#e91e63', icon: 'sparkles',
    cover: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    genres: ['Pop', 'Balada'], queries: ['pop hits', 'baladas romanticas'], sort: 10,
  },
  {
    id: 'Rock', label: 'Rock', tag: 'Guitarras e himnos eternos',
    tagEn: 'Guitars and timeless anthems', color: '#f44336', icon: 'lightning',
    cover: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
    genres: ['Rock', 'Metal', 'Punk', 'Grunge'], queries: ['rock clasico', 'rock hits'], sort: 20,
  },
  {
    id: 'Latino', label: 'Latino', tag: 'Ritmo y sabor de fiesta',
    tagEn: 'Party rhythm and flavor', color: '#ff9800', icon: 'fire',
    cover: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    genres: ['Latino', 'Reggaetón', 'Salsa', 'Bachata', 'Cumbia', 'Merengue', 'Vallenato', 'Regional Mexicano', 'Popular', 'Despecho', 'Ranchera'],
    queries: ['latin music', 'reggaeton', 'musica popular'], sort: 30,
  },
  {
    id: 'Electrónica', label: 'Electrónica', tag: 'Beats, luces y sintetizadores',
    tagEn: 'Beats, lights and synths', color: '#9c27b0', icon: 'wave',
    cover: 'https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg',
    genres: ['Electrónica', 'EDM', 'House', 'Techno', 'Trance', 'Dance'], queries: ['electronic dance hits', 'edm'], sort: 40,
  },
  {
    id: 'Hip-Hop', label: 'Hip-Hop', tag: 'Flow, rimas y actitud',
    tagEn: 'Flow, rhymes and attitude', color: '#8d6e63', icon: 'mic',
    cover: 'https://i.ytimg.com/vi/QK8mJJJvaes/hqdefault.jpg',
    genres: ['Hip-Hop', 'Rap', 'Trap', 'Drill'], queries: ['hip hop hits', 'rap'], sort: 50,
  },
  {
    id: 'Lo-Fi', label: 'Lo-Fi', tag: 'Calma para estudiar y crear',
    tagEn: 'Calm to study and create', color: '#4caf50', icon: 'headphones',
    cover: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
    genres: ['Lo-Fi', 'Lofi', 'Chillhop', 'Ambient'], queries: ['lofi chill beats', 'chillhop'], sort: 60,
  },
  {
    id: 'R&B', label: 'R&B', tag: 'Soul, groove y voz',
    tagEn: 'Soul, groove and voice', color: '#7e57c2', icon: 'heart',
    cover: 'https://i.ytimg.com/vi/450p7goxZqg/hqdefault.jpg',
    genres: ['R&B', 'Soul', 'Funk'], queries: ['r&b soul hits'], sort: 70,
  },
  {
    id: 'K-Pop', label: 'K-Pop', tag: 'Pop coreano que conquista',
    tagEn: 'Korean pop that takes over', color: '#ec407a', icon: 'sparkles',
    cover: 'https://i.ytimg.com/vi/gdZLi9oWNZg/hqdefault.jpg',
    genres: ['K-Pop', 'J-Pop'], queries: ['kpop hits'], sort: 80,
  },
  {
    id: 'Indie', label: 'Indie', tag: 'Nuevas voces, sonidos libres',
    tagEn: 'New voices, free sounds', color: '#26a69a', icon: 'wave',
    cover: 'https://i.ytimg.com/vi/1G4isv_Fylg/hqdefault.jpg',
    genres: ['Indie', 'Alternative', 'Alternativo', 'Folk'], queries: ['indie hits', 'indie alternative'], sort: 90,
  },
];

function categoryKey(value) {
  return norm(value).replace(/\s+/g, '-') || 'categoria';
}

function normalizeCategory(raw, index = 0) {
  const label = String(raw?.label || raw?.id || '').trim();
  const id = String(raw?.id || categoryKey(label)).trim();
  if (!id || !label) return null;
  const genres = Array.from(new Set(
    (Array.isArray(raw.genres) ? raw.genres : [label])
      .map((g) => String(g || '').trim())
      .filter(Boolean),
  ));
  return {
    id,
    label,
    tag: String(raw.tag || '').trim(),
    tagEn: String(raw.tagEn || raw.tag_en || '').trim(),
    color: /^#[0-9a-f]{3,8}$/i.test(String(raw.color || '')) ? raw.color : '#e91e63',
    icon: String(raw.icon || 'sparkles').trim(),
    cover: String(raw.cover || '').trim(),
    genres: genres.length ? genres : [label],
    queries: Array.isArray(raw.queries) ? raw.queries.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 8) : [],
    active: raw.active !== false,
    sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : (index + 1) * 10,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function seedCategories() {
  const now = Date.now();
  const data = {
    version: 1,
    updatedAt: now,
    categories: DEFAULT_CATEGORIES.map((c, i) => normalizeCategory({ ...c, updatedAt: now }, i)),
  };
  writeJson(CATEGORIES_FILE, data);
  return data;
}

/** Estado completo (incluye categorías inactivas) para el panel admin. */
export function readCategories() {
  const data = readJson(CATEGORIES_FILE);
  if (!data || !Array.isArray(data.categories) || !data.categories.length) return seedCategories();
  const categories = data.categories.map(normalizeCategory).filter(Boolean);
  return { version: data.version || 1, updatedAt: data.updatedAt || 0, categories };
}

/** Categorías visibles para la web/APK, ordenadas y con contadores. */
export function publicCategories(catalog) {
  const data = readCategories();
  const tracks = Array.isArray(catalog?.tracks) ? catalog.tracks : [];
  return {
    updatedAt: data.updatedAt,
    categories: data.categories
      .filter((c) => c.active)
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
      .map((c) => ({
        ...c,
        count: tracks.filter((t) => categoryMatches(c, t)).length,
      })),
  };
}

/** Todas las categorías (activas o no) con contadores, para el panel admin. */
export function adminCategories(catalog) {
  const data = readCategories();
  const tracks = Array.isArray(catalog?.tracks) ? catalog.tracks : [];
  return {
    updatedAt: data.updatedAt,
    categories: data.categories
      .slice()
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
      .map((c) => ({
        ...c,
        count: tracks.filter((t) => categoryMatches(c, t)).length,
      })),
  };
}

/** Alta o edición desde el panel admin. */
export function saveCategory(raw) {
  const data = readCategories();
  const existingIndex = data.categories.findIndex((c) => c.id === String(raw?.id || ''));
  const normalized = normalizeCategory({
    ...raw,
    id: raw?.id || categoryKey(raw?.label),
    updatedAt: Date.now(),
  }, existingIndex >= 0 ? existingIndex : data.categories.length);
  if (!normalized) throw new Error('categoría no válida');

  if (existingIndex >= 0) data.categories[existingIndex] = { ...data.categories[existingIndex], ...normalized };
  else data.categories.push(normalized);

  data.updatedAt = Date.now();
  writeJson(CATEGORIES_FILE, data);
  return normalized;
}

export function removeCategory(id) {
  const data = readCategories();
  const before = data.categories.length;
  data.categories = data.categories.filter((c) => c.id !== String(id || ''));
  data.updatedAt = Date.now();
  writeJson(CATEGORIES_FILE, data);
  return before !== data.categories.length;
}

/* ── Género efectivo de una pista del catálogo ampliado ───────────────────
   El catálogo antiguo guardó «Ritmo»/«Pop» para muchos temas latinos porque
   el clasificador anterior no conocía a Darell, Myke Towers ni la música
   popular colombiana/mexicana. Aquí se re-clasifica al leer, sin mutar el
   catálogo: una señal latina fuerte manda sobre el género almacenado. */
const LATIN_SIGNAL = /darell|myke towers|ñengo flow|nengo flow|farruko|bad bunny|karol g|feid|daddy yankee|anuel|ozuna|rauw|maluma|j balvin|arcangel|arcángel|sech|blessd|ryan castro|brytiago|nicky jam|wisin|yandel|don omar|jhayco|jhay cortez|quevedo|eladio carrion|trap\s*latino|dembow|dancehall|urbano\s*latino|perreo|reggaeton|reggaetón|salsa|bachata|cumbia|merengue|vallenato|ranchera|mariachi|norteño|norteno|corrido|regional mexicano|musica popular|música popular|despecho|los betos|el andariego|grupo firme|natanael cano|peso pluma|carin leon|carin león|christian nodal|calibre 50|tigres del norte|intocable|jenni rivera|vicente fernandez|vicente fernández|joan sebastian|joan sebastián|los bukis|marco antonio solis|marco antonio solís|jorge celedon|jorge celedón|peter manjarres|silvestre dangond|diomedes diaz|los temerarios/i;

function latinSubgenre(hay) {
  if (/dembow/i.test(hay)) return 'Dembow';
  if (/trap\s*latino|trap latino|trap\s*argentino/i.test(hay)) return 'Trap Latino';
  if (/dancehall/i.test(hay)) return 'Dancehall Latino';
  if (/urbano\s*latino|perreo/i.test(hay)) return 'Urbano Latino';
  if (/reggaeton|reggaetón|darell|myke towers|ñengo flow|nengo flow|farruko|bad bunny|karol g|feid|daddy yankee|anuel|ozuna|rauw|maluma|j balvin|arcangel|arcángel|sech|blessd|ryan castro|brytiago|nicky jam|wisin|yandel|don omar|jhayco|jhay cortez|quevedo|eladio carrion/i.test(hay)) return 'Reggaetón';
  if (/salsa/i.test(hay)) return 'Salsa';
  if (/bachata/i.test(hay)) return 'Bachata';
  if (/cumbia/i.test(hay)) return 'Cumbia';
  if (/merengue/i.test(hay)) return 'Merengue';
  if (/vallenato|despecho|los betos|el andariego|jorge celedon|jorge celedón|peter manjarres|silvestre dangond|diomedes diaz/i.test(hay)) return 'Vallenato';
  if (/regional mexicano|ranchera|mariachi|norteño|norteno|corrido|popular|grupo firme|natanael cano|peso pluma|carin leon|carin león|christian nodal|calibre 50|tigres del norte|intocable|jenni rivera|vicente fernandez|vicente fernández|joan sebastian|joan sebastián|los bukis|marco antonio solis|marco antonio solís|los temerarios/i.test(hay)) return 'Popular';
  return 'Latino';
}

function effectiveGenre(track) {
  const own = String(track?.genre || '').trim();
  const hay = `${track?.title || ''} ${track?.artist || ''} ${track?.album || ''}`;
  const latin = LATIN_SIGNAL.test(hay) ? latinSubgenre(hay) : '';
  const genericOwn = !own || GENERIC_GENRES.has(norm(own)) || /^(?:pop|ritmo|youtube|musica|música)$/.test(norm(own));
  if (latin && (genericOwn || /latino|latin|reggaeton|reggaetón|salsa|bachata|cumbia|merengue|vallenato|popular|regional|ranchera|norteño|corrido|dembow|trap|urbano/i.test(own))) {
    return latin;
  }
  if (own && !GENERIC_GENRES.has(norm(own))) return own;
  if (latin) return latin;
  for (const [re, genre] of GENRE_RULES) {
    if (re.test(hay)) return genre;
  }
  return '';
}

function categoryMatches(category, track) {
  const genre = effectiveGenre(track);
  if (!genre) return false;
  const g = norm(genre);
  return category.genres.some((wanted) => {
    const w = norm(wanted);
    return w && (g === w || g.startsWith(w + ' ') || w.startsWith(g + ' '));
  });
}

const JUNK_TITLE = /\b(?:top\s*\d+|top\s+(?:global|songs|hits|canciones|music|m[úu]sica)|megamix|non-?stop|compilation|recopilaci[oó]n|best of|greatest hits|full album|album completo|playlist|grandes\s+[eé]xitos|viejitas|medley|popurr[ií]|mix|old\s*school|#mix|\d+\s*(?:hour|hours|hora|horas)|(?:las?\s+)?\d+\s+(?:mejores|best)|making\s+of|vevo\s+footnotes|detr[áa]s\s+de\s+c[áa]maras|behind\s+the\s+scenes)\b/i;
const LOW_VALUE_TITLE = /\b(?:tutorial|how to|como hacer|review|unboxing|podcast|vlog|reaction|reacts|gameplay|walkthrough|trailer|karaoke|tribute)\b/i;
const LYRIC_TITLE = /\b(?:lyrics?|letra|letras|sub\s*(?:espa[ñn]ol|esp|english|ingl[ée]s)|traducid[oa]|subtitulad[oa])\b/i;
const JUNK_ARTIST = /(?:\bletras?\.?\s*4k\b|\blyrics?\s*(?:4k|channel|music)\b|\btop\s*lau\b|\bmixes?\s+(?:para|de)\b|\bdj\s*(?:carloss|vj)\b|\bhear this music\b|\bproducciones\b|\bcompilations?\b|\bplaylists?\b)/i;
const PLACEHOLDER_ARTISTS = new Set(['', 'sonora', 'sonora music', 'artista', 'artista desconocido', 'canal', 'lista', 'ritmo']);

/* Limpieza de metadatos: la interfaz es de marca blanca, así que el título
   nunca debe arrastrar «(Official Video)», «Lyric Video» ni listas de artistas
   del canal (`KAROL G, Nicki Minaj - Tusa` → `Tusa`). */
function cleanTitle(value) {
  let out = String(value || '');
  out = out.replace(/\s*[([{]\s*(?:(?:official|oficial)\s*)?(?:video|audio|videoclip|visualizer|lyric\s*video|letra|hd|hq|4k)\s*[)\]}]\s*/gi, ' ');
  out = out.replace(/\s*[-–—]\s*(?:official|oficial)\s+(?:video|audio|videoclip)\b.*$/gi, '');
  out = out.replace(/\s+(?:official|oficial)\s+(?:video|audio|videoclip)\b.*$/gi, '');
  out = out.replace(/\s+(?:video|audio)\s+(?:oficial|official)\b.*$/gi, '');
  out = out.replace(/\s*[([{]\s*(?:hd|hq|4k|remaster(?:ed)?(?:\s*\d{4})?)\s*[)\]}]\s*/gi, ' ');
  out = out.replace(/\s*[|•]\s*(?:official|oficial|video|audio|lyrics?|letra)\b.*$/gi, '');
  out = out.replace(/\s{2,}/g, ' ').replace(/[\s\-–—:|]+$/g, '').trim();

  /* «Artista, Artista - Canción» → «Canción». Se recorta la izquierda cuando
     parece una lista de artistas (comas, «x», «&», «feat») o cuando tiene dos
     o más palabras y la derecha es un título corto. */
  const dash = out.lastIndexOf(' - ');
  if (dash > 0) {
    const left = out.slice(0, dash);
    const right = out.slice(dash + 3).trim();
    const leftWords = norm(left).split(' ').filter((w) => w.length > 1);
    const rightWords = norm(right).split(' ').filter((w) => w.length > 1);
    if (right && (
      /[,&]|\sx\s|\b(?:ft\.?|feat\.?|featuring)\b/i.test(left) ||
      (leftWords.length >= 2 && rightWords.length >= 1 && rightWords.length <= 6)
    )) out = right;
  }
  return out;
}

/* «BLESSD 💀 ANUEL AA» / «Nicky Jam x Ozuna»: el título es una lista de
   artistas del canal, no una canción. */
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

function isPlayableSong(track) {
  if (!track) return false;
  const yt = String(track.yt || '');
  if (!/^[\w-]{11}$/.test(yt)) return false;
  const title = cleanTitle(track.title);
  if (title.length < 2) return false;
  const artist = String(track.artist || '');
  if (PLACEHOLDER_ARTISTS.has(norm(artist)) || JUNK_ARTIST.test(artist)) return false;
  if (JUNK_TITLE.test(title) || LOW_VALUE_TITLE.test(title) || LYRIC_TITLE.test(title)) return false;
  if (looksLikeArtistOnly(title, artist)) return false;
  // Medleys con tres o más canciones en el título.
  if ((title.match(/\s\/\s/g) || []).length >= 2) return false;
  const dur = Number(track.dur || track.duration || 0);
  if (dur && (dur < 60 || dur > 900)) return false;
  return true;
}

function inferYear(track) {
  const direct = Number(track?.year);
  if (direct >= 1900 && direct <= 2035) return direct;
  const match = `${track?.title || ''} ${track?.album || ''}`.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return match ? Number(match[1]) : null;
}

function toClientTrack(track, category, coverProxy) {
  const yt = String(track.yt || '');
  const art = String(track.thumb || `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`);
  return {
    track_id: `snr_${Buffer.from(yt, 'utf8').toString('base64url')}`,
    id: `yt-${yt}`,
    yt,
    title: cleanTitle(track.title),
    artist: track.artist,
    album: track.album || 'Sonora',
    cover_url: coverProxy(art),
    thumb: coverProxy(art),
    stream_url: `/api/stream/${Buffer.from(yt, 'utf8').toString('base64url')}`,
    kind: 'video',
    genre: effectiveGenre(track) || category.label,
    moods: Array.isArray(track.moods) && track.moods.length ? track.moods : [],
    duration: Number(track.dur || track.duration || 0),
    dur: Number(track.dur || track.duration || 0),
    year: inferYear(track),
    views: Number(track.views || 0),
    categoryId: category.id,
    source: 'sonora',
    external: true,
  };
}

/** Pistas de una categoría, ya saneadas y listas para el cliente. */
export function categoryTracks(categoryId, { catalog, curated, limit = 150, coverProxy = (x) => x } = {}) {
  const data = readCategories();
  const category = data.categories.find((c) => c.id === String(categoryId || '') && c.active);
  if (!category) return null;

  const all = [
    ...(Array.isArray(curated?.catalog) ? curated.catalog : []),
    ...(Array.isArray(catalog?.tracks) ? catalog.tracks : []),
  ];
  const seen = new Set();
  const seenTitles = new Set();
  const tracks = [];
  for (const track of all) {
    const yt = String(track?.yt || '');
    if (!yt || seen.has(yt)) continue;
    if (!isPlayableSong(track) || !categoryMatches(category, track)) continue;
    /* Diversas subidas del mismo tema suelen llegar con canales distintos.
       Se conserva la primera y se descartan las copias por título limpio. */
    const titleKey = norm(cleanTitle(track.title));
    if (titleKey && seenTitles.has(titleKey)) continue;
    seen.add(yt);
    if (titleKey) seenTitles.add(titleKey);
    tracks.push(toClientTrack(track, category, coverProxy));
    if (tracks.length >= limit) break;
  }
  return { category, tracks, updatedAt: data.updatedAt };
}

/* ── Telemetría / QA Robot ──────────────────────────────────────────────── */
function safeContext(value) {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const text = JSON.stringify(value);
    if (!text || text.length > 4000) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function recordError(raw, { ip } = {}) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const entry = {
    id: `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    type: String(payload.type || 'playback').slice(0, 24),
    severity: ['info', 'warning', 'error', 'fatal'].includes(payload.severity) ? payload.severity : 'error',
    message: String(payload.message || '').slice(0, 500),
    code: String(payload.code || '').slice(0, 64),
    trackId: String(payload.trackId || payload.track_id || '').slice(0, 128),
    title: String(payload.title || '').slice(0, 200),
    artist: String(payload.artist || '').slice(0, 200),
    source: String(payload.source || '').slice(0, 80),
    latencyMs: Math.max(0, Math.min(600000, Number(payload.latencyMs) || 0)),
    url: String(payload.url || '').slice(0, 500),
    platform: String(payload.platform || '').slice(0, 40),
    appVersion: String(payload.appVersion || '').slice(0, 40),
    userAgent: String(payload.userAgent || '').slice(0, 300),
    ip: String(ip || '').slice(0, 80),
    context: safeContext(payload.context),
  };
  const data = readJson(ERRORS_FILE) || { updatedAt: 0, errors: [] };
  const errors = Array.isArray(data.errors) ? data.errors : [];
  errors.unshift(entry);
  writeJson(ERRORS_FILE, { updatedAt: Date.now(), errors: errors.slice(0, MAX_ERRORS) });
  return entry;
}

export function readErrors(limit = 200) {
  const data = readJson(ERRORS_FILE) || { updatedAt: 0, errors: [] };
  return {
    updatedAt: data.updatedAt || 0,
    total: Array.isArray(data.errors) ? data.errors.length : 0,
    errors: (Array.isArray(data.errors) ? data.errors : []).slice(0, Math.max(1, Math.min(MAX_ERRORS, limit))),
  };
}

export function clearErrors() {
  writeJson(ERRORS_FILE, { updatedAt: Date.now(), errors: [] });
}

/* ── Server-Sent Events: cambios en vivo para Web + APK ─────────────────── */
const sseClients = new Set();
let heartbeat = null;

export function subscribeEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.write('retry: 5000\n\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: Date.now() })}\n\n`);
  sseClients.add(res);

  const cleanup = () => {
    sseClients.delete(res);
    if (!sseClients.size && heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);

  if (!heartbeat) {
    heartbeat = setInterval(() => {
      for (const client of sseClients) {
        try { client.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch { sseClients.delete(client); }
      }
      if (!sseClients.size) { clearInterval(heartbeat); heartbeat = null; }
    }, 20000);
    heartbeat.unref?.();
  }
}

export function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(frame); } catch { sseClients.delete(client); }
  }
}
