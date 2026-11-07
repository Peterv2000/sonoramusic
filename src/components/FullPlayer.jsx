import { useEffect, useState } from 'react';
import { usePlayer, usePlayerProgress, fmt } from '../player/PlayerContext.jsx';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { fetchLyrics, activeLineIndex } from '../api/lyrics.js';
import Icon from './Icon.jsx';
import { DJAvatar, Bars } from './DJ.jsx';
import { Reactions, Comments } from './Reactions.jsx';
import { useToast } from './Toast.jsx';

const SLEEP_OPTS = [5, 10, 15, 30, 45, 60, 90];

/* Pestaña de letra sincronizada (LRCLIB) */
function LyricsPane({ track, position, fullscreen = false }) {
  const { t } = useI18n();
  const [lyr, setLyr] = useState(undefined); // undefined = cargando, null = sin letra

  useEffect(() => {
    let dead = false;
    setLyr(undefined);
    fetchLyrics(track.title, track.artist).then((r) => { if (!dead) setLyr(r); });
    return () => { dead = true; };
  }, [track.id, track.title, track.artist]);

  if (lyr === undefined) return <div className={`lyrics-pane muted ${fullscreen ? 'lyrics-full' : ''}`}>🎤 {t('lyricsLoading')}</div>;
  if (!lyr || (!lyr.plain && !lyr.synced?.length)) return <div className={`lyrics-pane muted ${fullscreen ? 'lyrics-full' : ''}`}>🎤 {t('lyricsNone')}</div>;

  if (lyr.synced?.length) {
    const active = activeLineIndex(lyr.synced, position);
    return (
      <div className={`lyrics-pane synced ${fullscreen ? 'lyrics-full' : ''}`}>
        {lyr.synced.map((l, i) => (
          <p key={i} className={i === active ? 'active' : ''}>{l.text}</p>
        ))}
      </div>
    );
  }
  return <div className={`lyrics-pane ${fullscreen ? 'lyrics-full' : ''}`}>{lyr.plain.split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}</div>;
}

export default function FullPlayer() {
  const p = usePlayer();
  const { position, duration } = usePlayerProgress();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const [showSleep, setShowSleep] = useState(false);
  const track = p.track;
  if (!track) return null;

  const liked = state.library.liked.includes(track.id);
  const frac = duration ? position / duration : 0;
  const inPl = state.library.playlists;
  const panel = p.panel; // player | queue | lyrics
  const auto = p.autoQueue || [];
  const usingAuto = p.queue.length === 0 && auto.length > 0;
  const upNext = p.queue.length ? p.queue : auto;

  return (
    <div className="full-player" style={{ '--art': `url(${track.thumb})` }}>
      <div className="full-scrim" />
      <header className="full-head">
        <button className="icon-btn" onClick={() => p.openFull(false)} aria-label={t('close')}>
          <Icon name="chevronDown" />
        </button>
        <div className="full-head-title">{t('nowPlaying')}</div>
        <button
          className={`icon-btn ${p.djOn ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'patch-settings', value: { dj: !p.djOn } })}
          title={p.djOn ? t('dj') : t('djOn')}
          aria-label={t('dj')}
        ><Icon name="micVocal" /></button>
        <button
          className={`icon-btn ${p.videoMode ? 'on' : ''}`}
          onClick={p.toggleVideo}
          title={t('videoHint')}
          aria-label={t('videos')}
        ><Icon name="video" /></button>
      </header>

      {/* Selector de pestañas estilo YT Music / Spotify */}
      <nav className="full-tabs" role="tablist">
        {[
          ['player', 'music', t('nowPlaying')],
          ['queue', 'queue', `${t('queue')} (${upNext.length + p.upcoming.length})`],
          ['lyrics', 'lyrics', t('lyrics')],
        ].map(([id, ico, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={panel === id}
            className={`full-tab ${panel === id ? 'on' : ''}`}
            onClick={() => p.setPanel(id)}
          ><Icon name={ico} size={17} /> {label}</button>
        ))}
      </nav>

      {panel === 'player' && (
        <div className="full-main">
          <img className={`full-art ${p.playing ? 'spinning' : ''}`} src={track.thumb} alt="" />
          <div className="full-meta">
            <div className="full-titles">
              <h2>{track.title}</h2>
              <p>{track.artist} · {track.album} {track.live && <span className="live-pill">{t('liveNow')}</span>}</p>
            </div>
            <button
              className={`icon-btn like-btn ${liked ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'toggle-like', id: track.id })}
              aria-label={t('liked')}
            ><Icon name="heart" size={24} /></button>
          </div>

          <div className="full-seek" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            p.seek((e.clientX - r.left) / r.width);
          }}>
            <div className="seek-track"><div className="seek-fill" style={{ width: `${frac * 100}%` }} /></div>
            <div className="seek-times">
              <span>{p.track.live ? `● ${t('liveNow')}` : fmt(position)}</span>
              <span>{p.track.live ? '' : fmt(duration)}</span>
            </div>
          </div>

          <div className="full-controls">
            <button className={`icon-btn ${p.shuffle ? 'on' : ''}`} onClick={p.toggleShuffle} aria-label={t('shuffle')}><Icon name="shuffle" /></button>
            <button className="icon-btn big" onClick={p.prev} aria-label={t('previous')}><Icon name="prev" size={26} /></button>
            <button className="play-big" onClick={p.toggle} aria-label={p.playing ? t('pause') : t('play')}>
              <Icon name={p.playing ? 'pause' : 'play'} size={30} />
            </button>
            <button className="icon-btn big" onClick={p.next} aria-label={t('next')}><Icon name="next" size={26} /></button>
            <button
              className={`icon-btn ${p.repeat !== 'off' ? 'on' : ''}`}
              onClick={p.cycleRepeat}
              aria-label={t('repeat')}
            ><Icon name={p.repeat === 'one' ? 'repeatOne' : 'repeat'} /></button>
          </div>

          {p.djOn && (
            <div className="dj-strip">
              <DJAvatar speaking={p.djSpeaking} size={52} />
              <div className="dj-strip-body">
                <div className="dj-strip-head">
                  <Bars />
                  <strong>{t('dj')}</strong>
                  {p.djSpeaking && <span className="dj-live">{t('djTagFiller')}</span>}
                </div>
                <p>{p.djText || t('djDesc')}</p>
              </div>
              <div className="dj-voice-controls">
                <button className={`icon-btn ${state.settings.djVoice ? "" : "off"}`} onClick={() => dispatch({ type: "patch-settings", value: { djVoice: !state.settings.djVoice } })} title={t("djVoiceOn")} aria-label={t("djVoiceOn")}>
                  <Icon name={state.settings.djVoice ? "volume" : "mute"} size={16} />
                </button>
                <select className="dj-voice-select" value={p.djVoiceURI || ""} onChange={(e) => p.djSetVoice(e.target.value)} aria-label={t("djVoiceSelect")}>
                  <option value="">{t("djVoiceAuto")}</option>
                  {p.djVoices().map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>
              <button className="icon-btn" onClick={p.djGreet} title={t('djGreet')} aria-label={t('djGreet')}>
                <Icon name="volume" size={18} />
              </button>
            </div>
          )}

          <div className="react-comments-block">
            <Reactions trackId={track.id} />
            <Comments trackId={track.id} />
          </div>

          <div className="full-extra">
            <div className="vol-row">
              <button className="icon-btn" onClick={() => p.setVolume(p.volume > 0 ? 0 : 80)} aria-label={t('mute')}>
                <Icon name={p.volume > 0 ? "volume" : "mute"} size={18} />
              </button>
              <input
                type="range" min="0" max="100" value={p.volume}
                onChange={(e) => p.setVolume(Number(e.target.value))}
                aria-label={t('volume')}
              />
              <button className="icon-btn" onClick={() => p.setVolume(100)} aria-label={t('volumeMax')}>
                <Icon name="volume" size={18} />
              </button>
            </div>
            <div className="extra-btns">
              <button className="chip" onClick={() => setShowSleep(true)}>
                <Icon name="moon" size={15} /> {t('sleepTimer')}{p.sleepEndsAt ? ` · ${Math.ceil((p.sleepEndsAt - Date.now()) / 60000)}m` : ''}
              </button>
              <button className="chip" onClick={() => { p.playNext(track); }}><Icon name="next" size={15} /> {t('playNext')}</button>
              <button className="chip" onClick={() => p.enqueue(track)}><Icon name="plus" size={15} /> {t('addToQueue')}</button>
              {inPl.length > 0 && (
                <select
                  className="chip select-chip"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) dispatch({ type: 'toggle-track-in-playlist', plId: e.target.value, trackId: track.id });
                    e.target.value = '';
                  }}
                >
                  <option value="" disabled>＋ {t('addToPlaylist')}</option>                  {inPl.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {panel === 'queue' && (
        <div className="full-queue">
          <div className="queue-head">
            <h3>{t('queue')}</h3>
            {p.queue.length > 0 && <button className="chip" onClick={p.clearQueue}><Icon name="trash" size={15} /> {t('clearQueue')}</button>}
            {!p.queue.length && auto.length > 0 && (
              <button className="chip" onClick={p.refreshRelated}><Icon name="sparkles" size={15} /> {t('refreshRecommendations')}</button>
            )}
          </div>

          <div className="q-current">
            <small className="muted">{t('nowPlaying')}</small>
            <div className="q-row current">
              <img src={track.thumb} alt="" />
              <div><strong>{track.title}</strong><small>{track.artist}</small></div>
            </div>
          </div>

          <h4 className="q-next-title">
            {usingAuto ? t('upNextInSonora') : t('upNext')} {upNext.length > 0 && <span className="q-count">{upNext.length}</span>}
            {usingAuto && <span className="live-badge"><Icon name="radio" size={12} /> {t('radioOfSong')}</span>}
          </h4>
          {usingAuto && <small className="muted q-radio-hint">{t('smartQueueHint')}</small>}

          {upNext.length === 0 ? (
            <div className="q-empty">
              <p className="muted"><Icon name="music" size={16} /> {t('queueEmpty')}</p>
              <div className="q-empty-actions">
                <button className="chip" onClick={() => p.playRadio(track)}><Icon name="radio" size={15} /> {t('startRadio')}</button>
                {p.related?.length > 0 && (
                  <button className="chip" onClick={() => p.playRelated()}><Icon name="sparkles" size={15} /> {t('playRelated')}</button>
                )}
              </div>
              {p.related?.length > 0 && (
                <>
                  <small className="muted q-related-hint">{t('queueRelatedHint')}</small>
                  {p.related.slice(0, 6).map((r, i) => (
                    <div key={r.id + i} className="q-row q-row-related" onClick={() => p.enqueue(r)}>
                      <img src={r.thumb} alt="" loading="lazy" />
                      <div>
                        <strong>{r.title}</strong><small>{r.artist}</small>
                      </div>
                      <button
                        className="icon-btn q-add"
                        onClick={(e) => { e.stopPropagation(); p.enqueue(r); }}
                        aria-label={t('addToQueue')}
                      ><Icon name="plus" size={16} /></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            upNext.map((q, i) => (
              <div
                key={q.id + i}
                className={`q-row ${usingAuto ? 'q-row-related' : ''}`}
                onClick={() => (usingAuto ? p.playAutoAt(i) : p.playQueueAt(i))}
                draggable={!usingAuto}
                onDragStart={(e) => { if (!usingAuto) e.dataTransfer.setData('text/plain', String(i)); }}
                onDragOver={(e) => { if (!usingAuto) e.preventDefault(); }}
                onDrop={(e) => {
                  if (usingAuto) return;
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  if (Number.isNaN(from) || from === i) return;
                  if (p.reorderQueue) p.reorderQueue(from, i);
                }}
              >
                <img src={q.thumb} alt="" loading="lazy" />
                <div>
                  <strong>{q.title}</strong><small>{q.artist}</small>
                </div>
                {usingAuto ? (
                  <button
                    className="icon-btn q-add"
                    onClick={(e) => { e.stopPropagation(); p.enqueue(q); }}
                    aria-label={t('addToQueue')}
                  ><Icon name="plus" size={16} /></button>
                ) : (
                  <button
                    className="icon-btn"
                    onClick={(e) => { e.stopPropagation(); p.removeFromQueue(i); }}
                    aria-label={t('remove')}
                  ><Icon name="close" size={16} /></button>
                )}
              </div>
            ))
          )}

          {/* Lo que sonará después de la cola: el resto de la lista en curso */}
          {p.upcoming?.length > 0 && (
            <>
              <h4 className="q-next-title q-next-context">{t('nextFromList')}</h4>
              {p.upcoming.slice(0, 12).map((q, i) => (
                <div key={q.id + 'c' + i} className="q-row context" onClick={() => p.playContextAt(i)}>
                  <img src={q.thumb} alt="" loading="lazy" />
                  <div>
                    <strong>{q.title}</strong><small>{q.artist}</small>
                  </div>
                  <button
                    className="icon-btn q-add"
                    onClick={(e) => { e.stopPropagation(); p.enqueue(q); }}
                    aria-label={t('addToQueue')}
                  ><Icon name="plus" size={16} /></button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {panel === 'lyrics' && (state.settings.lyricsFullscreen ? <div className="lyrics-fullscreen-wrap" style={{ '--art': `url(${track.thumb})` }}><div className="lyrics-fullscreen-scrim" /><div className="lyrics-fullscreen-head"><button className="icon-btn" onClick={() => p.setPanel('player')}><Icon name="chevronDown" /></button><div>{track.title} · {track.artist}</div></div><LyricsPane track={track} position={position} fullscreen /></div> : <LyricsPane track={track} position={position} />)}

      {showSleep && (
        <div className="modal-backdrop" onClick={() => setShowSleep(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3><Icon name="moon" size={18} /> {t('sleepTimer')}</h3>
            <p className="muted">{t('sleepTimerHint')}</p>
            <div className="sleep-grid">
              {SLEEP_OPTS.map((m) => (
                <button key={m} className="chip" onClick={() => { p.setSleep(m); setShowSleep(false); toast(`${t('sleepTimer')} · ${m} min`); }}>{m} min</button>
              ))}
              {p.sleepEndsAt && (
                <button className="chip" onClick={() => { p.setSleep(0); setShowSleep(false); }}>{t('cancel')}</button>
              )}
            </div>
            {!state.pro.active && <p className="muted small">{t('sleepFreeNote')}</p>}
          </div>
        </div>
      )}

      {/* El auditor de reproducción cambia de fuente en silencio: nunca
          mostramos un cartel de error por una URL 404/500. Los fallos se
          registran en telemetría para el QA Robot. */}
    </div>
  );
}
