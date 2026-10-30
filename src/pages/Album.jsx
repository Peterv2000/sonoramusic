import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer, fmt } from '../player/PlayerContext.jsx';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { TrackRow } from '../components/widgets.jsx';
import { albumByTitle, ARTISTS } from '../data/catalog.js';

export default function Album() {
  const { id } = useParams();
  const nav = useNavigate();
  const p = usePlayer();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const toast = useToast();

  const album = albumByTitle(decodeURIComponent(id || ''));
  if (!album) return <div className="page"><h1>{t('notFound')}</h1></div>;

  const saved = state.library.savedAlbums.includes(album.title);
  const downloaded = album.tracks.every((tr) => state.library.downloads.includes(tr.id));
  const total = album.tracks.reduce((s, tr) => s + tr.dur, 0);
  const artist = ARTISTS.find((a) => a.name === album.artist || album.artist.startsWith(a.name));

  const toggleDownload = () => {
    if (!state.pro.active) { toast(t('proNeeded')); nav('/pro'); return; }
    if (downloaded) {
      album.tracks.forEach((tr) => {
        if (state.library.downloads.includes(tr.id)) dispatch({ type: 'toggle-download', id: tr.id });
      });
      toast(t('clear'));
    } else {
      dispatch({ type: 'download-many', ids: album.tracks.map((tr) => tr.id) });
      toast(`⬇ ${t('downloadedFlag')}`);
    }
  };

  return (
    <div className="page album-page">
      <header className="album-hero">
        <img className="album-cover" src={album.cover} alt="" />
        <div className="album-info">
          <span className="type-pill">{t('album')}</span>
          <h1>{album.title}</h1>
          <p className="album-sub">
            {artist
              ? <button className="link" onClick={() => nav(`/artist/${encodeURIComponent(artist.name)}`)}>{artist.name}</button>
              : <span>{album.artist}</span>}
            {' · '}{album.year} · {album.tracks.length} {t('songs')} · {fmt(total)}
          </p>
          <div className="head-actions">
            <button className="play-big sm" onClick={() => p.playList(album.tracks)} aria-label={t('play')}><Icon name="play" size={22} /></button>
            <button className="btn" onClick={() => p.playList([...album.tracks].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
            <button
              className={`btn ${saved ? 'primary' : ''}`}
              onClick={() => { dispatch({ type: 'toggle-album', title: album.title }); toast(saved ? t('clear') : t('albumSaved')); }}
            >{saved ? `✓ ${t('albumSaved')}` : `＋ ${t('saveAlbum')}`}</button>
            <button className={`btn ${downloaded ? 'primary' : ''}`} onClick={toggleDownload}>⬇ {downloaded ? t('downloadedFlag') : t('download')}</button>
          </div>
        </div>
      </header>

      <section className="list-section">
        {album.tracks.map((tr, i) => (
          <TrackRow key={tr.id} track={tr} index={i} list={album.tracks} showAlbum />
        ))}
      </section>

      <footer className="album-foot muted">
        <p>{album.year} · {album.genre}</p>
        <p>℗ {album.year} {album.artist} · {t('demoCatalog')}</p>
      </footer>
    </div>
  );
}
