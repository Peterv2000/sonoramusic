/* Catálogo curado de Ritmo Music.
 * Los IDs de vídeo son públicos de YouTube; si alguno falla o fue retirado,
 * el reproductor lo omite automáticamente y continúa con la cola. */

export const TRACKS = [
  // ── Pop internacional ──────────────────────────────────────────────
  { yt: 'JGwWNGJdvx8', title: 'Shape of You', artist: 'Ed Sheeran', album: '÷ (Divide)', year: 2017, genre: 'Pop', moods: ['Fiesta', 'Energía'], dur: 234, views: 6_400_000_000 },
  { yt: 'lp-EO5I60KA', title: 'Thinking Out Loud', artist: 'Ed Sheeran', album: '× (Multiply)', year: 2014, genre: 'Pop', moods: ['Romántico', 'Relajado'], dur: 281, views: 3_600_000_000 },
  { yt: 'YQHsXMglC9A', title: 'Hello', artist: 'Adele', album: '25', year: 2015, genre: 'Pop', moods: ['Triste', 'Romántico'], dur: 367, views: 3_400_000_000 },
  { yt: 'rYEDA3JcQqw', title: 'Rolling in the Deep', artist: 'Adele', album: '21', year: 2010, genre: 'Pop', moods: ['Energía'], dur: 228, views: 3_400_000_000 },
  { yt: 'hLQl3WQQoQ0', title: 'Someone Like You', artist: 'Adele', album: '21', year: 2011, genre: 'Pop', moods: ['Triste', 'Relajado'], dur: 285, views: 2_500_000_000 },
  { yt: 'ZbZSe6N_BXs', title: 'Happy', artist: 'Pharrell Williams', album: 'G I R L', year: 2013, genre: 'Pop', moods: ['Fiesta', 'Energía'], dur: 233, views: 4_200_000_000 },
  { yt: '09R8_2nJtjg', title: 'Sugar', artist: 'Maroon 5', album: 'V', year: 2015, genre: 'Pop', moods: ['Fiesta', 'Romántico'], dur: 235, views: 4_000_000_000 },
  { yt: 'nfWlot6h_JM', title: 'Shake It Off', artist: 'Taylor Swift', album: '1989', year: 2014, genre: 'Pop', moods: ['Fiesta', 'Energía'], dur: 242, views: 4_000_000_000 },
  { yt: 'CevxZvSJLk8', title: 'Roar', artist: 'Katy Perry', album: 'Prism', year: 2013, genre: 'Pop', moods: ['Energía', 'Fiesta'], dur: 269, views: 4_000_000_000 },
  { yt: '0KSOMA3QBU0', title: 'Dark Horse', artist: 'Katy Perry', album: 'Prism', year: 2013, genre: 'Pop', moods: ['Noche', 'Energía'], dur: 215, views: 4_100_000_000 },
  { yt: '2vjPBrBU-TM', title: 'Chandelier', artist: 'Sia', album: '1000 Forms of Fear', year: 2014, genre: 'Pop', moods: ['Energía'], dur: 236, views: 3_200_000_000 },
  { yt: '8UVNT4wvIGY', title: 'Elastic Heart', artist: 'Sia', album: '1000 Forms of Fear', year: 2013, genre: 'Pop', moods: ['Energía', 'Noche'], dur: 246, views: 2_600_000_000 },
  { yt: '450p7goxZqg', title: 'All of Me', artist: 'John Legend', album: 'Love in the Future', year: 2013, genre: 'Pop', moods: ['Romántico', 'Relajado'], dur: 300, views: 3_300_000_000 },
  { yt: 'RgKAFK5djSk', title: 'See You Again', artist: 'Wiz Khalifa ft. Charlie Puth', album: 'Furious 7', year: 2015, genre: 'Pop', moods: ['Triste', 'Romántico'], dur: 237, views: 6_500_000_000 },
  { yt: 'OPf0YbXqDm0', title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', album: 'Uptown Special', year: 2014, genre: 'Pop', moods: ['Fiesta', 'Energía'], dur: 270, views: 5_100_000_000 },
  { yt: 'F57P9C4SAW4', title: '24K Magic', artist: 'Bruno Mars', album: '24K Magic', year: 2016, genre: 'Pop', moods: ['Fiesta'], dur: 226, views: 2_300_000_000 },
  { yt: 'JRfuAukYTKg', title: 'Treasure', artist: 'Bruno Mars', album: 'Unorthodox Jukebox', year: 2012, genre: 'Pop', moods: ['Fiesta'], dur: 178, views: 1_400_000_000 },
  { yt: 'hT_nvWreIhg', title: 'Counting Stars', artist: 'OneRepublic', album: 'Native', year: 2013, genre: 'Pop', moods: ['Energía', 'Concentración'], dur: 257, views: 4_300_000_000 },

  // ── Rock clásico ───────────────────────────────────────────────────
  { yt: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', year: 1975, genre: 'Rock', moods: ['Energía', 'Clásico'], dur: 355, views: 1_900_000_000 },
  { yt: 'hTWKbfoikeg', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', year: 1991, genre: 'Rock', moods: ['Energía', 'Workout'], dur: 301, views: 2_000_000_000 },
  { yt: '1w7OgIMMRc4', title: "Sweet Child O' Mine", artist: "Guns N' Roses", album: 'Appetite for Destruction', year: 1987, genre: 'Rock', moods: ['Energía', 'Clásico'], dur: 356, views: 2_100_000_000 },
  { yt: 'v2AC41dglnM', title: 'Smoke on the Water', artist: 'Deep Purple', album: 'Machine Head', year: 1972, genre: 'Rock', moods: ['Energía', 'Clásico'], dur: 228, views: 1_000_000_000 },
  { yt: 'btPJPFnesV4', title: 'Eye of the Tiger', artist: 'Survivor', album: 'Eye of the Tiger', year: 1982, genre: 'Rock', moods: ['Workout', 'Energía'], dur: 246, views: 1_200_000_000 },
  { yt: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley', album: 'Whenever You Need Somebody', year: 1987, genre: 'Pop', moods: ['Fiesta', 'Clásico'], dur: 213, views: 1_600_000_000 },
  { yt: 'djV11Xbc914', title: 'Take On Me', artist: 'a-ha', album: 'Hunting High and Low', year: 1985, genre: 'Rock', moods: ['Clásico', 'Energía'], dur: 225, views: 1_900_000_000 },
  { yt: 'L_jWHffIx5E', title: 'All Star', artist: 'Smash Mouth', album: 'Astro Lounge', year: 1999, genre: 'Rock', moods: ['Fiesta', 'Clásico'], dur: 237, views: 1_000_000_000 },

  // ── Iconos pop/rock ────────────────────────────────────────────────
  { yt: 'Zi_XLOBDo_Y', title: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', year: 1982, genre: 'Pop', moods: ['Fiesta', 'Clásico'], dur: 294, views: 1_700_000_000 },
  { yt: '9bZkp7q19f0', title: 'Gangnam Style', artist: 'PSY', album: 'PSY 6 (Six Rules)', year: 2012, genre: 'Pop', moods: ['Fiesta', 'Energía'], dur: 253, views: 5_400_000_000 },

  // ── Electrónica ────────────────────────────────────────────────────
  { yt: '60ItHLz5WEA', title: 'Faded', artist: 'Alan Walker', album: 'Different World', year: 2015, genre: 'Electrónica', moods: ['Relajado', 'Concentración'], dur: 212, views: 3_700_000_000 },
  { yt: 'IcrbM1l_BoI', title: 'Wake Me Up', artist: 'Avicii', album: 'True', year: 2013, genre: 'Electrónica', moods: ['Energía', 'Fiesta'], dur: 247, views: 3_400_000_000 },
  { yt: '5NV6Rdv1a3I', title: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories', year: 2013, genre: 'Electrónica', moods: ['Fiesta', 'Relajado'], dur: 248, views: 600_000_000 },

  // ── Latino ─────────────────────────────────────────────────────────
  { yt: 'kJQP7kiw5Fk', title: 'Despacito', artist: 'Luis Fonsi ft. Daddy Yankee', album: 'Vida', year: 2017, genre: 'Latino', moods: ['Fiesta latina', 'Romántico'], dur: 282, views: 8_600_000_000 },
  { yt: 'pRpeEdMmmQ0', title: 'Waka Waka (Esto es África)', artist: 'Shakira', album: 'Sale el Sol', year: 2010, genre: 'Latino', moods: ['Fiesta latina', 'Fiesta'], dur: 211, views: 4_000_000_000 },
  { yt: 'DUT5rEU6pqM', title: 'Gasolina', artist: 'Daddy Yankee', album: 'Barrio Fino', year: 2004, genre: 'Latino', moods: ['Fiesta latina', 'Workout'], dur: 192, views: 2_500_000_000 },

  // ── Hip-Hop / Urbano ───────────────────────────────────────────────
  { yt: 'ru0K8uYEZWw', title: "Can't Hold Us", artist: 'Macklemore & Ryan Lewis', album: 'The Heist', year: 2011, genre: 'Hip-Hop', moods: ['Energía', 'Workout'], dur: 258, views: 1_700_000_000 },
  { yt: 'QK8mJJJvaes', title: 'Thrift Shop', artist: 'Macklemore & Ryan Lewis ft. Wanz', album: 'The Heist', year: 2012, genre: 'Hip-Hop', moods: ['Fiesta'], dur: 236, views: 1_900_000_000 },

  // ── Pop moderno / R&B ──────────────────────────────────────────────
  { yt: '4NRXx6U8ABQ', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', year: 2019, genre: 'Pop', moods: ['Energía', 'Noche'], dur: 244, views: 4_600_000_000 },
  { yt: 'PT2_F-1esPk', title: "Can't Feel My Face", artist: 'The Weeknd', album: 'Beauty Behind the Madness', year: 2015, genre: 'Pop', moods: ['Fiesta', 'Noche'], dur: 234, views: 2_500_000_000 },
  { yt: 'aJOTlE1K90k', title: 'New Rules', artist: 'Dua Lipa', album: 'Dua Lipa', year: 2017, genre: 'Pop', moods: ['Fiesta', 'Energía'], dur: 209, views: 1_900_000_000 },
  { yt: '7wtfhZwyrcc', title: 'Believer', artist: 'Imagine Dragons', album: 'Evolve', year: 2017, genre: 'Pop', moods: ['Workout', 'Energía'], dur: 204, views: 4_100_000_000 },
  { yt: '1G4isv_Fylg', title: 'Paradise', artist: 'Coldplay', album: 'Mylo Xyloto', year: 2011, genre: 'Rock', moods: ['Relajado', 'Energía'], dur: 279, views: 1_000_000_000 },

  // ── Lo-Fi (streams en vivo funcionan como emisora) ────────────────
  { yt: '5qap5aO4i9A', title: 'Lo-Fi beats para estudiar', artist: 'Lofi Girl', album: 'Emisora', year: 2023, genre: 'Lo-Fi', moods: ['Concentración', 'Relajado'], dur: 0, live: true, views: 400_000_000 },
  { yt: 'jfKfPfyJRdk', title: 'Lo-Fi beats para relajarse', artist: 'Lofi Girl', album: 'Emisora', year: 2023, genre: 'Lo-Fi', moods: ['Relajado', 'Concentración'], dur: 0, live: true, views: 300_000_000 },
].map((t) => ({
  ...t,
  id: t.yt,
  explicit: false,
  thumb: `https://i.ytimg.com/vi/${t.yt}/hqdefault.jpg`,
  video: `https://www.youtube.com/watch?v=${t.yt}`,
}));

export const trackById = (id) => TRACKS.find((t) => t.id === id);

const pick = (...ids) => ids.map(trackById).filter(Boolean);

export const MIXES = [
  { id: 'mix-pop', title: 'Mezcla Pop', desc: 'Tus éxitos pop de siempre y nuevos', cover: TRACKS[0].thumb, tracks: pick('JGwWNGJdvx8', 'nfWlot6h_JM', 'CevxZvSJLk8', '09R8_2nJtjg', 'aJOTlE1K90k', '4NRXx6U8ABQ', 'F57P9C4SAW4', 'ZbZSe6N_BXs') },
  { id: 'mix-rock', title: 'Mezcla Rock', desc: 'Guitarras, himnos y clásicos eternos', cover: trackById('fJ9rUzIMcZQ').thumb, tracks: pick('fJ9rUzIMcZQ', 'hTWKbfoikeg', '1w7OgIMMRc4', 'v2AC41dglnM', 'djV11Xbc914', 'btPJPFnesV4', 'L_jWHffIx5E', '1G4isv_Fylg') },
  { id: 'mix-latina', title: 'Éxitos Latinos', desc: 'Reggaetón, pop latino y fiesta', cover: trackById('kJQP7kiw5Fk').thumb, tracks: pick('kJQP7kiw5Fk', 'pRpeEdMmmQ0', 'DUT5rEU6pqM') },
  { id: 'mix-noche', title: 'Modo Noche', desc: 'Para la hora dorada y después', cover: trackById('4NRXx6U8ABQ').thumb, tracks: pick('4NRXx6U8ABQ', 'PT2_F-1esPk', 'YQHsXMglC9A', 'hLQl3WQQoQ0', '60ItHLz5WEA', '5NV6Rdv1a3I', '0KSOMA3QBU0') },
  { id: 'mix-workout', title: 'Workout', desc: 'Ritmo alto para entrenar', cover: trackById('btPJPFnesV4').thumb, tracks: pick('btPJPFnesV4', 'hTWKbfoikeg', '7wtfhZwyrcc', 'ru0K8uYEZWw', 'DUT5rEU6pqM', 'IcrbM1l_BoI') },
  { id: 'mix-romantica', title: 'Romántica', desc: 'Baladas para dedicar', cover: trackById('450p7goxZqg').thumb, tracks: pick('450p7goxZqg', 'lp-EO5I60KA', 'YQHsXMglC9A', 'kJQP7kiw5Fk', 'RgKAFK5djSk', 'hLQl3WQQoQ0') },
  { id: 'mix-lofi', title: 'Flujo Lo-Fi', desc: 'Beats para estudiar y trabajar', cover: trackById('60ItHLz5WEA').thumb, tracks: pick('5qap5aO4i9A', 'jfKfPfyJRdk', '60ItHLz5WEA') },
  { id: 'mix-clasicos', title: 'Clásicos de Siempre', desc: 'Los himnos que todos conocen', cover: trackById('Zi_XLOBDo_Y').thumb, tracks: pick('Zi_XLOBDo_Y', 'dQw4w9WgXcQ', 'fJ9rUzIMcZQ', 'v2AC41dglnM', 'djV11Xbc914', '9bZkp7q19f0') },
  { id: 'mix-urbana', title: 'Urbana', desc: 'Hip-Hop y ritmo para la calle', cover: trackById('QK8mJJJvaes').thumb, tracks: pick('QK8mJJJvaes', 'ru0K8uYEZWw', 'DUT5rEU6pqM', '4NRXx6U8ABQ') },
  { id: 'mix-energia', title: 'Energía pura', desc: 'Nada de baladas por aquí', cover: trackById('7wtfhZwyrcc').thumb, tracks: pick('7wtfhZwyrcc', 'IcrbM1l_BoI', 'hTWKbfoikeg', 'CevxZvSJLk8', 'hT_nvWreIhg', '8UVNT4wvIGY') },
];

export const STATIONS = [
  { id: 'st-fiesta', title: 'Emisora Fiesta', desc: 'Nunca paramos de bailar', cover: trackById('OPf0YbXqDm0').thumb, tracks: pick('OPf0YbXqDm0', 'ZbZSe6N_BXs', '09R8_2nJtjg', 'nfWlot6h_JM', 'F57P9C4SAW4', 'JRfuAukYTKg', '9bZkp7q19f0', 'dQw4w9WgXcQ', 'aJOTlE1K90k') },
  { id: 'st-relax', title: 'Emisora Relajada', desc: 'Calma para tu día', cover: trackById('5qap5aO4i9A').thumb, tracks: pick('5qap5aO4i9A', 'jfKfPfyJRdk', 'lp-EO5I60KA', '450p7goxZqg', 'hLQl3WQQoQ0', '60ItHLz5WEA') },
  { id: 'st-rock', title: 'Emisora Rock', desc: 'Volumen alto, sin disculpas', cover: trackById('1w7OgIMMRc4').thumb, tracks: pick('1w7OgIMMRc4', 'hTWKbfoikeg', 'fJ9rUzIMcZQ', 'v2AC41dglnM', 'btPJPFnesV4', '7wtfhZwyrcc', 'L_jWHffIx5E') },
  { id: 'st-latina', title: 'Emisora Latina', desc: 'Sabor latino 24/7', cover: trackById('pRpeEdMmmQ0').thumb, tracks: pick('pRpeEdMmmQ0', 'kJQP7kiw5Fk', 'DUT5rEU6pqM') },
  { id: 'st-concentracion', title: 'Emisora Concentración', desc: 'Flujo para estudiar y programar', cover: trackById('jfKfPfyJRdk').thumb, tracks: pick('jfKfPfyJRdk', '5qap5aO4i9A', '60ItHLz5WEA', 'hT_nvWreIhg') },
  { id: 'st-clasicos', title: 'Emisora Clásicos', desc: 'Joyas que no envejecen', cover: trackById('fJ9rUzIMcZQ').thumb, tracks: pick('fJ9rUzIMcZQ', 'Zi_XLOBDo_Y', 'v2AC41dglnM', 'djV11Xbc914', '1w7OgIMMRc4', 'btPJPFnesV4') },
];

export const GENRES = [
  { id: 'Pop', color: '#e91e63' },
  { id: 'Rock', color: '#f44336' },
  { id: 'Latino', color: '#ff9800' },
  { id: 'Electrónica', color: '#9c27b0' },
  { id: 'Hip-Hop', color: '#795548' },
  { id: 'Lo-Fi', color: '#4caf50' },
];

export const MOODS = ['Fiesta', 'Relajado', 'Energía', 'Romántico', 'Triste', 'Concentración', 'Fiesta latina', 'Workout', 'Noche', 'Clásico'];

export const tracksByGenre = (g) => TRACKS.filter((t) => t.genre === g);
export const tracksByMood = (m) => TRACKS.filter((t) => t.moods.includes(m));

/* ── Álbumes (agrupados del catálogo) ─────────────────────────────── */
export const ALBUMS = (() => {
  const map = new Map();
  for (const t of TRACKS) {
    const key = `${t.album}||${t.artist}`;
    if (!map.has(key)) map.set(key, { id: encodeURIComponent(t.album), title: t.album, artist: t.artist, year: t.year, genre: t.genre, cover: t.thumb, tracks: [] });
    map.get(key).tracks.push(t);
  }
  return [...map.values()].sort((a, b) => b.year - a.year);
})();
export const albumByTitle = (title) => ALBUMS.find((a) => a.title === title);

/* ── Artistas (agrupados) ─────────────────────────────────────────── */
const hashNum = (s, mod) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % mod; };
export const ARTISTS = (() => {
  const map = new Map();
  for (const t of TRACKS) {
    const name = t.artist.replace(/ ft\..*$/i, '').replace(/ & .*$/i, '');
    if (!map.has(name)) {
      map.set(name, {
        id: encodeURIComponent(name),
        name,
        genre: t.genre,
        thumb: t.thumb,
        listeners: 400_000 + hashNum(name, 18_000_000),
        tracks: [],
      });
    }
    map.get(name).tracks.push(t);
  }
  return [...map.values()].sort((a, b) => b.listeners - a.listeners);
})();
export const artistByName = (name) => ARTISTS.find((a) => a.name === name || encodeURIComponent(a.name) === name);
export const relatedArtists = (artist) => ARTISTS.filter((a) => a.name !== artist.name && a.genre === artist.genre).slice(0, 6);

/* ── Gráficos (estilo YouTube Music / Apple Music) ────────────────── */
export const CHART_TABS = ['Global', 'Pop', 'Rock', 'Latino', 'Electrónica', 'Hip-Hop'];
export const topCharts = (tab = 'Global') => {
  const pool = tab === 'Global' ? TRACKS : TRACKS.filter((t) => t.genre === tab);
  return [...pool].sort((a, b) => b.views - a.views);
};

/* ── Nuevos lanzamientos (álbumes ordenados por año) ──────────────── */
export const newReleases = () => ALBUMS.slice(0, 12);

/* ── Vídeos musicales (todo el catálogo tiene vídeo oficial) ──────── */
export const VIDEOS = TRACKS.filter((t) => !t.live).sort((a, b) => b.views - a.views);

/* ── Reproducciones con semilla estable (Random sin caos) ─────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedShuffle(arr, seed) {
  const rnd = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Descubrimiento semanal (renueva cada lunes, estilo Spotify) ─── */
export const weeklyDiscovery = () => {
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  return seedShuffle(TRACKS, week).slice(0, 20);
};

/* ── Mezclas diarias (4 mezclas por familia de género) ────────────── */
export const dailyMixes = () => {
  const week = Math.floor(Date.now() / (24 * 3600 * 1000));
  const families = [
    { title: 'Mezcla diaria 1', genres: ['Pop'] },
    { title: 'Mezcla diaria 2', genres: ['Rock'] },
    { title: 'Mezcla diaria 3', genres: ['Latino', 'Hip-Hop'] },
    { title: 'Mezcla diaria 4', genres: ['Electrónica', 'Lo-Fi'] },
  ];
  return families.map((f, i) => {
    const pool = TRACKS.filter((t) => f.genres.includes(t.genre));
    const tracks = seedShuffle(pool, week + i * 977).slice(0, 8);
    return {
      id: `daily-${i}`,
      title: f.title,
      desc: tracks.slice(0, 3).map((t) => t.artist).join(', '),
      cover: tracks[0]?.thumb,
      tracks,
    };
  }).filter((m) => m.tracks.length);
};

/* ── Canciones relacionadas (para "Reproducir a continuación") ────── */
export const relatedTracks = (seed, n = 10) => {
  const same = TRACKS.filter((t) => t.id !== seed.id && t.genre === seed.genre);
  const mood = TRACKS.filter((t) => t.id !== seed.id && t.moods.some((m) => seed.moods.includes(m)) && !same.includes(t));
  const rest = TRACKS.filter((t) => t.id !== seed.id && !same.includes(t) && !mood.includes(t));
  return [...same, ...mood, ...rest].slice(0, n);
};

/* ── Construye una emisora infinita a partir de una canción semilla ─ */
export function radioFrom(seed) {
  const same = TRACKS.filter((t) => t.genre === seed.genre && t.id !== seed.id);
  const mood = TRACKS.filter((t) => t.moods.some((m) => seed.moods.includes(m)) && t.id !== seed.id && !same.includes(t));
  const rest = TRACKS.filter((t) => t.id !== seed.id && !same.includes(t) && !mood.includes(t));
  return [seed, ...shuffle(same), ...shuffle(mood), ...shuffle(rest)];
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Formato de reproducciones (8,6 mil M) ────────────────────────── */
export const nf = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
export const formatViews = (n) => `${nf.format(n)} reproducciones`;
export const formatFollowers = (n) => `${nf.format(n)} oyentes mensuales`;
