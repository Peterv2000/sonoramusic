/* ══════════════════════════════════════════════════════════════════════════
   IA LOCAL DE CURACIÓN — Ritmo Music

   Sin APIs externas de pago. Decide, de forma heurística pero robusta, qué
   canciones merecen subirse al catálogo y a los gráficos:

     · Filtra basura: recopilatorios, mezclas, compilaciones, directos largos,
       vídeos sin duración, títulos sin sentido, canales sospechosos.
     · Clasifica género por reglas (palabras clave + artista).
     · Estima ánimo (mood) y década.
     · Puntúa la "calidad" de la pista (0..100) y solo acepta las que superan
       un umbral mínimo.
     · Deduplica de forma semántica (título + artista normalizados).

   Todo es determinista y auditable: cada decisión deja rastro en `reason`.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Normalización ── */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/* ── Reglas de género (ampliadas, subgéneros incluidos) ──
   El orden importa: el urbano latino y la música popular/regional se evalúan
   ANTES que «pop» y que el trap genérico. Así «Darell», «trap latino» o
   «música popular» nunca terminan clasificados como pop inglés. */
const URBAN_LATIN_ARTISTS = /darell|myke towers|ñengo flow|nengo flow|farruko|bad bunny|karol g|feid|daddy yankee|anuel|ozuna|rauw alejandro|rauw|maluma|j balvin|arcangel|arcángel|sech|blessd|ryan castro|brytiago|nicky jam|wisin|yandel|don omar|jhayco|jhay cortez|quevedo|eladio carrion|eladio carrión|dei v|j quiles|lenny tavarez|lenny tavárez|sebastian yatra|sebastián yatra/i;
const REGIONAL_ARTISTS = /grupo firme|natanael cano|peso pluma|carin leon|carin león|christian nodal|calibre 50|tigres del norte|intocable|arrolladora|espinoza paz|pepe aguilar|alejandro fernandez|alejandro fernández|los temerarios|banda ms|los plebes|el fantasma|edwin luna|jenni rivera|vicente fernandez|vicente fernández|joan sebastian|joan sebastián|los bukis|marco antonio solis|marco antonio solís|jorge celedon|jorge celedón|peter manjarres|silvestre dangond|diomedes diaz|diomedes díaz|los betos|el andariego|los inquietos|los gigantes|los chiches|los diablitos/i;

const GENRE_RULES = [
  // Latino urbano (primero, para no caer en «pop» ni en «trap» genérico)
  [/dembow/i, 'Dembow'],
  [/trap\s*latino|trap latino|trap\s*argentino/i, 'Trap Latino'],
  [/dancehall\s*latino|dancehall/i, 'Dancehall Latino'],
  [/urbano\s*latino|perreo/i, 'Urbano Latino'],
  [/reggaeton|reggaetón/i, 'Reggaetón'],
  [URBAN_LATIN_ARTISTS, 'Reggaetón'],
  [/salsa/i, 'Salsa'],
  [/bachata/i, 'Bachata'],
  [/cumbia/i, 'Cumbia'],
  [/merengue/i, 'Merengue'],
  [/vallenato|despecho/i, 'Vallenato'],
  // Popular / regional mexicano antes de «pop»: «Popular» contiene «pop».
  [/regional mexicano|ranchera|mariachi|norteño|norteno|corrido|banda|popular/i, 'Popular'],
  [REGIONAL_ARTISTS, 'Popular'],
  [/latin|latino|sabor/i, 'Latino'],
  // Rock / metal
  [/metallica|iron maiden|slipknot|metal|heavy|thrash/i, 'Metal'],
  [/punk|green day|offspring|ramones/i, 'Punk'],
  [/rock|queen|nirvana|guns|acdc|ac\/dc|deep purple|muse|foo fighter|linkin|imagine dragons|coldplay|u2|oasis|radiohead/i, 'Rock'],
  // Electrónica
  [/edm|electronic dance|house|techno|dubstep|trance|drum and bass|d&b/i, 'Electrónica'],
  [/alan walker|avicii|daft punk|tiesto|marshmello|calvin harris|david guetta|martin garrix|kygo|armin|hardwell|skrillex|deadmau5|zedd/i, 'Electrónica'],
  // Hip-Hop / trap
  [/trap/i, 'Trap'],
  [/hip hop|hip-hop|rap|drake|kendrick|eminem|macklemore|cardi|nicki|post malone|travis scott|jay-z|nas|lil /i, 'Hip-Hop'],
  // R&B / soul
  [/r&b|rnb|soul|the weeknd|frank ocean|sza|h\.e\.r|usher|chris brown|alicia keys/i, 'R&B'],
  // Indie / alternative
  [/indie|alternative|arctic monkeys|lana del rey|tame impala|radiohead|the strokes|vampire weekend/i, 'Indie'],
  // K-Pop / J-Pop
  [/kpop|k-pop|bts|blackpink|twice|stray kids|newjeans|\\baespa\\b|\\bexo\\b|red velvet/i, 'K-Pop'],
  [/jpop|j-pop|anime|opening/i, 'J-Pop'],
  // Jazz / blues / clásica
  [/jazz/i, 'Jazz'],
  [/blues/i, 'Blues'],
  [/classical|clásica|orchestra|beethoven|mozart|bach|chopin|piano solo/i, 'Clásica'],
  // Country / folk
  [/country/i, 'Country'],
  [/folk|acoustic|unplugged/i, 'Folk'],
  // Reggae / ska
  [/reggae|bob marley/i, 'Reggae'],
  [/ska/i, 'Ska'],
  // Gospel / cristiana
  [/gospel|cristian|worship|alabanza/i, 'Gospel'],
  // Flamenco
  [/flamenco/i, 'Flamenco'],
  // Pop (amplio, va al final)
  [/pop|taylor swift|dua lipa|adele|ed sheeran|bruno mars|ariana|billie eilish|rihanna|katy perry|sia|shakira|maroon|justin bieber|selena gomez|olivia rodrigo|sabrina carpenter/i, 'Pop'],
];

export function guessGenre(text, artist) {
  const hay = `${text || ''} ${artist || ''}`;
  for (const [re, genre] of GENRE_RULES) if (re.test(hay)) return genre;
  return 'Pop';
}

/* ── Moods ── */
const MOOD_RULES = [
  [/party|fiesta|dance|bailar|hit|hits|top|club/i, 'Fiesta'],
  [/rock|energy|workout|gym|motivaci|power/i, 'Energía'],
  [/chill|relax|lofi|sleep|study|calm|piano|ambient/i, 'Relajado'],
  [/sad|triste|llorar|desamor|heartbreak|despecho|ranchera|vallenato|popular/i, 'Triste'],
  [/love|amor|romant|heart|beso/i, 'Romántico'],
  [/night|noche|dark/i, 'Noche'],
  [/workout|gym|entren/i, 'Workout'],
  [/study|estudi|focus|concentr/i, 'Concentración'],
  [/classic|clásic/i, 'Clásico'],
  [/latin|latino|sabor|reggaeton|reggaetón|dembow|urbano|dancehall/i, 'Fiesta latina'],
];

export function guessMoods(text, genre) {
  const moods = [];
  for (const [re, mood] of MOOD_RULES) if (re.test(text || '')) moods.push(mood);
  if (genre === 'Lo-Fi' || genre === 'Ambient') moods.push('Concentración');
  if (['Latino', 'Reggaetón', 'Salsa', 'Cumbia', 'Bachata', 'Merengue', 'Dembow', 'Trap Latino', 'Urbano Latino', 'Dancehall Latino'].includes(genre)) {
    moods.push('Fiesta latina', 'Fiesta');
  }
  if (['Popular', 'Vallenato', 'Regional Mexicano'].includes(genre)) {
    moods.push('Triste', 'Romántico');
  }
  if (genre === 'Metal' || genre === 'Punk' || genre === 'Rock') moods.push('Energía');
  return [...new Set(moods)].slice(0, 4);
}

/* ── Década ── */
export function guessDecade(text, year) {
  if (year) {
    const y = Number(year);
    if (y >= 1950 && y < 2030) return Math.floor(y / 10) * 10 + 's';
  }
  const m = String(text || '').match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (m) return Math.floor(Number(m[1]) / 10) * 10 + 's';
  return null;
}

/* ── Filtro de basura (compilaciones, mezclas, directos largos, etc.) ── */
const COMPILATION_RE = /top\s*\d|top\s+(global|songs|hits|canciones)|más escuchad|mas escuchad|playlist|megamix|recopilac|best of|greatest hits|nonstop|non-stop|compilation|ranking|éxitos?\s+del|exitos?\s+del|lo más|lo mas|selección|selection|\bmix\b|\bmixes\b|\bhour\b|\bhoras?\b|\d+\s*minutos?|full album|album completo|compilado|medley|popurrí|popurri/i;
const LIVE_RE = /\ben\s*vivo\b|\blive\b|\bconcert\b|\bconcierto\b/i;
const LOW_VALUE_RE = /tutorial|how to|como hacer|review|unboxing|podcast|vlog|reaction|reacts|gameplay|walkthrough|trailer/i;

export function isJunk(track) {
  const title = track.title || '';
  const text = `${title} ${track.artist || ''}`;
  if (!track.yt || !/^[A-Za-z0-9_-]{11}$/.test(track.yt)) return { junk: true, reason: 'sin id válido' };
  if (!track.dur || track.dur < 60) return { junk: true, reason: 'duración < 60s (posible previo)' };
  if (track.dur > 900) return { junk: true, reason: 'duración > 15 min' };
  if (COMPILATION_RE.test(title)) return { junk: true, reason: 'compilación/mezcla' };
  if (LOW_VALUE_RE.test(text)) return { junk: true, reason: 'contenido no musical' };
  if (/\b(official|oficial)\s*(audio|video|music)\b/i.test(title) && title.length < 8) return { junk: true, reason: 'título demasiado corto' };
  if (title.length < 3) return { junk: true, reason: 'título muy corto' };
  return { junk: false, reason: '' };
}

/* ── Puntuación de calidad (0..100) ── */
export function scoreTrack(track) {
  let score = 50;
  const title = track.title || '';
  const artist = track.artist || '';

  // Duración razonable para una canción (2–5 min) = +15
  if (track.dur >= 120 && track.dur <= 330) score += 15;
  else if (track.dur >= 90 && track.dur <= 420) score += 8;
  else score -= 5;

  // Vistas: logarítmico, hasta +20
  const v = Number(track.views) || 0;
  if (v >= 1_000_000_000) score += 20;
  else if (v >= 100_000_000) score += 16;
  else if (v >= 10_000_000) score += 12;
  else if (v >= 1_000_000) score += 8;
  else if (v >= 100_000) score += 4;

  // Título limpio (sin "(Official Video)" etc.) ya limpiado = +5
  if (!/\(.*\)|\[.*\]/.test(title)) score += 5;

  // Artista real (no "Ritmo"/"Canal") = +5
  if (artist && artist !== 'Ritmo' && artist !== 'Canal' && artist.length > 2) score += 5;

  // Sin live = +3
  if (!LIVE_RE.test(title)) score += 3;

  // Miniatura válida = +2
  if (track.thumb && /ytimg|hqdefault|mqdefault/.test(track.thumb)) score += 2;

  return Math.max(0, Math.min(100, score));
}

/* ── Decisión completa: ¿subir o descartar? ── */
export const QUALITY_THRESHOLD = 55;

export function curate(track) {
  const j = isJunk(track);
  if (j.junk) return { accept: false, reason: j.reason, score: 0, genre: null, moods: [], decade: null };
  const text = `${track.title} ${track.artist} ${track.album || ''}`;
  const genre = guessGenre(text, track.artist);
  const moods = guessMoods(text, genre);
  const decade = guessDecade(text, track.year);
  const score = scoreTrack(track);
  const accept = score >= QUALITY_THRESHOLD;
  return { accept, reason: accept ? 'ok' : `score ${score} < ${QUALITY_THRESHOLD}`, score, genre, moods, decade };
}

/* ── Deduplicación semántica ── */
export function semanticKey(track) {
  return norm(track.artist) + '|' + norm(track.title);
}

/* ── Pipeline: aplica curación a una lista y devuelve aceptados + descartados ── */
export function curateBatch(tracks, seenKeys = new Set()) {
  const accepted = [];
  const rejected = [];
  for (const tr of tracks) {
    const decision = curate(tr);
    if (!decision.accept) { rejected.push({ track: tr, reason: decision.reason }); continue; }
    const key = semanticKey(tr);
    if (seenKeys.has(key)) { rejected.push({ track: tr, reason: 'duplicado semántico' }); continue; }
    seenKeys.add(key);
    accepted.push({ ...tr, genre: decision.genre, moods: decision.moods, decade: decision.decade, _score: decision.score });
  }
  return { accepted, rejected, seenKeys };
}

export { GENRE_RULES };
