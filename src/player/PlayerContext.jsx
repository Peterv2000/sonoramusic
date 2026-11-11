import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { recordPlay } from '../ai/personalize.js';
import { mergeTracks, globalPool } from './queue.js';
import { fetchSmartRelatedQueue } from '../api/related.js';
import { pickSmartNext, smartRelated } from './smartQueue.js';
import { djLine as makeDjLine, djGreeting } from './dj.js';
import VideoStage from './VideoStage.jsx';
import { DJDrop } from '../components/DJ.jsx';
import { useAds } from '../ads/AdManager.jsx';
import { reportIssue } from '../api/telemetry.js';
import { recordListen } from '../api/home.js';
import { recordCatalogListen } from '../api/catalogStore.js';
import { apiUrl } from '../api/apiBase.js';

const PlayerCtx = createContext(null);
/* El progreso (posición/duración) vive en su propio contexto: cambia cada
   500 ms y si compartiera el contexto principal volvería a renderizar toda la
   app (portada, filas, búsqueda, biblioteca...) dos veces por segundo. */
const PlayerProgressCtx = createContext({ position: 0, duration: 0 });

const MANUAL_FADE_MS = 300;   // salto manual: fundido corto para evitar clics
const MIN_AUDIO_SECONDS = 60; // por debajo de esto no es una canción completa
/* Intentos de rescatar UNA canción antes de rendirse. Cada intento prueba
   varias alternativas; al agotarlas se salta (nunca se encadenan saltos). */
const MAX_RESOLVE_TRIES = 4;
const PROBE_MS = 4500;        // espera máxima a que arranque una alternativa
const STALL_MS = 12000;       // sin avanzar durante 12 s → reintentar el stream
const HARD_STALL_MS = 30000;  // 30 s atascado → buscar otra fuente

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

  /* Dos reproductores en paralelo: mientras uno suena, el otro precarga y
     entra con fundido. Los hosts son nodos estables (nunca se recrean). */
  const hostsRef = useRef([null, null]);
  const playersRef = useRef([null, null]);
  const readySlotsRef = useRef([false, false]);
  const playersReadyRef = useRef(0);
  const activeSlotRef = useRef(0);
  const [activeSlot, setActiveSlot] = useState(0);

  const [ready, setReady] = useState(false);
  const [track, setTrack] = useState(null);
  const [contextList, setContextList] = useState([]);   // lista completa que se está reproduciendo
  const [queue, setQueue] = useState([]);               // "a continuación" (insertable)
  const [autoQueue, setAutoQueue] = useState([]);       // recomendaciones dinámicas (cola automática)
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  /* Espejo síncrono del progreso: la API pública (seek/nudge/prev) lee los
     refs y así no depende de position/duration ni se recrea cada 500 ms. */
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const applyPosition = useCallback((value) => {
    const next = Number(value) || 0;
    positionRef.current = next;
    setPosition(next);
  }, []);
  const applyDuration = useCallback((value) => {
    const next = Number(value) || 0;
    durationRef.current = next;
    setDuration(next);
  }, []);
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
  const playedHistoryRef = useRef([]);   // historial reciente para diversidad de artistas
  const handlersRef = useRef({});        // siempre el último advance/handleEnded
  const autoQueueRef = useRef([]);       // copia síncrona de las recomendaciones
  const relatedTokenRef = useRef(0);     // descarta respuestas viejas
  const relatedTimerRef = useRef(0);     // debounce de recomendaciones al cambiar de pista
  const lastSelectionRef = useRef(0);    // instante de la última selección manual
  const pendingAdvanceRef = useRef(false); // esperando recomendaciones para seguir
  const playAutoRef = useRef(null);      // reproduce una recomendación (se asigna abajo)
  const liveRef = useRef({ contextList: [], queue: [], index: -1, autoQueue: [] });
  liveRef.current = { contextList, queue, index, autoQueue }; // reflejo síncrono del estado
  const trackRef = useRef(null);        // el callback onError del iframe se crea una vez
  trackRef.current = track;
  const audioRef = useRef(null);
  const loadStartedRef = useRef(null);   // QA Robot: latencia hasta el primer play
  const sameSongLockRef = useRef(false);
  const sameSongRef = useRef(null);
  const triedVideosRef = useRef(new Set());   // vídeos ya probados para la canción activa
  const resolveTriesRef = useRef(new Map());  // intentos de rescate por canción
  const earlyEndTriedRef = useRef(new Set());
  const [audioMode, setAudioMode] = useState(false);
  const audioModeRef = useRef(false);
  audioModeRef.current = audioMode;
  const audioSyncRef = useRef(null);
  const pendingPlayRef = useRef(null);  // pista pedida antes de que YouTube esté listo

  /* Volumen, PRO, crossfade y estado en refs: los callbacks de YouTube se
     crean una sola vez y siempre deben leer el valor actual. */
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const proRef = useRef(pro);
  proRef.current = pro;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const playingRef = useRef(false);
  playingRef.current = playing;

  const crossfadeSec = Math.max(0, Math.min(12, Number(settings.crossfade) || 0));
  const crossfadeRef = useRef(crossfadeSec);
  crossfadeRef.current = crossfadeSec;

  const rampsRef = useRef(new Map());
  const crossfadingRef = useRef(false);
  const approachLockRef = useRef(false);
  const lastTickRef = useRef({ t: -1 });
  const stallMsRef = useRef(0);
  const stallRetryRef = useRef(false);
  const stallResolveRef = useRef(false);

  const getPlayer = useCallback(() => playersRef.current[activeSlotRef.current], []);

  const targetVolume = useCallback(() => {
    const s = settingsRef.current;
    const p = proRef.current;
    const v = p.active && (s.volumeNorm || s.normalizeEQ !== 'flat')
      ? Math.min(100, volumeRef.current + 8)
      : volumeRef.current;
    return Math.max(0, Math.min(100, v));
  }, []);

  const cancelRamp = useCallback((slot) => {
    const id = rampsRef.current.get(slot);
    if (id) {
      try { cancelAnimationFrame(id); } catch { /* noop */ }
      rampsRef.current.delete(slot);
    }
  }, []);

  const cancelRamps = useCallback(() => {
    cancelRamp(0);
    cancelRamp(1);
  }, [cancelRamp]);

  /* Fundido de volumen con requestAnimationFrame (sin cortes ni clics). */
  const rampVolume = useCallback((slot, to, ms) => {
    const p = playersRef.current[slot];
    if (!p?.setVolume) return;
    cancelRamp(slot);
    let from = 0;
    try { from = Number(p.getVolume?.()); } catch { from = 0; }
    if (!Number.isFinite(from)) from = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / Math.max(1, ms));
      try { p.setVolume(Math.max(0, Math.min(100, from + (to - from) * t))); } catch { /* noop */ }
      if (t < 1) rampsRef.current.set(slot, requestAnimationFrame(step));
      else rampsRef.current.delete(slot);
    };
    rampsRef.current.set(slot, requestAnimationFrame(step));
  }, [cancelRamp]);

  const pauseAllPlayers = useCallback(() => {
    for (let i = 0; i < 2; i++) {
      try { playersRef.current[i]?.pauseVideo?.(); } catch { /* noop */ }
    }
  }, []);

  const stopAudioFallback = useCallback(() => {
    try {
      if (audioSyncRef.current) { clearInterval(audioSyncRef.current); audioSyncRef.current = null; }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load?.();
      }
    } catch { /* noop */ }
  }, []);

  /* Carga una pista en el reproductor activo sin fundido (arranque en frío). */
  const hardPlay = useCallback((tk) => {
    cancelRamps();
    crossfadingRef.current = false;
    let slot = activeSlotRef.current;
    if (!playersRef.current[slot]?.loadVideoById) {
      slot = 1 - slot;
      activeSlotRef.current = slot;
      setActiveSlot(slot);
    }
    const p = playersRef.current[slot];
    if (!p?.loadVideoById) {
      // El iframe aún no está listo: guardamos la pista y la arrancamos en
      // `onReady` para que el primer play nunca se pierda.
      pendingPlayRef.current = tk;
      return;
    }
    try { p?.setVolume?.(targetVolume()); } catch { /* noop */ }
    try {
      p?.loadVideoById({ videoId: tk.yt, startSeconds: 0 });
      p?.playVideo?.();
    } catch { /* noop */ }
  }, [cancelRamps, targetVolume]);

  /* Fundido cruzado real: el tema nuevo entra por el reproductor libre. */
  const crossfadeTo = useCallback((tk, ms) => {
    const from = activeSlotRef.current;
    const to = 1 - from;
    const nextPlayer = playersRef.current[to];
    if (!nextPlayer?.loadVideoById) return false;
    const target = targetVolume();
    try { nextPlayer.setVolume(0); } catch { /* noop */ }
    try {
      nextPlayer.loadVideoById({ videoId: tk.yt, startSeconds: 0 });
      nextPlayer.playVideo?.();
    } catch { return false; }
    crossfadingRef.current = true;
    activeSlotRef.current = to;
    setActiveSlot(to);
    rampVolume(from, 0, ms);
    rampVolume(to, target, ms);
    window.setTimeout(() => {
      try {
        if (activeSlotRef.current === to) playersRef.current[from]?.pauseVideo?.();
      } catch { /* noop */ }
    }, ms + 140);
    return true;
  }, [rampVolume, targetVolume]);

  /* Prueba VARIAS alternativas a la vez en reproductores ocultos y muteados.
     YouTube responde con error 150 (no insertable) a la mayoría de las
     re-subidas, así que probarlas de una en una dejaba 10-15 s de silencio.
     En paralelo, una canción recuperable vuelve a sonar en 3-5 s. Solo cuenta
     el estado 1 (reproduciendo) y con el tiempo avanzando: el estado 3
     (buffering) también aparece con vídeos bloqueados y daba falsos positivos.
     Devuelve el candidato que mejor puntúa entre los que arrancan. */
  const probeCandidates = useCallback(async (candidates) => {
    const YT = typeof window !== 'undefined' ? window.YT : null;
    if (!YT?.Player || !candidates.length) return null;

    const CHUNK = 5;
    for (let start = 0; start < candidates.length; start += CHUNK) {
      const batch = candidates.slice(start, start + CHUNK);
      const winners = await new Promise((resolve) => {
        const found = [];
        let left = batch.length;
        const done = () => { if (--left === 0) resolve(found); };
        for (const candidate of batch) {
          const videoId = candidate.videoId;
          const host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
          document.body.appendChild(host);
          let player = null;
          let settled = false;
          let confirmTimer = 0;
          let timer = 0;
          const settle = (ok) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            window.clearTimeout(confirmTimer);
            try { player?.destroy?.(); } catch { /* noop */ }
            try { host.remove(); } catch { /* noop */ }
            if (ok) found.push(candidate);
            done();
          };
          timer = window.setTimeout(() => settle(false), PROBE_MS);
          try {
            player = new YT.Player(host, {
              height: '1',
              width: '1',
              videoId,
              playerVars: { autoplay: 1, controls: 0, playsinline: 1, mute: 1 },
              events: {
                onReady: (e) => {
                  try { e.target.mute?.(); } catch { /* noop */ }
                  try { e.target.playVideo?.(); } catch { /* noop */ }
                },
                onStateChange: (e) => {
                  if (e?.data !== 1 || confirmTimer) return;
                  confirmTimer = window.setTimeout(() => {
                    let t = 0;
                    try { t = e.target.getCurrentTime?.() || 0; } catch { /* noop */ }
                    settle(t > 0.15);
                  }, 1000);
                },
                onError: () => settle(false),
              },
            });
          } catch {
            settle(false);
          }
        }
      });
      if (winners.length) {
        winners.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        return winners[0];
      }
    }
    return null;
  }, []);

  /* Pregunta al servidor por otra fuente de la MISMA canción. Nunca tarda
     más de 9 s: si el API no contesta, se salta rápido en vez de dejar el
     reproductor en silencio durante medio minuto. */
  const resolveAlternative = useCallback(async (failedTrack, exclude) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    try {
      const params = new URLSearchParams({
        title: failedTrack.title || '',
        artist: failedTrack.artist || '',
      });
      const duration = Number(failedTrack.duration || failedTrack.dur || 0);
      if (duration > 0) params.set('duration', String(Math.round(duration)));
      if (exclude.length) params.set('exclude', exclude.slice(-12).join(','));
      const res = await fetch(apiUrl(`/api/resolve?${params}`), {
        cache: 'no-store', signal: controller.signal,
      });
      if (!res.ok) return { ok: false };
      return await res.json();
    } catch {
      return { ok: false };
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  const playSameSongGuaranteed = useCallback(async (failedTrack) => {
    if (!failedTrack || sameSongLockRef.current) return false;

    const key = `${String(failedTrack.title || '').toLowerCase()}|${String(failedTrack.artist || '').toLowerCase()}`;
    const tries = resolveTriesRef.current.get(key) || 0;
    if (tries >= MAX_RESOLVE_TRIES) return false;

    const tried = triedVideosRef.current;
    if (failedTrack.yt) tried.add(String(failedTrack.yt));
    if (String(failedTrack.id || '').startsWith('yt-')) tried.add(String(failedTrack.id).slice(3));

    sameSongLockRef.current = true;
    try {
      setError('Buscando esta canción en otra fuente...');
      resolveTriesRef.current.set(key, tries + 1);

      /* Una sola consulta por rescate: el servidor devuelve hasta 12
         candidatos de la MISMA canción y aquí se prueban en paralelo hasta
         que uno reproduzca de verdad. Antes se encadenaban rondas y cada una
         volvía a tardar ~1 s (o hasta 32 s si el API estaba lento). */
      const res = await resolveAlternative(failedTrack, [...tried]);

      /* Fuente de audio directa (espejo): no depende del iframe. */
      if (res?.ok && res.type === 'audio' && res.audioUrl) {
        try { pauseAllPlayers(); } catch { /* noop */ }
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.preload = 'auto';
          audioRef.current.playsInline = true;
          audioRef.current.onerror = () => {
            reportIssue({
              type: 'playback', severity: 'error',
              message: 'la fuente alternativa de audio también falló',
              code: String(audioRef.current?.error?.code || ''),
              track: failedTrack, source: 'audio',
            });
            /* Auditor: un 404/500 del stream de audio no detiene la música.
               Se pide otro espejo/vídeo de la misma canción; si tampoco hay,
               se salta en silencio a la siguiente de la cola. */
            if (!sameSongLockRef.current) {
              sameSongRef.current?.(failedTrack).then((ok) => {
                if (!ok) handlersRef.current.advance?.(1, { force: true });
              }).catch(() => handlersRef.current.advance?.(1, { force: true }));
            }
          };
        }
        audioRef.current.src = res.audioUrl;
        audioRef.current.volume = targetVolume() / 100;
        setAudioMode(true);
        const next = { ...failedTrack, _guaranteed: true, source: res.source };
        trackRef.current = next;
        setTrack(next);
        setPlaying(true);
        setReady(true);
        applyPosition(0);
        setError(null);
        try { await audioRef.current.play(); } catch { /* noop */ }
        if (audioSyncRef.current) clearInterval(audioSyncRef.current);
        audioSyncRef.current = setInterval(() => {
          if (!audioRef.current) return;
          try {
            applyPosition(audioRef.current.currentTime || 0);
            if (audioRef.current.duration && isFinite(audioRef.current.duration)) applyDuration(audioRef.current.duration);
            if (audioRef.current.ended) {
              clearInterval(audioSyncRef.current);
              audioSyncRef.current = null;
              handlersRef.current.handleEnded?.();
            }
          } catch { /* noop */ }
        }, 400);
        return true;
      }

      /* Alternativas de vídeo: se prueban en paralelo hasta que una arranque. */
      const list = res?.ok
        ? (Array.isArray(res.candidates) && res.candidates.length
          ? res.candidates
          : [{ videoId: res.videoId }])
        : [];
      const fresh = [];
      const seen = new Set();
      for (const item of list) {
        const videoId = String(item?.videoId || '').replace(/^yt-/, '');
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || tried.has(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        tried.add(videoId);
        fresh.push({ videoId, score: Number(item?.score) || 0 });
        if (fresh.length >= 10) break;
      }
      if (!fresh.length) return false;

      const player = getPlayer();
      if (!player?.loadVideoById) {
        /* El iframe aún no está listo: se encarga `hardPlay` al arrancar. */
        const videoId = fresh[0].videoId;
        const next = { ...failedTrack, yt: videoId, _guaranteed: true, source: 'resolver' };
        trackRef.current = next;
        setTrack(next);
        setPlaying(true);
        setReady(true);
        applyPosition(0);
        setError(null);
        hardPlay(next);
        return true;
      }

      const winner = await probeCandidates(fresh);
      if (!winner) {
        reportIssue({
          type: 'playback', severity: 'warning',
          message: 'ninguna alternativa de esta canción reprodujo',
          track: failedTrack, source: 'resolver',
          context: { probados: fresh.map((c) => c.videoId) },
        });
        return false;
      }

      setAudioMode(false);
      try {
        player.setVolume?.(targetVolume());
        player.loadVideoById({ videoId: winner.videoId, startSeconds: 0 });
        player.playVideo?.();
      } catch { /* noop */ }
      /* Se conserva el id original: la pista sigue siendo la misma en la
         cola, el historial y los "me gusta"; solo cambia el vídeo. */
      const next = { ...failedTrack, yt: winner.videoId, _guaranteed: true, source: 'resolver' };
      trackRef.current = next;
      setTrack(next);
      setPlaying(true);
      setReady(true);
      applyPosition(0);
      setError(null);
      loadStartedRef.current = { id: next.id, at: Date.now() };
      return true;
    } catch (e) {
      console.warn('[guaranteed] err', e);
    } finally {
      sameSongLockRef.current = false;
    }
    return false;
  }, [getPlayer, hardPlay, pauseAllPlayers, probeCandidates, resolveAlternative, targetVolume]);
  sameSongRef.current = playSameSongGuaranteed;

  /* ---------- init de los dos reproductores ---------- */
  useEffect(() => {
    let dead = false;
    loadYT().then((YT) => {
      if (dead || !YT) return;
      for (let slot = 0; slot < 2; slot++) {
        const host = hostsRef.current[slot];
        if (!host) continue;
        playersRef.current[slot] = new YT.Player(host, {
          width: '1', height: '1',
          playerVars: {
            playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1,
            rel: 0, fs: 0, iv_load_policy: 3, origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              readySlotsRef.current[slot] = true;
              playersReadyRef.current = readySlotsRef.current.filter(Boolean).length;
              try { e.target.setVolume(targetVolume()); } catch { /* noop */ }
              const pending = pendingPlayRef.current;
              if (pending?.yt) {
                pendingPlayRef.current = null;
                activeSlotRef.current = slot;
                setActiveSlot(slot);
                try {
                  e.target.loadVideoById({ videoId: pending.yt, startSeconds: 0 });
                  e.target.playVideo?.();
                } catch { /* noop */ }
              }
              if (slot === activeSlotRef.current) setReady(true);
            },
            onStateChange: (e) => {
              const isActive = slot === activeSlotRef.current;
              if (e.data === 1 || e.data === 3) {
                if (!isActive) return;
                setPlaying(e.data === 1 || e.data === 3);
                if (e.data === 1) {
                  setError(null);
                  stallMsRef.current = 0;
                  lastTickRef.current = { t: -1 };
                  const started = loadStartedRef.current;
                  const current = trackRef.current;
                  if (started && started.id === current?.id) {
                    const latency = Date.now() - started.at;
                    loadStartedRef.current = null;
                    if (latency > 6000) {
                      reportIssue({
                        type: 'latency', severity: 'warning',
                        message: `inicio lento (${latency} ms)`,
                        track: current, source: 'youtube', latencyMs: latency,
                      });
                    }
                  }
                }
                return;
              }
              if (e.data === 2) {
                if (isActive) setPlaying(false);
                return;
              }
              if (e.data === 0) {
                // El reproductor que se desvanece no debe disparar otro salto.
                if (!isActive || audioModeRef.current) return;

                const cur = trackRef.current;
                const expected = Number(cur?.duration || cur?.dur || 0);
                let actual = 0;
                try { actual = e.target.getDuration() || 0; } catch { actual = 0; }
                const endedTooSoon = expected >= MIN_AUDIO_SECONDS && actual > 0 && actual < expected * 0.7;

                if (endedTooSoon && cur && !earlyEndTriedRef.current.has(cur.id)) {
                  earlyEndTriedRef.current.add(cur.id);
                  reportIssue({
                    type: 'playback', severity: 'warning',
                    message: `la pista terminó antes de tiempo (${Math.round(actual)} s de ${Math.round(expected)} s)`,
                    track: cur, source: 'youtube',
                    context: { actual, expected },
                  });
                  sameSongRef.current?.(cur).then((ok) => {
                    if (!ok) handlersRef.current.handleEnded?.();
                  }).catch(() => handlersRef.current.handleEnded?.());
                  return;
                }
                handlersRef.current.handleEnded?.();
              }
            },
            onError: async (e) => {
              if (slot !== activeSlotRef.current) return;
              if (sameSongLockRef.current || audioModeRef.current) return;
              const cur = trackRef.current;
              reportIssue({
                type: 'playback', severity: 'error',
                message: 'el reproductor no pudo cargar el audio',
                code: String(e?.data ?? ''),
                track: cur, source: 'youtube',
                context: { audioMode: audioModeRef.current, code: e?.data },
              });
              /* Un solo rescate: prueba alternativas de la MISMA canción. Si
                 ninguna arranca, se salta una vez (sin cadenas de saltos). */
              if (cur) {
                const ok = await sameSongRef.current?.(cur);
                if (ok) {
                  reportIssue({
                    type: 'recovery', severity: 'info',
                    message: 'recuperado con una fuente alternativa',
                    track: cur, source: 'resolver',
                  });
                  setError(null);
                  return;
                }
              }
              setError('No disponible. Saltando...');
              setTimeout(() => {
                sameSongLockRef.current = false;
                handlersRef.current.advance?.(1, { force: true });
              }, 700);
            },
          },
        });
      }
    });
    return () => {
      dead = true;
      cancelRamps();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- posición, watchdog y crossfade automático ---------- */
  useEffect(() => {
    const iv = setInterval(() => {
      if (audioModeRef.current) return; // el audio alternativo tiene su propio reloj
      if (seekingRef.current) return;
      const p = playersRef.current[activeSlotRef.current];
      if (!p?.getCurrentTime) return;

      let t = 0;
      let d = 0;
      try {
        t = p.getCurrentTime() || 0;
        d = p.getDuration() || 0;
      } catch { return; }

      applyPosition(t);
      if (d) applyDuration(d);

      const cur = trackRef.current;
      const expected = Number(cur?.duration || cur?.dur || 0);
      const cf = crossfadeRef.current;

      // Pista "recortada": el stream real dura mucho menos que la canción.
      if (expected >= MIN_AUDIO_SECONDS && d > 0 && d < expected * 0.7 && !earlyEndTriedRef.current.has(cur?.id)) {
        earlyEndTriedRef.current.add(cur?.id);
        reportIssue({
          type: 'playback', severity: 'warning',
          message: `el stream dura ${Math.round(d)} s y la pista ${Math.round(expected)} s`,
          track: cur, source: 'youtube', context: { stream: d, expected },
        });
        sameSongRef.current?.(cur);
        return;
      }

      // Watchdog: si el tiempo no avanza, reintentar sin saltar la canción.
      if (playingRef.current && !crossfadingRef.current && t >= 0) {
        if (lastTickRef.current.t < 0 || Math.abs(t - lastTickRef.current.t) > 0.2) {
          stallMsRef.current = 0;
          lastTickRef.current = { t };
        } else {
          stallMsRef.current += 500;
          if (stallMsRef.current >= STALL_MS && !stallRetryRef.current) {
            stallRetryRef.current = true;
            reportIssue({
              type: 'stream', severity: 'warning',
              message: `reproducción atascada en ${Math.round(t)} s; reintentando`,
              track: cur, source: 'youtube', context: { position: t },
            });
            try { p.seekTo?.(Math.max(0, t - 0.4), true); p.playVideo?.(); } catch { /* noop */ }
            setTimeout(() => { stallRetryRef.current = false; }, 5000);
          }
          if (stallMsRef.current >= HARD_STALL_MS && !stallResolveRef.current && !sameSongLockRef.current) {
            stallResolveRef.current = true;
            sameSongRef.current?.(cur).then((ok) => {
              if (!ok) handlersRef.current.advance?.(1, { force: true });
            }).catch(() => handlersRef.current.advance?.(1, { force: true }))
              .finally(() => {
                setTimeout(() => { stallResolveRef.current = false; }, 5000);
              });
          }
        }
      }

      // Crossfade: arranca justo antes del final, no cuando ya se cortó.
      if (cf > 0 && !crossfadingRef.current && playingRef.current && d > 20) {
        const remaining = d - t;
        if (remaining > 0.4 && remaining <= cf + 0.25) {
          handlersRef.current.handleApproachingEnd?.(remaining);
        }
      }
    }, 500);
    return () => clearInterval(iv);
  }, [ready]);

  /* ---------- temporizador de apagado (PRO) ---------- */
  useEffect(() => {
    if (!sleepEndsAt) return;
    const iv = setInterval(() => {
      if (Date.now() >= sleepEndsAt) {
        pauseAllPlayers();
        setSleepEndsAt(null);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [sleepEndsAt, pauseAllPlayers]);

  /* ---------- normalización de volumen (PRO) ---------- */
  useEffect(() => {
    if (!ready) return;
    if (!crossfadingRef.current) {
      try { getPlayer()?.setVolume?.(targetVolume()); } catch { /* noop */ }
    }
    try { localStorage.setItem('ritmo_vol', String(volume)); } catch { /* noop */ }
  }, [volume, settings.volumeNorm, settings.normalizeEQ, pro.active, ready, getPlayer, targetVolume]);

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

  /* ---------- Recomendaciones dinámicas ---------- */
  /* Calcula en segundo plano la radio de la canción actual (misma vibra,
     variedad de artistas) y rellena la cola automática. Si la reproducción se
     había quedado esperando, arranca en cuanto llegan los resultados. */
  const refreshRelated = useCallback(async (tk) => {
    if (!tk) return [];
    if (relatedTimerRef.current) {
      window.clearTimeout(relatedTimerRef.current);
      relatedTimerRef.current = 0;
    }
    const token = ++relatedTokenRef.current;
    try {
      const list = await fetchSmartRelatedQueue(tk, { limit: 18 });
      if (token !== relatedTokenRef.current) return [];
      const clean = Array.isArray(list) ? list.filter((x) => x && x.id !== tk.id) : [];
      autoQueueRef.current = clean;
      setAutoQueue(clean);
      if (pendingAdvanceRef.current && clean.length) {
        pendingAdvanceRef.current = false;
        playAutoRef.current?.(clean[0]);
      }
      return clean;
    } catch {
      if (token === relatedTokenRef.current) {
        autoQueueRef.current = [];
        setAutoQueue([]);
      }
      return [];
    }
  }, []);

  /* Al cambiar de canción varias veces seguidas (el usuario se equivocó y
     elige otra), no hace falta calcular recomendaciones para cada intento:
     solo para la última. Se retrasa ~500 ms e invalida el token al programar
     para que ninguna respuesta vieja pise la cola. */
  const scheduleRelated = useCallback((tk) => {
    const token = ++relatedTokenRef.current;
    if (relatedTimerRef.current) window.clearTimeout(relatedTimerRef.current);
    relatedTimerRef.current = window.setTimeout(() => {
      relatedTimerRef.current = 0;
      if (token === relatedTokenRef.current) refreshRelated(tk);
    }, 500);
  }, [refreshRelated]);

  /* ---------- Motor de reproducción ---------- */
  const commitTrack = useCallback((tk, list, idx, extraQueue) => {
    const prev = prevTrackRef.current;
    trackRef.current = tk;
    lastTickRef.current = { t: -1 };
    stallMsRef.current = 0;
    setTrack(tk);
    setContextList(list);
    setIndex(idx);
    setQueue(extraQueue);
    // Cada canción nueva renueva sus recomendaciones.
    pendingAdvanceRef.current = false;
    autoQueueRef.current = [];
    setAutoQueue([]);
    scheduleRelated(tk);
    applyPosition(0);
    setPlaying(true);
    setAudioMode(false);
    sameSongLockRef.current = false;
    triedVideosRef.current.clear();
    resolveTriesRef.current.clear();
    visitedRef.current.add(tk.id);
    playedHistoryRef.current = [...playedHistoryRef.current, tk].slice(-8);
    try { ads?.incrementPlay?.(); } catch { /* noop */ }
    loadStartedRef.current = { id: tk.id, at: Date.now() };
    dispatch({ type: 'add-history', id: tk.id });
    try { recordPlay(tk); } catch { /* noop */ }
    try { recordListen(tk, tk.categoryId); } catch { /* noop */ }
    /* Historial local: alimenta la rotación ponderada y las recomendaciones
       aunque el servidor no esté disponible. */
    try { recordCatalogListen(tk, tk.categoryId); } catch { /* noop */ }
    /* DJ Ritmo: comenta la nueva canción (usa el tema anterior para la transición) */
    if (tk.id !== prev?.id) emitDj({ track: tk, prevTrack: prev });
    prevTrackRef.current = tk;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: tk.title, artist: tk.artist, album: tk.album || 'Sonora Music',
          artwork: [{ src: tk.thumb, sizes: '480x360', type: 'image/jpeg' }],
        });
      } catch { /* noop */ }
    }
  }, [dispatch, emitDj, ads, scheduleRelated]);

  const playNow = useCallback((tk, list, idx, extraQueue = [], opts = {}) => {
    if (!tk) return;
    const prev = prevTrackRef.current;
    // Selección rápida: si el usuario cambió de canción hace menos de 1,5 s
    // (se equivocó y eligió otra), cargamos directamente en el reproductor
    // activo. Evita montar dos vídeos a la vez y el trabajo que eso arrastra.
    const now = Date.now();
    const rapidSelection = now - lastSelectionRef.current < 1500;
    lastSelectionRef.current = now;
    // Si veníamos de un fundido, lo cortamos limpiamente antes de decidir:
    // el reproductor que se estaba desvaneciendo vuelve a pausa.
    if (crossfadingRef.current) {
      crossfadingRef.current = false;
      cancelRamps();
      try {
        const other = 1 - activeSlotRef.current;
        playersRef.current[other]?.pauseVideo?.();
        playersRef.current[other]?.setVolume?.(0);
      } catch { /* noop */ }
    }
    stopAudioFallback();

    const fadeMs = Math.max(0, Number(opts.fadeMs) || 0);
    const canCrossfade = !rapidSelection && fadeMs > 0 && prev && prev.id !== tk.id &&
      !audioModeRef.current && playersReadyRef.current >= 2;

    if (canCrossfade && crossfadeTo(tk, fadeMs)) {
      window.setTimeout(() => { crossfadingRef.current = false; }, fadeMs + 160);
    } else {
      hardPlay(tk);
    }
    commitTrack(tk, list, idx, extraQueue);
  }, [cancelRamps, commitTrack, crossfadeTo, hardPlay, stopAudioFallback]);

  /* Reproduce una recomendación de la cola automática. La cola siguiente se
     recalcula sola para la nueva canción; no arrastramos la anterior. */
  const playAutoFromQueue = useCallback((item) => {
    if (!item) return;
    const { contextList: list, index: idx } = liveRef.current;
    const existing = list.findIndex((t) => t && t.id === item.id);
    const at = existing >= 0 ? existing : idx + 1;
    const merged = existing >= 0 ? list : [...list.slice(0, at), item, ...list.slice(at)];
    playNow(item, merged, at, [], { fadeMs: MANUAL_FADE_MS });
  }, [playNow]);

  playAutoRef.current = playAutoFromQueue;

  const advance = useCallback((dir, opts = {}) => {
    const fadeMs = Number.isFinite(Number(opts.crossfadeMs)) && opts.crossfadeMs > 0
      ? Number(opts.crossfadeMs)
      : MANUAL_FADE_MS;
    const go = (tk, list, at, q) => playNow(tk, list, at, q, { fadeMs });

    // 1) La cola explícita del usuario ("Reproducir a continuación") manda.
    //    No la filtramos: el usuario pidió esos temas a propósito.
    if (dir > 0 && queue.length > 0) {
      const [nextTr, ...rest] = queue;
      const at = Math.max(0, index + 1);
      const list = [...contextList.slice(0, at), nextTr, ...contextList.slice(at)];
      go(nextTr, list, at, rest);
      return;
    }

    const list = contextList;
    if (!list.length || !track) return;
    const current = list[index] || track;
    const active = getPlayer();

    // Repetición de una sola canción: al terminar, vuelve a empezar.
    if (repeat === 'one' && dir > 0 && !opts.force) {
      try { active?.seekTo?.(0, true); active?.playVideo?.(); } catch { /* noop */ }
      return;
    }
    if (repeat === 'one' && dir > 0 && opts.ended) {
      try { active?.seekTo?.(0, true); active?.playVideo?.(); } catch { /* noop */ }
      return;
    }

    // 2) Anterior: respeta el orden de la lista en curso.
    if (dir < 0) {
      let prev = index - 1;
      if (prev < 0) prev = repeat === 'all' ? list.length - 1 : 0;
      go(list[prev], list, prev, []);
      return;
    }

    // 3) Siguiente de una lista explícita (álbum, playlist o radio ya montada).
    //    Respetamos el orden que el usuario eligió antes de saltar a la radio.
    const following = list[index + 1];
    if (following && following.id !== current.id) {
      go(following, list, index + 1, []);
      return;
    }

    const canAppend = settings.autoplay !== false;
    if (!canAppend) {
      if (repeat === 'all') {
        const first = list.findIndex((t) => t.id !== current.id);
        const at = first >= 0 ? first : 0;
        go(list[at], list, at, []);
      } else {
        setPlaying(false);
        pauseAllPlayers();
      }
      return;
    }

    // 4) «Radio de la canción»: la cola recalculada en segundo plano manda.
    //    Se evitan las ya escuchadas; si todas lo están, seguimos con la
    //    primera para que la música nunca se corte.
    const dynamic = autoQueueRef.current || [];
    if (dynamic.length) {
      const fresh = dynamic.find((x) => x && x.id !== current.id && !visitedRef.current.has(x.id)) ||
        dynamic.find((x) => x && x.id !== current.id) || dynamic[0];
      if (fresh) {
        playAutoFromQueue(fresh);
        return;
      }
    }

    // 5) Sin cola dinámica todavía: siguiente por afinidad del catálogo.
    //    La puntuación usa género, BPM, energía y variedad de artistas.
    const pool = mergeTracks(list, globalPool()).filter(
      (t) => t && t.id !== current.id && !visitedRef.current.has(t.id),
    );
    const smart = shuffle
      ? smartRelated(current, { pool, limit: 32, recent: playedHistoryRef.current })
      : [];
    const pick = shuffle
      ? (smart[Math.floor(Math.random() * smart.length)] || smart[0] || null)
      : pickSmartNext({
        current,
        candidates: pool,
        recent: playedHistoryRef.current,
        exclude: [current.id],
      });

    if (pick) {
      const at = list.findIndex((t) => t.id === pick.id);
      if (at >= 0) go(pick, list, at, []);
      else {
        const merged = [...list, pick];
        go(pick, merged, merged.length - 1, []);
      }
      return;
    }

    // 6) Sin temas afines en el catálogo: repetimos la lista si se pidió.
    if (repeat === 'all') {
      const first = list.findIndex((t) => t.id !== current.id);
      const at = first >= 0 ? first : 0;
      go(list[at], list, at, []);
      return;
    }

    // 7) Aún no hay recomendaciones: esperamos a que lleguen y continuamos.
    //    Si el servidor no devuelve nada, seguimos con el catálogo local para
    //    que la música nunca se detenga.
    pendingAdvanceRef.current = true;
    setPlaying(false);
    pauseAllPlayers();
    const localFallback = () => {
      if (!pendingAdvanceRef.current) return;
      /* El contexto que el usuario puso (categoría, playlist…) siempre es del
         mismo género; solo se añade el pool global si respeta ese mundo. Antes
         se caía a `fallbackPool[0]`, que podía ser de cualquier género. */
      const contextPool = mergeTracks(list).filter((t) => t && t.id !== current.id);
      const globalCandidates = mergeTracks(globalPool()).filter(
        (t) => t && t.id !== current.id && !visitedRef.current.has(t.id),
      );
      const next = pickSmartNext({
        current,
        candidates: mergeTracks(contextPool, globalCandidates),
        recent: playedHistoryRef.current,
        exclude: [current.id],
      }) || contextPool.find((t) => !visitedRef.current.has(t.id)) || contextPool[0];
      pendingAdvanceRef.current = false;
      if (!next) {
        /* Sin nada coherente: repetimos la canción actual antes que saltar a
           otro género. La música sigue sonando. */
        try { getPlayer()?.seekTo?.(0, true); getPlayer()?.playVideo?.(); } catch { /* noop */ }
        setPlaying(true);
        applyPosition(0);
        return;
      }
      const at = list.findIndex((t) => t.id === next.id);
      if (at >= 0) playNow(next, list, at, [], { fadeMs });
      else playNow(next, [...list, next], list.length, [], { fadeMs });
    };
    refreshRelated(current)
      .then((items) => { if (!items?.length) localFallback(); })
      .catch(() => localFallback());
  }, [contextList, index, repeat, shuffle, playNow, playAutoFromQueue, refreshRelated, settings.autoplay, queue, track, getPlayer, pauseAllPlayers]);

  const handleEnded = useCallback(() => {
    if (crossfadingRef.current) return; // el fundido ya está en marcha
    const ms = crossfadeRef.current > 0 ? crossfadeRef.current * 1000 : 0;
    try { advance(1, { force: true, ended: true, crossfadeMs: ms }); } catch { /* noop */ }
  }, [advance]);

  /* Arranca el fundido justo antes del final real (no tras el corte). */
  const handleApproachingEnd = useCallback((remaining) => {
    if (repeat === 'one' || crossfadingRef.current || approachLockRef.current) return;
    const { contextList: list, index: idx, queue: q } = liveRef.current;
    const hasNext = q.length > 0 || Boolean(list[idx + 1]) || autoQueueRef.current.length > 0;
    if (!hasNext && settings.autoplay === false) return;
    approachLockRef.current = true;
    window.setTimeout(() => { approachLockRef.current = false; }, 1400);
    advance(1, {
      force: true,
      crossfadeMs: Math.max(400, Math.min(crossfadeRef.current, remaining) * 1000),
    });
  }, [advance, repeat, settings.autoplay]);

  /* Mantén siempre a mano la última versión de advance/handleEnded para los
     eventos del iframe de YouTube (se registran una sola vez). */
  handlersRef.current = { advance, handleEnded, handleApproachingEnd };

  /* ---------- API pública ---------- */
  const api = useMemo(() => ({
    playList(list, startId) {
      if (!list?.length) return;
      let idx = startId ? list.findIndex((t) => t.id === startId) : 0;
      if (idx < 0) idx = 0;
      visitedRef.current = new Set();
      playedHistoryRef.current = [];
      playNow(list[idx], list, idx, [], { fadeMs: MANUAL_FADE_MS });
    },
    playRadio(seed) {
      if (!seed) return;
      visitedRef.current = new Set([seed.id]);
      playedHistoryRef.current = [seed];
      // El contexto empieza solo con la semilla: la radio se recalcula para
      // cada canción en segundo plano, en vez de arrastrar una lista fija.
      playNow(seed, [seed], 0, [], { fadeMs: MANUAL_FADE_MS });
    },
    toggle() {
      if (audioMode && audioRef.current) {
        try {
          if (audioRef.current.paused) { audioRef.current.play(); setPlaying(true); }
          else { audioRef.current.pause(); setPlaying(false); }
          return;
        } catch { /* noop */ }
      }
      const p = getPlayer();
      if (!p || !track) return;
      try { playing ? p.pauseVideo() : p.playVideo(); } catch { /* noop */ }
    },
    next: () => { try { advance(1, { force: true }); } catch { /* noop */ } },
    prev() {
      if (positionRef.current > 4) { try { getPlayer()?.seekTo?.(0, true); } catch { /* noop */ } return; }
      try { advance(-1, { force: true }); } catch { /* noop */ }
    },
    seek(frac) {
      if (audioMode && audioRef.current && audioRef.current.duration) {
        const to = audioRef.current.duration * frac;
        try { audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration, to)); applyPosition(audioRef.current.currentTime); } catch { /* noop */ }
        return;
      }
      if (!durationRef.current) return;
      const to = Math.max(0, Math.min(durationRef.current, durationRef.current * frac));
      try { getPlayer()?.seekTo?.(to, true); applyPosition(to); } catch { /* noop */ }
    },
    nudge(sec) {
      if (audioMode && audioRef.current) {
        try {
          const to = Math.max(0, (audioRef.current.currentTime || 0) + sec);
          audioRef.current.currentTime = to;
          applyPosition(audioRef.current.currentTime);
        } catch { /* noop */ }
        return;
      }
      try {
        const to = Math.max(0, Math.min(durationRef.current, positionRef.current + sec));
        getPlayer()?.seekTo?.(to, true); applyPosition(to);
      } catch { /* noop */ }
    },
    setVolume(v) {
      const nv = Math.max(0, Math.min(100, Number(v) || 0));
      setVolumeState(nv);
      volumeRef.current = nv;
      try { if (audioRef.current) audioRef.current.volume = nv / 100; } catch { /* noop */ }
      try { if (!crossfadingRef.current) getPlayer()?.setVolume?.(nv); } catch { /* noop */ }
      try { localStorage.setItem('ritmo_vol', String(nv)); } catch { /* noop */ }
    },
    toggleShuffle() { setShuffle((s) => !s); },
    cycleRepeat() { setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')); },

    /* ── Cola: "Reproducir a continuación" y "Añadir a la cola" ── */
    playNext(t) { setQueue((q) => [t, ...q]); },
    enqueue(t) { if (t) setQueue((q) => [...q, t]); },
    enqueueList(list) {
      if (!Array.isArray(list)) return;
      const clean = list.filter((t) => t && t.id);
      if (clean.length) setQueue((q) => [...q, ...clean]);
    },
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
      playNow(item, merged, idx + 1, rest, { fadeMs: MANUAL_FADE_MS });
    },
    /* Reproduce un elemento "a continuación" del contexto por posición */
    playContextAt(pos) {
      const { contextList: list, index: idx } = liveRef.current;
      const target = idx + 1 + pos;
      if (!list[target]) return;
      playNow(list[target], list, target, liveRef.current.queue, { fadeMs: MANUAL_FADE_MS });
    },
    /* Reproduce una recomendación dinámica por posición */
    playAutoAt(pos) {
      const items = autoQueueRef.current || [];
      const item = items[pos];
      if (!item) return;
      playAutoFromQueue(item);
    },
    /* Vuelve a pedir recomendaciones para la canción actual */
    refreshRelated() {
      if (track) refreshRelated(track);
    },
    /* Reproduce la radio de la canción (misma vibra, varios artistas) */
    playRelated() {
      if (!track) return;
      const rel = smartRelated(track, {
        pool: mergeTracks(contextList, globalPool()),
        limit: 30,
        recent: playedHistoryRef.current,
      });
      if (!rel.length) return;
      playNow(rel[0], [track, ...rel], 1, [], { fadeMs: MANUAL_FADE_MS });
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
  }), [track, playing, advance, playNow, playAutoFromQueue, refreshRelated, contextList, djText, speak, stopDjSpeech, settings.lang, djVoiceURI, audioMode, getPlayer]);

  /* Acciones de MediaSession */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* noop */ } };
    set('play', () => getPlayer()?.playVideo?.());
    set('pause', () => getPlayer()?.pauseVideo?.());
    set('nexttrack', () => advance(1, { force: true }));
    set('previoustrack', () => advance(-1, { force: true }));
    set('seekbackward', () => api.nudge(-10));
    set('seekforward', () => api.nudge(10));
  }, [advance, api, getPlayer]);

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

  /* La radio local de respaldo solo hace falta mientras no han llegado las
     recomendaciones del servidor. Se memoiza aparte para no recalcularla cada
     vez que cambia el volumen, el panel o el estado de reproducción. */
  const fallbackRelated = useMemo(() => {
    if (!track || autoQueue.length) return [];
    return smartRelated(track, {
      pool: mergeTracks(contextList, globalPool()),
      limit: 8,
      recent: playedHistoryRef.current,
    });
  }, [track, autoQueue.length, contextList]);

  const value = useMemo(() => {
    // Lo que sonará después, cuando la cola se vacíe (resto de la lista en curso)
    const upcoming = (index >= 0 && contextList.length > index + 1) ? contextList.slice(index + 1) : [];
    // Recomendaciones dinámicas si ya llegaron; si no, radio local inmediata.
    const recommended = autoQueue.length ? autoQueue : fallbackRelated;
    return {
      ...api, track, queue, autoQueue, recommended, contextList, index, playing,
      shuffle, repeat, volume, fullOpen, panel, ready, error, sleepEndsAt, videoMode,
      djText, djTag, djSpeaking, djOn: settings.dj, djVoiceURI,
      related: recommended.slice(0, 6),
      upcoming,
      // La cola visible: primero lo que el usuario encoló, después las recomendaciones.
      upNext: queue.length ? queue : (recommended.length ? recommended : upcoming),
      audioMode,
      crossfadeSeconds: crossfadeSec,
      activeSlot,
    };
  }, [api, track, queue, autoQueue, contextList, index, playing, shuffle, repeat, volume, fullOpen, panel, ready, error, sleepEndsAt, videoMode, djText, djTag, djSpeaking, settings.dj, djVoiceURI, audioMode, crossfadeSec, activeSlot, fallbackRelated]);

  /* Progreso aislado: solo los componentes que lo pintan (mini, panel, full,
     vídeo) se actualizan cada 500 ms. */
  const progressValue = useMemo(() => ({ position, duration }), [position, duration]);

  return (
    <PlayerCtx.Provider value={value}>
      <PlayerProgressCtx.Provider value={progressValue}>
        {children}
        {/* Dos hosts estables: el crossfade entra con el reproductor libre. */}
        <VideoStage hostsRef={hostsRef} activeSlot={activeSlot} videoMode={videoMode} />
        {settings.dj && (
          <DJDrop
            text={djText}
            tag={djTag}
            onClose={api.djDismiss}
            onRepeat={api.djRepeat}
          />
        )}
      </PlayerProgressCtx.Provider>
    </PlayerCtx.Provider>
  );
}

export const usePlayer = () => useContext(PlayerCtx);
export const usePlayerProgress = () => useContext(PlayerProgressCtx);

export const fmt = (s) => {
  if (!s || s < 0 || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
