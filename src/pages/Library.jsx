import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import { trackById, ARTISTS, ALBUMS, shuffle } from '../data/catalog.js';
import Icon from '../components/Icon.jsx';

const TABS = ['playlists', 'albums', 'artists', 'songs', 'downloads'];

export default function Library() {
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const nav = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [tab, setTab] = useState('playlists');

  const pl = state.library.playlists;
  const liked = state.library.liked.map(trackById).filter(Boolean);
  const downloads = state.library.downloads.map(trackById).filter(Boolean);
  const savedAlbums = state.library.savedAlbums
    .map((title) => ALBUMS.find((a) => a.title === title))
    .filter(Boolean);
  const followed = state.library.followedArtists
    .map((n) => ARTISTS.find((a) => a.name === n))
    .filter(Boolean);

  const create = () => {
    if (!name.trim()) return;
    dispatch({ type: 'create-playlist', name: name.trim(), desc: desc.trim() });
    setCreating(false); setName(''); setDesc('');
    toast(t('createPlaylist') + ' ✓');
  };

  const tabCounts = {
    playlists: pl.length,
    albums: savedAlbums.length,
    artists: followed.length,
    songs: liked.length,
    downloads: downloads.length,
  };

  return (
    <div className="page">
      <div className="shelf-head">
        <h1>{t('library')}</h1>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> {t('createPlaylist')}</button>
      </div>

      <div className="lib-shortcuts">
        <div className="lib-tile" onClick={() => nav('/liked')}>
          <span className="lib-ico liked"><Icon name="heart" size={22} /></span>
          <div><strong>{t('likedSongs')}</strong><small>{state.library.liked.length} {t('songs')}</small></div>
        </div>
        <div className="lib-tile" onClick={() => nav('/history')}>
          <span className="lib-ico"><Icon name="history" size={22} /></span>
          <div><strong>{t('history')}</strong><small>{state.library.history.length} {t('songs')}</small></div>
        </div>
        <div className="lib-tile" onClick={() => nav('/charts')}>
          <span className="lib-ico"><Icon name="charts" size={22} /></span>
          <div><strong>{t('charts')}</strong><small>{t('top50')}</small></div>
        </div>
      </div>

      {/* Pestañas de biblioteca estilo Spotify / Apple Music */}
      <nav className="lib-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`lib-tab ${tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(id)} {tabCounts[id] > 0 && <span className="tab-count">{tabCounts[id]}</span>}
          </button>
        ))}
      </nav>

      {tab === 'playlists' && (
        pl.length === 0 ? (
          <div className="empty-box">
            <p>{t('empty')}</p>
            <small>{t('emptyHint')}</small>
          </div>
        ) : (
          <>
            <div className="head-actions lib-actions">
              <button className="btn primary" onClick={() => p.playList(pl.flatMap((x) => x.tracks.map(trackById).filter(Boolean)))}><Icon name="play" size={15} /> {t('playAll')}</button>
              <button className="btn" onClick={() => p.playList(shuffle(pl.flatMap((x) => x.tracks.map(trackById).filter(Boolean))))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
            </div>
            <Shelf title={t('playlists')}>
              {pl.map((p0) => (
                <Card
                  key={p0.id}
                  item={{ title: p0.name, desc: `${p0.tracks.length} ${t('songs')}`, cover: p0.cover || 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="%23303030"/><text x="150" y="165" font-size="90" text-anchor="middle" fill="%23aaaaaa">♪</text></svg>') }}
                  onOpen={() => nav(`/playlist/${p0.id}`)}
                />
              ))}
            </Shelf>
          </>
        )
      )}

      {tab === 'albums' && (
        savedAlbums.length === 0 ? (
          <div className="empty-box">
            <p>{t('empty')}</p>
            <small>{t('albumsEmptyHint')}</small>
            <button className="btn primary" onClick={() => nav('/explore')}>{t('explore')}</button>
          </div>
        ) : (
          <Shelf title={t('albums')}>
            {savedAlbums.map((al) => (
              <Card
                key={al.id}
                item={{ title: al.title, thumb: al.cover }}
                onPlay={() => p.playList(al.tracks)}
                onOpen={() => nav(`/album/${encodeURIComponent(al.title)}`)}
                sub={`${al.artist} · ${al.year}`}
              />
            ))}
          </Shelf>
        )
      )}

      {tab === 'artists' && (
        followed.length === 0 ? (
          <div className="empty-box">
            <p>{t('empty')}</p>
            <small>{t('artistsEmptyHint')}</small>
            <button className="btn primary" onClick={() => nav('/charts')}>{t('charts')}</button>
          </div>
        ) : (
          <Shelf title={t('artists')}>
            {followed.map((a) => (
              <Card
                key={a.name}
                item={{ title: a.name, thumb: a.thumb }}
                round
                onPlay={() => p.playList(a.tracks)}
                onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
                sub={t('following')}
              />
            ))}
          </Shelf>
        )
      )}

      {tab === 'songs' && (
        liked.length === 0 ? (
          <div className="empty-box">
            <p>{t('empty')}</p>
            <small>{t('likedEmptyHint')}</small>
          </div>
        ) : (
          <section className="list-section">
            <div className="head-actions lib-actions">
              <button className="btn primary" onClick={() => p.playList(liked)}><Icon name="play" size={15} /> {t('playAll')}</button>
              <button className="btn" onClick={() => p.playList(shuffle(liked))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
            </div>
            {liked.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={liked} showAlbum />)}
          </section>
        )
      )}

      {tab === 'downloads' && (
        !state.pro.active ? (
          <div className="empty-box">
            <span className="lib-ico pro">✦</span>
            <p>{t('proNeeded')}</p>
            <small>{t('downloadsHint')}</small>
            <button className="btn primary" onClick={() => nav('/pro')}>{t('activatePro')}</button>
          </div>
        ) : downloads.length === 0 ? (
          <div className="empty-box">
            <p>{t('empty')}</p>
            <small>{t('downloadsEmptyHint')}</small>
            <button className="btn primary" onClick={() => nav('/explore')}>{t('explore')}</button>
          </div>
        ) : (
          <section className="list-section">
            <div className="head-actions lib-actions">
              <button className="btn primary" onClick={() => p.playList(downloads)}><Icon name="play" size={15} /> {t('playAll')}</button>
              <button className="btn" onClick={() => { dispatch({ type: 'clear-downloads' }); toast(t('clear') + ' ✓'); }}><Icon name="trash" size={15} /> {t('clear')}</button>
            </div>
            {downloads.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={downloads} showAlbum />)}
          </section>
        )
      )}

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3><Icon name="plus" size={18} /> {t('newPlaylist')}</h3>
            <label className="field">
              <span>{t('playlistName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            </label>
            <label className="field">
              <span>{t('description')}</span>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setCreating(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={create}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
