import { usePlayer, fmt } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import Icon from './Icon.jsx';

/* Barra inferior fija de extremo a extremo: información a la izquierda,
   controles centrados y volumen/expansión a la derecha. */
export default function MiniPlayer() {
  const p = usePlayer();
  const { t } = useI18n();
  if (!p.track) return null;
  const frac = p.duration ? p.position / p.duration : 0;

  return (
    <div
      className="mini-player mini-player-floating"
      style={{ '--mini-art': `url(${p.track.thumb})` }}
    >
      <div
        className="mini-progress-wrap"
        onClick={(e) => {
          if (!p.track || p.track.live) return;
          const r = e.currentTarget.getBoundingClientRect();
          p.seek((e.clientX - r.left) / Math.max(1, r.width));
        }}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(frac * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (!p.track || p.track.live) return;
          if (e.key === 'ArrowRight') { p.nudge(5); e.preventDefault(); }
          if (e.key === 'ArrowLeft') { p.nudge(-5); e.preventDefault(); }
        }}
      >
        <div className="mini-progress" style={{ width: `${Math.min(100, frac * 100)}%` }} />
      </div>

      <div className="mini-body" onClick={() => p.openFull(true)} title={t('nowPlaying')}>
        <img className="mini-thumb" src={p.track.thumb} alt="" loading="lazy" />
        <div className="mini-meta">
          <strong title={p.track.title}>{p.track.title}</strong>
          <small title={p.track.artist}>{p.track.artist}{p.track.live ? ` · ${t('liveNow')}` : ''}</small>
        </div>
      </div>

      <div className="mini-center">
        <div className="mini-controls">
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); p.prev(); }} aria-label={t('previous')}>
            <Icon name="prev" />
          </button>
          <button className="icon-btn play-toggle" onClick={(e) => { e.stopPropagation(); p.toggle(); }} aria-label={p.playing ? t('pause') : t('play')}>
            <Icon name={p.playing ? 'pause' : 'play'} />
          </button>
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); p.next(); }} aria-label={t('next')}>
            <Icon name="next" />
          </button>
        </div>
        <div className="mini-time">
          {p.track.live ? 'LIVE' : `${fmt(p.position)} / ${fmt(p.duration)}`}
        </div>
      </div>

      <div className="mini-right">
        <button
          className="icon-btn mini-vol-icon"
          onClick={() => p.setVolume(p.volume > 0 ? 0 : 80)}
          aria-label={p.volume > 0 ? t('mute') : t('volume')}
        >
          <Icon name={p.volume > 0 ? 'volume' : 'mute'} size={18} />
        </button>
        <input
          className="mini-volume"
          type="range"
          min="0"
          max="100"
          value={p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          aria-label={t('volume')}
        />
        <button className="icon-btn" onClick={() => p.openFull(true)} aria-label={t('nowPlaying')}>
          <Icon name="fullscreen" size={17} />
        </button>
      </div>
    </div>
  );
}
