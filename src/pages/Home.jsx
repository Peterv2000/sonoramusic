import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow, GenreGrid } from '../components/widgets.jsx';
import Icon from '../components/Icon.jsx';
import { formatViews, nf, trackById } from '../data/catalog.js';
import { fetchMoodTracks, useHomeFeed } from '../api/home.js';
import { categoryTag } from '../api/categories.js';

/* Cada píldora decide qué bloques del centro se muestran. */
const FILTER_SECTIONS = {
  all: null,
  music: new Set(['genres', 'discovery', 'recent', 'quick', 'mixes', 'foryou', 'releases', 'charts', 'stations', 'newadd', 'trends']),
  forYou: new Set(['discovery', 'quick', 'recent', 'mixes', 'foryou', 'stations', 'artists']),
  new: new Set(['releases', 'newadd', 'charts']),
  charts: new Set(['charts', 'trends']),
};

const FILTER_IDS = ['all', 'music', 'forYou', 'new', 'charts'];

export default function Home() {
  const { state } = useApp();
  const p = usePlayer();
  const nav = useNavigate();
  const loc = useLocation();
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('all');
  const [mood, setMood] = useState('');
  const [moodTracks, setMoodTracks] = useState([]);
  const [moodLoading, setMoodLoading] = useState(false);

  const { feed, loading, refresh } = useHomeFeed({
    userId: state.auth.userId || undefined,
    lang,
    enabled: true,
  });

  /* Cada visita a Inicio renueva el orden de secciones; el hook ya recarga al
     montar, así que aquí solo se limpian los filtros locales. */
  useEffect(() => {
    if (loc.pathname === '/') {
      setFilter('all');
      setMood('');
      setMoodTracks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key]);

  const sections = feed?.sections || {};
  const categories = feed?.categories || [];
  const moods = feed?.moods || [];

  /* Si el servidor aún no tiene historial, usa el historial local como apoyo. */
  const recent = useMemo(() => {
    if (sections.recent?.length) return sections.recent;
    return (state.library.history || [])
      .map((h) => trackById(h.id))
      .filter(Boolean)
      .slice(0, 10);
  }, [sections.recent, state.library.history]);

  const genres = useMemo(
    () => categories.slice(0, 8).map((c) => ({ ...c, tag: categoryTag(c, lang) })),
    [categories, lang],
  );

  const pickMood = async (label) => {
    if (!label) return;
    if (mood === label) {
      setMood('');
      setMoodTracks([]);
      return;
    }
    setMood(label);
    // Instantáneo: la portada ya trae una muestra de cada estado de ánimo.
    const instant = moods.find((m) => m.label === label)?.tracks || [];
    setMoodTracks(instant);
    setMoodLoading(true);
    try {
      const full = await fetchMoodTracks(label);
      if (full.length) setMoodTracks(full);
    } finally {
      setMoodLoading(false);
    }
  };

  const show = (key) => !FILTER_SECTIONS[filter] || FILTER_SECTIONS[filter].has(key);

  const greeting = (() => {
    const h = new Date().getHours();
    const es = lang === 'es';
    if (h < 6) return es ? 'Buenas noches' : 'Good evening';
    if (h < 12) return es ? 'Buenos días' : 'Good morning';
    if (h < 20) return es ? 'Buenas tardes' : 'Good afternoon';
    return es ? 'Buenas noches' : 'Good evening';
  })();

  if (!feed && loading) {
    return (
      <div className="page">
        <h1 className="greeting">{greeting}, {state.profile.name || t('guest')}</h1>
        <div className="home-skeleton" aria-busy="true" aria-label={t('loading') || 'Cargando'}>
          <span /><span /><span /><span /><span /><span />
        </div>
      </div>
    );
  }

  const discovery = sections.discovery || [];
  const quickPicks = sections.quickPicks || [];
  const mixes = sections.mixes || [];
  const forYou = sections.forYou?.length ? sections.forYou : mixes;
  const releases = sections.releases || [];
  const charts = sections.charts || [];
  const stations = sections.stations || [];
  const newAdditions = sections.newAdditions || [];
  const trends = sections.trends || [];
  const artists = sections.artists || [];
  const videos = sections.videos || [];

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
        <button className="btn small home-renew" onClick={() => { setMood(''); setMoodTracks([]); refresh(); }} title={t('renew')}>
          <Icon name="shuffle" size={14} /> {t('renew')}
        </button>
      </div>

      {/* Chips de estados de ánimo: filtran todo el catálogo al instante */}
      <div className="chip-row">
        {moods.map((m) => (
          <button
            key={m.label}
            className={`chip ${mood === m.label ? 'on' : ''}`}
            onClick={() => pickMood(m.label)}
            aria-pressed={mood === m.label}
          >
            {m.label}
            {m.count > 0 && <span className="chip-count">{m.count}</span>}
          </button>
        ))}
      </div>

      {mood && (
        <section className="list-section mood-section">
          <div className="shelf-head">
            <h2>{mood} <small className="muted">· {moodLoading ? '…' : moodTracks.length} {t('songs')}</small></h2>
            <div className="head-actions">
              <button className="btn primary" disabled={!moodTracks.length} onClick={() => p.playList(moodTracks)}>
                <Icon name="play" size={15} /> {t('playAll')}
              </button>
              <button className="btn" disabled={!moodTracks.length} onClick={() => p.playList([...moodTracks].sort(() => Math.random() - 0.5))}>
                <Icon name="shuffle" size={15} /> {t('shuffle')}
              </button>
              <button className="btn small" onClick={() => { setMood(''); setMoodTracks([]); }}>{t('close') || 'Cerrar'}</button>
            </div>
          </div>
          {moodTracks.slice(0, 12).map((tr, i) => (
            <TrackRow key={tr.id} track={tr} index={i} list={moodTracks} showAlbum />
          ))}
        </section>
      )}

      {/* Categorías dinámicas, ordenadas por lo que el usuario escucha */}
      {show('genres') && genres.length > 0 && (
        <section className="shelf">
          <div className="shelf-head">
            <h2>{t('genres')}</h2>
            <button className="btn small" onClick={() => nav('/explore')}>{t('seeAll')}</button>
          </div>
          <GenreGrid
            genres={genres}
            countOf={(id) => categories.find((c) => c.id === id)?.count || 0}
            onPick={(id) => nav('/explore', { state: { categoryId: id } })}
            onPlay={(id) => {
              const cat = categories.find((c) => c.id === id);
              if (cat?.tracks?.length) p.playList(cat.tracks);
            }}
          />
        </section>
      )}

      {/* Descubrimiento — rota en cada visita */}
      {show('discovery') && discovery.length > 0 && (
        <section className="spotlight spotlight-modern" onClick={() => p.playList(discovery)}>
          <div className="spotlight-art">
            <img src={discovery[0]?.thumb} alt="" />
            <img src={discovery[4 % discovery.length]?.thumb} alt="" />
            <img src={discovery[8 % discovery.length]?.thumb} alt="" />
            <img src={discovery[12 % discovery.length]?.thumb} alt="" />
          </div>
          <div className="spotlight-body">
            <span className="spotlight-tag">✦ {t('discoverWeekly')}</span>
            <h2>{t('discoverWeekly')}</h2>
            <p className="muted">{t('discoverSub')} · {discovery.length} {t('songs')}</p>
            <div className="head-actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn primary" onClick={() => p.playList(discovery)}><Icon name="play" size={15} /> {t('play')}</button>
              <button className="btn" onClick={() => p.playList([...discovery].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
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

      {show('quick') && quickPicks.length > 0 && (
        <Shelf title={t('quickPicks')}>
          {quickPicks.map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playList(quickPicks, tr.id)} onOpen={() => p.playRadio(tr)} sub={tr.artist} />
          ))}
        </Shelf>
      )}

      {show('mixes') && mixes.length > 0 && (
        <Shelf title={t('dailyMixes')}>
          {mixes.map((mx) => (
            <Card
              key={mx.id}
              item={{ ...mx, thumb: mx.cover }}
              badge={state.pro.active ? '✦' : null}
              onPlay={() => p.playList(mx.tracks)}
              onOpen={() => p.playRadio(mx.tracks[0])}
              sub={state.pro.active ? `${mx.desc} · ${t('enhancedMix')}` : mx.desc}
            />
          ))}
        </Shelf>
      )}

      {show('foryou') && forYou.length > 0 && (
        <Shelf title={t('forYou')}>
          {forYou.map((mx) => (
            <Card key={mx.id} item={{ ...mx, thumb: mx.cover }} onPlay={() => p.playList(mx.tracks)} onOpen={() => nav('/explore')} sub={mx.desc} />
          ))}
        </Shelf>
      )}

      {show('releases') && releases.length > 0 && (
        <Shelf title={t('releaseRadar')} action={<button className="btn small" onClick={() => nav('/explore')}>{t('seeAll')}</button>}>
          {releases.map((al) => (
            <Card
              key={al.id}
              item={{ title: al.title, thumb: al.cover }}
              onPlay={() => p.playList(al.tracks)}
              onOpen={() => nav(`/album/${encodeURIComponent(al.title)}`)}
              sub={`${al.artist}${al.year ? ' · ' + al.year : ''}`}
            />
          ))}
        </Shelf>
      )}

      {show('charts') && charts.length > 0 && (
        <Shelf title={<><Icon name="charts" size={18} /> {t('charts')}</>} action={<button className="btn small" onClick={() => nav('/charts')}>{t('seeAll')}</button>}>
          {charts.slice(0, 10).map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playList(charts, tr.id)} onOpen={() => nav('/charts')} sub={formatViews(tr.views)} />
          ))}
        </Shelf>
      )}

      {show('stations') && stations.length > 0 && (
        <Shelf title={t('stations')}>
          {stations.map((st) => (
            <Card key={st.id} item={{ ...st, thumb: st.cover }} onPlay={() => p.playList(st.tracks)} onOpen={() => p.playRadio(st.tracks[0])} sub={st.desc} />
          ))}
        </Shelf>
      )}

      {show('artists') && artists.length > 0 && (
        <Shelf title={t('artists')}>
          {artists.map((a) => (
            <Card
              key={a.id || a.name}
              item={{ title: a.name, thumb: a.thumb }}
              round
              onPlay={() => p.playList(a.tracks)}
              onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
              sub={`${nf.format(a.listeners || 0)} ${t('listeners')}`}
            />
          ))}
        </Shelf>
      )}

      {show('newadd') && newAdditions.length > 0 && (
        <Shelf title={t('newAdditions')}>
          {newAdditions.map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playRadio(tr)} onOpen={() => p.playRadio(tr)} />
          ))}
        </Shelf>
      )}

      {show('trends') && trends.length > 0 && (
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
