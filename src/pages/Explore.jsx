import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow, GenreGrid } from '../components/widgets.jsx';
import Icon from '../components/Icon.jsx';
import { tracksByGenre, formatViews, nf } from '../data/catalog.js';
import { useApp } from '../state/AppState.jsx';
import { categoryTag, fetchCategoryTracks, useCategories } from '../api/categories.js';
import { listeningProfile, weightedShuffle } from '../state/listeningHistory.js';
import { useHomeFeed } from '../api/home.js';

/* Cuántas filas se pintan de cada categoría. Se descargan hasta 300 y se
   muestran 150 barajadas según lo escuchado: la lista cambia en cada visita. */
const DISPLAY_LIMIT = 150;

export default function Explore() {
  const p = usePlayer();
  const nav = useNavigate();
  const loc = useLocation();
  const { t, lang } = useI18n();
  const { state } = useApp();
  const { categories: remoteCategories, loading: categoriesLoading } = useCategories();
  const { feed } = useHomeFeed({ userId: state.auth.userId || undefined, lang });
  const [genre, setGenre] = useState(loc.state?.categoryId || null);
  const [remoteTracks, setRemoteTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  /* Cambia cuando el usuario pide «Renovar» o entra de nuevo a la categoría:
     fuerza una mezcla nueva sin recargar la página. */
  const [mixSeed, setMixSeed] = useState(0);

  /* La portada trae las categorías ya ordenadas por escucha; si aún no llegó,
     se usa la lista en vivo del API (nunca datos estáticos). */
  const categories = useMemo(
    () => (feed?.categories?.length ? feed.categories : remoteCategories),
    [feed?.categories, remoteCategories],
  );

  const category = categories.find((c) => c.id === genre) || null;

  useEffect(() => {
    if (loc.state?.categoryId) setGenre(loc.state.categoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.state?.categoryId]);

  useEffect(() => {
    if (!genre) { setRemoteTracks([]); return undefined; }
    let dead = false;
    setTracksLoading(true);
    setRemoteTracks([]);
    /* Siempre positiva: `^` devuelve un int32 con signo y una semilla negativa
       rompería la mezcla ponderada. */
    const seed = (((Date.now() ^ (mixSeed || 0)) >>> 0) % 2147483647) || 1;
    fetchCategoryTracks(genre, { limit: 300, seed, userId: state.auth.userId || '' })
      .then((tracks) => {
        if (dead || !tracks?.length) return;
        /* Mezcla ponderada por el historial local: sube lo que el usuario
           escucha últimamente y hunde lo que acaba de sonar. */
        const ordered = weightedShuffle(tracks, {
          profile: listeningProfile(),
          seed: seed ^ 0x9e3779b9,
          limit: DISPLAY_LIMIT,
        });
        setRemoteTracks(ordered.length ? ordered : tracks.slice(0, DISPLAY_LIMIT));
      })
      .finally(() => { if (!dead) setTracksLoading(false); });
    return () => { dead = true; };
  }, [genre, mixSeed, state.auth.userId]);

  // Si el administrador desactiva la categoría abierta, volvemos a la rejilla.
  useEffect(() => {
    if (genre && !categoriesLoading && categories.length && !categories.some((c) => c.id === genre)) setGenre(null);
  }, [categories, categoriesLoading, genre]);

  const localForGenre = useMemo(() => {
    if (!genre) return [];
    const wanted = new Set((category?.genres || [genre]).map((g) => String(g).toLowerCase()));
    return tracksByGenre(genre).filter((t) => wanted.has(String(t.genre || '').toLowerCase()));
  }, [category, genre]);

  const list = useMemo(() => {
    if (!genre) return [];
    // Mientras llegan las pistas limpias del API no mostramos el catálogo
    // local (puede contener recopilatorios); solo se usa si el API falla.
    const res = remoteTracks.length ? remoteTracks : (tracksLoading ? [] : localForGenre);
    const seen = new Set();
    return [...res].filter((t) => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [genre, remoteTracks, localForGenre, tracksLoading]);

  const sections = feed?.sections || {};
  const charts = (sections.charts || []).slice(0, 10);
  const releases = sections.releases || [];
  const videos = sections.videos || [];
  const artists = sections.artists || [];
  const mixes = sections.mixes || [];
  const stations = sections.stations || [];
  const gridGenres = categories.map((c) => ({ ...c, tag: categoryTag(c, lang) }));

  const playCategory = async (id) => {
    const seed = ((Date.now() % 2147483647) || 1);
    const remote = await fetchCategoryTracks(id, { limit: 300, seed, userId: state.auth.userId || '' });
    const wanted = new Set((categories.find((c) => c.id === id)?.genres || [id]).map((g) => String(g).toLowerCase()));
    const local = tracksByGenre(id).filter((t) => wanted.has(String(t.genre || '').toLowerCase()));
    const base = remote?.length ? remote : local;
    const l = weightedShuffle(base, {
      profile: listeningProfile(),
      seed: seed ^ 0x9e3779b9,
      limit: DISPLAY_LIMIT,
    });
    if (l.length) p.playList(l);
  };

  const renewMix = () => setMixSeed(Date.now());
  const playShuffled = () => {
    if (!list.length) return;
    p.playList(weightedShuffle(list, {
      profile: listeningProfile(),
      seed: Date.now(),
      limit: list.length,
    }));
  };

  return (
    <div className="page">
      <h1>{t('explore')}</h1>

      <GenreGrid
        genres={gridGenres}
        selected={genre}
        countOf={(id) => categories.find((c) => c.id === id)?.count || tracksByGenre(id).length}
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
                  <button className="btn" onClick={playShuffled}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
                  <button className="btn" onClick={renewMix} disabled={tracksLoading}><Icon name="refresh" size={15} /> {t('renew')}</button>
                </>
              )}
            </div>
          </div>
          {list.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={list} showAlbum />)}
        </section>
      )}

      {charts.length > 0 && (
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
      )}

      {videos.length > 0 && (
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
      )}

      {releases.length > 0 && (
        <Shelf title={<><Icon name="sparkles" size={18} /> {t('releaseRadar')}</>} action={<button className="btn small" onClick={() => nav('/charts')}>{t('seeAll')}</button>}>
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

      {artists.length > 0 && (
        <Shelf title={t('artists')}>
          {artists.slice(0, 10).map((a) => (
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

      {mixes.length > 0 && (
        <Shelf title={t('forYou')}>
          {mixes.map((mx) => (
            <Card key={mx.id} item={{ ...mx, thumb: mx.cover }} onPlay={() => p.playList(mx.tracks)} onOpen={() => p.playList(mx.tracks)} sub={mx.desc} />
          ))}
        </Shelf>
      )}

      {stations.length > 0 && (
        <Shelf title={t('stations')}>
          {stations.map((st) => (
            <Card key={st.id} item={{ ...st, thumb: st.cover }} onPlay={() => p.playList(st.tracks)} onOpen={() => p.playList(st.tracks)} sub={st.desc} />
          ))}
        </Shelf>
      )}
    </div>
  );
}
