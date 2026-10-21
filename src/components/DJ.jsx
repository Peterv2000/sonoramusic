/* ══════════════════════════════════════════════════════════════════════════
   DJ RITMO — presencia visual interactiva.

   Dos piezas:
     · <DJDrop>   aviso flotante que aparece entre canciones con la frase del
                  DJ, barras de ecualizador animadas y botón para repetir.
     · <DJAvatar> retrato animado del DJ (ondas + aro que late) para usar en
                  el reproductor y en los ajustes.

   Sin dependencias: todo con CSS/SVG y la Web Speech API opcional.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/useI18n.jsx';

/* Barras de ecualizador animadas (puro CSS). */
function Bars({ count = 4 }) {
  return (
    <span className="dj-bars" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />
      ))}
    </span>
  );
}

/* Retrato del DJ: disco con ondas que laten. `speaking` lo aviva. */
export function DJAvatar({ speaking = false, size = 96 }) {
  return (
    <span
      className={`dj-avatar ${speaking ? 'speaking' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="dj-ring r1" />
      <span className="dj-ring r2" />
      <span className="dj-disc">
        <span className="dj-face">🎧</span>
      </span>
    </span>
  );
}

/* Aviso flotante del DJ. `onRepeat` vuelve a locutar la frase. */
export function DJDrop({ text, tag, onClose, onRepeat }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!text) return;
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [text]);

  if (!text) return null;

  return (
    <div className={`dj-drop ${shown ? 'in' : ''}`} role="status" aria-live="polite">
      <DJAvatar speaking size={54} />
      <div className="dj-drop-body">
        <div className="dj-drop-head">
          <Bars />
          <strong>DJ Ritmo</strong>
          {tag && <span className="dj-drop-tag">{t(tag)}</span>}
        </div>
        <p>{text}</p>
        <div className="dj-drop-actions">
          <button className="dj-mini-btn" onClick={onRepeat} title={t('djReplay')}>
            <Icon name="volume" size={14} /> {t('djReplay')}
          </button>
        </div>
      </div>
      {onClose && (
        <button className="dj-drop-close" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}

export { Bars };
