import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { usePlayer, usePlayerProgress } from '../player/PlayerContext.jsx';
import { TrackRow } from '../components/widgets.jsx';
import { trackById, ARTISTS } from '../data/catalog.js';
import Icon from '../components/Icon.jsx';

/* Cuenta frecuencias a partir de una lista de IDs */
function tally(ids) {
  const map = new Map();
  for (const id of ids) {
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Profile() {
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const { position } = usePlayerProgress();
  const nav = useNavigate();
  const { t } = useI18n();
  const { profile, pro, library } = state;

  const plays = library.history.length;
  const minutes = Math.round(library.history.length * 3.5 + (position > 0 ? position / 60 : 0));

  /* ── "Tu 2026 en música" (Spotify Wrapped / Apple Replay) ── */
  const replay = useMemo(() => {
    const counted = tally(Object.keys(library.playCounts || {}));
    const topSongs = counted.slice(0, 5).map(([id, n]) => ({ tr: trackById(id), n })).filter((x) => x.tr);

    const artistTally = new Map();
    const genreTally = new Map();
    for (const [id, n] of counted) {
      const tr = trackById(id);
      if (!tr) continue;
      artistTally.set(tr.artist, (artistTally.get(tr.artist) || 0) + n);
      genreTally.set(tr.genre, (genreTally.get(tr.genre) || 0) + n);
    }
    const topArtist = [...artistTally.entries()].sort((a, b) => b[1] - a[1])[0];
    const topGenre = [...genreTally.entries()].sort((a, b) => b[1] - a[1])[0];
    const totalPlays = counted.reduce((s, [, n]) => s + n, 0);
    const topArtistData = topArtist ? ARTISTS.find((a) => a.name === topArtist[0]) : null;
    return { topSongs, topArtist, topGenre, totalPlays, topArtistData };
  }, [library.playCounts]);

  const edit = () => {
    const name = prompt(t('name'), profile.name);
    if (name == null) return;
    const email = prompt(t('email'), profile.email || '');
    dispatch({ type: 'set', key: 'profile', value: { name: name.trim() || 'Invitado', email: (email || '').trim() } });
  };

  return (
    <div className="page narrow">
      <div className="profile-head">
        <div className="profile-avatar">
          {(profile.avatar && profile.avatar !== '🎧') ? profile.avatar : (profile.name || ' Invitado').trim().charAt(0).toUpperCase() || '🎧'}
        </div>
        <h1>{profile.name} {pro.active && <span className="badge-pro">✦ {t('proBadge')}</span>}</h1>
        <p className="muted">{profile.email || t('guest')}</p>
        <div className="head-actions" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={edit} aria-label={t('edit')}><Icon name="edit" size={15} /></button>
          <button className="btn" onClick={() => location.hash = '#/settings'}><Icon name="settings" size={15} /> {t('settings')}</button>
          <button className="btn primary" onClick={() => location.hash = '#/pro'}>✦ {t('upgrade')}</button>
        </div>
      </div>

      <section className="set-group">
        <h2><Icon name="chart" size={16} /> {t('stats')}</h2>
        <div className="stats-grid">
          <div className="stat"><strong>{minutes}</strong><small>{t('minutesPlayed')}</small></div>
          <div className="stat"><strong>{plays}</strong><small>{t('tracksPlayed')}</small></div>
          <div className="stat"><strong>{library.liked.length}</strong><small>{t('likedCount')}</small></div>
          <div className="stat"><strong>{library.playlists.length}</strong><small>{t('playlists')}</small></div>
          <div className="stat"><strong>{library.downloads.length}</strong><small>{t('downloads')}</small></div>
          <div className="stat"><strong>{library.followedArtists.length}</strong><small>{t('artists')}</small></div>
        </div>
      </section>

      {/* ── Wrapped / Replay ── */}
      <section className="set-group wrapped">
        <h2><Icon name="sparkles" size={20} /> {t('replay')}</h2>

        {replay.totalPlays === 0 ? (
          <p className="muted pad">{t('replayEmpty')}</p>
        ) : (
          <>
            {replay.topArtist && (
              <div className="wrapped-hero" onClick={() => replay.topArtistData && nav(`/artist/${encodeURIComponent(replay.topArtist[0])}`)}>
                <div className="wrapped-rank">1</div>
                <div>
                  <small>{t('topArtist')}</small>
                  <strong>{replay.topArtist[0]}</strong>
                  <span className="muted">{replay.topArtist[1]} {t('tracksPlayed')}</span>
                </div>
                {replay.topArtistData && <img src={replay.topArtistData.thumb} alt="" />}
              </div>
            )}

            <div className="stats-grid">
              <div className="stat">
                <strong>{replay.topGenre ? replay.topGenre[0] : '—'}</strong>
                <small>{t('topGenre')}</small>
              </div>
              <div className="stat"><strong>{replay.totalPlays}</strong><small>{t('mostPlayed')}</small></div>
            </div>

            <div className="wrapped-list">
              <h3>{t('topSongs')}</h3>
              {replay.topSongs.map(({ tr, n }, i) => (
                <div key={tr.id} className="wrapped-song">
                  <span className="rank">{i + 1}</span>
                  <TrackRow track={tr} index={null} list={replay.topSongs.map((x) => x.tr)} />
                  <span className="muted small-count">×{n}</span>
                </div>
              ))}
            </div>

            <button className="btn primary" onClick={() => p.playList(replay.topSongs.map((x) => x.tr))}>
              <Icon name="play" size={15} /> {t('play')}
            </button>
          </>
        )}
      </section>

      <section className="set-group">
        <h2>{t('subscription')}</h2>
        <div className="setting-row static">
          <span className="set-label">
            <strong>{pro.active ? `✦ ${t('subActive')}` : 'Free'}</strong>
            <small>{pro.active && pro.since ? `${t('subSince')} ${new Date(pro.since).toLocaleDateString()}` : t('upgrade')}</small>
          </span>
          <button className="btn" onClick={() => location.hash = '#/pro'}>→</button>
        </div>
      </section>
    </div>
  );
}
