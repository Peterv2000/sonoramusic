import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { TrackRow } from '../components/widgets.jsx';
import { trackById } from '../data/catalog.js';
import Icon from '../components/Icon.jsx';

export default function Playlist() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const pl = state.library.playlists.find((x) => x.id === id);
  if (!pl) {
    return (
      <div className="page">
        <div className="empty-box"><p>{t('empty')}</p><button className="btn" onClick={() => nav('/library')}>← {t('library')}</button></div>
      </div>
    );
  }

  const tracks = pl.tracks.map(trackById).filter(Boolean);
  const cover = pl.cover || tracks[0]?.thumb;

  const startRename = () => { setName(pl.name); setDesc(pl.desc || ''); setRenaming(true); };
  const doRename = () => {
    dispatch({ type: 'rename-playlist', id: pl.id, name: name.trim() || pl.name, desc });
    setRenaming(false);
  };

  return (
    <div className="page">
      <div className="pl-header">
        {cover
          ? <img className="pl-cover" src={cover} alt="" />
          : <div className="pl-cover placeholder">♪</div>}
        <div className="pl-info">
          <h1>{pl.name}</h1>
          {pl.desc && <p className="muted">{pl.desc}</p>}
          <small className="muted">{pl.tracks.length} {t('songs')}</small>
          <div className="head-actions" style={{ marginTop: 12 }}>
            {tracks.length > 0 && (
              <>
                <button className="btn primary" onClick={() => p.playList(tracks)}><Icon name="play" size={15} /> {t('playAll')}</button>
                <button className="btn" onClick={() => p.playList([...tracks].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
              </>
            )}
            <button className="btn" onClick={startRename}>✎ {t('rename')}</button>
            <button
              className="btn danger"
              onClick={() => { dispatch({ type: 'delete-playlist', id: pl.id }); nav('/library'); }}
            >{t('delete')}</button>
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="empty-box"><p>{t('empty')}</p><small>{t('emptyHint')}</small></div>
      ) : (
        <section className="list-section">
          {tracks.map((tr, i) => (
            <TrackRow
              key={tr.id} track={tr} index={i} list={tracks}
              onPlay={() => p.playList(tracks, tr.id)}
            />
          ))}
        </section>
      )}

      {renaming && (
        <div className="modal-backdrop" onClick={() => setRenaming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>✎ {t('rename')}</h3>
            <label className="field"><span>{t('playlistName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
            </label>
            <label className="field"><span>{t('description')}</span>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setRenaming(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={doRename}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
