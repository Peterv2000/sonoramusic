import { useMemo, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow, GenreGrid } from '../components/widgets.jsx';
import Icon from '../components/Icon.jsx';
import {
  TRACKS, MIXES, STATIONS, MOODS, GENRES, trackById,
  weeklyDiscovery, dailyMixes, newReleases, topCharts, ARTISTS, formatViews, seedShuffle,
} from '../data/catalog.js';
import { useLibraryData } from '../hooks/useLibraryData.js';
import { getPersonalizedFeed, refreshProfile } from '../ai/personalize.js';

/* Cada píldora decide qué bloques del centro se muestran. */
const FILTER_SECTIONS = {
  all: null,
  music: new Set(['genres', 'discovery', 'recent', 'quick', 'listen', 'mixes', 'foryou', 'releases', 'charts', 'stations', 'newadd', 'trends']),
  forYou: new Set(['discovery', 'quick', 'listen', 'mixes', 'foryou', 'followed', 'saved', 'stations']),
  new: new Set(['releases', 'newadd', 'charts']),
  charts: new Set(['charts', 'trends']),
};

const FILTER_IDS = ['all', 'music', 'forYou', 'new', 'charts'];

export default function Home() {
  const { state } = useApp();
  const p = usePlayer();
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useI18n();
  const lib = useLibraryData();
  const all = Array.isArray(lib.tracks) && lib.tracks.length ? lib.tracks : TRACKS;
  const [homeSeed, setHomeSeed] = useState(() => Date.now());
  const [filter, setFilter] = useState('all');

  useEffect(() => { refreshProfile(); }, []);

  /* Cada visita a Inicio (o al pulsar Renovar) cambia la semilla y, con ella,
     el orden de categorías y recomendaciones. */
  useEffect(() => {
    if (loc.pathname === '/') {
      setHomeSeed((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      setFilter('all');
    }
  }, [loc.key, loc.pathname]);

  const recent = useMemo(
    () => state.library.history.map((h) => trackById(h.id)).filter(Boolean).slice(0, 10),
    [state.library.history]
  );

  const quickPicks = useMemo(() => {
    const liked = state.library.liked.map(trackById).filter(Boolean);
    const pool = liked.length ? liked : all;
    return seedShuffle(pool, homeSeed + 3).slice(0, 6);
  }, [state.library.liked, all, homeSeed]);

  const added = useMemo(
    () => seedShuffle(all, homeSeed + 53).slice(0, 12),
    [all, homeSeed]
  );

  // Spotify: Descubrimiento semanal + Mezclas diarias · Apple: Para ti
  const discovery = useMemo(() => {
    const arr = Array.isArray(all) ? all : [];
    try {
      const feed = getPersonalizedFeed(arr, state, { limit: 40 });
      return seedShuffle(feed, homeSeed + 7);
    } catch {
      return seedShuffle(weeklyDiscovery(), homeSeed + 7);
    }
    // Solo cambia al navegar a Inicio o al pulsar Renovar: reproducir una
    // canción no debe reordenar la portada delante del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, homeSeed]);

  const mixes = useMemo(() => seedShuffle(dailyMixes(), homeSeed + 11), [homeSeed]);
  const releases = useMemo(() => seedShuffle(newReleases(), homeSeed + 23), [homeSeed]);
  const charts = useMemo(
    () => seedShuffle(topCharts('Global'), homeSeed + 37).slice(0, 8),
    [homeSeed]
  );
  const genres = useMemo(() => seedShuffle(GENRES, homeSeed + 41).slice(0, 6), [homeSeed]);
  const forYouMixes = useMemo(() => seedShuffle(MIXES, homeSeed + 67), [homeSeed]);
  const stations = useMemo(() => seedShuffle(STATIONS, homeSeed + 71), [homeSeed]);
  const trends = useMemo(() => seedShuffle(all, homeSeed + 89).slice(0, 12), [all, homeSeed]);

  const followed = useMemo(() => {
    const list = state.library.followedArtists
      .map((n) => ARTISTS.find((a) => a.name === n))
      .filter(Boolean);
    return seedShuffle(list, homeSeed + 79);
  }, [state.library.followedArtists, homeSeed]);

  const savedAlbums = useMemo(() => {
    const list = state.library.savedAlbums
      .map((title) => TRACKS.find((tr) => tr.album === title))
      .filter(Boolean);
    return seedShuffle(list, homeSeed + 83);
  }, [state.library.savedAlbums, homeSeed]);

  const show = (key) => !FILTER_SECTIONS[filter] || FILTER_SECTIONS[filter].has(key);

  const greeting = (() => {
    const h = new Date().getHours();
    const es = state.settings.lang === 'es';
    if (h < 6) return es ? 'Buenas noches' : 'Good evening';
    if (h < 12) return es ? 'Buenos días' : 'Good morning';
    if (h < 20) return es ? 'Buenas tardes' : 'Good afternoon';
    return es ? 'Buenas noches' : 'Good evening';
  })();

  return (
    <div className="page">
      <h1 className="greeting">{greeting}, {state.profile.name || t('guest')} {state.pro.active && <span className="badge-pro">✦ {t('proBadge')}</span>}</h1>

      {/* Píldoras de filtro rápido + refresco de recomendaciones */}
      <div className="home-controls">
        <div className="home-filters" role="tablist" aria-label={t('home')}>
          {FILTER_IDS.map((id) => (
            <button
              key={id}
              className={`chip home-pill ${filter === id ? 'on' : ''}`}
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {id === 'all' && t('filter_all')}
              {id === 'music' && t('songs')}
              {id === 'forYou' && t('forYou')}
              {id === 'new' && t('releaseRadar')}
              {id === 'charts' && t('charts')}
            </button>
          ))}
        </div>
        <button
          className="btn small home-renew"
          onClick={() => setHomeSeed((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0)}
          title={t('renew')}
        >
          <Icon name="shuffle" size={14} /> {t('renew')}
        </button>
      </div>

      {/* Chips de estados de ánimo */}
      <div className="chip-row">
        {MOODS.slice(0, 8).map((m) => (
          <button
            key={m}
            className="chip"
            onClick={() => {
              const list = (Array.isArray(all) ? all : TRACKS).filter((t) => Array.isArray(t.moods) && t.moods.includes(m));
              if (list.length) p.playList(seedShuffle(list, homeSeed + 101), list[0].id);
            }}
          >{m}</button>
        ))}
      </div>

      {/* Categorías por género */}
      {show('genres') && (
        <section className="shelf">
          <div className="shelf-head">
            <h2>{t('genres')}</h2>
            <button className="btn small" onClick={() => nav('/explore')}>{t('seeAll')}</button>
          </div>
          <GenreGrid
            genres={genres}
            countOf={(id) => (Array.isArray(all) ? all : TRACKS).filter((t) => t.genre === id).length}
            onPick={() => nav('/explore')}
            onPlay={(id) => { const l = (Array.isArray(all) ? all : TRACKS).filter((t) => t.genre === id); if (l.length) p.playList(seedShuffle(l, homeSeed + 103)); }}
          />
        </section>
      )}

      {/* Descubrimiento semanal (Spotify) — rota en cada visita */}
      {show('discovery') && discovery.length > 0 && (
        <section className="spotlight spotlight-modern" onClick={() => p.playList(discovery)}>
          <div className="spotlight-art">
            <img src={discovery[0]?.thumb} alt="" />
            <img src={discovery[4 % discovery.length]?.thumb} alt="" />
            <img src={discovery[8 % discovery.length]?.thumb} alt="" />
            <img src={discovery[12 % discovery.length]?.thumb} alt="" />
          </div>
          <div className="spotlight-body">
            <span className="spotlight-tag">✦ {t('discoverWeekly') || 'Descubrimiento semanal'}</span>
            <h2>{t('discoverWeekly') || 'Descubrimiento semanal'}</h2>
            <p className="muted">{t('discoverSub') || 'Basado en lo que has escuchado'} · {discovery.length} {t('songs') || 'canciones'}</p>
            <div className="head-actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn primary" onClick={() => p.playList(discovery)}><Icon name="play" size={15} /> {t('play')}</button>
              <button className="btn" onClick={() => p.playList(seedShuffle(discovery, Date.now()))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
            </div>
          </div>
        </section>
      )}

      {show('recent') && recent.length > 0 && (
        <Shelf title={t('recent')}>
          {recent.map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playRadio(tr)} onOpen={() => p.playRadio(tr)} />
          ))}
        </Shelf>
      )}

      {show('quick') && (
        <Shelf title={t('quickPicks') || 'Selecciones rápidas'}>
          {quickPicks.map((tr) => (
            <Card
              key={tr.id} item={tr}
              onPlay={() => p.playList(quickPicks, tr.id)}
              onOpen={() => p.playRadio(tr)}
              sub={`${tr.artist}`}
            />
          ))}
        </Shelf>
      )}

      {show('listen') && recent.length > 0 && (
        <Shelf title={t('listenAgain') || 'Escuchar de nuevo'}>
          {seedShuffle(recent, homeSeed + 109).slice(0, 12).map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playRadio(tr)} onOpen={() => p.playRadio(tr)} />
          ))}
        </Shelf>
      )}

      {/* Mezclas diarias (Spotify) / Para ti (Apple) */}
      {show('mixes') && (
        <Shelf title={t('dailyMixes')}>
          {mixes.map((mx) => (
            <Card
              key={mx.id}
              item={{ ...mx, thumb: mx.cover }}
              badge={state.pro.active ? '✦' : null}
              onPlay={() => p.playList(mx.tracks)}
              onOpen={() => p.playList(mx.tracks)}
              sub={state.pro.active ? `${mx.desc} · ${t('enhancedMix')}` : mx.desc}
            />
          ))}
        </Shelf>
      )}

      {show('foryou') && (
        <Shelf title={t('forYou')}>
          {forYouMixes.map((mx) => (
            <Card key={mx.id} item={{ ...mx, thumb: mx.cover }} onPlay={() => p.playList(mx.tracks)} onOpen={() => nav('/explore')} sub={mx.desc} />
          ))}
        </Shelf>
      )}

      {/* Radar de novedades (Spotify) — lanzamientos recientes */}
      {show('releases') && (
        <Shelf title={t('releaseRadar')} action={<button className="btn small" onClick={() => nav('/explore')}>{t('seeAll')}</button>}>
          {releases.map((al) => (
            <Card
              key={al.id}
              item={{ title: al.title, thumb: al.cover }}
              onPlay={() => p.playList(al.tracks)}
              onOpen={() => nav(`/album/${encodeURIComponent(al.title)}`)}
              sub={`${al.artist} · ${al.year}`}
            />
          ))}
        </Shelf>
      )}

      {/* Gráficos (YT Music / Apple Music) */}
      {show('charts') && (
        <Shelf title={<><Icon name="charts" size={18} /> {t('charts')}</>} action={<button className="btn small" onClick={() => nav('/charts')}>{t('seeAll')}</button>}>
          {charts.map((tr) => (
            <Card
              key={tr.id} item={tr}
              onPlay={() => p.playList(charts, tr.id)}
              onOpen={() => nav('/charts')}
              sub={formatViews(tr.views)}
            />
          ))}
        </Shelf>
      )}

      {/* Artistas seguidos + álbumes guardados */}
      {show('followed') && followed.length > 0 && (
        <Shelf title={t('following')}>
          {followed.map((a) => (
            <Card
              key={a.name}
              item={{ title: a.name, thumb: a.thumb }}
              round
              onPlay={() => p.playList(a.tracks)}
              onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
              sub={t('verified')}
            />
          ))}
        </Shelf>
      )}

      {show('saved') && savedAlbums.length > 0 && (
        <Shelf title={t('albums')}>
          {savedAlbums.map((tr) => (
            <Card
              key={tr.album}
              item={{ title: tr.album, thumb: tr.thumb }}
              onPlay={() => p.playList(TRACKS.filter((x) => x.album === tr.album))}
              onOpen={() => nav(`/album/${encodeURIComponent(tr.album)}`)}
              sub={`${tr.artist} · ${tr.year}`}
            />
          ))}
        </Shelf>
      )}

      {show('stations') && (
        <Shelf title={t('stations')}>
          {stations.map((st) => (
            <Card key={st.id} item={{ ...st, thumb: st.cover }} onPlay={() => p.playList(st.tracks)} onOpen={() => p.playList(st.tracks)} sub={st.desc} />
          ))}
        </Shelf>
      )}

      {show('newadd') && (
        <Shelf title={t('newAdditions')}>
          {added.map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playRadio(tr)} onOpen={() => p.playRadio(tr)} />
          ))}
        </Shelf>
      )}

      {show('trends') && (
        <section className="list-section">
          <div className="shelf-head">
            <h2>{t('trends')}</h2>
            <button className="btn small" onClick={() => nav('/charts')}><Icon name="charts" size={14} /> {t('seeAll')}</button>
          </div>
          {trends.map((tr, i) => (
            <TrackRow key={tr.id} track={tr} index={i} list={trends} />
          ))}
        </section>
      )}
    </div>
  );
}
