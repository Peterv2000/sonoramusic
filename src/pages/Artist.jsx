import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { Card, Shelf, TrackRow } from '../components/widgets.jsx';
import { artistByName, relatedArtists, ARTISTS, formatFollowers, nf } from '../data/catalog.js';

export default function Artist() {
  const { name } = useParams();
  const nav = useNavigate();
  const p = usePlayer();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const toast = useToast();

  const artist = artistByName(decodeURIComponent(name || ''));
  if (!artist) {
    return <div className="page"><h1>{t('notFound')}</h1></div>;
  }

  const top = [...artist.tracks].sort((a, b) => b.views - a.views).slice(0, 8);
  const albums = [...new Map(artist.tracks.map((tr) => [tr.album, tr])).values()];
  const following = state.library.followedArtists.includes(artist.name);
  const related = relatedArtists(artist);

  return (
    <div className="page artist-page">
      <header className="artist-hero" style={{ '--g': `var(--accent)` }}>
        <img className="artist-photo" src={artist.thumb} alt="" />
        <div className="artist-id">
          <span className="verified">✔ {t('verified')}</span>
          <h1>{artist.name}</h1>
          <p className="muted">{formatFollowers(artist.listeners)}</p>
        </div>
        <div className="artist-actions">
          <button className="play-big sm" onClick={() => p.playList(artist.tracks)} aria-label={t('play')}>▶</button>
          <button
            className={`btn ${following ? 'primary' : ''}`}
            onClick={() => { dispatch({ type: 'toggle-artist', name: artist.name }); toast(following ? t('unfollowed') : t('following')); }}
          >{following ? `✓ ${t('following')}` : t('follow')}</button>
          <button className="btn" onClick={() => p.playRadio(artist.tracks[0])}>📡 {t('stations')}</button>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/artist/${encodeURIComponent(artist.name)}`).catch(() => {}); toast(t('copiedLink')); }}><Icon name="share" size={15} /> {t('share')}</button>
        </div>
      </header>

      <section className="list-section">
        <div className="shelf-head"><h2>{t('topSongs')}</h2></div>
        {top.map((tr, i) => (
          <TrackRow key={tr.id} track={tr} index={i} list={top} showAlbum />
        ))}
      </section>

      <section className="list-section">
        <div className="shelf-head"><h2>{t('discography')}</h2></div>
        <div className="shelf-row">
          {albums.map((tr) => (
            <Card
              key={tr.album}
              item={{ title: tr.album, sub: `${tr.year} · ${t('album')}`, thumb: tr.thumb }}
              onPlay={() => p.playList(artist.tracks.filter((x) => x.album === tr.album))}
              onOpen={() => nav(`/album/${encodeURIComponent(tr.album)}`)}
              sub={`${tr.year} · ${t('album')}`}
            />
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <Shelf title={t('fansAlsoLike')}>
          {related.map((a) => (
            <Card
              key={a.name}
              item={{ title: a.name, thumb: a.thumb }}
              round
              sub={`${nf.format(a.listeners)} ${t('listeners')}`}
              onPlay={() => p.playList(a.tracks)}
              onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
            />
          ))}
        </Shelf>
      )}

      <Shelf title={t('charts')}>
        {ARTISTS.slice(0, 8).map((a) => (
          <Card
            key={a.name}
            item={{ title: a.name, thumb: a.thumb }}
            round
            sub={`${nf.format(a.listeners)} ${t('listeners')}`}
            onPlay={() => p.playList(a.tracks)}
            onOpen={() => nav(`/artist/${encodeURIComponent(a.name)}`)}
          />
        ))}
      </Shelf>
    </div>
  );
}
