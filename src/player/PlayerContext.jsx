import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { radioFrom, relatedTracks, shuffle as shuffleArr } from '../data/catalog.js';
import VideoStage from './VideoStage.jsx';

const PlayerCtx = createContext(null);

/* Carga dinámica del IFrame API de YouTube (una sola vez). */
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__ritmoYT) return window.__ritmoYT;
  window.__ritmoYT = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
    setTimeout(() => resolve(window.YT || null), 12000);
  });
  return window.__ritmoYT;
}

export function PlayerProvider({ children }) {
  const { state, dispatch } = useApp();
  const { pro, settings } = state;

  const ytRef = useRef(null);
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [track, setTrack] = useState(null);
  const [contextList, setContextList] = useState([]);   // lista completa que se está reproduciendo
  const [queue, setQueue] = useState([]);               // "a continuación" (insertable)
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // off | all | one
  const [volume, setVolumeState] = useState(80);
  const [fullOpen, setFullOpen] = useState(false);
  const [panel, setPanel] = useState('player'); // player | queue | lyrics | video
  const [error, setError] = useState(null);
  const [sleepEndsAt, setSleepEndsAt] = useState(null);
  const [videoMode, setVideoMode] = useState(false); // YT Music: mostrar vídeo

  const seekingRef = useRef(false);
  const visitedRef = useRef(new Set()); // para aleatorio inteligente
  const handlersRef = useRef({});        // siempre el último advance/handleEnded
  const liveRef = useRef({ contextList: [], queue: [], index: -1 });
  liveRef.current = { contextList, queue, index }; // reflejo síncrono del estado

  /* ---------- init del player ---------- */
  useEffect(() => {
    let dead = false;
    loadYT().then((YT) => {
      if (dead || !YT || !hostRef.current) return;
      ytRef.current = new YT.Player(hostRef.current, {
        width: '1', height: '1',
        playerVars: {
          playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1,
          rel: 0, fs: 0, iv_load_policy: 3, origin: window.location.origin,
        },
        events: {
          onReady: (e) => { setReady(true); try { e.target.setVolume(volume); } catch { /* noop */ } },
          onStateChange: (e) => {
            setPlaying(e.data === 1 || e.data === 3);
            if (e.data === 1) setError(null);
            if (e.data === 0) handlersRef.current.handleEnded?.();
          },
          onError: () => {
            // Vídeo retirado/no disponible: avisar y saltar al siguiente
            setError('unavailable');
            setTimeout(() => handlersRef.current.advance?.(1, { force: true }), 700);
          },
        },
      });
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- posición ---------- */
  useEffect(() => {
    const iv = setInterval(() => {
      const p = ytRef.current;
      if (!p?.getCurrentTime || seekingRef.current) return;
      try {
        setPosition(p.getCurrentTime() || 0);
        setDuration(p.getDuration() || 0);
      } catch { /* aún no listo */ }
    }, 500);
    return () => clearInterval(iv);
  }, [ready]);

  /* ---------- temporizador de apagado (PRO) ---------- */
  useEffect(() => {
    if (!sleepEndsAt) return;
    const iv = setInterval(() => {
      if (Date.now() >= sleepEndsAt) {
        ytRef.current?.pauseVideo?.();
        setSleepEndsAt(null);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [sleepEndsAt]);

  /* ---------- normalización (PRO) ---------- */
  useEffect(() => {
    const p = ytRef.current;
    if (!p?.setVolume || !ready) return;
    const v = pro.active && (settings.volumeNorm || settings.normalizeEQ !== 'flat')
      ? Math.min(100, volume + 8)
      : volume;
    try { p.setVolume(v); } catch { /* noop */ }
  }, [volume, settings.volumeNorm, settings.normalizeEQ, pro.active, ready]);

  /* ---------- Motor de reproducción ---------- */
  const playNow = useCallback((tk, list, idx, extraQueue = []) => {
    const p = ytRef.current;
    if (!p?.loadVideoById) return;
    setTrack(tk);
    setContextList(list);
    setIndex(idx);
    setQueue(extraQueue);
    setPosition(0);
    setPlaying(true);
    visitedRef.current.add(tk.id);
    try { p.loadVideoById({ videoId: tk.yt, startSeconds: 0 }); } catch { /* noop */ }
    dispatch({ type: 'add-history', id: tk.id });
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: tk.title, artist: tk.artist, album: tk.album || 'Ritmo Music',
          artwork: [{ src: tk.thumb, sizes: '480x360', type: 'image/jpeg' }],
        });
      } catch { /* noop */ }
    }
  }, [dispatch]);

  const advance = useCallback((dir, opts = {}) => {
    // La cola "a continuación" tiene prioridad (también al terminar la canción)
    if (dir > 0 && queue.length > 0) {
      const [next, ...rest] = queue;
      const list = [...contextList.slice(0, index + 1), next, ...contextList.slice(index + 1)];
      playNow(next, list, index + 1, rest);
      return;
    }
    const list = contextList;
    if (!list.length) return;

    let next;
    if (repeat === 'one' && !opts.force && dir > 0) next = index;
    else if (shuffle && dir > 0) {
      const visited = visitedRef.current;
      // Aleatorio inteligente (PRO): prioriza no reproducidas
      const candidates = list.map((t, i) => i).filter((i) => i !== index);
      const unplayed = candidates.filter((i) => !visited.has(list[i].id));
      const pool = settings.smartShuffle && pro.active && unplayed.length ? unplayed : candidates;
      next = pool[Math.floor(Math.random() * pool.length)] ?? index + 1;
    } else next = index + dir;

    if (next >= list.length) {
      if (repeat === 'all') next = 0;
      else if (settings.autoplay && dir > 0) {
        // Música relacionada infinita (estilo Spotify autoplay)
        const seed = list[list.length - 1];
        const related = relatedTracks(seed, 8).filter((t) => !list.some((x) => x.id === t.id));
        if (related.length) {
          setContextList((prev) => [...prev, ...related]);
          setIndex(list.length);
          playNow(related[0], [...list, ...related], list.length, []);
          return;
        }
        setPlaying(false); ytRef.current?.pauseVideo?.(); return;
      } else { setPlaying(false); ytRef.current?.pauseVideo?.(); return; }
    }
    if (next < 0) next = 0;
    playNow(list[next], list, next, dir > 0 ? queue : queue);
  }, [contextList, index, repeat, shuffle, playNow, settings.autoplay, settings.smartShuffle, pro.active, queue]);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      try { ytRef.current?.seekTo?.(0, true); ytRef.current?.playVideo?.(); } catch { /* noop */ }
      return;
    }
    advance(1, { force: true });
  }, [advance, repeat]);

  /* Mantén siempre a mano la última versión de advance/handleEnded para los
     eventos del iframe de YouTube (se registran una sola vez). */
  handlersRef.current = { advance, handleEnded };

  /* ---------- API pública ---------- */
  const api = useMemo(() => ({
    playList(list, startId) {
      if (!list?.length) return;
      let idx = startId ? list.findIndex((t) => t.id === startId) : 0;
      if (idx < 0) idx = 0;
      visitedRef.current = new Set();
      playNow(list[idx], list, idx, []);
    },
    playRadio(seed) {
      visitedRef.current = new Set([seed.id]);
      playNow(seed, radioFrom(seed), 0, []);
    },
    toggle() {
      const p = ytRef.current;
      if (!p || !track) return;
      try { playing ? p.pauseVideo() : p.playVideo(); } catch { /* noop */ }
    },
    next: () => advance(1, { force: true }),
    prev() {
      if (position > 4) { try { ytRef.current?.seekTo?.(0, true); } catch { /* noop */ } return; }
      advance(-1, { force: true });
    },
    seek(frac) {
      if (!duration) return;
      const to = Math.max(0, Math.min(duration, duration * frac));
      try { ytRef.current?.seekTo?.(to, true); setPosition(to); } catch { /* noop */ }
    },
    nudge(sec) {
      try {
        const to = Math.max(0, Math.min(duration, position + sec));
        ytRef.current?.seekTo?.(to, true); setPosition(to);
      } catch { /* noop */ }
    },
    setVolume(v) { setVolumeState(v); },
    toggleShuffle() { setShuffle((s) => !s); },
    cycleRepeat() { setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')); },

    /* ── Cola estilo Spotify: "Reproducir a continuación" ── */
    playNext(t) { setQueue((q) => [t, ...q]); },
    enqueue(t) { setQueue((q) => [...q, t]); },
    removeFromQueue(pos) { setQueue((q) => q.filter((_, i) => i !== pos)); },
    clearQueue() { setQueue([]); },
    /* Reproduce un elemento de la cola por posición: descarta lo anterior */
    playQueueAt(pos) {
      const { contextList: list, queue: q, index: idx } = liveRef.current;
      const item = q[pos];
      if (!item) return;
      const rest = q.slice(pos + 1);
      const merged = [...list.slice(0, idx + 1), item, ...list.slice(idx + 1)];
      setQueue(rest);
      playNow(item, merged, idx + 1, rest);
    },
    /* Reproduce un elemento "a continuación" del contexto por posición */
    playContextAt(pos) {
      const { contextList: list, index: idx } = liveRef.current;
      const target = idx + 1 + pos;
      if (!list[target]) return;
      playNow(list[target], list, target, liveRef.current.queue);
    },
    /* Llena la cola con música relacionada (estilo autoplay) */
    playRelated() {
      if (!track) return;
      const rel = relatedTracks(track, 10);
      if (!rel.length) return;
      playNow(rel[0], rel, 0, []);
    },
    /* Quitar la canción actual de la lista y saltar */
    removeCurrent() { advance(1, { force: true }); },

    openFull(v) { setFullOpen(v); if (!v) { setPanel('player'); setVideoMode(false); } },
    setPanel(next) {
      setPanel(next);
      // Cualquier pestaña distinta del vídeo descarta el modo vídeo
      if (next !== 'video') setVideoMode(false);
    },
    toggleVideo() { setVideoMode((v) => !v); },
    setSleep(minutes) { setSleepEndsAt(minutes ? Date.now() + minutes * 60000 : null); },
    dismissError() { setError(null); },
  }), [track, playing, position, duration, advance, playNow]);

  /* Acciones de MediaSession */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* noop */ } };
    set('play', () => ytRef.current?.playVideo?.());
    set('pause', () => ytRef.current?.pauseVideo?.());
    set('nexttrack', () => advance(1, { force: true }));
    set('previoustrack', () => advance(-1, { force: true }));
    set('seekbackward', () => api.nudge(-10));
    set('seekforward', () => api.nudge(10));
  }, [advance, api]);

  const value = useMemo(() => ({
    ...api, track, queue, contextList, index, playing, position, duration,
    shuffle, repeat, volume, fullOpen, panel, ready, error, sleepEndsAt, videoMode,
    related: track ? relatedTracks(track, 6) : [],
    // Lo que sonará después, cuando la cola se vacíe (resto de la lista en curso)
    upcoming: (index >= 0 && contextList.length > index + 1) ? contextList.slice(index + 1) : [],
  }), [api, track, queue, contextList, index, playing, position, duration, shuffle, repeat, volume, fullOpen, panel, ready, error, sleepEndsAt, videoMode]);

  return (
    <PlayerCtx.Provider value={value}>
      {children}
      {/* El iframe se crea dentro de .yt-host (YouTube reemplaza el div interno),
          por eso los controles de vídeo se renderizan FUERA de ese contenedor.
          VideoStage dibuja la carcasa nativa alrededor del iframe. */}
      <VideoStage />
      <div className={`yt-host ${videoMode ? 'video-on' : ''}`} aria-hidden={!videoMode}>
        <div ref={hostRef} />
      </div>
    </PlayerCtx.Provider>
  );
}

export const usePlayer = () => useContext(PlayerCtx);

export const fmt = (s) => {
  if (!s || s < 0 || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
