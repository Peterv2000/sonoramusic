/* ══════════════════════════════════════════════════════════════════════════
   Motor de coincidencia de búsqueda compartido (servidor + cliente).

   Objetivo: que una búsqueda real nunca quede vacía. Para eso combina:

     1. Coincidencia exacta/parcial por título, artista, álbum, género y mood.
     2. Tolerancia a errores de escritura y palabras incompletas (fuzzy).
     3. Inferencia de intención: «para llorar» → triste, «para estudiar» →
        concentración, «rock de los 80» → rock clásico, etc.
     4. Relleno con música relacionada y, como último recurso, populares.

   No depende de Node ni del navegador: es JS puro y se puede importar desde
   `server/*` y desde `src/*`.
   ══════════════════════════════════════════════════════════════════════════ */

export const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'lo', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'u', 'en', 'con', 'para', 'por', 'al', 'a', 'que', 'mi', 'tu',
  'su', 'sus', 'se', 'me', 'te', 'nos', 'les', 'es', 'son', 'muy', 'mas',
  'the', 'of', 'and', 'to', 'in', 'for', 'with', 'feat', 'ft', 'from',
  /* Palabras genéricas: «canciones para llorar» debe buscar por «llorar»,
     no por la palabra «canciones» que aparece en muchos títulos. */
  'cancion', 'canciones', 'song', 'songs', 'musica', 'music', 'tema', 'temas',
  'algo', 'quiero', 'ponme', 'pon', 'escuchar', 'oir', 'playlist', 'playlists',
]);

/** Normaliza texto: minúsculas, sin acentos y solo letras/números. */
export function normalizeSearch(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function queryTokens(query) {
  const text = normalizeSearch(query);
  return text ? text.split(' ').filter(Boolean) : [];
}

/** Palabras con contenido (sin artículos/preposiciones). */
export function contentTokens(query) {
  const tokens = queryTokens(query);
  const content = tokens.filter((token) => !STOPWORDS.has(token) && token.length > 1);
  return content.length ? content : tokens;
}

/* Coincidencia por palabras completas: «rock» coincide con «rock en español»,
   pero no con «rockstar». También admite frases de varias palabras
   («hip hop», «regional mexicano»). */
function phraseInTokens(tokens, phrase) {
  const want = normalizeSearch(phrase).split(' ').filter(Boolean);
  if (!want.length || want.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - want.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) {
      if (tokens[i + j] !== want[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/* Géneros comodín que no describen ningún estilo. */
const GENERIC_GENRES = new Set([
  '', 'sonora', 'sonora music', 'ritmo', 'otros', 'other', 'music', 'musica',
  'varios', 'unknown', 'artista', 'artista desconocido', 'youtube', 'album',
  'lista',
]);

export function isGenericGenre(value) {
  return GENERIC_GENRES.has(normalizeSearch(value));
}

/* Estilos que se pueden deducir directamente de una consulta («merengue»,
   «rock de los 80», «bachata dominicana»). Se usan para etiquetar resultados
   del buscador que llegan sin género y para que la semilla de la radio no
   pierda el estilo. El orden importa: lo específico va antes que lo genérico. */
const STYLE_RULES = [
  { genre: 'Dembow', terms: ['dembow', 'dembow dominicano'] },
  { genre: 'Trap Latino', terms: ['trap', 'trap latino', 'trap argentino', 'trap chileno'] },
  { genre: 'Dancehall Latino', terms: ['dancehall', 'dancehall latino'] },
  { genre: 'Reggaetón', terms: ['reggaeton', 'regueton', 'perreo', 'perrear', 'urbano latino', 'urbana latina', 'musica urbana', 'urbano', 'urbana'] },
  { genre: 'Merengue', terms: ['merengue', 'merengues', 'merengue tipico', 'merengue dominicano'] },
  { genre: 'Salsa', terms: ['salsa', 'salsas', 'salsera', 'timba'] },
  { genre: 'Bachata', terms: ['bachata', 'bachatas'] },
  { genre: 'Cumbia', terms: ['cumbia', 'cumbias', 'sonidera', 'chicha', 'tecno cumbia'] },
  { genre: 'Vallenato', terms: ['vallenato', 'vallenatos', 'vallenata'] },
  { genre: 'Popular', terms: ['popular', 'populares', 'ranchera', 'rancheras', 'corrido', 'corridos', 'banda', 'bandas', 'norteno', 'nortena', 'regional mexicano', 'mariachi', 'despecho'] },
  { genre: 'Rock', terms: ['rock', 'rock en espanol', 'metal', 'punk', 'grunge', 'alternativo', 'alternativa'] },
  { genre: 'Pop', terms: ['pop', 'pop latino'] },
  { genre: 'Hip-Hop', terms: ['hip hop', 'hiphop', 'rap', 'drill', 'hip hop latino'] },
  { genre: 'R&B', terms: ['r&b', 'rnb', 'soul', 'neo soul'] },
  { genre: 'Electrónica', terms: ['electronica', 'edm', 'techno', 'house', 'dubstep', 'dance', 'trance'] },
  { genre: 'K-Pop', terms: ['kpop', 'k pop', 'coreano', 'coreana'] },
  { genre: 'Lo-Fi', terms: ['lofi', 'lo fi', 'chillhop'] },
  { genre: 'Indie', terms: ['indie'] },
  { genre: 'Latino', terms: ['latino', 'latina', 'latin', 'musica latina'] },
  { genre: 'Clásica', terms: ['clasica', 'clasico', 'opera', 'instrumental', 'piano', 'violin'] },
  { genre: 'Jazz', terms: ['jazz', 'blues', 'swing'] },
  { genre: 'Cristiana', terms: ['cristiana', 'cristiano', 'gospel', 'alabanza', 'adoracion'] },
  { genre: 'Navidad', terms: ['navidad', 'navideno', 'navidena', 'christmas', 'villancico', 'villancicos'] },
  { genre: 'Infantil', terms: ['infantil', 'ninos', 'ninas'] },
  { genre: 'Balada', terms: ['balada', 'baladas', 'bolero', 'boleros'] },
  { genre: 'Acústico', terms: ['acustico', 'acustica', 'acoustic', 'folk'] },
];

/**
 * Estilo musical deducido de la consulta, o '' cuando la consulta no describe
 * un género (por ejemplo el nombre de un artista o una canción).
 */
export function styleForQuery(query) {
  const tokens = queryTokens(query);
  if (!tokens.length) return '';
  for (const rule of STYLE_RULES) {
    if (rule.terms.some((term) => phraseInTokens(tokens, term))) return rule.genre;
  }
  return '';
}

/**
 * Devuelve una copia de la pista con el estilo de la consulta si su género es
 * un comodín («Sonora»). No toca pistas con género real ni títulos homónimos
 * de una consulta de varias palabras («El Merengue»).
 */
export function tagTrackWithQueryStyle(track, query, style = styleForQuery(query)) {
  if (!track || !style || !isGenericGenre(track.genre)) return track;
  const q = normalizeSearch(query);
  const titleLike = q.split(' ').filter(Boolean).length > 1;
  if (titleLike && normalizeSearch(track.title) === q) return track;
  return { ...track, genre: style };
}

/* ── Reglas de intención ────────────────────────────────────────────────── */

/* Cada regla aporta géneros/moods del catálogo. `terms` se compara contra la
   consulta normalizada (incluye frases como «rock en espanol»). */
const INTENT_RULES = [
  {
    id: 'party',
    terms: ['fiesta', 'bailar', 'baile', 'festejar', 'antro', 'discoteca', 'rumba',
      'parranda', 'cumpleanos', 'boda', 'reventon', 'party', 'pachanga', 'movidito'],
    genres: ['Reggaetón', 'Cumbia', 'Salsa', 'Latino', 'Electrónica'],
    moods: ['Fiesta', 'Fiesta latina', 'Energía'],
  },
  {
    id: 'sad',
    terms: ['llorar', 'llora', 'triste', 'tristeza', 'desamor', 'corazon roto', 'melancol',
      'melancolia', 'sad', 'depresion', 'sola', 'solo', 'abandono', 'adios'],
    genres: ['Balada', 'Bolero', 'Pop', 'Bachata', 'Latino'],
    moods: ['Triste', 'Romántico', 'Melancólico'],
    /* Una canción de fiesta no responde a «canciones tristes». */
    avoidMoods: ['Fiesta', 'Fiesta latina', 'Energía', 'Workout'],
  },
  {
    id: 'romance',
    terms: ['romantico', 'romantica', 'romance', 'amor', 'enamorado', 'enamorada', 'pareja',
      'cita', 'cena', 'san valentin', 'boda', 'serenata', 'dedicar'],
    genres: ['Balada', 'Bolero', 'Bachata', 'Pop', 'Latino'],
    moods: ['Romántico'],
  },
  {
    id: 'focus',
    terms: ['estudiar', 'estudio', 'concentrar', 'concentracion', 'trabajar', 'trabajo',
      'focus', 'leer', 'lectura', 'programar', 'oficina', 'productividad'],
    genres: ['Lo-Fi', 'Electrónica', 'Indie', 'Clásica'],
    moods: ['Concentración', 'Relajado'],
    avoidMoods: ['Fiesta', 'Fiesta latina', 'Energía', 'Workout'],
  },
  {
    id: 'relax',
    terms: ['relajar', 'relajante', 'calma', 'tranquilo', 'tranquila', 'chill', 'dormir',
      'sueno', 'descansar', 'spa', 'meditar', 'meditacion', 'yoga', 'paz'],
    genres: ['Lo-Fi', 'Indie', 'Electrónica', 'Clásica'],
    moods: ['Relajado', 'Concentración'],
    avoidMoods: ['Fiesta', 'Fiesta latina', 'Energía', 'Workout'],
  },
  {
    id: 'workout',
    terms: ['energia', 'entrenar', 'entrenamiento', 'gym', 'correr', 'workout', 'deporte',
      'motivacion', 'power', 'adrenalina', 'levantar'],
    genres: ['Electrónica', 'Rock', 'Hip-Hop', 'Reggaetón'],
    moods: ['Energía', 'Workout', 'Fiesta'],
  },
  {
    id: 'night',
    terms: ['noche', 'nocturno', 'nocturna', 'oscuro', 'after', 'madrugada', 'insomnio'],
    genres: ['Electrónica', 'R&B', 'Indie', 'Pop'],
    moods: ['Noche', 'Relajado'],
  },
  {
    id: 'classic',
    terms: ['clasico', 'clasica', 'clasicos', 'viejito', 'viejita', 'viejitas', 'antiguo',
      'antigua', 'antiguas', 'retro', 'oldies', 'recuerdo', 'infancia', '80', '80s',
      '90', '90s', '2000', '2000s', 'decada'],
    genres: ['Rock', 'Pop', 'Salsa', 'Cumbia', 'Balada', 'Latino'],
    moods: ['Clásico', 'Romántico', 'Fiesta'],
  },
  {
    id: 'christian',
    terms: ['cristiana', 'cristiano', 'gospel', 'alabanza', 'adoracion', 'iglesia', 'dios'],
    genres: ['Cristiana', 'Gospel', 'Pop', 'Latino'],
    moods: ['Relajado'],
  },
  {
    id: 'christmas',
    terms: ['navidad', 'navideno', 'navidena', 'christmas', 'villancico', 'villancicos'],
    genres: ['Navidad', 'Pop'],
    moods: ['Fiesta', 'Clásico'],
  },
  {
    id: 'kids',
    terms: ['infantil', 'ninos', 'ninas', 'caricaturas', 'dibujos', 'peliculas'],
    genres: ['Infantil', 'Pop'],
    moods: ['Fiesta'],
  },
];

/* Alias de género → géneros reales del catálogo. */
const GENRE_RULES = [
  { terms: ['reggaeton', 'regueton', 'reggaetton', 'perreo', 'dembow', 'urbano', 'urbana', 'trap'], genres: ['Reggaetón', 'Latino', 'Hip-Hop'] },
  { terms: ['merengue', 'merengues', 'merengue tipico'], genres: ['Merengue', 'Latino'] },
  { terms: ['cumbia', 'cumbiambera', 'sonidera', 'chicha', 'tecno cumbia'], genres: ['Cumbia', 'Latino'] },
  { terms: ['salsa', 'salsera', 'timba'], genres: ['Salsa', 'Latino'] },
  { terms: ['bachata', 'bachatas'], genres: ['Bachata', 'Salsa', 'Latino'] },
  { terms: ['vallenato', 'vallenata'], genres: ['Vallenato', 'Latino', 'Cumbia'] },
  { terms: ['rock', 'metal', 'punk', 'grunge', 'alternativo', 'alternativa'], genres: ['Rock', 'Indie'] },
  { terms: ['pop'], genres: ['Pop'] },
  { terms: ['hip hop', 'hiphop', 'rap', 'drill'], genres: ['Hip-Hop', 'R&B'] },
  { terms: ['r&b', 'rnb', 'soul', 'neo soul'], genres: ['R&B', 'Pop'] },
  { terms: ['electronica', 'edm', 'techno', 'house', 'dubstep', 'dance', 'trance'], genres: ['Electrónica'] },
  { terms: ['kpop', 'k pop', 'coreano', 'coreana'], genres: ['K-Pop', 'Pop'] },
  { terms: ['lofi', 'lo fi', 'chillhop', 'beats'], genres: ['Lo-Fi', 'Indie'] },
  { terms: ['indie'], genres: ['Indie', 'Rock'] },
  { terms: ['latino', 'latina', 'latin'], genres: ['Latino', 'Reggaetón', 'Cumbia', 'Salsa'] },
  { terms: ['clasica', 'clasico', 'opera', 'instrumental', 'piano', 'violin'], genres: ['Clásica', 'Lo-Fi'] },
  { terms: ['jazz', 'blues', 'swing'], genres: ['Jazz', 'R&B'] },
  { terms: ['cristiana', 'cristiano', 'gospel'], genres: ['Cristiana', 'Gospel'] },
  { terms: ['navidad', 'christmas', 'villancicos'], genres: ['Navidad'] },
  { terms: ['infantil', 'ninos', 'ninas'], genres: ['Infantil'] },
  { terms: ['balada', 'bolero'], genres: ['Balada', 'Bolero', 'Latino'] },
];

/**
 * Deduce géneros, moods y etiquetas a partir de la consulta.
 * @returns {{genres: string[], moods: string[], tags: string[], ids: string[]}}
 */
export function inferIntent(query) {
  const q = normalizeSearch(query);
  const tokens = q ? q.split(' ').filter(Boolean) : [];
  const genres = new Set();
  const moods = new Set();
  const tags = new Set();
  const ids = new Set();
  const avoidMoods = new Set();

  if (!q) return { genres: [], moods: [], tags: [], ids: [], avoidMoods: [] };

  for (const rule of INTENT_RULES) {
    if (rule.terms.some((term) => q.includes(term))) {
      ids.add(rule.id);
      rule.genres.forEach((g) => genres.add(g));
      rule.moods.forEach((m) => moods.add(m));
      (rule.avoidMoods || []).forEach((m) => avoidMoods.add(m));
    }
  }
  for (const rule of GENRE_RULES) {
    /* Palabras completas: «rockstar» no debe convertirse en Rock. */
    if (rule.terms.some((term) => phraseInTokens(tokens, term))) {
      rule.genres.forEach((g) => genres.add(g));
    }
  }

  // Años sueltos («80», «los 90») refuerzan la etiqueta clásica.
  if (/\b(?:19)?(?:60|70|80|90)s?\b/.test(q) || /\b2000s?\b/.test(q)) {
    tags.add('classic');
    ids.add('classic');
  }

  return {
    genres: [...genres],
    moods: [...moods],
    tags: [...tags],
    ids: [...ids],
    avoidMoods: [...avoidMoods],
  };
}

/* ── Utilidades de coincidencia ─────────────────────────────────────────── */

function levenshtein(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** ¿La palabra se parece al token (prefijo o error de escritura)? */
function fuzzyWordMatch(word, token) {
  if (!word || !token) return false;
  if (word === token) return true;
  if (token.length >= 4 && word.startsWith(token)) return true;
  if (word.length >= 4 && token.startsWith(word)) return true;
  const max = token.length >= 8 ? 2 : token.length >= 5 ? 1 : 0;
  if (!max) return false;
  return levenshtein(word, token, max) <= max;
}

function wordsOf(text) {
  return text ? text.split(' ').filter(Boolean) : [];
}

function normMoods(track) {
  return Array.isArray(track?.moods) ? track.moods : [];
}

function haystacks(track) {
  const title = normalizeSearch(track?.title);
  const artist = normalizeSearch(track?.artist);
  const moodsText = normalizeSearch(normMoods(track).join(' '));
  const meta = normalizeSearch([
    track?.album,
    track?.genre,
    track?.year,
    ...normMoods(track),
  ].join(' '));
  return {
    title,
    artist,
    moodsText,
    meta,
    hay: `${title} ${artist} ${meta}`.trim(),
    titleWords: wordsOf(title),
    artistWords: wordsOf(artist),
    moodWords: wordsOf(moodsText),
    metaWords: wordsOf(meta),
    hayWords: wordsOf(`${title} ${artist} ${meta}`),
  };
}

function matchesToken(words, text, token) {
  if (text.includes(token)) return true;
  return words.some((word) => fuzzyWordMatch(word, token));
}

/** Puntuación por texto (0 = no coincide). */
export function scoreTrackText(track, query) {
  const tokens = contentTokens(query);
  if (!tokens.length) return 0;
  const fields = haystacks(track);
  if (!fields.hay) return 0;

  let score = 0;
  let matched = 0;

  for (const token of tokens) {
    const inTitle = matchesToken(fields.titleWords, fields.title, token);
    const inArtist = matchesToken(fields.artistWords, fields.artist, token);
    /* Un mood que coincide con la consulta vale más que un álbum o un año,
       porque describe cómo suena la canción, no solo una etiqueta. */
    const inMood = matchesToken(fields.moodWords, fields.moodsText, token);
    const inMeta = matchesToken(fields.metaWords, fields.meta, token);
    if (!inTitle && !inArtist && !inMood && !inMeta) continue;

    matched += 1;
    if (inTitle) score += 6;
    else if (inArtist) score += 6;
    else if (inMood) score += 4;
    else score += 2;
  }

  if (!matched) return 0;

  // Frase completa (más relevante) y campos exactos.
  const phrase = normalizeSearch(query);
  const title = fields.title;
  const artist = fields.artist;
  if (fields.hay.includes(phrase)) score += 4;
  if (title === phrase || artist === phrase) score += 10;
  else if (title.startsWith(phrase) || artist.startsWith(phrase)) score += 5;

  // Cobertura: coincidir con todas las palabras vale más que con una.
  score += (matched / tokens.length) * 4;
  return score;
}

function viewsOf(track) {
  const n = Number(track?.views ?? track?.plays ?? track?.listeners ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Puntuación por intención. El estado de ánimo manda sobre el género genérico:
    «triste» no es cualquier canción de Pop, y una canción de fiesta resta. */
export function scoreTrackIntent(track, intent) {
  if (!intent) return 0;
  let score = 0;
  const genre = normalizeSearch(track?.genre);
  const moods = normMoods(track).map(normalizeSearch);

  for (const g of intent.genres || []) {
    if (genre && genre === normalizeSearch(g)) { score += 5; break; }
  }

  /* El primer mood de la regla es el dominante (Triste, Concentración…). */
  (intent.moods || []).forEach((m, index) => {
    if (moods.includes(normalizeSearch(m))) score += index === 0 ? 12 : 7;
  });

  for (const m of intent.avoidMoods || []) {
    if (moods.includes(normalizeSearch(m))) score -= 14;
  }

  return score;
}

/**
 * Ordena el catálogo para una consulta.
 * @returns {{matches: any[], related: any[]}}
 *   matches: coincidencias por texto (título/artista/género/mood).
 *   related: pistas que encajan con la intención aunque no citen la consulta.
 */
export function rankTracks(tracks, query) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  const intent = inferIntent(query);
  const matches = [];
  const related = [];
  const seenMatches = new Set();

  for (const track of list) {
    const score = scoreTrackText(track, query);
    if (score > 0) {
      matches.push({ track, score });
      seenMatches.add(track);
    }
  }

  const hasIntent = intent.genres.length || intent.moods.length;
  if (hasIntent) {
    for (const track of list) {
      if (seenMatches.has(track)) continue;
      const score = scoreTrackIntent(track, intent);
      if (score > 0) related.push({ track, score });
    }
  }

  const byScore = (a, b) => b.score - a.score || viewsOf(b.track) - viewsOf(a.track);
  matches.sort(byScore);
  related.sort(byScore);

  return {
    matches: matches.map((item) => item.track),
    related: related.map((item) => item.track),
    intent,
  };
}

/* ── PRNG determinista para «populares» estable por consulta ────────────── */

function hashString(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Relleno final: música relacionada con la intención y, si aún falta, una
 * selección popular estable por consulta. Nunca devuelve vacío si hay catálogo.
 */
export function fallbackTracks(tracks, query, limit = 40) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!list.length) return [];
  const ranked = rankTracks(list, query);
  const out = [];
  const seen = new Set();
  const keyOf = (track) => track.yt || track.id ||
    `${normalizeSearch(track.title)}|${normalizeSearch(track.artist)}`;
  const add = (track) => {
    if (!track) return;
    const key = keyOf(track);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(track);
  };

  ranked.matches.forEach(add);
  ranked.related.forEach(add);

  if (out.length < limit) {
    const rnd = mulberry32(hashString(query) || 1);
    const conflictMoods = new Set((ranked.intent.avoidMoods || []).map(normalizeSearch));
    const contradicts = (track) => conflictMoods.size > 0 &&
      normMoods(track).map(normalizeSearch).some((mood) => conflictMoods.has(mood));

    const remaining = list.filter((track) => !seen.has(keyOf(track)));
    /* Las canciones que contradicen la intención (fiesta para «triste») solo
       entran como último recurso, para que el relleno nunca quede vacío. */
    const preferred = remaining.filter((track) => !contradicts(track));
    const rest = remaining.filter(contradicts);

    const popular = (pool) => {
      // Fisher-Yates determinista.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.sort((a, b) => viewsOf(b) - viewsOf(a));
      return pool;
    };

    popular(preferred).forEach(add);
    popular(rest).forEach(add);
  }

  return out.slice(0, Math.max(1, limit));
}

/** Etiqueta legible de la intención detectada (para diagnósticos/tests). */
export function intentLabel(query) {
  const intent = inferIntent(query);
  return [...intent.ids].join('+') || 'texto';
}
