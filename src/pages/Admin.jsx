import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { usePlayer, fmt } from '../player/PlayerContext.jsx';
import Icon from '../components/Icon.jsx';
import { nf } from '../data/catalog.js';
import {
  adminAvailable, adminCategories, adminSearch, adminPicks, adminSave,
} from '../api/youtubeSearch.js';

/* Atajos de categoría que rellenan el buscador con un clic. */
const QUICK = [
  'top canciones pop 2026', 'clasicos del rock', 'exitos reggaeton 2026',
  'top electronic dance music', 'best rap songs', 'best r&b songs',
  'mejores baladas', 'musica cristiana', 'banda sonora peliculas',
  'canciones infantiles', 'jazz relajante', 'clasica para estudiar',
];

export default function Admin() {
  const { t } = useI18n();
  const toast = useToast();
  const p = usePlayer();

  const [ready, setReady] = useState(null);   // null=comprobando, true=ok, false=sin servidor
  const [cats, setCats] = useState({ charts: [], catalogQueries: [] });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [dest, setDest] = useState('catalog');   // 'catalog' | id de pestaña de gráficos
  const [picks, setPicks] = useState({ catalog: [], charts: {} });
  const [counts, setCounts] = useState(null);
  const [saving, setSaving] = useState(false);
  const reqRef = useRef(0);

  /* 1. ¿Está disponible el panel? (necesita el servidor) */
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await adminAvailable();
      if (!alive) return;
      setReady(ok);
      if (!ok) return;
      try {
        const [c, pk] = await Promise.all([adminCategories(), adminPicks()]);
        if (!alive) return;
        setCats(c);
        setPicks(pk.curated);
        setCounts(pk.counts);
      } catch { /* sin datos */ }
    })();
    return () => { alive = false; };
  }, []);

  const refreshPicks = async () => {
    try {
      const pk = await adminPicks();
      setPicks(pk.curated);
      setCounts(pk.counts);
    } catch { /* noop */ }
  };

  /* 2. Búsqueda real (con retardo para no saturar) */
  const buscar = async (term) => {
    const query = (term ?? q).trim();
    if (query.length < 2) return;
    const id = ++reqRef.current;
    setLoading(true);
    setSelected(new Set());
    try {
      const data = await adminSearch(query, 30);
      if (id === reqRef.current) setResults(data.results || []);
    } catch (e) {
      toast(String(e.message || e));
      if (id === reqRef.current) setResults([]);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  };

  const toggle = (yt) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(yt)) next.delete(yt); else next.add(yt);
      return next;
    });
  };

  const todos = () => setSelected(new Set(results.map((r) => r.yt)));

  /* 3. Guardar la selección en el destino elegido */
  const guardar = async () => {
    const elegidas = results.filter((r) => selected.has(r.yt));
    if (!elegidas.length) { toast(t('adminPickNone')); return; }
    setSaving(true);
    try {
      const payload = dest === 'catalog'
        ? { add: { catalog: elegidas } }
        : { add: { charts: { [dest]: elegidas } } };
      const r = await adminSave(payload);
      const n = r.added.catalog + r.added.charts;
      toast(`${t('adminSaved')} · +${n}`);
      setSelected(new Set());
      await refreshPicks();
    } catch (e) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  /* 4. Quitar una elección */
  const quitar = async (yt, tab) => {
    try {
      const payload = tab
        ? { remove: { charts: { [tab]: [yt] } } }
        : { remove: { catalog: [yt] } };
      await adminSave(payload);
      await refreshPicks();
      toast(t('adminRemoved'));
    } catch (e) {
      toast(String(e.message || e));
    }
  };

  const totalElegidas = (picks.catalog?.length || 0) +
    Object.values(picks.charts || {}).reduce((n, a) => n + a.length, 0);

  const tabLabels = useMemo(() => cats.charts.map((c) => c.label), [cats]);

  /* ── Sin servidor: el panel necesita el backend ── */
  if (ready === false) {
    return (
      <div className="page narrow">
        <h1><Icon name="settings" size={24} /> {t('adminTitle')}</h1>
        <div className="empty-box">
          <p><Icon name="warning" size={18} /> {t('adminNoServer')}</p>
          <small>{t('adminNoServerHint')}</small>
        </div>
        <pre className="admin-cmd">npm start</pre>
      </div>
    );
  }

  return (
    <div className="page admin">
      <h1><Icon name="settings" size={24} /> {t('adminTitle')}</h1>
      <p className="muted">{t('adminSub')}</p>

      {counts && (
        <div className="stats-grid admin-stats">
          <div className="stat"><strong>{counts.catalog}</strong><small>{t('adminCatalog')}</small></div>
          <div className="stat"><strong>{counts.charts}</strong><small>{t('charts')}</small></div>
          <div className="stat"><strong>{totalElegidas}</strong><small>{t('adminCurated')}</small></div>
        </div>
      )}

      {/* ── Buscador ── */}
      <section className="admin-search">
        <div className="search-input-wrap">
          <input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            placeholder={t('adminSearchPlaceholder')}
          />
          {q && <button className="icon-btn clear-x" onClick={() => { setQ(''); setResults([]); }}><Icon name="close" size={16} /></button>}
        </div>
        <button className="btn primary" onClick={() => buscar()} disabled={loading}>
          <Icon name="search" size={15} /> {loading ? t('adminSearching') : t('search')}
        </button>
      </section>

      {/* ── Categorías rápidas ── */}
      {results.length === 0 && !loading && (
        <section className="list-section">
          <h2>{t('adminCategories')}</h2>
          <div className="chip-row">
            {QUICK.map((c) => (
              <button key={c} className="chip" onClick={() => { setQ(c); buscar(c); }}>{c}</button>
            ))}
          </div>
          {tabLabels.length > 0 && (
            <>
              <h2 style={{ marginTop: 16 }}>{t('charts')}</h2>
              <div className="chip-row">
                {tabLabels.map((c) => (
                  <button key={c} className="chip" onClick={() => { setQ(c); buscar(c); }}>{c}</button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Barra de acciones: destino + guardar ── */}
      {results.length > 0 && (
        <div className="admin-bar">
          <span className="muted">{selected.size}/{results.length} {t('adminSelected')}</span>
          <button className="btn small" onClick={todos}><Icon name="check" size={14} /> {t('adminSelectAll')}</button>
          <label className="admin-dest">
            <span className="muted">{t('adminDestination')}</span>
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="select-chip">
              <option value="catalog">{t('adminCatalog')}</option>
              {cats.charts.map((c) => <option key={c.id} value={c.label}>{t('charts')} · {c.label}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={guardar} disabled={saving || !selected.size}>
            <Icon name="plus" size={15} /> {saving ? t('adminSaving') : t('adminUpload')}
          </button>
        </div>
      )}

      {/* ── Resultados con casillas ── */}
      {loading && (
        <div className="yt-skel">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="yt-skel-row" />)}
        </div>
      )}

      {!loading && results.length > 0 && (
        <section className="list-section">
          <div className="admin-results">
            {results.map((tr) => {
              const on = selected.has(tr.yt);
              const yaEsta = picks.catalog?.some((x) => x.yt === tr.yt);
              return (
                <div key={tr.yt} className={`admin-result ${on ? 'on' : ''}`}>
                  <button className={`admin-check ${on ? 'on' : ''}`} onClick={() => toggle(tr.yt)} aria-label="elegir">
                    {on && <Icon name="check" size={14} />}
                  </button>
                  <img src={tr.thumb} alt="" loading="lazy" onClick={() => p.playList([tr], tr.id)} />
                  <div className="admin-meta" onClick={() => toggle(tr.yt)}>
                    <strong>{tr.title}</strong>
                    <small>
                      {tr.artist}
                      {tr.dur ? <> · {fmt(tr.dur)}</> : null}
                      {tr.views ? <> · <Icon name="globe" size={11} /> {nf.format(tr.views)}</> : null}
                      {yaEsta && <> · <span className="live-badge"><Icon name="check" size={11} /> {t('adminAlready')}</span></>}
                    </small>
                  </div>
                  <button className="icon-btn" onClick={() => p.playList([tr], tr.id)} aria-label={t('play')}><Icon name="play" /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Elecciones actuales ── */}
      {totalElegidas > 0 && (
        <section className="list-section">
          <h2><Icon name="star" size={16} /> {t('adminCurated')} · {totalElegidas}</h2>

          {picks.catalog?.length > 0 && (
            <div className="admin-picked">
              <span className="admin-picked-head">{t('adminCatalog')}</span>
              <div className="chip-row">
                {picks.catalog.map((tr) => (
                  <span key={tr.yt} className="pick-chip">
                    {tr.title}
                    <button className="icon-btn" onClick={() => quitar(tr.yt)} aria-label={t('delete')}><Icon name="close" size={13} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {Object.entries(picks.charts || {}).filter(([, a]) => a.length).map(([tab, list]) => (
            <div key={tab} className="admin-picked">
              <span className="admin-picked-head">{t('charts')} · {tab}</span>
              <div className="chip-row">
                {list.map((tr) => (
                  <span key={tr.yt} className="pick-chip">
                    {tr.title}
                    <button className="icon-btn" onClick={() => quitar(tr.yt, tab)} aria-label={t('delete')}><Icon name="close" size={13} /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
