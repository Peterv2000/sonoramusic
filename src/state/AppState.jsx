import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { trackById } from '../data/catalog.js';

const KEY = 'ritmo-state-v1';

const DEFAULT_STATE = {
  profile: { name: 'Invitado', email: '', avatar: '🎧' },
  pro: { active: false, plan: null, since: null, expires: null },
  settings: {
    theme: 'dark',            // dark | light | system
    lang: 'es',               // es | en
    quality: 'auto',          // auto | low | high (high = PRO)
    volumeNorm: false,        // PRO
    crossfade: 0,             // segundos, PRO
    autoplay: true,
    explicitFilter: false,
    dataSaver: false,
    wifiOnlyHigh: true,       // PRO
    notifyReleases: true,
    notifyRecs: true,
    sleepTimer: 0,            // minutos, PRO
    // ── Nuevos (Spotify · Apple Music · YT Music) ──
    lossless: false,          // PRO — Audio sin pérdida
    spatial: false,           // PRO — Dolby Atmos / espacial
    gapless: false,           // PRO — sin pausas entre canciones
    smartShuffle: false,      // PRO — aleatorio inteligente (evita repetir)
    canvas: true,             // vídeo corto de fondo estilo Spotify Canvas
    autoVideo: false,         // YT Music: mostrar vídeo si está disponible
    normalizeEQ: 'flat',      // ecualizador: flat | bass | vocal | treble | loud
    dataSaverVideo: true,     // no vídeo en datos móviles
    crossDevice: true,        // continuidad entre dispositivos
  },
  library: {
    liked: [],                // ids de track
    playlists: [],            // { id, name, desc, cover, tracks: [ids], createdAt }
    history: [],              // { id, at }
    recentSearches: [],
    savedAlbums: [],          // títulos de álbum
    followedArtists: [],      // nombres de artista
    downloads: [],            // ids de track "descargados" (simulado)
    playCounts: {},           // { trackId: n }
    radioHistory: [],         // emisoras/recientes de contexto
  },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...saved,
      profile: { ...DEFAULT_STATE.profile, ...saved.profile },
      pro: { ...DEFAULT_STATE.pro, ...saved.pro },
      settings: { ...DEFAULT_STATE.settings, ...saved.settings },
      library: { ...DEFAULT_STATE.library, ...saved.library, playCounts: { ...saved.library?.playCounts } },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: { ...state[action.key], ...action.value } };
    case 'patch-settings':
      return { ...state, settings: { ...state.settings, ...action.value } };
    case 'toggle-like': {
      const liked = state.library.liked.includes(action.id)
        ? state.library.liked.filter((x) => x !== action.id)
        : [action.id, ...state.library.liked];
      return { ...state, library: { ...state.library, liked } };
    }
    case 'add-history': {
      const history = [{ id: action.id, at: Date.now() }, ...state.library.history.filter((h) => h.id !== action.id)].slice(0, 60);
      const playCounts = { ...state.library.playCounts, [action.id]: (state.library.playCounts[action.id] || 0) + 1 };
      return { ...state, library: { ...state.library, history, playCounts } };
    }
    case 'clear-history':
      return { ...state, library: { ...state.library, history: [], playCounts: {} } };
    case 'clear-searches':
      return { ...state, library: { ...state.library, recentSearches: [] } };
    case 'add-search': {
      const recentSearches = [action.q, ...state.library.recentSearches.filter((s) => s !== action.q)].slice(0, 10);
      return { ...state, library: { ...state.library, recentSearches } };
    }
    case 'create-playlist': {
      const pl = {
        id: 'pl-' + Date.now(),
        name: action.name,
        desc: action.desc || '',
        cover: action.cover || null,
        tracks: [],
        createdAt: Date.now(),
      };
      return { ...state, library: { ...state.library, playlists: [pl, ...state.library.playlists] } };
    }
    case 'delete-playlist':
      return { ...state, library: { ...state.library, playlists: state.library.playlists.filter((p) => p.id !== action.id) } };
    case 'rename-playlist':
      return {
        ...state,
        library: {
          ...state.library,
          playlists: state.library.playlists.map((p) => (p.id === action.id ? { ...p, name: action.name, desc: action.desc ?? p.desc } : p)),
        },
      };
    case 'toggle-track-in-playlist':
      return {
        ...state,
        library: {
          ...state.library,
          playlists: state.library.playlists.map((p) => {
            if (p.id !== action.plId) return p;
            const has = p.tracks.includes(action.trackId);
            const tracks = has ? p.tracks.filter((t) => t !== action.trackId) : [action.trackId, ...p.tracks];
            const cover = !has && !p.cover ? trackById(action.trackId)?.thumb || null : p.cover;
            return { ...p, tracks, cover };
          }),
        },
      };
    /* ── Álbumes guardados (Apple Music / Spotify) ── */
    case 'toggle-album': {
      const savedAlbums = state.library.savedAlbums.includes(action.title)
        ? state.library.savedAlbums.filter((x) => x !== action.title)
        : [action.title, ...state.library.savedAlbums];
      return { ...state, library: { ...state.library, savedAlbums } };
    }
    /* ── Artistas seguidos ── */
    case 'toggle-artist': {
      const followedArtists = state.library.followedArtists.includes(action.name)
        ? state.library.followedArtists.filter((x) => x !== action.name)
        : [action.name, ...state.library.followedArtists];
      return { ...state, library: { ...state.library, followedArtists } };
    }
    /* ── Descargas simuladas (PRO) ── */
    case 'toggle-download': {
      const downloads = state.library.downloads.includes(action.id)
        ? state.library.downloads.filter((x) => x !== action.id)
        : [action.id, ...state.library.downloads];
      return { ...state, library: { ...state.library, downloads } };
    }
    case 'download-many': {
      const set = new Set([...state.library.downloads, ...action.ids]);
      return { ...state, library: { ...state.library, downloads: [...set] } };
    }
    case 'clear-downloads':
      return { ...state, library: { ...state.library, downloads: [] } };
    /* ── Suscripción PRO ── */
    case 'activate-pro':
      return { ...state, pro: { active: true, plan: action.plan, since: Date.now(), expires: action.expires } };
    case 'cancel-pro':
      return { ...state, pro: { ...state.pro, active: false } };
    case 'restore-pro':
      return { ...state, pro: { active: true, plan: state.pro.plan || 'monthly', since: state.pro.since || Date.now(), expires: state.pro.expires } };
    case 'reset':
      return DEFAULT_STATE;
    default:
      return state;
  }
}

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) { setReady(true); return; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* cuota llena */ }
  }, [state, ready]);

  // Tema: aplica clases al <html> y meta theme-color
  const { theme } = state.settings;
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = dark ? '#030303' : '#f9f9f9';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
