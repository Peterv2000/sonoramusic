import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';

const EMPTY = {
  id: '', label: '', tag: '', tagEn: '', color: '#ff0033', icon: 'sparkles',
  cover: '', genres: '', queries: '', active: true, sort: 100,
};

function adminToken() {
  try { return localStorage.getItem('ritmo-admin-token') || ''; } catch { return ''; }
}

async function adminJSON(path, opts = {}) {
  const res = await fetch(path, {
    headers: {
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminToken() ? { 'X-Admin-Token': adminToken() } : {}),
    },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function splitList(value) {
  return String(value || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - Number(ts || 0));
  if (diff < 60000) return 'ahora';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} h`;
  return new Date(Number(ts)).toLocaleString();
}

export function AdminCategories({ toast }) {
  const [categories, setCategories] = useState([]);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await adminJSON('/api/v1/admin/categories');
      if (alive.current) setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch (e) {
      if (alive.current) setError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    let es = null;
    try {
      es = new EventSource('/api/v1/events');
      es.addEventListener('categories', () => load());
    } catch { /* sin SSE */ }
    return () => { alive.current = false; try { es?.close(); } catch { /* noop */ } };
  }, [load]);

  const edit = (c) => {
    setDraft({
      ...EMPTY,
      ...c,
      genres: (c.genres || []).join(', '),
      queries: (c.queries || []).join(', '),
    });
    setError('');
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!draft.label.trim()) { setError('Escribe un nombre de categoría'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...draft,
        genres: splitList(draft.genres || draft.label),
        queries: splitList(draft.queries),
      };
      if (!payload.id) delete payload.id;
      const data = await adminJSON('/api/v1/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ category: payload }),
      });
      setDraft(EMPTY);
      await load();
      toast?.(`Categoría «${data.category?.label || payload.label}» guardada`);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c) => {
    try {
      await adminJSON('/api/v1/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ category: { ...c, active: !c.active } }),
      });
      await load();
      toast?.(c.active ? 'Categoría oculta en Web/APK' : 'Categoría publicada en vivo');
    } catch (err) {
      toast?.('No se pudo cambiar: ' + (err.message || err));
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`¿Eliminar la categoría «${c.label}»?`)) return;
    try {
      await adminJSON('/api/v1/admin/categories', {
        method: 'DELETE',
        body: JSON.stringify({ id: c.id }),
      });
      await load();
      toast?.('Categoría eliminada y sincronizada');
    } catch (err) {
      toast?.('No se pudo eliminar: ' + (err.message || err));
    }
  };

  const field = (key, label, props = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        value={draft[key] ?? ''}
        onChange={(ev) => setDraft((d) => ({ ...d, [key]: ev.target.value }))}
        {...props}
      />
    </label>
  );

  return (
    <section className="admin-grid two admin-live">
      <div className="admin-card">
        <div className="card-head">
          <h2><Icon name="sparkles" size={16} /> Categorías en vivo</h2>
          <button className="btn small" onClick={load}><Icon name="refresh" size={13} /> Refrescar</button>
        </div>
        <p className="muted">Los cambios se publican al instante en Web y APK mediante SSE. No hace falta actualizar la app.</p>
        <div className="admin-live-list">
          {categories.map((c) => (
            <div className={`admin-live-row ${c.active ? '' : 'is-off'}`} key={c.id}>
              <span className="admin-live-dot" style={{ background: c.color || '#ff0033' }} />
              <div className="admin-live-info">
                <strong>{c.label}</strong>
                <small>{(c.genres || []).join(' · ') || 'sin géneros'} · {c.count ?? '—'} temas</small>
              </div>
              <span className={`pill ${c.active ? 'on' : 'off'}`}>{c.active ? 'Activa' : 'Oculta'}</span>
              <button className="btn tiny" onClick={() => edit(c)}><Icon name="edit" size={13} /></button>
              <button className="btn tiny" onClick={() => toggle(c)}>{c.active ? 'Ocultar' : 'Publicar'}</button>
              <button className="btn tiny danger" onClick={() => remove(c)}><Icon name="trash" size={13} /></button>
            </div>
          ))}
          {!categories.length && <p className="muted">Sin categorías todavía.</p>}
        </div>
      </div>

      <form className="admin-card" onSubmit={save}>
        <div className="card-head">
          <h2>{draft.id ? 'Editar categoría' : 'Nueva categoría'}</h2>
          {draft.id && <button type="button" className="btn small" onClick={() => setDraft(EMPTY)}>Cancelar</button>}
        </div>
        <div className="admin-form-grid">
          {field('label', 'Nombre')}
          {field('tag', 'Descripción (ES)')}
          {field('tagEn', 'Description (EN)')}
          {field('genres', 'Géneros incluidos (coma)', { placeholder: 'Latino, Vallenato, Popular' })}
          {field('queries', 'Búsquedas de respaldo (coma)', { placeholder: 'reggaeton, musica popular' })}
          {field('color', 'Color', { placeholder: '#ff0033' })}
          {field('icon', 'Icono', { placeholder: 'sparkles' })}
          {field('cover', 'Portada (URL)')}
          {field('sort', 'Orden', { type: 'number' })}
        </div>
        <label className="admin-check">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />
          <span>Visible en Web y APK</span>
        </label>
        {error && <p className="admin-error">{error}</p>}
        <div className="card-actions">
          <button className="btn primary" type="submit" disabled={busy}>
            <Icon name="check" size={14} /> {busy ? 'Guardando…' : 'Guardar y publicar'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function AdminErrors({ toast }) {
  const [data, setData] = useState({ errors: [], total: 0, updatedAt: 0 });
  const [filter, setFilter] = useState('all');
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await adminJSON('/api/v1/admin/errors?limit=200');
      if (alive.current) setData({ errors: res.errors || [], total: res.total || 0, updatedAt: res.updatedAt || 0 });
    } catch { /* servidor caído */ }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const iv = setInterval(load, 15000);
    let es = null;
    try {
      es = new EventSource('/api/v1/events');
      es.addEventListener('telemetry', () => load());
    } catch { /* sin SSE */ }
    return () => {
      alive.current = false;
      clearInterval(iv);
      try { es?.close(); } catch { /* noop */ }
    };
  }, [load]);

  const clear = async () => {
    if (!window.confirm('¿Vaciar el registro de errores?')) return;
    try {
      await adminJSON('/api/v1/admin/errors', { method: 'DELETE' });
      await load();
      toast?.('Registro de errores vaciado');
    } catch (err) {
      toast?.('No se pudo vaciar: ' + (err.message || err));
    }
  };

  const visible = filter === 'all' ? data.errors : data.errors.filter((e) => e.type === filter);
  const types = [...new Set(data.errors.map((e) => e.type))];

  return (
    <section className="admin-card admin-live">
      <div className="card-head">
        <h2><Icon name="pulse" size={16} /> QA Robot · errores en vivo</h2>
        <div className="admin-tools">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos ({data.errors.length})</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn small" onClick={load}><Icon name="refresh" size={13} /> Refrescar</button>
          <button className="btn small danger" onClick={clear}><Icon name="trash" size={13} /> Vaciar</button>
        </div>
      </div>
      <p className="muted">Fallos de reproducción, carátulas y latencia reportados por la Web y la APK. La auto-recuperación se ejecuta en el cliente sin pausar al usuario.</p>
      <div className="admin-errors-table">
        {visible.map((e) => (
          <div className="admin-error-row" key={e.id}>
            <span className={`pill ${e.severity === 'info' ? 'pending' : e.severity === 'warning' ? 'pending' : 'free'}`}>{e.type}</span>
            <div className="admin-error-main">
              <strong>{e.title || e.message || 'Sin título'}</strong>
              <small>
                {e.artist || '—'} · {timeAgo(e.at)} · {e.platform || 'web'}
                {e.latencyMs ? ` · ${e.latencyMs} ms` : ''}
                {e.code ? ` · código ${e.code}` : ''}
              </small>
              {e.message && e.title && <small className="admin-cell-sub">{e.message}</small>}
            </div>
          </div>
        ))}
        {!visible.length && <p className="muted">Sin errores registrados en este filtro.</p>}
      </div>
    </section>
  );
}
