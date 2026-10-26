import { usePlayer, fmt } from '../player/PlayerContext.jsx';
import Icon from './Icon.jsx';

export default function MiniPlayer() {
  const p = usePlayer();
  if (!p.track) return null;
  const frac = p.duration ? p.position / p.duration : 0;

  return (
    <div className="mini-player">
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
      <div className="mini-body" onClick={() => p.openFull(true)}>
        <img className="mini-thumb" src={p.track.thumb} alt="" loading="lazy" />
        <div className="mini-meta">
          <strong>{p.track.title}</strong>
          <small>{p.track.artist} · {p.track.live ? 'EN VIVO' : fmt(p.duration - p.position)}</small>
        </div>
      </div>
      <div className="mini-controls">
        <button className="icon-btn" onClick={p.toggle} aria-label={p.playing ? 'Pausar' : 'Reproducir'}>
          <Icon name={p.playing ? 'pause' : 'play'} />
        </button>
        <button className="icon-btn" onClick={p.next} aria-label="Siguiente">
          <Icon name="next" />
        </button>
      </div>
    </div>
  );
}
