import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import { TRACKS, MIXES, STATIONS, ALBUMS, ARTISTS, trackById, nf } from '../data/catalog.js';
import {
  searchYouTube, suggestYouTube, parseYouTubeId, trackFromYouTubeId,
} from '../api/youtubeSearch.js';
import { getCatalog, warmLookup } from '../api/liveData.js';
import Icon from '../components/Icon.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

export { parseYouTubeId };

const FILTERS = ['all', 'songs', 'videos', 'albums', 'artists', 'playlists', 'stations'];

/* Resultados en vivo del catálogo global (búsqueda real, profunda).
   Si el servidor ya tiene esa búsqueda en caché caliente, aparece al instante. */
function LiveResults({ query, deep, onPlay, onPlayAll }) {
  const { t } = useI18n();
  const [items, setItems] = useState(null); // null = cargando
  const [instant, setInstant] = useState(false);
  const reqRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const id = ++reqRef.current;
    setItems(null);
    setInstant(false);
    (async () => {
      try {
        // 1) caché caliente del servidor → respuesta inmediata (solo búsqueda normal)
        if (!deep) {
          try {
            const warm = await warmLookup(query).catch(() => null);
            if (aliveRef.current && id === reqRef.current && Array.isArray(warm) && warm.length) {
              setItems(warm);
              setInstant(true);
              return;
            }
          } catch {}
        }
        // 2) búsqueda real (profunda si se pidió)
        try {
          const list = await searchYouTube(query, { deep }).catch(() => []);
          if (aliveRef.current && id === reqRef.current) {
            setItems(Array.isArray(list) ? list : []);
          }
        } catch {
          if (aliveRef.current && id === reqRef.current) setItems([]);
        }
      } catch {
        if (aliveRef.current && id === reqRef.current) setItems([]);
      }
    })();
    return () => { aliveRef.current = false; };
  }, [query, deep]);

  if (items === null) {
    return (
      <section className="list-section">
        <div className="shelf-head">
          <h2><Icon name="lightning" size={15} /> {t('searchYouTube')}</h2>
        </div>
        <div className="yt-skel">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="yt-skel-row" />)}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  // Separa canales y playlists de las canciones para mostrarlos aparte.
  const songs = items.filter((x) => (x.kind || 'video') === 'video');
  const channels = items.filter((x) => x.kind === 'channel');
  const lists = items.filter((x) => x.kind === 'playlist');

  return (
    <>
      {songs.length > 0 && (
        <section className="list-section">
          <div className="shelf-head">
            <h2>
              <Icon name="lightning" size={15} /> {t('searchYouTube')}
              <span className="count-badge">{songs.length}</span>
              {deep && <span className="live-badge deep"><Icon name="globe" size={12} /> {t('deepSearchOn')}</span>}
              {instant && !deep && <span className="live-badge"><Icon name="lightning" size={12} /> {t('instant')}</span>}
            </h2>
            <button className="btn primary" onClick={() => onPlayAll(items)}><Icon name="play" size={15} /> {t('playAll')}</button>
          </div>
          {songs.map((tr, i) => (
            <TrackRow key={tr.id} track={tr} index={i} list={items} onPlay={() => onPlay(items, tr.id)} />
          ))}
        </section>
      )}

      {channels.length > 0 && (
        <Shelf title={t('artists')}>
          {channels.map((ch) => (
            <Card
              key={ch.id}
              item={ch}
              round
              onOpen={() => onPlay([ch], ch.id)}
              onPlay={() => onPlay([ch], ch.id)}
              sub={t('officialVideo')}
            />
          ))}
        </Shelf>
      )}

      {lists.length > 0 && (
        <Shelf title={t('playlists')}>
          {lists.map((pl) => (
            <Card
              key={pl.id}
              item={pl}
              onOpen={() => onPlay([pl], pl.id)}
              onPlay={() => onPlay([pl], pl.id)}
              sub={pl.artist && pl.artist !== 'Lista' ? pl.artist : t('playlists')}
            />
          ))}
        </Shelf>
      )}
    </>
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
  const [deep, setDeep] = useState(false);
  const [liveTracks, setLiveTracks] = useState([]);
  const [sugg, setSugg] = useState([]);
  const [suggOpen, setSuggOpen] = useState(false);
  const suggReq = useRef(0);
  const boxRef = useRef(null);

  const query = q.trim().toLowerCase();

  /* Carga el catálogo ampliado que refresca el servidor (si está disponible) */
  useEffect(() => {
    let alive = true;
    getCatalog().then((c) => { if (alive && c?.tracks?.length) setLiveTracks(c.tracks); });
    return () => { alive = false; };
  }, []);

  /* Retardo de 250 ms: búsqueda en vivo sin irse de la página */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setDebounced(''); return; }
    const id = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(id);
  }, [q]);

  /* Sugerencias en vivo (autocompletado) mientras se escribe */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setSugg([]); setSuggOpen(false); return; }
    const id = ++suggReq.current;
    setSuggOpen(true);
    const timer = setTimeout(async () => {
      try {
        const list = await suggestYouTube(term).catch(() => []);
        if (id === suggReq.current) {
          setSugg(Array.isArray(list) ? list : []);
          setSuggOpen(true);
        }
      } catch {
        if (id === suggReq.current) { setSugg([]); }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [q]);

  /* Cierra el desplegable al tocar fuera */
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setSuggOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const results = useMemo(() => {
    try {
      const empty = { songs: [], videos: [], mixes: [], albums: [], artists: [], playlists: [], stations: [] };
      if (!query) return empty;
      const hit = (s) => (s || '').toString().toLowerCase().includes(query);
      // Catálogo curado + catálogo en vivo (sin duplicar por id)
      const all = [...(Array.isArray(TRACKS) ? TRACKS : []), ...(Array.isArray(liveTracks) ? liveTracks.filter((tr) => !(Array.isArray(TRACKS) && TRACKS.some((x) => x?.id === tr?.id))) : [])];
      const songs = all.filter((tr) => {
        try {
          const moods = Array.isArray(tr?.moods) ? tr.moods : [];
          return [tr?.title, tr?.artist, tr?.album, tr?.genre, ...moods].join(' ').toLowerCase().includes(query);
        } catch { return false; }
      });
      return {
        songs,
        videos: songs.filter((tr) => !tr?.live),
        mixes: Array.isArray(MIXES) ? MIXES.filter((mx) => hit(`${mx?.title || ''} ${mx?.desc || ''}`)) : [],
        albums: Array.isArray(ALBUMS) ? ALBUMS.filter((al) => hit(`${al?.title || ''} ${al?.artist || ''} ${al?.year || ''}`)) : [],
        artists: Array.isArray(ARTISTS) ? ARTISTS.filter((a) => hit(`${a?.name || ''} ${a?.genre || ''}`)) : [],
        playlists: Array.isArray(state?.library?.playlists) ? state.library.playlists.filter((pl) => hit(`${pl?.name || ''} ${pl?.desc || ''}`)) : [],
        stations: Array.isArray(STATIONS) ? STATIONS.filter((st) => hit(`${st?.title || ''} ${st?.desc || ''}`)) : [],
      };
    } catch {
      return { songs: [], videos: [], mixes: [], albums: [], artists: [], playlists: [], stations: [] };
    }
  }, [query, state?.library?.playlists, liveTracks]);

  const totalHits = results.songs.length + results.mixes.length + results.albums.length +
    results.artists.length + results.playlists.length + results.stations.length;

  const show = (k) => (filter === 'all' || filter === k) && results[k]?.length > 0;

  const onSearch = (value) => {
    const v = value || '';
    setQ(v);
    const tval = v.trim();
    setSuggOpen(tval.length >= 2);
    if (tval.length > 1) {
      try { dispatch({ type: 'add-search', q: tval }); } catch {}
    }
  };

  const pickSuggestion = (s) => {
    const val = s.trim();
    setQ(val);
    setSuggOpen(false);
    setDebounced(val);
    if (val) dispatch({ type: 'add-search', q: val });
  };

  const playPasted = () => {
    const id = parseYouTubeId(url);
    if (!id) { toast(t('urlHint')); return; }
    const tk = trackFromYouTubeId(id, `${id}`, t('searchYouTube'));
    p.playList([tk], tk.id);
    setUrl('');
    toast('▶ ' + tk.title);
  };

  return (
    <div className="page search-page">
      <h1>{t('search')}</h1>

      <form className="search-bar" ref={boxRef} onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (!v) return; setDebounced(v); setSuggOpen(false); if (v.length > 1) { try { dispatch({ type: 'add-search', q: v }); } catch {} } }} autoComplete="off">
        <div className="search-input-wrap">
          <Icon name="search" size={17} className="search-lead" />
          <input
            className="search-input"
            type="search"
            value={q}
            onChange={(e) => { onSearch(e.target.value); setSuggOpen((e.target.value || '').trim().length >= 2); }}
            onFocus={() => setSuggOpen((q || '').trim().length >= 2)}
            onClick={() => setSuggOpen((q || '').trim().length >= 2)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const v = q.trim();
                if (!v) return;
                setDebounced(v);
                setSuggOpen(false);
                if (v.length > 1) { try { dispatch({ type: 'add-search', q: v }); } catch {} }
              }
              if (e.key === 'Escape') setSuggOpen(false);
            }}
            placeholder={t('searchPlaceholder')}
            autoFocus
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
          />
          {q && <button type="button" className="icon-btn clear-x" onClick={() => { setQ(''); setSugg([]); setSuggOpen(false); setDebounced(''); }}><Icon name="close" size={16} /></button>}
        </div>

        <button
          type="button"
          className={`btn deep-toggle ${deep ? 'on' : ''}`}
          onClick={() => setDeep((v) => !v)}
          title={t('deepSearchHint')}
        >
          <Icon name="globe" size={15} /> {t('deepSearch')}
        </button>

        {suggOpen && Array.isArray(sugg) && sugg.length > 0 && (
          <div className="sugg-list">
            {sugg.slice(0, 8).map((s, idx) => (
              <button type="button" key={s + idx} className="sugg-item" onClick={() => pickSuggestion(s)}>
                <Icon name="search" size={14} /> <span>{s}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {deep && (
        <p className="deep-hint"><Icon name="globe" size={13} /> {t('deepSearchHint')}</p>
      )}

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
                placeholder="https://…"
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
                  sub={tr.artist}
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

          {/* ── Búsqueda REAL en el catálogo global (cualquier canción/artista) ── */}
          {debounced && (filter === 'all' || filter === 'songs' || filter === 'videos') && (
            <LiveResults
              query={debounced}
              deep={deep}
              onPlay={(list, id) => p.playList(list, id)}
              onPlayAll={(list) => p.playList(list)}
            />
          )}
        </>
      )}
    </div>
  );
}
