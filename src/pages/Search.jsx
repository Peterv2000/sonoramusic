import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import { TRACKS, MIXES, STATIONS, ALBUMS, ARTISTS, GENRES, trackById, nf } from '../data/catalog.js';
import { searchYouTubeDetailed, suggestYouTube } from '../api/youtubeSearch.js';
import { getCatalog, warmLookup } from '../api/liveData.js';
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
  const [liveError, setLiveError] = useState(null);
  const [liveInstant, setLiveInstant] = useState(false);
  const [liveAttempt, setLiveAttempt] = useState(0);

  const suggReq = useRef(0);
  const liveReq = useRef(0);
  const boxRef = useRef(null);

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

  /* Búsqueda global: se ejecuta al pulsar Enter o el botón, no al teclear. */
  useEffect(() => {
    const term = submitted.trim();
    if (!term) {
      setLiveItems(null);
      setLiveError(null);
      setLiveInstant(false);
      return undefined;
    }
    let alive = true;
    const id = ++liveReq.current;
    setLiveItems(null);
    setLiveError(null);
    setLiveInstant(false);
    (async () => {
      try {
        if (!deep) {
          const warm = await warmLookup(term).catch(() => null);
          if (alive && id === liveReq.current && Array.isArray(warm) && warm.length) {
            setLiveItems(warm);
            setLiveInstant(true);
            return;
          }
        }
        const result = await searchYouTubeDetailed(term, { deep });
        if (alive && id === liveReq.current) {
          setLiveItems(Array.isArray(result?.items) ? result.items : []);
          setLiveError(result?.error || null);
        }
      } catch {
        if (alive && id === liveReq.current) {
          setLiveItems([]);
          setLiveError('unavailable');
        }
      }
    })();
    return () => { alive = false; };
  }, [submitted, deep, liveAttempt]);

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
    });
    return {
      songs,
      albums: Array.isArray(ALBUMS) ? ALBUMS.filter((al) => hit(`${al?.title} ${al?.artist} ${al?.year}`)) : [],
      artists: Array.isArray(ARTISTS) ? ARTISTS.filter((a) => hit(`${a?.name} ${a?.genre}`)) : [],
      playlists: Array.isArray(state?.library?.playlists) ? state.library.playlists.filter((pl) => hit(`${pl?.name} ${pl?.desc}`)) : [],
      mixes: Array.isArray(MIXES) ? MIXES.filter((mx) => hit(`${mx?.title} ${mx?.desc}`)) : [],
      stations: Array.isArray(STATIONS) ? STATIONS.filter((st) => hit(`${st?.title} ${st?.desc}`)) : [],
    };
  }, [submitted, liveTracks, state?.library?.playlists]);

  const liveSongs = useMemo(
    () => (liveItems || []).filter((x) => (x.kind || 'video') === 'video'),
    [liveItems],
  );
  const liveArtists = useMemo(() => (liveItems || []).filter((x) => x.kind === 'channel'), [liveItems]);
  const livePlaylists = useMemo(() => (liveItems || []).filter((x) => x.kind === 'playlist'), [liveItems]);

  const counts = {
    all: liveSongs.length + liveArtists.length + livePlaylists.length +
      local.songs.length + local.albums.length + local.artists.length +
      local.playlists.length + local.mixes.length + local.stations.length,
    songs: liveSongs.length + local.songs.length,
    artists: liveArtists.length + local.artists.length,
    albums: local.albums.length,
    playlists: livePlaylists.length + local.playlists.length + local.mixes.length + local.stations.length,
  };

  const visible = (tab) => filter === 'all' || filter === tab;
  const loading = submitted.trim().length > 0 && liveItems === null;

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
      const result = await searchYouTubeDetailed(term, { limit: 30 });
      const songs = (result?.items || []).filter((x) => (x.kind || 'video') === 'video');
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
                      {GENRES.map((g) => (
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

          {loading && (
            <section className="list-section search-youtube-section">
              <div className="shelf-head">
                <h2><Icon name="sparkles" size={18} /> {t('searchingSonora')} <span className="search-query-chip">“{submitted.trim()}”</span></h2>
              </div>
              <div className="yt-skel">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="yt-skel-row" />)}
              </div>
            </section>
          )}

          {liveError && liveItems?.length > 0 && (
            <div className="search-inline-warn">
              <Icon name="warning" size={14} />
              <span>{liveError === 'timeout' ? t('searchTimeout') : t('searchUnavailable')}</span>
              <button className="btn tiny" onClick={() => setLiveAttempt((n) => n + 1)}>{t('retry')}</button>
            </div>
          )}

          {liveError && liveItems?.length === 0 && (
            <div className="empty-box search-fallback">
              <p><Icon name="warning" size={16} /> {liveError === 'timeout' ? t('searchTimeout') : t('searchUnavailable')}</p>
              <small>{t('searchUnavailableHint')}</small>
              <div className="head-actions">
                <button className="btn small primary" onClick={() => setLiveAttempt((n) => n + 1)}>
                  <Icon name="history" size={14} /> {t('retry')}
                </button>
              </div>
            </div>
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
                  onPlay={() => p.playList(liveSongs, tr.id)}
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

          {visible('songs') && local.songs.length > 0 && (
            <section className="list-section search-catalog-section">
              <SectionHead icon="library" title={t('inCatalog')} count={local.songs.length}>
                <button className="btn small" onClick={() => queueAll(local.songs)}>
                  <Icon name="plus" size={14} /> {t('addToQueue')}
                </button>
                <button className="btn primary small" onClick={() => playAll(local.songs)}>
                  <Icon name="play" size={15} /> {t('playAll')}
                </button>
              </SectionHead>
              {local.songs.map((tr, i) => (
                <TrackRow
                  key={tr.id}
                  track={tr}
                  index={i}
                  list={local.songs}
                  showAlbum
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

          {!loading && !liveError && counts.all === 0 && (
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
