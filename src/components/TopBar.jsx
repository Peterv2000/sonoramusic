import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import { useI18n } from '../i18n/useI18n.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { GENRES } from '../data/catalog.js';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import { suggestYouTube, searchYouTube } from '../api/youtubeSearch.js';

export default function TopBar() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const { t } = useI18n();
  const p = usePlayer();
  const initial = (state.profile.name || ' Invitado').trim().charAt(0).toUpperCase();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState([]);
  const [res, setRes] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const req = useRef(0);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setSugg([]); setRes([]); return; }
    const id = ++req.current;
    setLoading(true);
    const tmr = setTimeout(async () => {
      try {
        const [s, r] = await Promise.all([
          suggestYouTube(term).catch(() => []),
          searchYouTube(term, { deep: false }).catch(() => []),
        ]);
        if (id !== req.current) return;
        setSugg(Array.isArray(s) ? s.filter((x) => typeof x === 'string').slice(0, 6) : []);
        setRes(Array.isArray(r) ? r.filter((x) => (x.kind || 'video') === 'video').slice(0, 8) : []);
      } catch {
        if (id === req.current) { setSugg([]); setRes([]); }
      } finally {
        if (id === req.current) setLoading(false);
      }
    }, 160);
    return () => clearTimeout(tmr);
  }, [q]);

  const pick = (val) => goSearch(val);

  /* Enter en la barra: abrir la página de búsqueda con el término. */
  const goSearch = (val) => {
    const v = (val ?? q).trim();
    if (!v) return;
    setQ(v);
    setOpen(false);
    try { dispatch({ type: 'add-search', q: v }); } catch {}
    nav(`/search?q=${encodeURIComponent(v)}`);
  };

  const playItem = (item) => {
    try {
      p.playList([item], item.id);
      setOpen(false);
    } catch { /* noop */ }
  };

  const queueItem = (item) => {
    try {
      p.enqueue(item);
      setOpen(false);
    } catch { /* noop */ }
  };

  const placeholders = ['Bad Bunny', 'Taylor Swift', 'Queen', 'Shakira', 'Dua Lipa', 'Karol G'];

  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={() => nav('/')} aria-label={t('home')}>
        <Logo size={26} />
      </button>
      <div className="search-pill-wrap" ref={ref}>
        <div className={`search-pill search-pill-modern ${open ? 'open' : ''}`} onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="search-pill-input"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goSearch(); } }}
            placeholder={t('searchGlobalPlaceholder')}
            aria-label={t('searchGlobalPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            inputMode="search"
            type="search"
            name="q"
            lang={state.settings.lang || 'es'}
          />
          {q && (
            <button
              className="icon-btn sm"
              onClick={(e) => { e.stopPropagation(); setQ(''); setSugg([]); setRes([]); }}
              aria-label={t('close')}
            ><Icon name="close" size={14} /></button>
          )}
        </div>
        {open && (
          <div className="search-dropdown search-dropdown-compact">
            {q.trim().length < 2 ? (
              <>
                <div className="sd-section">
                  <div className="sd-title"><Icon name="history" size={13} /> {t('recentSearches')}</div>
                  {(state.library?.recentSearches || []).length > 0 ? (
                    (state.library?.recentSearches || []).slice(0, 4).map((s) => (
                      <button key={s} className="sd-item" onClick={() => pick(s)}><Icon name="history" size={14} /> <span>{s}</span></button>
                    ))
                  ) : (
                    <div className="sd-empty">{t('typeToSearch')}</div>
                  )}
                </div>
                <div className="sd-section">
                  <div className="sd-title"><Icon name="sparkles" size={13} /> {t('genresToExplore')}</div>
                  <div className="sd-chips">
                    {GENRES.slice(0, 6).map((g) => (
                      <button key={g.id} className="chip" onClick={() => pick(g.id)}>{g.id}</button>
                    ))}
                  </div>
                  <div className="sd-chips">
                    {placeholders.slice(0, 4).map((s) => (
                      <button key={s} className="chip" onClick={() => pick(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {sugg.length > 0 && (
                  <div className="sd-section">
                    <div className="sd-title">{t('suggestions')}</div>
                    {sugg.map((s, i) => (
                      <button key={`${s}-${i}`} className="sd-item" onClick={() => pick(s)}><Icon name="search" size={14} /> <span>{s}</span></button>
                    ))}
                  </div>
                )}
                {res.length > 0 && (
                  <div className="sd-section">
                    <div className="sd-title"><Icon name="music" size={13} /> {t('sonoraResults')}</div>
                    {res.map((it) => (
                      <div key={it.id} className="sd-track" onClick={() => playItem(it)}>
                        <img src={it.thumb} alt="" />
                        <div className="sd-track-meta">
                          <strong>{it.title}</strong>
                          <small>{it.artist}</small>
                        </div>
                        <button
                          className="icon-btn sm"
                          onClick={(e) => { e.stopPropagation(); queueItem(it); }}
                          aria-label={t('addToQueue')}
                          title={t('addToQueue')}
                        ><Icon name="plus" size={15} /></button>
                        <Icon name="play" size={16} />
                      </div>
                    ))}
                  </div>
                )}
                {loading && <div className="sd-loading"><Icon name="sparkles" size={14} /> {t('searchingSonora')}</div>}
                <button className="sd-all" onClick={() => goSearch()}>
                  <Icon name="search" size={14} /> {t('seeAllResults')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="topbar-right">
        {state.pro.active && (
          <span className="badge-pro"><Icon name="star" size={12} /> {t('proBadge')}</span>
        )}
        <button className="icon-btn" onClick={() => nav('/settings')} aria-label={t('settings')}>
          <Icon name="settings" />
        </button>
        <button className="avatar-btn" onClick={() => nav('/profile')} aria-label={t('profile')}>
          {state.profile.avatar && state.profile.avatar !== '🎧' ? state.profile.avatar : initial || '🎧'}
        </button>
      </div>
    </header>
  );
}
