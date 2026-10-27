/* IA de recomendaciones estilo YouTube Music.
   Aprende de gustos, búsquedas, reproducciones e historial.
   Se actualiza en cada apertura/vuelta a Inicio sin repetir lo mismo. */

const KEY = 'ritmo-ai-profile-v1';
const SEARCH_KEY = 'ritmo-ai-searches-v1';

function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { weights: {}, seen: {}, lastKey: Date.now() };
    const p = JSON.parse(raw);
    return { weights: p.weights || {}, seen: p.seen || {}, lastKey: p.lastKey || Date.now() };
  } catch {
    return { weights: {}, seen: {}, lastKey: Date.now() };
  }
}

function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

function addWeight(p, track, delta) {
  const w = p.weights;
  const g = track.genre || 'Otros';
  const a = (track.artist || '').replace(/ ft\..*$/i, '').trim();
  w[g] = (w[g] || 0) + delta * 2;
  if (a) w['art:' + a] = (w['art:' + a] || 0) + delta * 1.5;
  const ms = Array.isArray(track.moods) ? track.moods : [];
  for (const m of ms) w['mood:' + m] = (w['mood:' + m] || 0) + delta;
  const yk = 'year:' + Math.floor((track.year || 2020) / 10) * 10;
  w[yk] = (w[yk] || 0) + delta * 0.5;
}

export function trainFromState(state) {
  const p = loadProfile();
  const lib = state?.library || {};
  for (const g of lib.favoriteGenres || []) p.weights[g] = (p.weights[g] || 0) + 3;
  for (const a of lib.favoriteArtists || []) p.weights['art:' + a] = (p.weights['art:' + a] || 0) + 3;
  saveProfile(p);
  return p;
}

export function scoreTrack(track, state) {
  const p = loadProfile();
  const w = p.weights || {};
  let s = 1;
  const g = track.genre || 'Otros';
  const a = (track.artist || '').replace(/ ft\..*$/i, '').trim();
  s += (w[g] || 0) * 0.8;
  if (a) s += (w['art:' + a] || 0) * 1.2;
  const ms2 = Array.isArray(track.moods) ? track.moods : [];
  for (const m of ms2) s += (w['mood:' + m] || 0) * 0.6;
  const yk = 'year:' + Math.floor((track.year || 2020) / 10) * 10;
  s += (w[yk] || 0) * 0.4;
  const seen = (p.seen || {})[track.id] || 0;
  s *= Math.max(0.25, 1 - seen * 0.15);
  s *= 1 + Math.min(0.2, Math.log10((track.views || 1000) + 1) / 12);
  return s;
}

export function recordPlay(track) {
  if (!track || !track.id) return;
  const p = loadProfile();
  p.seen = p.seen || {};
  p.seen[track.id] = (p.seen[track.id] || 0) + 1;
  addWeight(p, track, 1);
  p.lastKey = Date.now();
  saveProfile(p);
}

export function recordLike(track, liked) {
  if (!track || !track.id) return;
  const p = loadProfile();
  addWeight(p, track, liked ? 2.5 : -1);
  p.lastKey = Date.now();
  saveProfile(p);
}

export function recordSearch(q) {
  const p = loadProfile();
  p.lastKey = Date.now();
  try {
    const arr = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]');
    arr.unshift(String(q).toLowerCase());
    localStorage.setItem(SEARCH_KEY, JSON.stringify(arr.slice(0, 50)));
  } catch {}
  saveProfile(p);
}

export function refreshProfile() {
  const p = loadProfile();
  p.lastKey = Date.now();
  saveProfile(p);
  return p;
}

export function getPersonalizedFeed(tracks, state, opts) {
  const limit = (opts && opts.limit) || 150;
  const exclude = new Set((opts && opts.exclude) || []);
  const arr = Array.isArray(tracks) ? tracks : [];
  if (arr.length === 0) return [];
  const scored = arr
    .filter((t) => t && !exclude.has(t.id))
    .map((t) => ({ t, s: scoreTrack(t, state) + Math.random() * 25 }))
    .sort((a, b) => b.s - a.s);
  const out = [];
  const seenGen = new Set();
  for (const item of scored) {
    if (out.length >= limit) break;
    const g = item.t.genre;
    if (seenGen.has(g) && out.length < limit * 0.6 && Math.random() > 0.3) continue;
    seenGen.add(g);
    out.push(item.t);
  }
  if (out.length < Math.min(limit, 120)) {
    for (const item of scored) {
      if (out.length >= limit) break;
      if (!out.find((x) => x.id === item.t.id)) out.push(item.t);
    }
  }
  const p = loadProfile();
  p.lastKey = Date.now();
  try { saveProfile(p); } catch {}
  const key = p.lastKey || Date.now();
  if (out.length === 0) return [];
  const rot = key % out.length;
  return [...out.slice(rot), ...out.slice(0, rot)];
}

export function getPersonalizedByGenre(tracks, genre, state, limit) {
  const lim = Math.max(limit || 100, 100);
  const arr = Array.isArray(tracks) ? tracks : [];
  const pool = arr.filter((t) => t.genre === genre);
  const base = pool.length >= lim ? [...pool, ...arr.filter((t) => t.genre !== genre)].sort(() => Math.random() - 0.5) : [...pool, ...arr.filter((t) => t.genre !== genre)].sort(() => Math.random() - 0.5);
  const feed = getPersonalizedFeed(base, state, { limit: lim * 2 });
  const pri = feed.filter((t) => t.genre === genre);
  const sec = feed.filter((t) => t.genre !== genre);
  const out = [...pri, ...sec].slice(0, lim);
  // Mezclar para variar cada vez
  return out.sort(() => Math.random() - 0.5);
}