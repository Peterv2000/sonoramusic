/* ══════════════════════════════════════════════════════════════════════════
   Reproductor de vídeo NATIVO.

   Envolvemos el iframe de reproducción con nuestra propia "carcasa": marco,
   cabecera de marca y controles propios (play/pausa, barra de progreso,
   tiempo, volumen, anterior/siguiente, pantalla completa). El contenido del
   iframe se recorta por CSS para que las barras/logo del proveedor queden
   fuera de vista; el usuario solo ve la app.

   Interacción:
     · 1 toque/clic en cualquier parte del vídeo → reproducir / pausar
     · 2 toques (double-tap) izquierda/derecha   → ±10 s
     · Arrastrar sobre el vídeo                  → adelantar/atrasar
     · Botón de pantalla completa (Fullscreen API) → vídeo a pantalla completa
       SIN nada del proveedor visible.

   IMPORTANTE: el iframe vive en `.yt-host`, que NO se mueve ni se recrea
   (moverlo reinicia la reproducción). Este componente solo dibuja capas
   hermanas encima/alrededor.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer, fmt } from './PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import Icon from '../components/Icon.jsx';

const SKIP_SECONDS = 10;

export default function VideoStage({ hostRef, videoMode }) {
  const p = usePlayer();
  const { t } = useI18n();
  const [hideUi, setHideUi] = useState(false);
  const [fs, setFs] = useState(false);            // pantalla completa activa
  const [dragPct, setDragPct] = useState(null);   // % mientras se arrastra
  const [flash, setFlash] = useState(null);       // aviso ±10 s
  const [jumpSide, setJumpSide] = useState(null); // zona iluminada al saltar
  const idleRef = useRef(null);
  const frameRef = useRef(null);
  const tapRef = useRef({ t: 0, x: 0, y: 0, side: 0 });
  const draggingRef = useRef(false);

  const open = videoMode;
  const track = p.track;

  /* Muestra los controles y los vuelve a ocultar tras 3 s de inactividad */
  const wake = useCallback(() => {
    setHideUi(false);
    clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setHideUi(true), 3000);
  }, []);

  useEffect(() => {
    if (!open) return;
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(idleRef.current);
      window.removeEventListener('mousemove', wake);
    };
  }, [open, wake]);

  /* Sigue el estado de pantalla completa (incluye salir con Esc) */
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* Al cerrar el reproductor, salimos también de pantalla completa */
  useEffect(() => {
    if (!open && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [open]);

  const pct = p.duration ? Math.min(100, (p.position / p.duration) * 100) : 0;
  const shownPct = dragPct != null ? dragPct : pct;

  const toggleFullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    }
  };

  /* ── Arrastrar para buscar (la barra y/o el propio vídeo) ── */
  const fracFromEvent = (e, el) => {
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const startScrub = (e, el) => {
    e.preventDefault();
    draggingRef.current = true;
    wake();
    const move = (ev) => setDragPct(fracFromEvent(ev, el) * 100);
    const up = (ev) => {
      draggingRef.current = false;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      p.seek(fracFromEvent(ev, el));
      setDragPct(null);
      wake();
    };
    setDragPct(fracFromEvent(e, el) * 100);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  /* ── Salto de ±N segundos con aviso visual ── */
  const nudge = (sec) => {
    p.nudge(sec);
    setFlash(sec > 0 ? `+${sec}s` : `${sec}s`);
    setJumpSide(sec > 0 ? 'right' : 'left');
    window.setTimeout(() => { setFlash(null); setJumpSide(null); }, 650);
    wake();
  };

  /* ── Toque/clic sobre el vídeo: 1 = play/pausa, 2 = ±10 s ── */
  const onScreenTap = (e) => {
    if (draggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side = x < rect.width / 2 ? -1 : 1;
    const now = Date.now();
    const prev = tapRef.current;

    // ¿Segundo toque seguido (double-tap) en la misma zona?
    if (now - prev.t < 320 && Math.abs(x - prev.x) < rect.width * 0.35) {
      tapRef.current = { t: 0, x: 0, y: 0, side: 0 };
      nudge(side * SKIP_SECONDS);
      return;
    }
    tapRef.current = { t: now, x, y: e.clientY - rect.top, side };
    // Un toque simple: esperamos un poco por si llega el segundo
    setTimeout(() => {
      if (tapRef.current.t === now) {
        p.toggle();
        wake();
      }
    }, 260);
  };

  const fsLabel = fs ? t('exitFullscreen') : t('fullscreen');

  return (
    <>
      {/* Fondo oscuro: clic fuera cierra (no se muestra en pantalla completa) */}
      {open && !fs && <div className="vstage-backdrop" onClick={() => p.openFull(false)} />}

      {/* Carcasa nativa. IMPORTANTE: `.yt-host` está SIEMPRE montado aquí (aunque
          el vídeo esté cerrado) para que el iframe nunca se recree; así la
          reproducción no se reinicia al abrir/cerrar el vídeo ni al entrar en
          pantalla completa. Solo se muestra/oculta con clases. */}
      <div className={`vstage ${open ? 'open' : ''} ${hideUi ? 'idle' : ''} ${fs ? 'fs' : ''}`} role="dialog" aria-label={t('nowPlaying')}>
        <div className="vstage-frame" ref={frameRef}>
          <div className="vstage-head">
            <div className="vstage-brand">
              <span className="vstage-dot" />
              <strong>Sonora</strong>
              <span className="vstage-sep">·</span>
              <span className="vstage-sub">{t('videoTitle') || 'Vídeo'}</span>
            </div>
            <div className="vstage-head-actions">
              <button className="vstage-icon" title={fsLabel} onClick={toggleFullscreen}>
                <Icon name={fs ? 'fullscreenExit' : 'fullscreen'} size={17} />
              </button>
              <button className="vstage-icon" title={t('closePanel')} onClick={() => p.openFull(false)}>
                <Icon name="close" size={17} />
              </button>
            </div>
          </div>

          {/* Área del vídeo: aquí vive el iframe recortado.
              · 1 toque → play/pausa   · 2 toques → ±10 s   · arrastrar → buscar */}
          <div
            className="vstage-screen"
            onClick={onScreenTap}
            onDoubleClick={(e) => e.preventDefault()}
            role="button" tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); p.toggle(); wake(); }
              if (e.key === 'ArrowRight') nudge(SKIP_SECONDS);
              if (e.key === 'ArrowLeft') nudge(-SKIP_SECONDS);
            }}
            aria-label={p.playing ? t('pause') : t('play')}
          >
            {/* Contenedor del iframe (nodo estable): se recorta por CSS.
                Va DENTRO de la carcasa para que la pantalla completa incluya el vídeo. */}
            <div className="yt-host" aria-hidden={!open}>
              <div ref={hostRef} />
            </div>

            {/* Zonas de doble toque (feedback visual) */}
            <span className={`vstage-dbl left ${jumpSide === 'left' ? 'show' : ''}`}><Icon name="rewind" size={26} /><em>10</em></span>
            <span className={`vstage-dbl right ${jumpSide === 'right' ? 'show' : ''}`}><Icon name="forward" size={26} /><em>10</em></span>

            {open && !p.playing && (
              <div className="vstage-screen-play"><Icon name="play" size={46} /></div>
            )}

            {/* Aviso de ±10 s */}
            {flash && <div className="vstage-flash">{flash}</div>}
          </div>

          <div className="vstage-controls">
            {/* Barra de progreso: clic o arrastre para buscar */}
            <div
              className="vstage-progress"
              onPointerDown={(e) => startScrub(e, e.currentTarget)}
              role="slider"
              aria-label={t('seek') || 'Progreso'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shownPct)}
            >
              <div className="vstage-progress-fill" style={{ width: shownPct + '%' }} />
              <div className="vstage-progress-knob" style={{ left: shownPct + '%' }} />
            </div>

            <div className="vstage-row">
              <button className="vstage-icon" title={t('previous')} onClick={() => p.prev()}>
                <Icon name="prev" size={20} />
              </button>
              <button className="vstage-icon" title={t('rew10') || '-10 s'} onClick={() => nudge(-SKIP_SECONDS)}>
                <Icon name="rewind" size={20} />
              </button>
              <button className="vstage-play" onClick={() => { p.toggle(); wake(); }}>
                <Icon name={p.playing ? 'pause' : 'play'} size={22} />
              </button>
              <button className="vstage-icon" title={t('fwd10') || '+10 s'} onClick={() => nudge(SKIP_SECONDS)}>
                <Icon name="forward" size={20} />
              </button>
              <button className="vstage-icon" title={t('next')} onClick={() => p.next()}>
                <Icon name="next" size={20} />
              </button>

              <span className="vstage-time">
                {fmt(p.position)} <span className="vstage-time-sep">/</span> {fmt(p.duration)}
              </span>

              <div className="vstage-right">
                <div className="vstage-meta">
                  <strong>{track?.title}</strong>
                  <small>{track?.artist}</small>
                </div>
                <div className="vstage-vol">
                  <button
                    className="vstage-icon"
                    title={t('volume')}
                    onClick={() => p.setVolume(p.volume > 0 ? 0 : 80)}
                  >
                    <Icon name={p.volume > 0 ? 'volume' : 'mute'} size={18} />
                  </button>
                  <input
                    className="vstage-vol-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={p.volume}
                    onChange={(e) => p.setVolume(Number(e.target.value))}
                    aria-label={t('volume')}
                  />
                </div>
                <button className="vstage-icon" title={fsLabel} onClick={toggleFullscreen}>
                  <Icon name={fs ? 'fullscreenExit' : 'fullscreen'} size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
