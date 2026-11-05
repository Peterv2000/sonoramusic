/* ══════════════════════════════════════════════════════════════════════════
   Inicio dinámico (Sonora).

   La portada ya no se arma con listas estáticas: se pide al servidor
   `GET /api/v1/home/feed`, que ordena las categorías según el historial de
   escucha del usuario, rota las pistas no escuchadas y devuelve todas las
   secciones (descubrimiento, mezclas, rankings, novedades, artistas, vídeos).
   Cada visita usa una semilla nueva para que el inicio nunca se congele.

   Si el servidor no responde, se construye un respaldo con el catálogo local
   para que la app siga usable; nunca se muestran datos inventados.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { TRACKS, GENRES, tracksByGenre } from '../data/catalog.js';
import { cachedCategories } from './categories.js';

const CACHE_KEY = 'sonora-home-v2';
const CLIENT_KEY = 'sonora-client-id';
const TTL = 1000 * 60 * 2;
const MOODS = ['Fiesta', 'Fiesta latina', 'Energía', 'Workout', 'Romántico', 'Relajado', 'Triste', 'Concentración'];

let memory = null;

/* Identidad estable del dispositivo: el historial de escucha se guarda por
   usuario. Al iniciar sesión se usa la cuenta real (ver `useHomeFeed`). */
export function getClientUserId() {
  try {
    const saved = localStorage.getItem(CLIENT_KEY);
    if (saved) return saved;
    const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return 'invitado';
  }
}

function normalizeTrack(raw) {
  if (!raw) return null;
  const yt = String(raw.yt || (String(raw.id || '').startsWith('yt-') ? String(raw.id).slice(3) : ''));
  const id = String(raw.id || (yt ? `yt-${yt}` : ''));
  if (!id && !yt) return null;
  const thumb = String(raw.thumb || raw.cover_url || raw.cover || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : ''));
  return {
    ...raw,
    id: id || `yt-${yt}`,
    yt: yt || (id.startsWith('yt-') ? id.slice(3) : ''),
    title: String(raw.title || ''),
    artist: String(raw.artist || 'Sonora Music'),
    album: String(raw.album || 'Sonora'),
    thumb,
    cover_url: String(raw.cover_url || thumb),
    genre: String(raw.genre || ''),
    moods: Array.isArray(raw.moods) ? raw.moods.filter(Boolean) : [],
    dur: Number(raw.dur || raw.duration || 0),
    duration: Number(raw.duration || raw.dur || 0),
    views: Number(raw.views || 0),
    year: Number(raw.year) || null,
    source: raw.source || 'sonora',
    external: raw.external !== false,
  };
}

const normalizeList = (list) => (Array.isArray(list) ? list.map(normalizeTrack).filter(Boolean) : []);

function normalizeCategory(raw, index = 0) {
  if (!raw) return null;
  const id = String(raw.id || raw.label || '').trim();
  if (!id) return null;
  return {
    id,
    label: String(raw.label || id),
    tag: String(raw.tag || ''),
    tagEn: String(raw.tagEn || raw.tag_en || ''),
    color: String(raw.color || '#e91e63'),
    icon: String(raw.icon || 'sparkles'),
    cover: String(raw.cover || ''),
    genres: Array.isArray(raw.genres) ? raw.genres : [id],
    active: raw.active !== false,
    sort: Number(raw.sort) || index * 10,
    count: Number(raw.count) || 0,
    tracks: normalizeList(raw.tracks),
  };
}

/* ── Respaldo local (solo si la API no está disponible) ─────────────────── */

function localMoodTags(track) {
  const out = new Set(Array.isArray(track?.moods) ? track.moods : []);
  const genre = String(track?.genre || '').toLowerCase();
  if (/reggaeton|reggaetón|salsa|bachata|cumbia|merengue|dembow|urbano|dancehall|trap latino/.test(genre)) {
    out.add('Fiesta latina');
    out.add('Fiesta');
  }
  if (/popular|vallenato|ranchera|regional|corrido|norte/.test(genre)) {
    out.add('Triste');
    out.add('Romántico');
  }
  if (/rock|metal|punk|electro|edm|hip hop|trap/.test(genre)) out.add('Energía');
  if (/balada|pop/.test(genre)) out.add('Romántico');
  if (/lo-?fi|ambient|acoustic|chill/.test(genre)) out.add('Relajado');
  return out;
}

function hash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rotate(list, seed, count) {
  const arr = (list || []).slice();
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

function localFeed({ lang = 'es', seed = Date.now(), mood = '' } = {}) {
  const categories = (cachedCategories().length ? cachedCategories() : GENRES).map((c, i) => normalizeCategory({
    ...c,
    tracks: rotate(tracksByGenre(c.id), seed + i * 17, 18),
    count: tracksByGenre(c.id).length,
  }, i)).filter(Boolean);

  const pool = [];
  const seen = new Set();
  for (const cat of categories) {
    for (const track of cat.tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      pool.push({ ...track, categoryId: cat.id });
    }
  }
  const fallbackPool = pool.length ? pool : normalizeList(TRACKS).map((t) => ({ ...t, categoryId: t.genre }));
  const selectedMood = MOODS.find((m) => m.toLowerCase() === String(mood || '').toLowerCase()) || '';
  return {
    ok: true,
    source: 'local',
    generatedAt: Date.now(),
    seed,
    lang,
    categories,
    moods: MOODS.map((label) => ({
      label,
      count: fallbackPool.filter((t) => localMoodTags(t).has(label)).length,
      tracks: rotate(fallbackPool.filter((t) => localMoodTags(t).has(label)), seed + hash(label), 24),
    })),
    selectedMood,
    moodTracks: selectedMood ? rotate(fallbackPool.filter((t) => localMoodTags(t).has(selectedMood)), seed + 9, 60) : [],
    sections: {
      recent: [],
      quickPicks: rotate(fallbackPool, seed + 3, 12),
      discovery: rotate(fallbackPool, seed + 7, 40),
      mixes: categories.slice(0, 8).map((c) => ({
        id: `mix-${c.id}`, title: c.label, desc: c.tag, descEn: c.tagEn,
        cover: c.tracks[0]?.thumb || c.cover, categoryId: c.id, tracks: c.tracks,
      })),
      forYou: [],
      releases: rotate(fallbackPool, seed + 23, 12).map((t, i) => ({
        id: `release-${i}`, title: t.album && t.album !== 'Sonora' ? t.album : t.title,
        artist: t.artist, year: t.year || '', cover: t.thumb, tracks: [t],
      })),
      charts: rotate(fallbackPool, seed + 37, 20),
      newAdditions: rotate(fallbackPool, seed + 53, 12),
      trends: rotate(fallbackPool, seed + 89, 12),
      stations: categories.slice(0, 8).map((c) => ({
        id: `station-${c.id}`, title: c.label, desc: `${c.count} canciones`, cover: c.cover, tracks: c.tracks,
      })),
      artists: [],
      videos: rotate(fallbackPool, seed + 71, 12),
    },
  };
}

function normalizeFeed(data) {
  if (!data || !Array.isArray(data.categories)) throw new Error('feed no válido');
  const sections = data.sections && typeof data.sections === 'object' ? data.sections : {};
  const normalizeMixes = (list) => (Array.isArray(list) ? list.map((m) => ({
    ...m,
    cover: m.cover || m.tracks?.[0]?.thumb || '',
    desc: String(m.desc || ''),
    descEn: String(m.descEn || m.desc || ''),
    tracks: normalizeList(m.tracks),
  })).filter((m) => m.tracks.length) : []);
  const normalizeReleases = (list) => (Array.isArray(list) ? list.map((r) => ({
    ...r,
    cover: r.cover || r.tracks?.[0]?.thumb || '',
    tracks: normalizeList(r.tracks),
  })).filter((r) => r.tracks.length) : []);
  const normalizeArtists = (list) => (Array.isArray(list) ? list.map((a) => ({
    ...a,
    thumb: a.thumb || a.tracks?.[0]?.thumb || '',
    tracks: normalizeList(a.tracks),
  })).filter((a) => a.tracks.length) : []);
  const normalizeStations = (list) => (Array.isArray(list) ? list.map((s) => ({
    ...s,
    cover: s.cover || s.tracks?.[0]?.thumb || '',
    tracks: normalizeList(s.tracks),
  })).filter((s) => s.tracks.length) : []);

  return {
    ...data,
    categories: data.categories.map(normalizeCategory).filter(Boolean),
    moods: Array.isArray(data.moods) ? data.moods.map((m) => ({
      label: String(m.label || ''),
      count: Number(m.count) || 0,
      tracks: normalizeList(m.tracks),
    })).filter((m) => m.label) : [],
    moodTracks: normalizeList(data.moodTracks),
    sections: {
      recent: normalizeList(sections.recent),
      quickPicks: normalizeList(sections.quickPicks),
      discovery: normalizeList(sections.discovery),
      mixes: normalizeMixes(sections.mixes),
      forYou: normalizeMixes(sections.forYou),
      releases: normalizeReleases(sections.releases),
      charts: normalizeList(sections.charts),
      newAdditions: normalizeList(sections.newAdditions),
      trends: normalizeList(sections.trends),
      stations: normalizeStations(sections.stations),
      artists: normalizeArtists(sections.artists),
      videos: normalizeList(sections.videos),
    },
  };
}

function cacheKey(userId, lang, mood) {
  return `${userId}|${lang}|${mood}`;
}

/** Descarga la portada. `force` ignora la caché en memoria. */
export async function fetchHomeFeed({ userId = getClientUserId(), lang = 'es', mood = '', seed = 0, limit = 12, force = false } = {}) {
  const key = cacheKey(userId, lang, mood);
  const hit = memory?.get(key);
  if (!force && hit && Date.now() - hit.t < TTL && !seed) return hit.data;

  const useSeed = seed || (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const params = new URLSearchParams({
    user_id: userId,
    lang,
    seed: String(useSeed),
    limit: String(limit),
  });
  if (mood) params.set('mood', mood);

  try {
    const res = await fetch(`/api/v1/home/feed?${params}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = normalizeFeed(await res.json());
    memory = memory || new Map();
    memory.set(key, { t: Date.now(), data });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* cuota */ }
    return data;
  } catch {
    // Caché persistida de la última sesión (puede seguir sirviendo sin red).
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (raw?.data && Date.now() - (raw.t || 0) < 1000 * 60 * 30) {
        const cached = normalizeFeed(raw.data);
        if (cached.categories.length) return { ...cached, source: 'cache' };
      }
    } catch { /* sin caché */ }
    return localFeed({ lang, seed: useSeed, mood });
  }
}

/** Pistas de un chip de estado de ánimo desde todo el catálogo. */
export async function fetchMoodTracks(mood, { limit = 600 } = {}) {
  if (!mood) return [];
  try {
    const res = await fetch(`/api/v1/tracks?mood=${encodeURIComponent(mood)}&limit=${limit}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return normalizeList(data.tracks);
  } catch {
    return normalizeList(TRACKS).filter((t) => localMoodTags(t).has(mood));
  }
}

/** Envía una reproducción al historial central (fire-and-forget). */
export function recordListen(track, categoryId) {
  if (!track || (!track.id && !track.yt)) return;
  try {
    const body = JSON.stringify({
      userId: getClientUserId(),
      categoryId: categoryId || track.categoryId || '',
      track: {
        id: track.id,
        yt: track.yt,
        title: track.title,
        artist: track.artist,
        album: track.album,
        thumb: track.thumb || track.cover_url,
        genre: track.genre,
        moods: track.moods,
        dur: track.dur || track.duration,
        views: track.views,
        year: track.year,
      },
    });
    fetch('/api/v1/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* sin red: el historial local sigue funcionando */ }
}

/** Hook de portada: carga, refresca al volver a Inicio y escucha cambios SSE. */
export function useHomeFeed({ userId, lang = 'es', mood = '', enabled = true } = {}) {
  const uid = userId || getClientUserId();
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);

  const load = async ({ force = true, freshSeed = true } = {}) => {
    const token = ++requestRef.current;
    setLoading(true);
    try {
      const data = await fetchHomeFeed({
        userId: uid,
        lang,
        mood,
        seed: freshSeed ? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0 : 0,
        force,
      });
      if (token !== requestRef.current) return;
      setFeed(data);
      setError(data.source === 'local' ? 'offline' : null);
    } catch (err) {
      if (token === requestRef.current) setError(String(err?.message || err));
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return undefined;
    let dead = false;
    load({ force: true, freshSeed: true });
    let es = null;
    try {
      if (typeof EventSource !== 'undefined') {
        es = new EventSource('/api/v1/events');
        const refresh = () => { if (!dead) load({ force: true, freshSeed: false }); };
        es.addEventListener('categories', refresh);
        es.addEventListener('version', refresh);
      }
    } catch { /* sin SSE: la app sigue con la caché */ }
    return () => {
      dead = true;
      try { es?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, lang, mood, enabled, nonce]);

  return {
    feed,
    loading,
    error,
    userId: uid,
    refresh: () => setNonce((n) => n + 1),
  };
}

export const HOME_MOODS = MOODS;
