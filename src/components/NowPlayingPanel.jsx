import { useEffect, useState } from 'react';
import { usePlayer, usePlayerProgress, fmt } from '../player/PlayerContext.jsx';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { fetchLyrics, activeLineIndex } from '../api/lyrics.js';
import { trackById } from '../data/catalog.js';
import Icon from './Icon.jsx';

/* Panel derecho de escritorio: carátula, controles, letra y cola. */
export default function NowPlayingPanel() {
  const p = usePlayer();
  const { position, duration } = usePlayerProgress();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const track = p.track;
  const [lyr, setLyr] = useState(undefined); // undefined = cargando, null = sin letra

  useEffect(() => {
    if (!track) { setLyr(null); return undefined; }
    let dead = false;
    setLyr(undefined);
    fetchLyrics(track.title, track.artist)
      .then((result) => { if (!dead) setLyr(result); })
      .catch(() => { if (!dead) setLyr(null); });
    return () => { dead = true; };
  }, [track?.id, track?.title, track?.artist]);

  const recent = state.library.history
    .map((h) => trackById(h.id))
    .filter(Boolean)
    .slice(0, 4);

  if (!track) {
    return (
      <aside className="np-panel" aria-label={t('nowPlaying')}>
        <div className="np-head">
          <span>{t('nowPlaying')}</span>
        </div>
        <div className="np-empty">
          <div className="np-empty-art"><Icon name="music" size={34} /></div>
          <strong>{t('playFirst')}</strong>
        </div>
        {recent.length > 0 && (
          <section className="np-card">
            <header className="np-card-head"><span>{t('recent')}</span></header>
            <div className="np-mini-list">
              {recent.map((tr) => (
                <button key={tr.id} className="np-mini-row" onClick={() => p.playRadio(tr)}>
                  <img src={tr.thumb} alt="" loading="lazy" />
                  <span><strong>{tr.title}</strong><small>{tr.artist}</small></span>
                  <Icon name="play" size={14} />
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>
    );
  }

  const frac = duration ? Math.min(1, position / duration) : 0;
  const liked = state.library.liked.includes(track.id);
  const usingQueue = p.queue.length > 0;
  const usingAuto = !usingQueue && (p.autoQueue?.length || 0) > 0;
  const queue = usingQueue ? p.queue : usingAuto ? p.autoQueue : p.upcoming;
  const playAt = (i) => {
    if (usingQueue) p.playQueueAt(i);
    else if (usingAuto) p.playAutoAt(i);
    else p.playContextAt(i);
  };

  let lines = [];
  if (lyr?.synced?.length) {
    const active = activeLineIndex(lyr.synced, position);
    const start = Math.max(0, Math.min(Math.max(0, lyr.synced.length - 7), active > 0 ? active - 1 : 0));
    lines = lyr.synced.slice(start, start + 7).map((line, i) => ({
      ...line,
      active: start + i === active,
    }));
  } else if (lyr?.plain) {
    lines = lyr.plain.split('\n').map((text) => text.trim()).filter(Boolean).slice(0, 7).map((text) => ({ text }));
  }

  const openLyrics = () => { p.openFull(true); p.setPanel('lyrics'); };

  return (
    <aside className="np-panel" aria-label={t('nowPlaying')} style={{ '--np-art': `url(${track.thumb})` }}>
      <div className="np-head">
        <span>{t('nowPlaying')}</span>
        <button className="icon-btn sm" onClick={() => p.openFull(true)} aria-label={t('nowPlaying')}>
          <Icon name="fullscreen" size={15} />
        </button>
      </div>

      <div className={`np-art ${p.playing ? 'is-playing' : ''}`}>
        <img src={track.thumb} alt="" />
      </div>

      <div className="np-meta">
        <div className="np-meta-text">
          <strong title={track.title}>{track.title}</strong>
          <button className="np-artist" onClick={() => p.openFull(true)}>{track.artist}</button>
        </div>
        <button
          className={`icon-btn np-like ${liked ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'toggle-like', id: track.id })}
          aria-label={t('liked')}
        >
          <Icon name="heart" size={18} />
        </button>
      </div>

      <div
        className="np-progress"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(frac * 100)}
        tabIndex={0}
        onClick={(e) => {
          if (!duration) return;
          const r = e.currentTarget.getBoundingClientRect();
          p.seek((e.clientX - r.left) / Math.max(1, r.width));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { p.nudge(5); e.preventDefault(); }
          if (e.key === 'ArrowLeft') { p.nudge(-5); e.preventDefault(); }
        }}
      >
        <span style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="np-times">
        <span>{fmt(position)}</span>
        <span>{track.live ? 'LIVE' : fmt(duration)}</span>
      </div>

      <div className="np-controls">
        <button className="icon-btn" onClick={() => p.prev()} aria-label={t('previous')}><Icon name="prev" size={19} /></button>
        <button className="icon-btn np-play" onClick={() => p.toggle()} aria-label={p.playing ? t('pause') : t('play')}>
          <Icon name={p.playing ? 'pause' : 'play'} size={22} />
        </button>
        <button className="icon-btn" onClick={() => p.next()} aria-label={t('next')}><Icon name="next" size={19} /></button>
      </div>

      <section className="np-card np-lyrics">
        <header className="np-card-head">
          <span><Icon name="lyrics" size={14} /> {t('lyrics')}</span>
          <button onClick={openLyrics}>{t('seeAll')}</button>
        </header>
        {lyr === undefined && <p className="np-muted">{t('lyricsLoading')}</p>}
        {lyr !== undefined && lines.length === 0 && (
          <p className="np-muted">{lyr?.instrumental ? '♪' : t('lyricsNone')}</p>
        )}
        {lines.length > 0 && (
          <div className="np-lyric-lines">
            {lines.map((line, i) => (
              <p key={`${line.time || 0}-${i}`} className={line.active ? 'active' : ''}>{line.text}</p>
            ))}
          </div>
        )}
      </section>

      <section className="np-card np-queue">
        <header className="np-card-head">
          <span title={usingAuto ? t('smartQueueHint') : undefined}>
            <Icon name={usingAuto ? 'radio' : 'queue'} size={14} /> {usingAuto ? t('radioOfSong') : t('upNext')}
          </span>
          <button onClick={() => p.openFull(true)}>{t('queue')}</button>
        </header>
        {usingAuto && <p className="np-muted np-radio-hint">{t('upNextInSonora')}</p>}
        {queue.length === 0 && <p className="np-muted">{t('queueEmpty')}</p>}
        {queue.slice(0, 4).map((tr, i) => (
          <button
            key={`${tr.id}-${i}`}
            className="np-mini-row"
            onClick={() => playAt(i)}
          >
            <img src={tr.thumb} alt="" loading="lazy" />
            <span><strong>{tr.title}</strong><small>{tr.artist}</small></span>
            <Icon name="play" size={14} />
          </button>
        ))}
      </section>
    </aside>
  );
}
