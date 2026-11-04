/* ══════════════════════════════════════════════════════════════════════════
   Categorías dinámicas (Sonora).

   La web y la APK consumen `GET /api/v1/categories` y
   `GET /api/v1/tracks?category_id=…`. El catálogo local solo se usa como
   respaldo si el servidor no está disponible; cuando el administrador cambia
   una categoría, el evento SSE `categories` refresca todas las apps abiertas
   sin recargar.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { GENRES as STATIC_GENRES, tracksByGenre } from '../data/catalog.js';

const CACHE_KEY = 'sonora-categories-v2';
const TTL = 1000 * 60 * 5;

let memory = null;

function safeRead() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw && Array.isArray(raw.categories) && Date.now() - (raw.t || 0) < TTL) return raw;
  } catch { /* sin caché */ }
  return null;
}

function safeWrite(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, t: Date.now() })); } catch { /* cuota */ }
}

function normalize(raw, index = 0) {
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
  };
}

/** Respaldo local: mantiene la app usable si el servidor no responde. */
export function fallbackCategories() {
  return STATIC_GENRES.map((g, i) => normalize({
    ...g,
    genres: [g.id],
    sort: (i + 1) * 10,
    count: tracksByGenre(g.id).length,
  }, i)).filter(Boolean);
}

export function cachedCategories() {
  const hit = memory || safeRead();
  const categories = (hit?.categories || []).map(normalize).filter(Boolean);
  return categories.length ? categories : fallbackCategories();
}

/** Descarga las categorías activas. Si falla, conserva la caché o el respaldo. */
export async function fetchCategories({ force = false } = {}) {
  if (!force && memory && Date.now() - memory.t < TTL) return memory.categories;
  const hit = safeRead();
  if (!force && hit) {
    memory = hit;
    return hit.categories;
  }
  try {
    const res = await fetch('/api/v1/categories', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const categories = (data.categories || []).map(normalize).filter(Boolean);
    if (!categories.length) throw new Error('sin categorías');
    const out = { t: Date.now(), updatedAt: data.updatedAt || Date.now(), categories };
    memory = out;
    safeWrite(out);
    return categories;
  } catch {
    return cachedCategories();
  }
}

/** Pistas de una categoría. Devuelve `null` si la API no está disponible. */
export async function fetchCategoryTracks(categoryId, { limit = 150 } = {}) {
  if (!categoryId) return null;
  try {
    const res = await fetch(`/api/v1/tracks?category_id=${encodeURIComponent(categoryId)}&limit=${limit}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data.tracks) ? data.tracks : null;
  } catch {
    return null;
  }
}

export function categoryTag(category, lang) {
  if (!category) return '';
  if (lang === 'en' && category.tagEn) return category.tagEn;
  return category.tag || '';
}

/** Hook de categorías con refresco en tiempo real por SSE. */
export function useCategories() {
  const [categories, setCategories] = useState(() => cachedCategories());
  const [updatedAt, setUpdatedAt] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async (force = false) => {
    setLoading(true);
    try {
      const list = await fetchCategories({ force });
      if (list?.length) setCategories(list);
      const hit = memory || safeRead();
      if (hit?.updatedAt) setUpdatedAt(hit.updatedAt);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let dead = false;
    load(true);
    let es = null;
    try {
      if (typeof EventSource !== 'undefined') {
        es = new EventSource('/api/v1/events');
        es.addEventListener('categories', () => { if (!dead) load(true); });
      }
    } catch { /* sin SSE: la app sigue con la caché */ }
    return () => {
      dead = true;
      try { es?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { categories, updatedAt, loading, refresh: () => load(true) };
}
