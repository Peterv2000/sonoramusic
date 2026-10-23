/* ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
   Motor de recomendaciones Ritmo Music
   Inspirado en YouTube Music / Spotify: mezcla afinidad, diversidad y novedad.
   ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ */

function norm(s = '') {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function buildTaste(profile) {
  const { history = [], liked = [], followedArtists = [], favoriteGenres = [], favoriteArtists = [] } = profile || {};
  const genres = new Map();
  const artists = new Map();
  const moods = new Map();
  const years = new Map();

  const bump = (map, key, w) => { if (!key) return; map.set(key, (map.get(key) || 0) + w); };

  // Historial reciente tiene m├ís peso
  history.slice(0, 80).forEach((h, idx) => {
    const tr = h.track;
    if (!tr) return;
    const w = Math.max(1, 12 - idx * 0.15);
    bump(genres, tr.genre, w);
    bump(artists, norm(tr.artist), w * 1.4);
    (Array.isArray(tr.moods) ? tr.moods : []).forEach((m) => bump(moods, m, w * 0.6));
    if (tr.year) bump(years, Math.floor(tr.year / 10) * 10, w * 0.4);
  });

  liked.forEach((tr) => {
    if (!tr) return;
    bump(genres, tr.genre, 8);
    bump(artists, norm(tr.artist), 10);
    (Array.isArray(tr.moods) ? tr.moods : []).forEach((m) => bump(moods, m, 4));
  });

  followedArtists.forEach((a) => bump(artists, norm(a), 16));
  favoriteGenres.forEach((g) => bump(genres, g, 12));
  favoriteArtists.forEach((a) => bump(artists, norm(a), 14));

  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return {
    topGenres: top(genres, 6),
    topArtists: top(artists, 8),
    topMoods: top(moods, 5),
    topDecades: top(years, 3),
    raw: { genres, artists, moods },
  };
}

export function scoreTrack(track, taste, seen = new Set(), now = Date.now()) {
  if (!track) return -999;
  if (seen.has(track.id)) return -1000;
  let s = 0;
  const g = taste.topGenres;
  const a = taste.topArtists;
  const m = taste.topMoods;
  if (g.includes(track.genre)) s += 18;
  if (a.includes(norm(track.artist))) s += 26;
  (Array.isArray(track.moods) ? track.moods : []).forEach((x) => { if (m.includes(x)) s += 6; });
  if (track.views) s += Math.min(10, Math.log10(track.views) * 2);
  if (track.year >= 2018) s += 4;
  else if (track.year >= 2010) s += 2;
  // ligereza para descubrir
  s += Math.random() * 2.5;
  return s;
}

export function makeForYou(allTracks, profile, limit = 50) {
  const taste = buildTaste(profile);
  const seen = new Set([...(profile.history || []).map((h) => h.id), ...(profile.liked || []).map((t) => t.id)]);
  const scored = allTracks
    .filter((t) => t && !t.live)
    .map((t) => ({ t, score: scoreTrack(t, taste, seen) }))
    .filter((x) => x.score > -500)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
  return scored;
}

export function makeMixesForYou(allTracks, profile) {
  const taste = buildTaste(profile);
  const mixes = [];
  // Daily Mix style
  taste.topGenres.slice(0, 4).forEach((genre, i) => {
    const list = allTracks.filter((t) => t.genre === genre && !t.live).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0, 30);
    if (list.length) mixes.push({ id: `dmix-${i+1}`, title: `Mix diario ${i+1}`, desc: `${genre} ÔÇó Para ti`, tracks: list, cover: list[0]?.thumb });
  });
  // Based on top artist
  if (taste.topArtists[0]) {
    const nameKey = taste.topArtists[0];
    const list = allTracks.filter((t) => norm(t.artist).includes(nameKey) && !t.live).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0, 25);
    if (list.length) {
      const real = list[0]?.artist;
      mixes.push({ id: 'mix-like-artist', title: `Porque te gusta ${real}`, desc: 'M├ís de este artista y afines', tracks: list, cover: list[0]?.thumb });
    }
  }
  // Discovery blend
  const blend = makeForYou(allTracks, profile, 35);
  if (blend.length) mixes.push({ id: 'mix-discovery', title: 'Descubierto para ti', desc: 'Nuevas canciones que podr├¡an gustarte', tracks: blend, cover: blend[0]?.thumb });
  return mixes;
}

export function makeRadioForYou(allTracks, profile) {
  const taste = buildTaste(profile);
  const seed = taste.topArtists[0] || taste.topGenres[0];
  if (!seed) return [];
  const list = allTracks.filter((t) => (norm(t.artist).includes(seed) || t.genre === seed) && !t.live).slice(0, 40);
  return list;
}

export function localHits(allTracks, region = 'CO') {
  // Priorizamos latino/reggaet├│n/salsa/bachata/cumbia/merengue/vallenato
  const prefs = ['Reggaet├│n','Latino','Salsa','Bachata','Cumbia','Merengue','Vallenato','Regional Mexicano','Trap'];
  return allTracks
    .filter((t) => prefs.includes(t.genre) && !t.live)
    .sort((a,b)=>(b.views||0)-(a.views||0))
    .slice(0, 60);
}

export function trendingNow(allTracks) {
  return [...allTracks]
    .filter((t) => !t.live)
    .sort((a,b)=>(b.views||0)-(a.views||0))
    .slice(0, 60);
}

export function newForYou(allTracks, profile) {
  const taste = buildTaste(profile);
  const seen = new Set([...(profile.history||[]).map(h=>h.id)]);
  return allTracks
    .filter((t) => !t.live && t.year >= 2020 && !seen.has(t.id))
    .filter((t) => taste.topGenres.includes(t.genre) || taste.topArtists.includes(norm(t.artist)))
    .sort((a,b)=>(b.views||0)-(a.views||0))
    .slice(0, 40);
}
