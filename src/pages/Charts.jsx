import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer, fmt } from '../player/PlayerContext.jsx';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { CHART_TABS, topCharts, nf } from '../data/catalog.js';
import { getCharts } from '../api/liveData.js';
import Icon from '../components/Icon.jsx';

const MOVES = ['↑', '—', '↓', '↑↑', 'NEW'];

export default function Charts() {
  const p = usePlayer();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState('Global');
  const [live, setLive] = useState(null); // gráficos reales del servidor

  /* Los gráficos que refresca el servidor tienen prioridad; si no hay,
     se usa el ranking local del catálogo curado. */
  useEffect(() => {
    let alive = true;
    getCharts().then((c) => { if (alive && c?.tabs?.length) setLive(c.tabs); });
    return () => { alive = false; };
  }, []);

  const liveTabs = live?.map((x) => x.label) || [];
  const tabs = liveTabs.length ? liveTabs : CHART_TABS;

  const liveRows = live?.find((x) => x.label === tab)?.tracks;
  const rows = (liveRows && liveRows.length ? liveRows : topCharts(tab)).slice(0, 50);

  return (
    <div className="page">
      <h1><Icon name="charts" size={24} /> {t('charts')}</h1>
      <p className="muted">
        {t('chartsSub')}
        {live && <span className="live-badge"><Icon name="lightning" size={12} /> {t('updatedLive')}</span>}
      </p>

      <div className="chip-row">
        {tabs.map((c) => (
          <button key={c} className={`chip ${tab === c ? 'on' : ''}`} onClick={() => setTab(c)}>{c}</button>
        ))}
      </div>

      <section className="list-section">
        <div className="shelf-head">
          <h2>{tab} · {t('top50')}</h2>
          <div className="head-actions">
            <button className="btn primary" onClick={() => p.playList(rows)}><Icon name="play" size={15} /> {t('playAll')}</button>
            <button className="btn" onClick={() => p.playList([...rows].sort(() => Math.random() - 0.5))}><Icon name="shuffle" size={15} /> {t('shuffle')}</button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="muted pad">{t('chartsEmpty')}</p>
        ) : (
          <div className="chart-list">
            {rows.map((tr, i) => {
              const liked = state.library.liked.includes(tr.id);
              const move = MOVES[(i * 7 + tr.title.length) % MOVES.length];
              return (
                <div key={tr.id} className={`chart-row ${p.track?.id === tr.id ? 'current' : ''}`} onClick={() => p.playList(rows, tr.id)}>
                  <span className={`rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                  <span className={`move ${move === 'NEW' ? 'new' : ''}`}>{move}</span>
                  <img src={tr.thumb} alt="" loading="lazy" />
                  <div className="chart-meta">
                    <strong>{tr.title}</strong>
                    <small>
                      <button className="link" onClick={(e) => { e.stopPropagation(); nav(`/artist/${encodeURIComponent(tr.artist)}`); }}>{tr.artist}</button>
                      {tr.views ? <>{' · '}{nf.format(tr.views)}</> : null}
                    </small>
                  </div>
                  <span className="chart-dur">{tr.live ? 'EN VIVO' : fmt(tr.dur)}</span>
                  <button
                    className={`icon-btn ${liked ? 'on' : ''}`}
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'toggle-like', id: tr.id }); }}
                    aria-label={t('liked')}
                  ><Icon name="heart" /></button>
                  <button
                    className="icon-btn"
                    onClick={(e) => { e.stopPropagation(); if (!state.pro.active) { toast(t('proNeeded')); nav('/pro'); return; } dispatch({ type: 'toggle-download', id: tr.id }); }}
                    aria-label={t('download')}
                  ><Icon name="download" /></button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
