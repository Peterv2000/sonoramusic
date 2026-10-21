import { useApp } from '../state/AppState.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { TrackRow } from '../components/widgets.jsx';
import { trackById } from '../data/catalog.js';
import Icon from '../components/Icon.jsx';

const ago = (ts) => {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

export default function History() {
  const { state, dispatch } = useApp();
  const p = usePlayer();
  const { t } = useI18n();
  const items = state.library.history.map((h) => ({ tr: trackById(h.id), at: h.at })).filter((x) => x.tr);

  return (
    <div className="page">
      <div className="shelf-head">
        <h1><Icon name="history" size={24} /> {t('history')}</h1>
        {items.length > 0 && (
          <button className="btn danger" onClick={() => dispatch({ type: 'clear-history' })}><Icon name="trash" size={15} /> {t('clearHistory')}</button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="empty-box"><p>{t('empty')}</p><small>{t('emptyHint')}</small></div>
      ) : (
        <section className="list-section">
          {items.map(({ tr, at }, i) => (
            <div key={tr.id + at} className="history-wrap">
              <TrackRow track={tr} index={i} list={items.map((x) => x.tr)} />
              <span className="history-time">{ago(at)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
