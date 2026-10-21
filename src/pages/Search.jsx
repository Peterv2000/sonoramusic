import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import { TRACKS, MIXES, STATIONS, ALBUMS, ARTISTS, trackById, nf } from '../data/catalog.js';
import { searchYouTube, parseYouTubeId, trackFromYouTubeId } from '../api/youtubeSearch.js';
import { getCatalog, warmLookup } from '../api/liveData.js';
import Icon from '../components/Icon.jsx';

export { parseYouTubeId };

const FILTERS = ['all', 'songs', 'videos', 'albums', 'artists', 'playlists', 'stations'];

/* Sección «Resultados de YouTube»: busca en TODO YouTube (no solo el catálogo).
   Si el servidor ya tiene esa búsqueda en caché caliente, aparece al instante. */
function YouTubeResults({ query, onPlay, onPlayAll }) {
  const { t } = useI18n();
  const [items, setItems] = useState(null); // null = cargando
  const [instant, setInstant] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const id = ++reqRef.current;
    setItems(null);
    setInstant(false);
    let alive = true;
    (async () => {
      // 1) caché caliente del servidor → respuesta inmediata
      const warm = await warmLookup(query);
      if (alive && id === reqRef.current && warm) {
        setItems(warm);
        setInstant(true);
        return;
      }
      // 2) si no, búsqueda real en YouTube
      const list = await searchYouTube(query);
      if (alive && id === reqRef.current) setItems(list);
    })();
    return () => { alive = false; };
  }, [query]);

  if (items === null) {
    return (
      <section className="list-section">
        <div className="shelf-head"><h2><Icon name="play" size={15} /> YouTube</h2></div>
        <div className="yt-skel">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="yt-skel-row" />)}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="list-section">
      <div className="shelf-head">
        <h2><Icon name="play" size={15} /> YouTube · {items.length} {t('songs')}{instant && <span className="live-badge"><Icon name="lightning" size={12} /> {t('instant')}</span>}</h2>
        <button className="btn primary" onClick={() => onPlayAll(items)}><Icon name="play" size={15} /> {t('playAll')}</button>
      </div>
      {items.map((tr, i) => (
        <TrackRow key={tr.id} track={tr} index={i} list={items} onPlay={() => onPlay(items, tr.id)} />
      ))}
    </section>
  );
}

export default function Search() {
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const nav = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState('all');
  const [debounced, setDebounced] = useState('');
  const [liveTracks, setLiveTracks] = useState([]);

  const query = q.trim().toLowerCase();

  /* Carga el catálogo ampliado que refresca el servidor (si está disponible) */
  useEffect(() => {
    let alive = true;
    getCatalog().then((c) => { if (alive && c?.tracks?.length) setLiveTracks(c.tracks); });
    return () => { alive = false; };
  }, []);

  /* Retardo de 400 ms: evita buscar en YouTube con cada tecla */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setDebounced(''); return; }
    const id = setTimeout(() => setDebounced(term), 400);
    return () => clearTimeout(id);
  }, [q]);

  const results = useMemo(() => {
    const empty = { songs: [], videos: [], mixes: [], albums: [], artists: [], playlists: [], stations: [] };
    if (!query) return empty;
    const hit = (s) => s.toLowerCase().includes(query);
    // Catálogo curado + catálogo en vivo (sin duplicar por id)
    const all = [...TRACKS, ...liveTracks.filter((tr) => !TRACKS.some((x) => x.id === tr.id))];
    const songs = all.filter((tr) => [tr.title, tr.artist, tr.album, tr.genre, ...(tr.moods || [])].join(' ').toLowerCase().includes(query));
    return {
      songs,
      videos: songs.filter((tr) => !tr.live),
      mixes: MIXES.filter((mx) => hit(`${mx.title} ${mx.desc}`)),
      albums: ALBUMS.filter((al) => hit(`${al.title} ${al.artist} ${al.year}`)),
      artists: ARTISTS.filter((a) => hit(`${a.name} ${a.genre}`)),
      playlists: state.library.playlists.filter((pl) => hit(`${pl.name} ${pl.desc || ''}`)),
      stations: STATIONS.filter((st) => hit(`${st.title} ${st.desc}`)),
    };
  }, [query, state.library.playlists, liveTracks]);

  const totalHits = results.songs.length + results.mixes.length + results.albums.length +
    results.artists.length + results.playlists.length + results.stations.length;

  const show = (k) => (filter === 'all' || filter === k) && results[k]?.length > 0;

  const onSearch = (value) => {
    setQ(value);
    if (value.trim().length > 2) dispatch({ type: 'add-search', q: value.trim() });
  };

  const playPasted = () => {
    const id = parseYouTubeId(url);
    if (!id) { toast(t('urlHint')); return; }
    const tk = trackFromYouTubeId(id, `YouTube · ${id}`, 'Enlace pegado');
    p.playList([tk], tk.id);
    setUrl('');
    toast('▶ ' + tk.title);
  };

  return (
    <div className="page">
      <h1>{t('search')}</h1>
      <div className="search-input-wrap">
        <input
          className="search-input"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setDebounced(q.trim()); }}
          placeholder={t('searchPlaceholder')}
          autoFocus
        />
        {q && <button className="icon-btn clear-x" onClick={() => setQ('')}><Icon name="close" size={16} /></button>}
      </div>

      {!query && (
        <>
          {state.library.recentSearches.length > 0 && (
            <section className="list-section">
              <h2><Icon name="history" size={16} /> </h2>
              <div className="chip-row">
                {state.library.recentSearches.map((s) => (
                  <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>
                ))}
                <button className="chip danger" onClick={() => dispatch({ type: 'clear-searches' })}><Icon name="close" size={14} /> {t('clearSearches')}</button>
              </div>
            </section>
          )}

          <section className="paste-box">
            <h3><Icon name="link" size={16} /> {t('pasteURL')}</h3>
            <p className="muted">{t('urlHint')}</p>
            <div className="paste-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') playPasted(); }}
                placeholder="https://youtube.com/watch?v=…"
              />
              <button className="btn primary" onClick={playPasted}><Icon name="play" size={15} /></button>
            </div>
          </section>

          <section className="list-section">
            <h2>{t('searchYouTube')} <Icon name="globe" size={18} /></h2>
            <p className="muted">{t('searchYouTubeHint')}</p>
            <div className="chip-row">
              {['Bad Bunny', 'Metallica', 'Taylor Swift', 'Queen', 'Dua Lipa', 'Karol G', 'The Weeknd', 'Shakira'].map((s) => (
                <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>
              ))}
            </div>
          </section>

          <section className="list-section">
            <h2>{t('topCharts')}</h2>
            <div className="chip-row">
              {['Pop', 'Rock', 'Latino', 'Electrónica', 'Lo-Fi', 'Adele', 'Ed Sheeran'].map((s) => (
                <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>
              ))}
            </div>
          </section>
        </>
      )}

      {query && (
        <>
          <div className="chip-row search-filters">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`chip ${filter === f ? 'on' : ''}`}
                onClick={() => setFilter(f)}
              >{t(`filter_${f}`)}</button>
            ))}
          </div>

          {totalHits === 0 && debounced === '' && (
            <div className="empty-box">
              <p><Icon name="search" size={16} /> {t('noResults')}</p>
              <small>{t('searchYouTubeHint')}</small>
            </div>
          )}

          {show('songs') && (
            <section className="list-section">
              <div className="shelf-head">
                <h2>{t('songs')}</h2>
                <button className="btn primary" onClick={() => p.playList(results.songs)}><Icon name="play" size={15} /> {t('playAll')}</button>
              </div>
              {results.songs.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={results.songs} showAlbum />)}
            </section>
          )}

          {show('videos') && (
            <Shelf title={t('videos')}>
              {results.videos.map((tr) => (
                <Card
                  key={tr.id}
                  item={tr}
                  badge="▶"
                  onPlay={() => p.playList(results.videos, tr.id)}
                  onOpen={() => p.playList(results.videos, tr.id)}
                  sub={`${tr.artist} · ${t('officialVideo')}`}
                />
              ))}
            </Shelf>
          )}

          {show('albums') && (
            <Shelf title={t('albums')}>
              {results.albums.map((al) => (
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

          {show('artists') && (
            <Shelf title={t('artists')}>
              {results.artists.map((a) => (
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
          )}

          {show('playlists') && (
            <Shelf title={t('playlists')}>
              {results.playlists.map((pl) => (
                <Card
                  key={pl.id}
                  item={{ title: pl.name, thumb: pl.cover }}
                  onPlay={() => p.playList(pl.tracks.map(trackById).filter(Boolean))}
                  onOpen={() => nav(`/playlist/${pl.id}`)}
                  sub={`${pl.tracks.length} ${t('songs')}`}
                />
              ))}
            </Shelf>
          )}

          {show('stations') && (
            <Shelf title={t('stations')}>
              {results.stations.map((st) => (
                <Card
                  key={st.id}
                  item={{ title: st.title, thumb: st.cover }}
                  onPlay={() => p.playList(st.tracks)}
                  onOpen={() => p.playList(st.tracks)}
                  sub={st.desc}
                />
              ))}
            </Shelf>
          )}

          {/* ── Búsqueda REAL en YouTube (cualquier canción/artista) ── */}
          {debounced && (filter === 'all' || filter === 'songs' || filter === 'videos') && (
            <YouTubeResults
              query={debounced}
              onPlay={(list, id) => p.playList(list, id)}
              onPlayAll={(list) => p.playList(list)}
            />
          )}
        </>
      )}
    </div>
  );
}
