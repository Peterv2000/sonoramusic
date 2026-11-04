import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow, GenreGrid } from '../components/widgets.jsx';
import Icon from '../components/Icon.jsx';
import {
  MIXES, STATIONS, tracksByGenre,
  topCharts, newReleases, VIDEOS, ARTISTS, formatViews, nf,
} from '../data/catalog.js';
import { useLibraryData } from '../hooks/useLibraryData.js';
import { useApp } from '../state/AppState.jsx';
import { getPersonalizedByGenre } from '../ai/personalize.js';
import { categoryTag, fetchCategoryTracks, useCategories } from '../api/categories.js';

export default function Explore() {
  const p = usePlayer();
  const nav = useNavigate();
  const { t, lang } = useI18n();
  const { state } = useApp();
  const lib = useLibraryData();
  const all = Array.isArray(lib.tracks) && lib.tracks.length ? lib.tracks : null;
  const { categories, loading: categoriesLoading } = useCategories();
  const [genre, setGenre] = useState(null);
  const [remoteTracks, setRemoteTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(false);

  const category = categories.find((c) => c.id === genre) || null;

  useEffect(() => {
    if (!genre) { setRemoteTracks([]); return undefined; }
    let dead = false;
    setTracksLoading(true);
    setRemoteTracks([]);
    fetchCategoryTracks(genre)
      .then((tracks) => { if (!dead && tracks?.length) setRemoteTracks(tracks); })
      .finally(() => { if (!dead) setTracksLoading(false); });
    return () => { dead = true; };
  }, [genre]);

  // Si el administrador desactiva la categoría abierta, volvemos a la rejilla.
  useEffect(() => {
    if (genre && !categoriesLoading && !categories.some((c) => c.id === genre)) setGenre(null);
  }, [categories, categoriesLoading, genre]);

  const localForGenre = useMemo(() => {
    if (!genre) return [];
    const wanted = new Set((category?.genres || [genre]).map((g) => String(g).toLowerCase()));
    const base = all || tracksByGenre(genre);
    return base.filter((t) => wanted.has(String(t.genre || '').toLowerCase()));
  }, [all, category, genre]);

  const list = useMemo(() => {
    if (!genre) return [];
    // Mientras llegan las pistas limpias del API no mostramos el catálogo
    // local (puede contener recopilatorios); solo se usa si el API falla.
    let res = remoteTracks.length ? remoteTracks : (tracksLoading ? [] : localForGenre);
    const seen = new Set();
    res = res.filter((t) => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    return [...res].sort(() => Math.random() - 0.5);
  }, [genre, remoteTracks, localForGenre, tracksLoading]);

  const charts = topCharts('Global').slice(0, 10);
  const releases = newReleases();
  const videos = VIDEOS.slice(0, 12);
  const gridGenres = categories.map((c) => ({ ...c, tag: categoryTag(c, lang) }));

  const playCategory = async (id) => {
    const remote = await fetchCategoryTracks(id);
    const wanted = new Set((categories.find((c) => c.id === id)?.genres || [id]).map((g) => String(g).toLowerCase()));
    const local = (all || tracksByGenre(id)).filter((t) => wanted.has(String(t.genre || '').toLowerCase()));
    const l = remote?.length ? remote : local;
    if (l.length) p.playList(l);
  };

  return (
    <div className="page">
      <h1>{t('explore')}</h1>

      <GenreGrid
        genres={gridGenres}
        selected={genre}
        countOf={(id) => categories.find((c) => c.id === id)?.count || (all ? all.filter((t) => t.genre === id).length : tracksByGenre(id).length)}
        onPick={(id) => setGenre(genre === id ? null : id)}
        onPlay={playCategory}
      />

      {genre && (
        <section className="list-section">
          <div className="genre-hero" style={{ '--g': category?.color || 'var(--red)' }}>
            <img src={category?.cover} alt="" />
            <div className="genre-hero-text">
              <span className="genre-hero-kicker">{t('explore')}</span>
              <h2>{category?.label || genre}</h2>
              <small>{categoryTag(category, lang)} · {tracksLoading ? '…' : list.length} {t('songs')}</small>
            </div>
            <div className="head-actions">
              {list.length > 0 && (
                <>
                  <button className="btn primary" onClick={() => p.playList(list)}><Icon name="play" size={15} /> {t('playAll')}</button>
                  <button className="btn" onClick={() => p.playList([...list].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
                </>
              )}
            </div>
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
