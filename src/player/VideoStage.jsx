/* ══════════════════════════════════════════════════════════════════════════
   Reproductor de vídeo NATIVO.

   Envolvemos el iframe de reproducción con nuestra propia "carcasa": marco,
   cabecera de marca y controles propios (play/pausa, barra de progreso,
   tiempo, volumen, anterior/siguiente). El contenido del iframe se recorta
   por CSS para que las barras/logo del proveedor queden fuera de vista;
   el usuario solo ve la app.

   IMPORTANTE: el iframe vive en `.yt-host`, que NO se mueve ni se recrea
   (moverlo reinicia la reproducción). Este componente solo dibuja capas
   hermanas encima/alrededor.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { usePlayer, fmt } from './PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import Icon from '../components/Icon.jsx';

export default function VideoStage() {
  const p = usePlayer();
  const { t } = useI18n();
  const [hideUi, setHideUi] = useState(false);
  const idleRef = useRef(null);

  const open = p.videoMode;
  const track = p.track;

  /* Oculta los controles tras 3 s de inactividad (como un reproductor real) */
  useEffect(() => {
    if (!open) return;
    const wake = () => {
      setHideUi(false);
      clearTimeout(idleRef.current);
      idleRef.current = setTimeout(() => setHideUi(true), 3000);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      clearTimeout(idleRef.current);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, [open]);

  if (!open || !track) return null;

  const pct = p.duration ? Math.min(100, (p.position / p.duration) * 100) : 0;

  const seekTo = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    p.seek(frac);
  };

  return (
    <>
      {/* Fondo oscuro: clic fuera cierra */}
      <div className="vstage-backdrop" onClick={() => p.openFull(false)} />

      {/* Carcasa nativa: marco + cabecera de marca + controles propios.
          El iframe (.yt-host) se dibuja por encima, recortado dentro del marco. */}
      <div className={`vstage ${hideUi ? 'idle' : ''}`} role="dialog" aria-label={t('nowPlaying')}>
        <div className="vstage-frame">
          <div className="vstage-head">
            <div className="vstage-brand">
              <span className="vstage-dot" />
              <strong>Ritmo</strong>
              <span className="vstage-sep">·</span>
              <span className="vstage-sub">{t('videoTitle') || 'Vídeo'}</span>
            </div>
            <div className="vstage-head-actions">
              <button className="vstage-icon" title={t('closePanel')} onClick={() => p.openFull(false)}>
                <Icon name="close" size={17} />
              </button>
            </div>
          </div>

          {/* Área del vídeo (el iframe real se superpone aquí).
              Un clic alterna reproducción/pausa, como en cualquier reproductor. */}
          <div className="vstage-screen" onClick={() => p.toggle()} role="button" tabIndex={0}
               onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') p.toggle(); }}
               aria-label={p.playing ? t('pause') : t('play')}>
            {!p.playing && (
              <div className="vstage-screen-play"><Icon name="play" size={42} /></div>
            )}
          </div>

          <div className="vstage-controls">
            <div className="vstage-progress" onClick={seekTo}>
              <div className="vstage-progress-fill" style={{ width: pct + '%' }} />
              <div className="vstage-progress-knob" style={{ left: pct + '%' }} />
            </div>

            <div className="vstage-row">
              <button className="vstage-icon" title={t('previous')} onClick={() => p.prev()}>
                <Icon name="prev" size={20} />
              </button>
              <button className="vstage-play" onClick={() => p.toggle()}>
                <Icon name={p.playing ? 'pause' : 'play'} size={22} />
              </button>
              <button className="vstage-icon" title={t('next')} onClick={() => p.next()}>
                <Icon name="next" size={20} />
              </button>

              <span className="vstage-time">
                {fmt(p.position)} <span className="vstage-time-sep">/</span> {fmt(p.duration)}
              </span>

              <div className="vstage-right">
                <div className="vstage-meta">
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </div>
                <button
                  className="vstage-icon"
                  title={t('volume')}
                  onClick={() => p.setVolume(p.volume > 0 ? 0 : 80)}
                >
                  <Icon name={p.volume > 0 ? 'volume' : 'mute'} size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
