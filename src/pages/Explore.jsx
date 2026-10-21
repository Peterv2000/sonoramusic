import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import Icon from '../components/Icon.jsx';
import {
  GENRES, MIXES, STATIONS, tracksByGenre,
  topCharts, newReleases, VIDEOS, ARTISTS, formatViews, nf,
} from '../data/catalog.js';

export default function Explore() {
  const p = usePlayer();
  const nav = useNavigate();
  const { t } = useI18n();
  const [genre, setGenre] = useState(null);
  const list = genre ? tracksByGenre(genre) : [];

  const charts = topCharts('Global').slice(0, 10);
  const releases = newReleases();
  const videos = VIDEOS.slice(0, 12);

  return (
    <div className="page">
      <h1>{t('explore')}</h1>

      <div className="genre-grid">
        {GENRES.map((g) => (
          <button
            key={g.id}
            className={`genre-tile ${genre === g.id ? 'sel' : ''}`}
            style={{ '--g': g.color }}
            onClick={() => setGenre(genre === g.id ? null : g.id)}
          >{g.id}</button>
        ))}
      </div>

      {genre && (
        <section className="list-section">
          <div className="shelf-head">
            <h2>{genre} · {list.length} {t('songs')}</h2>
            {list.length > 0 && (
              <div className="head-actions">
                <button className="btn primary" onClick={() => p.playList(list)}><Icon name="play" size={15} /> {t('playAll')}</button>
                <button className="btn" onClick={() => p.playList([...list].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
              </div>
            )}
          </div>
          {list.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={list} showAlbum />)}
        </section>
      )}

      {/* Gráficos (YT Music) */}
      <Shelf title={<><Icon name="charts" size={18} /> {t('charts')}</>} action={<button className="btn small" onClick={() => nav('/charts')}>{t('seeAll')}</button>}>
        {charts.map((tr, i) => (
          <div key={tr.id} className="chart-mini" onClick={() => p.playList(charts, tr.id)}>
            <span className="rank">{i + 1}</span>
            <img src={tr.thumb} alt="" loading="lazy" />
            <div className="chart-meta">
              <strong>{tr.title}</strong>
              <small>{tr.artist} · {formatViews(tr.views)}</small>
            </div>
          </div>
        ))}
      </Shelf>

      {/* Vídeos musicales (YT Music) */}
      <Shelf title={<><Icon name="video" size={18} /> {t('videos')}</>}>
        {videos.map((tr) => (
          <Card
            key={tr.id}
            item={tr}
            badge="▶"
            onPlay={() => p.playList(videos, tr.id)}
            onOpen={() => p.playList(videos, tr.id)}
            sub={`${tr.artist} · ${t('officialVideo')}`}
          />
        ))}
      </Shelf>

      {/* Novedades (Apple Music) */}
      <Shelf title={<><Icon name="sparkles" size={18} /> {t('releaseRadar')}</>} action={<button className="btn small" onClick={() => nav('/charts')}>{t('seeAll')}</button>}>
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

      {/* Artistas populares */}
      <Shelf title={t('artists')}>
        {ARTISTS.slice(0, 10).map((a) => (
          <Card
            key={a.name}
            item={{ title: a.name, thumb: a.thumb }}
            round
            onPlay={() => p.playList(a.tracks)}
            onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
            sub={`${nf.format(a.listeners)} ${t('listeners')}`}
          />
        ))}
      </Shelf>

      <Shelf title={t('forYou')}>
        {MIXES.map((mx) => (
          <Card key={mx.id} item={{ ...mx, thumb: mx.cover }} onPlay={() => p.playList(mx.tracks)} onOpen={() => p.playList(mx.tracks)} sub={mx.desc} />
        ))}
      </Shelf>

      <Shelf title={t('stations')}>
        {STATIONS.map((st) => (
          <Card key={st.id} item={{ ...st, thumb: st.cover }} onPlay={() => p.playList(st.tracks)} onOpen={() => p.playList(st.tracks)} sub={st.desc} />
        ))}
      </Shelf>
    </div>
  );
}
