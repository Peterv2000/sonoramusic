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
import { TRACKS, GENRES } from '../data/catalog.js';
import { cachedCategories } from './categories.js';
import { catalogPool } from './catalogStore.js';
import { apiUrl, absMedia, eventUrl } from './apiBase.js';
import { weightedShuffle, listeningProfile } from '../state/listeningHistory.js';

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
  const thumb = absMedia(String(raw.thumb || raw.cover_url || raw.cover || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '')));
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

/* ── Coincidencia tolerante de género ─────────────────────────────────────
   El catálogo etiqueta las pistas con nombres libres («Reggaetón», «R&B/Soul»,
   «Latin Pop»…) y las categorías con sus propios géneros. Comparar por
   igualdad exacta dejaba categorías vacías y, al caer al respaldo local, la
   portada mostraba siempre las ~43 pistas semilla. */

function normKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function categoryKeys(category) {
  const keys = new Set();
  const push = (value) => {
    const key = normKey(value);
    if (key) keys.add(key);
  };
  push(category?.id);
  push(category?.label);
  for (const genre of Array.isArray(category?.genres) ? category.genres : []) push(genre);
  return [...keys];
}

function matchesCategory(track, category, keys = categoryKeys(category)) {
  const values = [track?.categoryId, track?.genre].map(normKey).filter(Boolean);
  if (!values.length) return false;
  for (const value of values) {
    if (keys.includes(value)) return true;
    const compact = value.replace(/\s+/g, '');
    const words = new Set(value.split(' '));
    for (const key of keys) {
      if (compact === key.replace(/\s+/g, '')) return true;
      const keyWords = key.split(' ');
      if (keyWords.length && keyWords.every((word) => words.has(word))) return true;
    }
  }
  return false;
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
  const profile = listeningProfile();
  /* El respaldo offline usa TODO el catálogo cacheado (cientos de pistas), no
     solo las ~43 semilla. Antes `TRACKS.filter(t => t.genre === category.id)`
     dejaba fuera casi todo y el Inicio parecía congelado. */
  const catalog = catalogPool();
  const source = (Array.isArray(catalog) && catalog.length ? catalog : TRACKS)
    .filter((track) => track && !track.live);
  const normalizedAll = normalizeList(source);

  const categories = (cachedCategories().length ? cachedCategories() : GENRES)
    .map((category, index) => {
      const keys = categoryKeys(category);
      const matches = source.filter((track) => matchesCategory(track, category, keys));
      const tracks = weightedShuffle(normalizeList(matches), {
        profile, seed: seed + index * 17, limit: 18,
      });
      return normalizeCategory({ ...category, tracks, count: matches.length }, index);
    })
    .filter((category) => category && category.tracks.length);

  const seen = new Set();
  const pool = [];
  for (const category of categories) {
    for (const track of category.tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      pool.push({ ...track, categoryId: category.id });
    }
  }
  const fallbackPool = pool.length
    ? pool
    : normalizedAll.map((track) => ({ ...track, categoryId: track.genre }));
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

  /* Dos intentos con límite de tiempo: un servidor dormido (Render Free) no
     debe congelar el Inicio ni hacerlo caer para siempre al respaldo local. */
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attempt === 0 ? 8000 : 12000);
    try {
      const res = await fetch(apiUrl(`/api/v1/home/feed?${params}`), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = normalizeFeed(await res.json());
      memory = memory || new Map();
      memory.set(key, { t: Date.now(), data });
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* cuota */ }
      return data;
    } catch {
      /* reintento */
    } finally {
      clearTimeout(timer);
    }
  }

  /* Si el API no responde, se prefiere el catálogo disponible (caché completa
     o semilla) con rotación real: la caché del feed se queda congelada y el
     Inicio parecía no cambiar nunca. La caché solo se usa cuando el catálogo
     local es pobre (primera instalación sin red). */
  const local = localFeed({ lang, seed: useSeed, mood });
  const poolSize = catalogPool().length;
  if (poolSize >= 100 && local.categories.length) return local;

  // Caché persistida reciente (sigue sirviendo sin red durante la sesión).
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw?.data && Date.now() - (raw.t || 0) < 1000 * 60 * 30) {
      const cached = normalizeFeed(raw.data);
      if (cached.categories.length) return { ...cached, source: 'cache' };
    }
  } catch { /* sin caché */ }

  return local;
}

/** Pistas de un chip de estado de ánimo desde todo el catálogo. */
export async function fetchMoodTracks(mood, { limit = 600 } = {}) {
  if (!mood) return [];
  try {
    const res = await fetch(apiUrl(`/api/v1/tracks?mood=${encodeURIComponent(mood)}&sort=random&limit=${limit}`), {
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
    fetch(apiUrl('/api/v1/history'), {
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
  const retryRef = useRef(0);
  const retryTimerRef = useRef(0);

  const load = async ({ force = true, freshSeed = true, retry = false } = {}) => {
    const token = ++requestRef.current;
    if (!retry) setLoading(true);
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
      const degraded = data.source === 'local' || data.source === 'cache';
      setError(data.source === 'local' ? 'offline' : null);
      /* Si el API no respondió, se reintenta en segundo plano: cuando vuelve
         la conexión la portada se reemplaza sola por la del servidor. */
      if (degraded && retryRef.current < 3) {
        const wait = 5000 * (retryRef.current + 1);
        retryRef.current += 1;
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          if (token === requestRef.current) load({ force: true, freshSeed: true, retry: true });
        }, wait);
      } else if (!degraded) {
        retryRef.current = 0;
      }
    } catch (err) {
      if (token === requestRef.current) setError(String(err?.message || err));
    } finally {
      if (token === requestRef.current && !retry) setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return undefined;
    let dead = false;
    retryRef.current = 0;
    load({ force: true, freshSeed: true });
    let es = null;
    try {
      if (typeof EventSource !== 'undefined') {
        es = new EventSource(eventUrl('/api/v1/events'));
        const refresh = () => { if (!dead) load({ force: true, freshSeed: false }); };
        es.addEventListener('categories', refresh);
        es.addEventListener('version', refresh);
      }
    } catch { /* sin SSE: la app sigue con la caché */ }
    return () => {
      dead = true;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
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
