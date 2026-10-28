import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { recordPlay } from '../ai/personalize.js';
import { radioFrom, relatedTracks, shuffle as shuffleArr } from '../data/catalog.js';
import { djLine as makeDjLine, djGreeting } from './dj.js';
import VideoStage from './VideoStage.jsx';
import { DJDrop } from '../components/DJ.jsx';
import { useAds } from '../ads/AdManager.jsx';

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
  const ads = useAds ? useAds() : null;

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
  const [volume, setVolumeState] = useState(() => {
    try { const v = localStorage.getItem('ritmo_vol'); if (v != null) return Math.max(0, Math.min(100, Number(v))); } catch {}
    return 80;
  });
  const [fullOpen, setFullOpen] = useState(false);
  const [panel, setPanel] = useState('player'); // player | queue | lyrics | video
  const [error, setError] = useState(null);
  const [sleepEndsAt, setSleepEndsAt] = useState(null);
  const [videoMode, setVideoMode] = useState(false); // YT Music: mostrar vídeo

  /* ── DJ Ritmo ── */
  const [djText, setDjText] = useState(null);     // frase actual (o null)
  const [djTag, setDjTag] = useState('');
  const [djSpeaking, setDjSpeaking] = useState(false);
  const [djVoiceURI, setDjVoiceURI] = useState(''); // voz elegida por el usuario
  const prevTrackRef = useRef(null);
  const seenGenresRef = useRef(new Set());

  const seekingRef = useRef(false);
  const visitedRef = useRef(new Set()); // para aleatorio inteligente
  const handlersRef = useRef({});        // siempre el último advance/handleEnded
  const liveRef = useRef({ contextList: [], queue: [], index: -1 });
  liveRef.current = { contextList, queue, index }; // reflejo síncrono del estado
  const audioRef = useRef(null);
  const sameSongLockRef = useRef(false);
  const triedResolveRef = useRef(new Set());
  const [audioMode, setAudioMode] = useState(false);
  const audioSyncRef = useRef(null);

  const playSameSongGuaranteed = useCallback(async (failedTrack) => {
    if (!failedTrack || sameSongLockRef.current) return false;
    if (triedResolveRef.current.has(failedTrack.id)) return false;
    sameSongLockRef.current = true;
    triedResolveRef.current.add(failedTrack.id);
    try {
      setError('Buscando esta canción en otra fuente...');
      const url = `/api/resolve?title=${encodeURIComponent(failedTrack.title || '')}&artist=${encodeURIComponent(failedTrack.artist || '')}`;
      const res = await fetch(url, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false }));
      if (res?.ok) {
        if (res.type === 'audio' && res.audioUrl) {
          try { ytRef.current?.pauseVideo?.(); ytRef.current?.stopVideo?.(); } catch {}
          if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.preload = 'auto';
            audioRef.current.playsInline = true;
          }
          audioRef.current.src = res.audioUrl;
          audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
          setAudioMode(true);
          setTrack({ ...failedTrack, _guaranteed: true, source: res.source });
          setPlaying(true);
          setReady(true);
          setPosition(0);
          setError(null);
          try { await audioRef.current.play(); } catch {}
          if (audioSyncRef.current) clearInterval(audioSyncRef.current);
          audioSyncRef.current = setInterval(() => {
            if (!audioRef.current) return;
            try {
              setPosition(audioRef.current.currentTime || 0);
              if (audioRef.current.duration && isFinite(audioRef.current.duration)) setDuration(audioRef.current.duration);
              if (audioRef.current.ended) {
                clearInterval(audioSyncRef.current);
                audioSyncRef.current = null;
                handlersRef.current.handleEnded?.();
              }
            } catch {}
          }, 400);
          sameSongLockRef.current = false;
          return true;
        }
        if (res.type === 'video' && res.videoId && res.videoId !== failedTrack.id) {
          try {
            setAudioMode(false);
            setError(null);
            const p = ytRef.current;
            if (p?.loadVideoById) {
              p.loadVideoById({ videoId: res.videoId, startSeconds: 0 });
              p.playVideo?.();
            }
            setTrack({ ...failedTrack, id: res.videoId, yt: res.videoId, _guaranteed: true });
            setPlaying(true);
            setReady(true);
            setPosition(0);
            sameSongLockRef.current = false;
            return true;
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[guaranteed] err', e);
    }
    sameSongLockRef.current = false;
    return false;
  }, [volume]);

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
            if (e.data === 0) {
              if (audioMode) return;
              try { handlersRef.current.handleEnded?.(); } catch {}
            }
          },
          onError: async () => {
            if (sameSongLockRef.current || audioMode) return;
            const cur = track;
            if (cur) {
              const ok = await playSameSongGuaranteed(cur);
              if (ok) {
                setError(null);
                return;
              }
            }
            // Solo en último recurso extremo, intentar una vez más
            setError('Reintentando...');
            setTimeout(async () => {
              if (sameSongLockRef.current) return;
              const ok2 = await playSameSongGuaranteed(track).catch(() => false);
              if (!ok2) {
                setError('No disponible. Saltando...');
                sameSongLockRef.current = false;
                setTimeout(() => handlersRef.current.advance?.(1, { force: true }), 600);
              } else {
                setError(null);
              }
            }, 500);
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
    try { localStorage.setItem('ritmo_vol', String(volume)); } catch {}
  }, [volume, settings.volumeNorm, settings.normalizeEQ, pro.active, ready]);

  /* ---------- DJ Ritmo: locución y frases ---------- */
  const speak = useCallback((text) => {
    if (!settings.dj || !settings.djVoice) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = settings.lang === 'en' ? 'en-US' : 'es-CO';
      u.rate = settings.djRate || 0.95; // más natural, menos apresurado
      u.pitch = 0.9; // más cálido y humano
      u.volume = 1;
      u.onstart = () => setDjSpeaking(true);
      u.onend = () => setDjSpeaking(false);
      u.onerror = () => setDjSpeaking(false);
      const voices = window.speechSynthesis.getVoices?.() || [];
      let match = null;
      if (djVoiceURI) match = voices.find((v) => v.voiceURI === djVoiceURI);
      if (!match) {
        const esVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('es'));
        match = esVoices.find((v) => /colombia|es-co|latam/i.test((v.lang + ' ' + v.name).toLowerCase())) ||
                esVoices.find((v) => /male|hombre|juan|carlos|andres|diego/i.test(v.name.toLowerCase())) ||
                esVoices.find((v) => !/google|microsoft|compact|robot/i.test(v.name.toLowerCase())) ||
                esVoices[0];
      }
      if (match) u.voice = match;
      window.speechSynthesis.speak(u);
    } catch { /* voz no disponible */ }
  }, [settings.dj, settings.djVoice, settings.djRate, settings.lang, djVoiceURI]);

  /* Emite una frase del DJ (y la locuta si la voz está activada). */
  const emitDj = useCallback((opts = {}) => {
    const tk = opts.track || track;
    if (!settings.dj || !tk) return;
    const line = makeDjLine({
      track: tk,
      prevTrack: opts.prevTrack ?? prevTrackRef.current,
      seenGenres: seenGenresRef.current,
      lang: settings.lang,
      kind: opts.kind || 'intro',
    });
    if (!line.text) return;
    if (tk.genre) seenGenresRef.current.add(tk.genre);
    setDjText(line.text);
    setDjTag(line.tag);
    speak(line.text);
  }, [settings.dj, settings.lang, track, speak]);

  const stopDjSpeech = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    setDjSpeaking(false);
  }, []);

  /* ---------- Motor de reproducción ---------- */
  const playNow = useCallback((tk, list, idx, extraQueue = []) => {
    const p = ytRef.current;
    if (!p?.loadVideoById) return;
    const prev = prevTrackRef.current;
    setTrack(tk);
    setContextList(list);
    setIndex(idx);
    setQueue(extraQueue);
    setPosition(0);
    setPlaying(true);
    setAudioMode(false);
    sameSongLockRef.current = false;
    triedResolveRef.current.clear();
    try {
      if (audioSyncRef.current) { clearInterval(audioSyncRef.current); audioSyncRef.current = null; }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current.load?.(); }
    } catch {}
    visitedRef.current.add(tk.id);
    try { ads?.incrementPlay?.(); } catch {}
    try { p.loadVideoById({ videoId: tk.yt, startSeconds: 0 }); } catch { /* noop */ }
    dispatch({ type: 'add-history', id: tk.id });
    try { recordPlay(tk); } catch { /* noop */ }
    /* DJ Ritmo: comenta la nueva canción (usa el tema anterior para la transición) */
    if (tk.id !== prev?.id) emitDj({ track: tk, prevTrack: prev });
    prevTrackRef.current = tk;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: tk.title, artist: tk.artist, album: tk.album || 'Ritmo Music',
          artwork: [{ src: tk.thumb, sizes: '480x360', type: 'image/jpeg' }],
        });
      } catch { /* noop */ }
    }
  }, [dispatch, emitDj, ads]);

  const advance = useCallback((dir, opts = {}) => {
    // La cola "a continuación" tiene prioridad (también al terminar la canción)
    if (dir > 0 && queue.length > 0) {
      const [nextTr, ...rest] = queue;
      const list = [...contextList.slice(0, index + 1), nextTr, ...contextList.slice(index + 1)];
      playNow(nextTr, list, index + 1, rest);
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
    // Intentar avanzar con garantía de siguiente pista
    try { advance(1, { force: true }); } catch {}
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
      if (audioMode && audioRef.current) {
        try {
          if (audioRef.current.paused) { audioRef.current.play(); setPlaying(true); }
          else { audioRef.current.pause(); setPlaying(false); }
          return;
        } catch {}
      }
      const p = ytRef.current;
      if (!p || !track) return;
      try { playing ? p.pauseVideo() : p.playVideo(); } catch { /* noop */ }
    },
    next: () => { try { advance(1, { force: true }); } catch {} },
    prev() {
      if (position > 4) { try { ytRef.current?.seekTo?.(0, true); } catch { /* noop */ } return; }
      try { advance(-1, { force: true }); } catch {}
    },
    seek(frac) {
      if (audioMode && audioRef.current && audioRef.current.duration) {
        const to = audioRef.current.duration * frac;
        try { audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration, to)); setPosition(audioRef.current.currentTime); } catch {}
        return;
      }
      if (!duration) return;
      const to = Math.max(0, Math.min(duration, duration * frac));
      try { ytRef.current?.seekTo?.(to, true); setPosition(to); } catch { /* noop */ }
    },
    nudge(sec) {
      if (audioMode && audioRef.current) {
        try {
          const to = Math.max(0, (audioRef.current.currentTime || 0) + sec);
          audioRef.current.currentTime = to;
          setPosition(audioRef.current.currentTime);
        } catch {}
        return;
      }
      try {
        const to = Math.max(0, Math.min(duration, position + sec));
        ytRef.current?.seekTo?.(to, true); setPosition(to);
      } catch { /* noop */ }
    },
    setVolume(v) {
      const nv = Math.max(0, Math.min(100, Number(v) || 0));
      setVolumeState(nv);
      try { if (audioRef.current) audioRef.current.volume = nv / 100; } catch {}
      try { const p = ytRef.current; if (p?.setVolume) p.setVolume(nv); } catch {}
      try { localStorage.setItem('ritmo_vol', String(nv)); } catch {}
    },
    toggleShuffle() { setShuffle((s) => !s); },
    cycleRepeat() { setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')); },

    /* ── Cola estilo Spotify: "Reproducir a continuación" ── */
    playNext(t) { setQueue((q) => [t, ...q]); },
    enqueue(t) { setQueue((q) => [...q, t]); },
    removeFromQueue(pos) { setQueue((q) => q.filter((_, i) => i !== pos)); },
    clearQueue() { setQueue([]); },
    reorderQueue(from, to) {
      setQueue((q) => {
        if (from < 0 || from >= q.length || to < 0 || to >= q.length) return q;
        const arr = [...q];
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
        return arr;
      });
    },
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

    /* ── DJ Ritmo ── */
    djRepeat() { if (djText) speak(djText); },
    djDismiss() { setDjText(null); stopDjSpeech(); },
    djGreet() {
      const g = djGreeting(settings.lang);
      setDjText(g);
      setDjTag('djTagHello');
      speak(g);
    },
    djSetVoice(uri) { setDjVoiceURI(uri); },
    djVoices() {
      if (typeof window === 'undefined' || !window.speechSynthesis) return [];
      return window.speechSynthesis.getVoices?.() || [];
    },
  }), [track, playing, position, duration, advance, playNow, djText, speak, stopDjSpeech, settings.lang, djVoiceURI]);

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

  /* ---------- DJ: reacciona al activar/desactivar ---------- */
  useEffect(() => {
    if (!settings.dj) { setDjText(null); stopDjSpeech(); }
  }, [settings.dj, stopDjSpeech]);

  /* La tarjeta del DJ se retira sola unos segundos después de aparecer */
  useEffect(() => {
    if (!djText) return;
    const id = setTimeout(() => setDjText(null), 11000);
    return () => clearTimeout(id);
  }, [djText]);

  /* Voz: precargamos la lista (algunos navegadores la cargan async) */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => window.speechSynthesis.getVoices?.();
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);

  const value = useMemo(() => ({
    ...api, track, queue, contextList, index, playing, position, duration,
    shuffle, repeat, volume, fullOpen, panel, ready, error, sleepEndsAt, videoMode,
    djText, djTag, djSpeaking, djOn: settings.dj, djVoiceURI,
    related: track ? relatedTracks(track, 6) : [],
    // Lo que sonará después, cuando la cola se vacíe (resto de la lista en curso)
    upcoming: (index >= 0 && contextList.length > index + 1) ? contextList.slice(index + 1) : [],
    audioMode,
  }), [api, track, queue, contextList, index, playing, position, duration, shuffle, repeat, volume, fullOpen, panel, ready, error, sleepEndsAt, videoMode, djText, djTag, djSpeaking, settings.dj, djVoiceURI, audioMode]);

  return (
    <PlayerCtx.Provider value={value}>
      {children}
      {/* El iframe se crea dentro de .yt-host (YouTube reemplaza el div interno).
          VideoStage monta la carcasa nativa y coloca el iframe DENTRO de ella,
          para que la pantalla completa incluya el vídeo sin mover el nodo
          (mover un iframe de vídeo reinicia la reproducción). */}
      <VideoStage hostRef={hostRef} videoMode={videoMode} />
      {settings.dj && (
        <DJDrop
          text={djText}
          tag={djTag}
          onClose={api.djDismiss}
          onRepeat={api.djRepeat}
        />
      )}
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
