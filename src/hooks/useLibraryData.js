/* ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
   useLibraryData ÔÇö une el cat├ílogo curado con el cat├ílogo EN VIVO que
   refresca el servidor autom├íticamente (cientos de pistas reales).

   Devuelve listas ya derivadas y listas para pintar:
       tracks        todas las pistas (curado + vivo, sin duplicar)
       genres        g├®neros detectados con su conteo y portada
       artists       artistas agrupados con su n├║mero de canciones
       moods         estados de ├ínimo detectados
       decades       d├®cadas presentes (70s, 80s, ÔÇª)
       ready         true cuando ya hay cat├ílogo en vivo (o fallback local)

   Nada se rompe si el servidor no est├í: se usa el cat├ílogo curado local.
   ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ */

import { useEffect, useMemo, useState } from 'react';
import { TRACKS, GENRES as LOCAL_GENRES } from '../data/catalog.js';
import { getCatalog } from '../api/liveData.js';

const hashNum = (s, mod) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
};

/* Portada e icono estables para un g├®nero, tomando la primera pista que lo use. */
function genreMeta(id) {
  const local = LOCAL_GENRES.find((g) => g.id === id);
  return local || { id, color: '#8e8e93', icon: 'wave', tag: '' };
}

export function useLibraryData() {
  const [live, setLive] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    getCatalog()
      .then((c) => { if (alive && c?.tracks?.length) setLive(c.tracks); })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const tracks = useMemo(() => {
    const seen = new Set(TRACKS.map((t) => t.id));
    return [...TRACKS, ...live.filter((tr) => tr.id && !seen.has(tr.id))];
  }, [live]);

  const genres = useMemo(() => {
    const map = new Map();
    for (const t of tracks) {
      const id = t.genre || 'Otros';
      if (!map.has(id)) map.set(id, { ...genreMeta(id), id, count: 0, cover: t.thumb });
      map.get(id).count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [tracks]);

  const artists = useMemo(() => {
    const map = new Map();
    for (const t of tracks) {
      const name = (t.artist || '').replace(/ ft\..*$/i, '').replace(/ & .*$/i, '').trim();
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, {
          id: encodeURIComponent(name), name, genre: t.genre, thumb: t.thumb,
          listeners: 400_000 + hashNum(name, 18_000_000), tracks: [],
        });
      }
      map.get(name).tracks.push(t);
    }
    return [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length || b.listeners - a.listeners);
  }, [tracks]);

  const moods = useMemo(() => {
    const map = new Map();
    for (const t of tracks) for (const m of t.moods || []) map.set(m, (map.get(m) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ id: m, count: n }));
  }, [tracks]);

  const decades = useMemo(() => {
    const map = new Map();
    for (const t of tracks) {
      const y = Number(t.year);
      if (!y || y < 1950) continue;
      const d = `${Math.floor(y / 10) * 10}s`;
      map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, n]) => ({ id: d, count: n }));
  }, [tracks]);

  return { tracks, genres, artists, moods, decades, ready };
}

export default useLibraryData;
