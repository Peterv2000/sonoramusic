import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { TrackRow } from '../components/widgets.jsx';
import { trackById } from '../data/catalog.js';
import Icon from '../components/Icon.jsx';

export default function Liked() {
  const { state } = useApp();
  const p = usePlayer();
  const { t } = useI18n();
  const tracks = state.library.liked.map(trackById).filter(Boolean);

  return (
    <div className="page">
      <div className="shelf-head">
        <h1><Icon name="heart" size={26} /> {t('likedSongs')}</h1>
        {tracks.length > 0 && (
          <div className="head-actions">
            <button className="btn primary" onClick={() => p.playList(tracks)}><Icon name="play" size={15} /> {t('playAll')}</button>
            <button className="btn" onClick={() => p.playList([...tracks].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
          </div>
        )}
      </div>
      {tracks.length === 0 ? (
        <div className="empty-box"><p>{t('empty')}</p><small>{t('emptyHint')}</small></div>
      ) : (
        <section className="list-section">
          {tracks.map((tr, i) => <TrackRow key={tr.id} track={tr} index={i} list={tracks} />)}
        </section>
      )}
    </div>
  );
}
