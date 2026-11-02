import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer, fmt } from '../player/PlayerContext.jsx';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

/* Tarjeta de carátula + título + subtítulo, con acciones rápidas. */
export function Card({ item, onPlay, onOpen, onQueue, sub, round, badge }) {
  const { t } = useI18n();
  return (
    <div className={`card ${round ? 'round' : ''}`} onClick={onOpen || onPlay}>
      <div className="card-art">
        <img src={item.thumb || item.cover} alt="" loading="lazy" />
        {badge && <span className="card-badge">{badge}</span>}
        <div className="card-actions">
          {onQueue && (
            <button
              className="card-queue"
              aria-label={t('addToQueue')}
              title={t('addToQueue')}
              onClick={(e) => { e.stopPropagation(); onQueue(); }}
            ><Icon name="plus" size={18} /></button>
          )}
          {(onPlay || onOpen) && (
            <button
              className="card-play"
              aria-label={t('play')}
              onClick={(e) => { e.stopPropagation(); if (onPlay) onPlay(); else if (onOpen) onOpen(); }}
            ><Icon name="play" size={22} /></button>
          )}
        </div>
      </div>
      <strong className="card-title">{item.title || item.name}</strong>
      <small className="card-sub">{sub || item.desc || item.artist}</small>
    </div>
  );
}

/* Fila de canción con acciones: reproducir, añadir a la cola, like y menú. */
export function TrackRow({ track, list, index, onPlay, onQueue, showAlbum }) {
  const p = usePlayer();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const liked = state.library.liked.includes(track.id);
  const isCurrent = p.track?.id === track.id;
  const downloaded = state.library.downloads.includes(track.id);

  const goArtist = () => { setMenu(false); nav(`/artist/${encodeURIComponent(track.artist)}`); };
  const goAlbum = () => { setMenu(false); nav(`/album/${encodeURIComponent(track.album)}`); };

  return (
    <div className={`track-row ${isCurrent ? 'current' : ''}`}>
      <div className="tr-left" onClick={() => (onPlay ? onPlay() : p.playList(list, track.id))}>
        <span className="tr-index">{isCurrent && p.playing ? '♪' : index != null ? index + 1 : '▶'}</span>
        <img src={track.thumb} alt="" loading="lazy" />
        <div className="tr-meta">
          <strong>{track.title}</strong>
          <small>
            {track.artist}
            {showAlbum && track.album && track.album !== 'Sonora' && track.album !== 'Ritmo' && <> · {track.album}</>}
            {track.explicit && <> · <span className="explicit-badge">E</span></>}
            {track.live && <> · <span className="live-pill">EN VIVO</span></>}
            {downloaded && <> · <span className="dl-badge">⬇ {t('downloadedFlag')}</span></>}
          </small>
        </div>
      </div>
      <div className="tr-right">
        <span className="tr-dur">{track.live ? '—' : fmt(track.dur)}</span>
        <button
          className="icon-btn tr-queue"
          onClick={(e) => {
            e.stopPropagation();
            if (onQueue) onQueue();
            else { p.enqueue(track); toast(t('addToQueue')); }
          }}
          aria-label={t('addToQueue')}
          title={t('addToQueue')}
        >
          <Icon name="plus" size={17} />
        </button>
        <button className={`icon-btn ${liked ? 'on' : ''}`} onClick={() => dispatch({ type: 'toggle-like', id: track.id })} aria-label={t('liked')}>
          <Icon name="heart" />
        </button>
        <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label={t('more')}><Icon name="more" /></button>
      </div>
      {menu && (
        <div className="tr-menu" onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { p.playNext(track); setMenu(false); toast(t('playNext')); }}><Icon name="next" size={16} /> {t('playNext')}</button>
          <button onClick={() => { p.enqueue(track); setMenu(false); toast(t('addToQueue')); }}><Icon name="plus" size={16} /> {t('addToQueue')}</button>
          <button onClick={goArtist}><Icon name="artist" size={16} /> {t('goToArtist')}</button>
          <button onClick={goAlbum}><Icon name="album" size={16} /> {t('goToAlbum')}</button>
          <button onClick={() => { p.playRadio(track); setMenu(false); }}><Icon name="radio" size={16} /> {t('stations')}</button>
          <button
            onClick={() => {
              setMenu(false);
              if (!state.pro.active) { toast(t('proNeeded')); nav('/pro'); return; }
              dispatch({ type: 'toggle-download', id: track.id });
              toast(downloaded ? t('clear') : t('downloadedFlag'));
            }}
          ><Icon name={downloaded ? 'check' : 'download'} size={16} /> {downloaded ? t('clear') : t('download')}</button>
          <button onClick={() => {
            setMenu(false);
            const shareUrl = `${location.origin}/#/search?t=${encodeURIComponent(track.title)}`;
            if (navigator.share) {
              navigator.share({ title: track.title, text: `${track.title} — ${track.artist}`, url: shareUrl }).catch(() => {});
            } else {
              navigator.clipboard?.writeText(shareUrl).catch(() => {});
              toast(t('copiedLink'));
            }
          }}><Icon name="share" size={16} /> {t('share')}</button>
        </div>
      )}
    </div>
  );
}

/* Fila horizontal de tarjetas con título de sección */
export function Shelf({ title, children, action }) {
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="shelf-row">{children}</div>
    </section>
  );
}

/* Rejilla gráfica de categorías (géneros) con arte, icono y contador.
   `onPick` navega/selecciona; `onPlay` reproduce la categoría al instante. */
export function GenreGrid({ genres, countOf, onPick, onPlay, selected }) {
  const { t } = useI18n();
  return (
    <div className="genre-grid">
      {genres.map((g) => {
        const sel = selected === g.id;
        return (
          <div
            key={g.id}
            className={`genre-card ${sel ? 'sel' : ''}`}
            style={{ '--g': g.color }}
            onClick={() => onPick(g.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g.id); } }}
          >
            <img className="genre-art" src={g.cover} alt="" loading="lazy" />
            <span className="genre-shade" />
            <span className="genre-icon"><Icon name={g.icon} size={18} /></span>
            {countOf && <span className="genre-count">{countOf(g.id)} {t('songs')}</span>}
            <div className="genre-text">
              <strong>{g.id}</strong>
              <small>{g.tag}</small>
            </div>
            {onPlay && (
              <button
                className="genre-play"
                aria-label={`${t('playAll')} ${g.id}`}
                onClick={(e) => { e.stopPropagation(); onPlay(g.id); }}
              ><Icon name="play" size={22} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}
