/* ══════════════════════════════════════════════════════════════════════════
   Reacciones y comentarios por canción.

   Bloque reutilizable: muestra una fila de emojis reaccionables (con contador)
   y una sección de comentarios con avatar, fecha y "me gusta".
   Todo se persiste en el estado de la app (localStorage), sin backend.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

export const REACTIONS = [
  { emoji: '❤️', label: 'Me encanta' },
  { emoji: '🔥', label: 'Fuego' },
  { emoji: '👏', label: 'Aplauso' },
  { emoji: '😍', label: 'Fascinado' },
  { emoji: '😢', label: 'Me emociona' },
  { emoji: '🤘', label: 'Rock' },
];

function timeAgo(ts, lang) {
  const es = lang === 'es';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return es ? 'ahora' : 'now';
  if (m < 60) return es ? `hace ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return es ? `hace ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return es ? `hace ${d} d` : `${d}d ago`;
}

export function Reactions({ trackId }) {
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const counts = state.library.reactions?.[trackId] || {};
  const mine = state.library.myReactions?.[trackId] || [];

  return (
    <div className="react-row" role="group" aria-label={t('reactions')}>
      {REACTIONS.map((r) => {
        const n = counts[r.emoji] || 0;
        const on = mine.includes(r.emoji);
        return (
          <button
            key={r.emoji}
            className={`react-chip ${on ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'react-track', id: trackId, emoji: r.emoji })}
            title={r.label}
            aria-pressed={on}
          >
            <span className="react-emoji">{r.emoji}</span>
            {n > 0 && <span className="react-count">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Comments({ trackId }) {
  const { state, dispatch } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const p = usePlayer();
  const [text, setText] = useState('');
  const comments = state.library.comments?.[trackId] || [];
  const user = state.profile?.name || 'Tú';

  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    if (v.length > 280) { toast(t('commentTooLong')); return; }
    dispatch({ type: 'add-comment', trackId, text: v, user });
    setText('');
    toast('💬 ' + t('commentAdded'));
  };

  return (
    <div className="comments-block">
      <div className="comments-head">
        <h3><Icon name="lyrics" size={16} /> {t('comments')} <span className="count-badge">{comments.length}</span></h3>
      </div>

      <form className="comment-form" onSubmit={submit}>
        <div className="comment-avatar">{state.profile?.avatar || '🎧'}</div>
        <input
          className="comment-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('commentPlaceholder')}
          maxLength={280}
        />
        <button className="btn primary small" type="submit" disabled={!text.trim()}>{t('commentPost')}</button>
      </form>

      {comments.length === 0 ? (
        <p className="muted small-pad">{t('commentsEmpty')}</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <div className="comment-avatar">{c.user === user ? (state.profile?.avatar || '🎧') : '👤'}</div>
              <div className="comment-body">
                <div className="comment-meta">
                  <strong>{c.user}</strong>
                  <small>{timeAgo(c.at, lang)}</small>
                </div>
                <p>{c.text}</p>
                <div className="comment-actions">
                  <button
                    className={`comment-like ${c.likedByMe ? 'on' : ''}`}
                    onClick={() => dispatch({ type: 'like-comment', trackId, commentId: c.id })}
                  >
                    <Icon name="heart" size={13} /> {c.likes || 0}
                  </button>
                  {c.user === user && (
                    <button
                      className="comment-del"
                      onClick={() => { dispatch({ type: 'delete-comment', trackId, commentId: c.id }); toast('✓'); }}
                    ><Icon name="trash" size={13} /> {t('delete')}</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default { Reactions, Comments };
