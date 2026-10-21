import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import Icon from '../components/Icon.jsx';
import {
  TRACKS, MIXES, STATIONS, MOODS, tracksByMood, trackById,
  weeklyDiscovery, dailyMixes, newReleases, topCharts, ARTISTS, formatViews,
} from '../data/catalog.js';

export default function Home() {
  const { state } = useApp();
  const p = usePlayer();
  const nav = useNavigate();
  const { t } = useI18n();

  const recent = useMemo(
    () => state.library.history.map((h) => trackById(h.id)).filter(Boolean).slice(0, 10),
    [state.library.history]
  );
  const quickPicks = useMemo(() => {
    const pool = state.library.liked.length
      ? state.library.liked.map(trackById).filter(Boolean)
      : TRACKS.slice(0, 6);
    return pool.slice(0, 6);
  }, [state.library.liked]);
  const added = useMemo(() => TRACKS.slice(-10).reverse(), []);

  // Spotify: Descubrimiento semanal + Mezclas diarias · Apple: Para ti
  const discovery = useMemo(() => weeklyDiscovery(), []);
  const mixes = useMemo(() => dailyMixes(), []);
  const releases = useMemo(() => newReleases(), []);
  const charts = useMemo(() => topCharts('Global').slice(0, 5), []);
  const followed = useMemo(
    () => state.library.followedArtists
      .map((n) => ARTISTS.find((a) => a.name === n))
      .filter(Boolean)
    , [state.library.followedArtists]
  );
  const savedAlbums = useMemo(
    () => state.library.savedAlbums
      .map((title) => TRACKS.find((tr) => tr.album === title))
      .filter(Boolean)
    , [state.library.savedAlbums]
  );

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
      <h1 className="greeting">{greeting}, {state.profile.name} {state.pro.active && <span className="badge-pro">✦ {t('proBadge')}</span>}</h1>

      {/* Chips de estados de ánimo */}
      <div className="chip-row">
        {MOODS.slice(0, 8).map((m) => (
          <button
            key={m}
            className="chip"
            onClick={() => {
              const list = tracksByMood(m);
              if (list.length) p.playList(list, list[0].id);
            }}
          >{m}</button>
        ))}
      </div>

      {/* Descubrimiento semanal (Spotify) — renueva cada lunes */}
      <section className="spotlight" onClick={() => p.playList(discovery)}>
        <div className="spotlight-art">
          <img src={discovery[0]?.thumb} alt="" />
          <img src={discovery[4]?.thumb} alt="" />
          <img src={discovery[8]?.thumb} alt="" />
          <img src={discovery[12]?.thumb} alt="" />
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

      {recent.length > 0 && (
        <Shelf title={t('recent')}>
          {recent.map((tr) => (
            <Card key={tr.id} item={tr} onPlay={() => p.playRadio(tr)} onOpen={() => p.playRadio(tr)} />
          ))}
        </Shelf>
      )}

      <Shelf title={t('quickPicks')}>
        {quickPicks.map((tr) => (
          <Card
            key={tr.id} item={tr}
            onPlay={() => p.playList(quickPicks, tr.id)}
            onOpen={() => p.playRadio(tr)}
            sub={`${tr.artist} · ${t('songs')}`}
          />
        ))}
      </Shelf>

      {/* Mezclas diarias (Spotify) / Para ti (Apple) */}
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

      <Shelf title={t('forYou')}>
        {MIXES.map((mx) => (
          <Card key={mx.id} item={{ ...mx, thumb: mx.cover }} onPlay={() => p.playList(mx.tracks)} onOpen={() => nav('/explore')} sub={mx.desc} />
        ))}
      </Shelf>

      {/* Radar de novedades (Spotify) — lanzamientos recientes */}
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

      {/* Gráficos (YT Music / Apple Music) */}
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

      {/* Artistas seguidos + álbumes guardados */}
      {followed.length > 0 && (
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

      {savedAlbums.length > 0 && (
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

      <Shelf title={t('stations')}>
        {STATIONS.map((st) => (
          <Card key={st.id} item={{ ...st, thumb: st.cover }} onPlay={() => p.playList(st.tracks)} onOpen={() => p.playList(st.tracks)} sub={st.desc} />
        ))}
      </Shelf>

      <Shelf title={t('newAdditions')}>
        {added.map((tr) => (
          <Card key={tr.id} item={tr} onPlay={() => p.playRadio(tr)} onOpen={() => p.playRadio(tr)} />
        ))}
      </Shelf>

      <section className="list-section">
        <div className="shelf-head">
          <h2>{t('trends')}</h2>
          <button className="btn small" onClick={() => nav('/charts')}><Icon name="charts" size={14} /> {t('seeAll')}</button>
        </div>
        {TRACKS.slice(0, 8).map((tr, i) => (
          <TrackRow key={tr.id} track={tr} index={i} list={TRACKS.slice(0, 8)} />
        ))}
      </section>
    </div>
  );
}
