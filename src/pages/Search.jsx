import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import { TRACKS, MIXES, STATIONS, ALBUMS, ARTISTS, trackById, nf } from '../data/catalog.js';
import { suggestYouTube } from '../api/youtubeSearch.js';
import { hybridSearchFallback, mergeTrackResults } from '../api/hybridSearch.js';
import { tagTrackWithQueryStyle } from '../../shared/searchIntent.mjs';
import { getCatalog } from '../api/liveData.js';
import { useCategories } from '../api/categories.js';
import Icon from '../components/Icon.jsx';

const TABS = ['all', 'songs', 'artists', 'albums', 'playlists'];

function SectionHead({ icon, title, count, children }) {
  return (
    <div className="shelf-head">
      <h2>
        {icon && <Icon name={icon} size={18} />} {title}
        {count != null && <span className="count-badge">{count}</span>}
      </h2>
      {children && <div className="head-actions">{children}</div>}
    </div>
  );
}

export default function Search() {
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const nav = useNavigate();
  const { t } = useI18n();
  const { categories } = useCategories();
  const [params] = useSearchParams();

  const urlQ = params.get('q') || '';
  const [q, setQ] = useState(urlQ);
  const [submitted, setSubmitted] = useState(urlQ);
  const [filter, setFilter] = useState('all');
  const [deep, setDeep] = useState(false);
  const [discovery, setDiscovery] = useState(false);
  const [sugg, setSugg] = useState([]);
  const [liveTracks, setLiveTracks] = useState([]);
  const [liveItems, setLiveItems] = useState(null); // null = cargando
  const [localResults, setLocalResults] = useState([]);
  const [suggestedResults, setSuggestedResults] = useState([]);
  const [hybridMeta, setHybridMeta] = useState(null);
  const [liveInstant, setLiveInstant] = useState(false);
  const [onlineTick, setOnlineTick] = useState(0);

  const suggReq = useRef(0);
  const liveReq = useRef(0);
  const boxRef = useRef(null);
  const liveTracksRef = useRef(liveTracks);

  liveTracksRef.current = liveTracks;

  /* La barra superior navega a /search?q=…: mantenemos el término en sincronía. */
  useEffect(() => {
    if (urlQ) { setQ(urlQ); setSubmitted(urlQ); }
  }, [urlQ]);

  /* Catálogo ampliado que refresca el servidor (si está disponible). */
  useEffect(() => {
    let alive = true;
    getCatalog().then((c) => { if (alive && c?.tracks?.length) setLiveTracks(c.tracks); });
    return () => { alive = false; };
  }, []);

  /* Sugerencias mientras se escribe (solo con el panel de descubrimiento abierto). */
  useEffect(() => {
    const term = q.trim();
    if (!discovery || term.length < 2) { setSugg([]); return undefined; }
    const id = ++suggReq.current;
    const timer = setTimeout(async () => {
      try {
        const list = await suggestYouTube(term);
        if (id === suggReq.current) {
          setSugg(Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim()) : []);
        }
      } catch {
        if (id === suggReq.current) setSugg([]);
      }
    }, 160);
    return () => clearTimeout(timer);
  }, [q, discovery]);

  /* Cierra el panel al tocar fuera. */
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setDiscovery(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  /* Si vuelve la conexión, reintentamos la consulta actual sin que el usuario
     tenga que pulsar nada. */
  useEffect(() => {
    const onOnline = () => setOnlineTick((n) => n + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  /* Búsqueda híbrida: locales/caché al instante, remotos si llegan a tiempo y
     respaldo silencioso a los 2.5 s. Nunca muestra errores de conexión. */
  useEffect(() => {
    const term = submitted.trim();
    if (!term) {
      setLiveItems(null);
      setLocalResults([]);
      setSuggestedResults([]);
      setHybridMeta(null);
      setLiveInstant(false);
      return undefined;
    }

    let alive = true;
    const id = ++liveReq.current;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setLiveItems(null);
    setLocalResults([]);
    setSuggestedResults([]);
    setHybridMeta(null);
    setLiveInstant(false);

    const apply = (result) => {
      if (!alive || id !== liveReq.current || !result) return;
      setLiveItems(Array.isArray(result.global) ? result.global : []);
      setLocalResults(Array.isArray(result.local) ? result.local : []);
      setSuggestedResults(Array.isArray(result.suggested) ? result.suggested : []);
      setHybridMeta(result.meta || null);
      setLiveInstant(Boolean(result.meta?.cached && !result.meta?.pending && !deep));
    };

    hybridSearchFallback(term, {
      deep,
      signal: ctrl?.signal,
      catalogTracks: liveTracksRef.current,
      onUpdate: apply,
    }).then(apply).catch(() => {
      if (!alive || id !== liveReq.current) return;
      /* El motor híbrido no rechaza; si algo externo falla, dejamos el estado
         local y nunca pintamos un error de red. */
      setLiveItems((items) => (Array.isArray(items) ? items : []));
      setHybridMeta((meta) => meta || {
        pending: false,
        degraded: true,
        offline: typeof navigator !== 'undefined' && navigator.onLine === false,
      });
    });

    return () => {
      alive = false;
      try { ctrl?.abort(); } catch { /* noop */ }
    };
  }, [submitted, deep, onlineTick]);

  const local = useMemo(() => {
    const term = submitted.trim().toLowerCase();
    const empty = { songs: [], albums: [], artists: [], playlists: [], mixes: [], stations: [] };
    if (!term) return empty;
    const hit = (s) => (s || '').toString().toLowerCase().includes(term);
    const all = [
      ...(Array.isArray(TRACKS) ? TRACKS : []),
      ...(Array.isArray(liveTracks)
        ? liveTracks.filter((tr) => !(Array.isArray(TRACKS) && TRACKS.some((x) => x?.id === tr?.id)))
        : []),
    ];
    const songs = all.filter((tr) => {
      try {
        const moods = Array.isArray(tr?.moods) ? tr.moods : [];
        return [tr?.title, tr?.artist, tr?.album, tr?.genre, ...moods].join(' ').toLowerCase().includes(term);
      } catch { return false; }
    }).map((tr) => tagTrackWithQueryStyle(tr, submitted));
    return {
      songs,
      albums: Array.isArray(ALBUMS) ? ALBUMS.filter((al) => hit(`${al?.title} ${al?.artist} ${al?.year}`)) : [],
      artists: Array.isArray(ARTISTS) ? ARTISTS.filter((a) => hit(`${a?.name} ${a?.genre}`)) : [],
      playlists: Array.isArray(state?.library?.playlists) ? state.library.playlists.filter((pl) => hit(`${pl?.name} ${pl?.desc}`)) : [],
      mixes: Array.isArray(MIXES) ? MIXES.filter((mx) => hit(`${mx?.title} ${mx?.desc}`)) : [],
      stations: Array.isArray(STATIONS) ? STATIONS.filter((st) => hit(`${st?.title} ${st?.desc}`)) : [],
    };
  }, [submitted, liveTracks, state?.library?.playlists]);

  /* Canciones locales: las del catálogo visible + las que rescató el motor
     híbrido (catálogo descargado, aunque esté caducado). Sin duplicados. */
  const localSongs = useMemo(
    () => mergeTrackResults(local.songs, localResults),
    [local.songs, localResults],
  );

  const liveVideos = useMemo(
    () => (liveItems || []).filter((x) => (x.kind || 'video') === 'video'),
    [liveItems],
  );
  const liveSongs = useMemo(() => liveVideos.filter((x) => !x.suggested), [liveVideos]);
  const liveSuggested = useMemo(() => liveVideos.filter((x) => x.suggested), [liveVideos]);
  const liveArtists = useMemo(() => (liveItems || []).filter((x) => x.kind === 'channel'), [liveItems]);
  const livePlaylists = useMemo(() => (liveItems || []).filter((x) => x.kind === 'playlist'), [liveItems]);

  /* Sugerencias: coincidencias aproximadas del servidor + relleno local. Se
     muestran en su propia sección y nunca se mezclan con las exactas. */
  const suggestedSongs = useMemo(() => {
    const key = (track) => String(track?.yt || track?.id || `${track?.title}|${track?.artist}`);
    const known = new Set([...localSongs, ...liveSongs].map(key));
    return mergeTrackResults(suggestedResults, liveSuggested)
      .filter((track) => !known.has(key(track)));
  }, [suggestedResults, liveSuggested, localSongs, liveSongs]);

  const counts = {
    all: liveSongs.length + liveArtists.length + livePlaylists.length +
      localSongs.length + suggestedSongs.length + local.albums.length + local.artists.length +
      local.playlists.length + local.mixes.length + local.stations.length,
    songs: liveSongs.length + localSongs.length + suggestedSongs.length,
    artists: liveArtists.length + local.artists.length,
    albums: local.albums.length,
    playlists: livePlaylists.length + local.playlists.length + local.mixes.length + local.stations.length,
  };

  const visible = (tab) => filter === 'all' || filter === tab;
  /* Mientras el remoto siga pendiente y no haya canciones globales, el
     esqueleto ocupa el lugar del aviso de error. */
  const loading = submitted.trim().length > 0
    && (liveItems === null || Boolean(hybridMeta?.pending && !liveSongs.length));

  const runSearch = (value) => {
    const v = (value ?? q).trim();
    if (!v) { setDiscovery(true); return; }
    setQ(v);
    setSubmitted(v);
    setDiscovery(false);
    setFilter('all');
    if (v.length > 1) { try { dispatch({ type: 'add-search', q: v }); } catch { /* noop */ } }
    nav(`/search?q=${encodeURIComponent(v)}`, { replace: true });
  };

  /* Búsqueda en vivo mientras se escribe: no hace falta pulsar Enter. Se
     espera una pausa corta para no lanzar una petición por tecla. No guarda
     cada pulsación en «búsquedas recientes». */
  useEffect(() => {
    const term = q.trim();
    if (!discovery || term.length < 2 || term === submitted.trim()) return undefined;
    const timer = setTimeout(() => {
      setSubmitted(term);
      setFilter('all');
      nav(`/search?q=${encodeURIComponent(term)}`, { replace: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [q, discovery, submitted, nav]);

  const onInputChange = (value) => {
    setQ(value);
    setDiscovery(true);
  };

  const pickSuggestion = (s) => runSearch(s);

  const playAll = (list) => { if (list?.length) p.playList(list); };
  const queueAll = (list) => { if (list?.length) p.enqueueList(list); };

  /* Artistas y playlists del buscador no traen sus pistas en la respuesta:
     al pulsar reproducir o añadir a la cola, pedimos sus canciones y actuamos. */
  const [pendingGroup, setPendingGroup] = useState(null);
  const playGroup = async (item, toQueue = false) => {
    const term = String(item?.title || '').trim();
    if (!term) return;
    setPendingGroup(item.id);
    try {
      const result = await hybridSearchFallback(term, { limit: 30 });
      const songs = (result?.merged || []).filter((x) => (x.kind || 'video') === 'video');
      if (!songs.length) return;
      if (toQueue) queueAll(songs);
      else playAll(songs);
    } catch {
      /* silencio: el buscador sigue disponible */
    } finally {
      setPendingGroup(null);
    }
  };

  const albumTracks = (al) => (Array.isArray(al?.tracks) ? al.tracks : []);
  const playlistTracks = (pl) => (Array.isArray(pl?.tracks) ? pl.tracks.map(trackById).filter(Boolean) : []);

  const showDiscovery = discovery && (!submitted.trim() || q.trim() !== submitted.trim() || q.trim().length >= 2);

  return (
    <div className="page search-page">
      <div className="search-hero">
        <h1 className="search-title">{t('search')}</h1>
        <form
          className="search-bar search-bar-hero"
          ref={boxRef}
          onSubmit={(e) => { e.preventDefault(); runSearch(); }}
          autoComplete="off"
        >
          <div className="search-input-wrap search-input-wrap-hero">
            <Icon name="search" size={20} className="search-lead" />
            <input
              className="search-input search-input-hero"
              type="search"
              value={q}
              onChange={(e) => onInputChange(e.target.value)}
              onFocus={() => setDiscovery(true)}
              onClick={() => setDiscovery(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') setDiscovery(false); }}
              placeholder={t('searchGlobalPlaceholder')}
              aria-label={t('searchGlobalPlaceholder')}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              lang={state.settings.lang || 'es'}
              name="q"
            />
            {q && (
              <button
                type="button"
                className="icon-btn clear-x"
                aria-label={t('close')}
                onClick={() => { setQ(''); setSugg([]); setDiscovery(true); setSubmitted(''); nav('/search', { replace: true }); }}
              ><Icon name="close" size={16} /></button>
            )}
          </div>

          <button
            type="button"
            className={`btn deep-toggle ${deep ? 'on' : ''}`}
            onClick={() => setDeep((v) => !v)}
            title={t('deepSearchHint')}
          >
            <Icon name="sparkles" size={15} /> {t('deepSearchOn')}
          </button>
          <button type="submit" className="btn primary search-submit">
            <Icon name="search" size={15} /> {t('search')}
          </button>

          {showDiscovery && (
            <div className="sugg-list sugg-list-hero search-discovery">
              {q.trim().length < 2 ? (
                <>
                  {state.library.recentSearches.length > 0 && (
                    <div className="discover-block">
                      <div className="discover-title"><Icon name="history" size={14} /> {t('recentSearches')}</div>
                      <div className="chip-row">
                        {state.library.recentSearches.slice(0, 8).map((s) => (
                          <button type="button" key={s} className="chip" onClick={() => runSearch(s)}>{s}</button>
                        ))}
                        <button
                          type="button"
                          className="chip danger"
                          onClick={() => dispatch({ type: 'clear-searches' })}
                        ><Icon name="close" size={14} /> {t('clearSearches')}</button>
                      </div>
                    </div>
                  )}
                  <div className="discover-block">
                    <div className="discover-title"><Icon name="sparkles" size={14} /> {t('genresToExplore')}</div>
                    <div className="discover-genres">
                      {categories.map((g) => (
                        <button
                          type="button"
                          key={g.id}
                          className="discover-genre"
                          style={{ '--g': g.color }}
                          onClick={() => runSearch(g.id)}
                        >
                          <img src={g.cover} alt="" loading="lazy" />
                          <span className="discover-genre-shade" />
                          <strong>{g.id}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="discover-block">
                    <div className="discover-title"><Icon name="fire" size={14} /> {t('quickPicks')}</div>
                    <div className="chip-row">
                      {['Bad Bunny', 'Taylor Swift', 'Queen', 'Shakira', 'Dua Lipa', 'Karol G', 'The Weeknd', 'Metallica'].map((s) => (
                        <button type="button" key={s} className="chip" onClick={() => runSearch(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {sugg.length > 0 && sugg.slice(0, 8).map((s, idx) => (
                    <button
                      type="button"
                      key={`${s}-${idx}`}
                      className="sugg-item sugg-item-hero"
                      onClick={() => pickSuggestion(s)}
                    >
                      <Icon name="search" size={16} /> <span>{s}</span>
                    </button>
                  ))}
                  <button type="button" className="sugg-item sugg-item-hero search-run-item" onClick={() => runSearch()}>
                    <Icon name="sparkles" size={16} /> <span>{t('searchFor')} “{q.trim()}”</span>
                    <Icon name="next" size={15} />
                  </button>
                </>
              )}
            </div>
          )}
        </form>
      </div>

      {!submitted.trim() && (
        <section className="search-empty-state">
          <div className="search-empty-art"><Icon name="search" size={34} /></div>
          <strong>{t('searchStartTitle')}</strong>
          <p className="muted">{t('searchHintSonora')}</p>
          <div className="chip-row">
            {['Pop', 'Rock', 'Latino', 'Electrónica', 'Lo-Fi'].map((g) => (
              <button key={g} className="chip" onClick={() => runSearch(g)}>{g}</button>
            ))}
          </div>
        </section>
      )}

      {submitted.trim() && (
        <>
          <div className="search-results-head">
            <div className="search-results-title">
              <Icon name="search" size={17} />
              <span>{t('resultsFor')} “{submitted.trim()}”</span>
              {liveInstant && !deep && (
                <span className="live-badge"><Icon name="lightning" size={12} /> {t('instant')}</span>
              )}
              {deep && <span className="live-badge deep"><Icon name="sparkles" size={12} /> {t('deepSearchOn')}</span>}
            </div>
            {counts.all > 0 && <span className="count-badge">{counts.all} {t('resultCount')}</span>}
          </div>

          <div className="chip-row search-filters" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={filter === tab}
                className={`chip search-tab ${filter === tab ? 'on' : ''}`}
                onClick={() => setFilter(tab)}
              >
                {t(`filter_${tab}`)}
                {counts[tab] > 0 && <span className="search-tab-count">{counts[tab]}</span>}
              </button>
            ))}
          </div>

          {hybridMeta?.offline && (
            <div className="search-offline-banner" role="status">
              <Icon name="download" size={16} />
              <span>{t('offlineCatalogMode')}</span>
            </div>
          )}

          {!hybridMeta?.offline && suggestedSongs.length > 0 && (
            <div className="search-suggest-banner" role="status">
              <Icon name="sparkles" size={16} />
              <span>{t('approxResultsHint')}</span>
            </div>
          )}

          {loading && (
            <section className="list-section search-youtube-section" aria-busy="true" aria-live="polite">
              <div className="shelf-head">
                <h2><Icon name="sparkles" size={18} /> {t('searchingSonora')} <span className="search-query-chip">“{submitted.trim()}”</span></h2>
              </div>
              <div className="yt-skel">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="yt-skel-row" />)}
              </div>
            </section>
          )}

          {visible('songs') && liveSongs.length > 0 && (
            <section className="list-section search-youtube-section">
              <SectionHead icon="music" title={t('sonoraSongs')} count={liveSongs.length}>
                <button className="btn small" onClick={() => queueAll(liveSongs)}>
                  <Icon name="plus" size={14} /> {t('addToQueue')}
                </button>
                <button className="btn primary small" onClick={() => playAll(liveSongs)}>
                  <Icon name="play" size={15} /> {t('playAll')}
                </button>
              </SectionHead>
              {liveSongs.map((tr, i) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  index={i}
                  list={liveSongs}
                  onPlay={() => p.playRadio(tr)}
                  onQueue={() => p.enqueue(tr)}
                />
              ))}
            </section>
          )}

          {visible('artists') && liveArtists.length > 0 && (
            <Shelf title={t('sonoraArtists')}>
              {liveArtists.map((ch) => (
                <Card
                  key={ch.id}
                  item={ch}
                  round
                  onOpen={() => runSearch(ch.title)}
                  onPlay={() => playGroup(ch)}
                  onQueue={() => playGroup(ch, true)}
                  sub={pendingGroup === ch.id ? t('searchingSonora') : t('filter_artists')}
                />
              ))}
            </Shelf>
          )}

          {visible('playlists') && livePlaylists.length > 0 && (
            <Shelf title={t('sonoraPlaylists')}>
              {livePlaylists.map((pl) => (
                <Card
                  key={pl.id}
                  item={pl}
                  onOpen={() => runSearch(pl.title)}
                  onPlay={() => playGroup(pl)}
                  onQueue={() => playGroup(pl, true)}
                  sub={pendingGroup === pl.id ? t('searchingSonora') : (pl.artist && pl.artist !== 'Sonora' ? pl.artist : t('filter_playlists'))}
                />
              ))}
            </Shelf>
          )}

          {visible('songs') && localSongs.length > 0 && (
            <section className="list-section search-catalog-section">
              <SectionHead icon="library" title={t('inCatalog')} count={localSongs.length}>
                <button className="btn small" onClick={() => queueAll(localSongs)}>
                  <Icon name="plus" size={14} /> {t('addToQueue')}
                </button>
                <button className="btn primary small" onClick={() => playAll(localSongs)}>
                  <Icon name="play" size={15} /> {t('playAll')}
                </button>
              </SectionHead>
              {localSongs.map((tr, i) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  index={i}
                  list={localSongs}
                  showAlbum
                  onPlay={() => p.playRadio(tr)}
                  onQueue={() => p.enqueue(tr)}
                />
              ))}
            </section>
          )}

          {visible('songs') && suggestedSongs.length > 0 && (
            <section className="list-section search-suggest-section">
              <SectionHead icon="sparkles" title={t('suggestedResults')} count={suggestedSongs.length}>
                <button className="btn small" onClick={() => queueAll(suggestedSongs)}>
                  <Icon name="plus" size={14} /> {t('addToQueue')}
                </button>
                <button className="btn primary small" onClick={() => playAll(suggestedSongs)}>
                  <Icon name="play" size={15} /> {t('playAll')}
                </button>
              </SectionHead>
              {suggestedSongs.map((tr, i) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  index={i}
                  list={suggestedSongs}
                  onPlay={() => p.playRadio(tr)}
                  onQueue={() => p.enqueue(tr)}
                />
              ))}
            </section>
          )}

          {visible('artists') && local.artists.length > 0 && (
            <Shelf title={t('artists')}>
              {local.artists.map((a) => (
                <Card
                  key={a.name}
                  item={{ title: a.name, thumb: a.thumb }}
                  round
                  onPlay={() => p.playList(a.tracks)}
                  onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
                  onQueue={() => queueAll(a.tracks)}
                  sub={`${nf.format(a.listeners)} ${t('listeners')}`}
                />
              ))}
            </Shelf>
          )}

          {visible('albums') && local.albums.length > 0 && (
            <Shelf title={t('albums')}>
              {local.albums.map((al) => (
                <Card
                  key={al.id}
                  item={{ title: al.title, thumb: al.cover }}
                  onPlay={() => playAll(albumTracks(al))}
                  onOpen={() => nav(`/album/${encodeURIComponent(al.title)}`)}
                  onQueue={() => queueAll(albumTracks(al))}
                  sub={`${al.artist} · ${al.year}`}
                />
              ))}
            </Shelf>
          )}

          {visible('playlists') && (local.playlists.length > 0 || local.mixes.length > 0 || local.stations.length > 0) && (
            <Shelf title={t('playlists')}>
              {local.playlists.map((pl) => {
                const tracks = playlistTracks(pl);
                return (
                  <Card
                    key={pl.id}
                    item={{ title: pl.name, thumb: pl.cover }}
                    onPlay={() => playAll(tracks)}
                    onOpen={() => nav(`/playlist/${pl.id}`)}
                    onQueue={() => queueAll(tracks)}
                    sub={`${pl.tracks.length} ${t('songs')}`}
                  />
                );
              })}
              {local.mixes.map((mx) => (
                <Card
                  key={mx.id}
                  item={{ title: mx.title, thumb: mx.cover }}
                  onPlay={() => playAll(mx.tracks)}
                  onOpen={() => playAll(mx.tracks)}
                  onQueue={() => queueAll(mx.tracks)}
                  sub={mx.desc}
                />
              ))}
              {local.stations.map((st) => (
                <Card
                  key={st.id}
                  item={{ title: st.title, thumb: st.cover }}
                  onPlay={() => playAll(st.tracks)}
                  onOpen={() => playAll(st.tracks)}
                  onQueue={() => queueAll(st.tracks)}
                  sub={st.desc}
                />
              ))}
            </Shelf>
          )}

          {!loading && counts.all === 0 && (
            <div className="empty-box search-empty">
              <div className="search-empty-art"><Icon name="search" size={30} /></div>
              <strong>{t('noResults')}</strong>
              <p className="muted">{t('noSonoraResults')}</p>
              <button className="btn small" onClick={() => setDiscovery(true)}>
                <Icon name="search" size={14} /> {t('openSearch')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
