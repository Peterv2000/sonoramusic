import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { AdminCategories, AdminErrors } from './AdminLive.jsx';

const CFG_KEY = 'ritmo-admin-config-v1';
const PAY_KEY = 'ritmo-admin-paystatus-v1';

const DEFAULT_CFG = {
  prices: { monthly: 4900, annual: 39900, family: 7900 },
  ads: { enabled: true, interval: 10, skipAfter: 7, provider: '' },
  gateway: { provider: 'local', publicKey: '' },
  updatedAt: null,
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento lleno o privado */ }
}

function loadConfig() {
  const saved = readJSON(CFG_KEY, null);
  if (!saved) return DEFAULT_CFG;
  return {
    ...DEFAULT_CFG,
    ...saved,
    prices: { ...DEFAULT_CFG.prices, ...(saved.prices || {}) },
    ads: { ...DEFAULT_CFG.ads, ...(saved.ads || {}) },
    gateway: { ...DEFAULT_CFG.gateway, ...(saved.gateway || {}) },
  };
}

const money = (value) => `$ ${Math.round(Number(value) || 0).toLocaleString('es-CO')}`;
const dateLabel = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};
const planPrice = (plan, prices) => (
  plan === 'family' ? prices.family : plan === 'pro' ? prices.monthly : 0
);

export default function Admin() {
  const { user, isAdmin, login, logout, getAllUsers, updateUser } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [cfg, setCfg] = useState(loadConfig);
  const [payStatus, setPayStatus] = useState(() => readJSON(PAY_KEY, {}));
  const [users, setUsers] = useState(() => {
    try { return getAllUsers ? getAllUsers() : []; } catch { return []; }
  });
  const [userQuery, setUserQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [range, setRange] = useState(30);
  const [email, setEmail] = useState('admin@sonora.com');
  const [pass, setPass] = useState('demo');
  const [loginError, setLoginError] = useState('');

  const refreshUsers = () => {
    try { setUsers(getAllUsers ? getAllUsers() : []); } catch { setUsers([]); }
  };

  useEffect(() => {
    if (isAdmin) refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const patchUser = (id, patch) => {
    try {
      updateUser?.(id, patch);
      refreshUsers();
      toast('Usuario actualizado');
    } catch {
      toast('No se pudo actualizar el usuario');
    }
  };

  const saveCfg = (message = 'Configuración guardada') => {
    const next = { ...cfg, updatedAt: Date.now() };
    writeJSON(CFG_KEY, next);
    setCfg(next);
    toast(message);
  };

  const setPaymentStatus = (id, status) => {
    const next = { ...payStatus, [id]: status };
    setPayStatus(next);
    writeJSON(PAY_KEY, next);
    toast(status === 'paid' ? 'Pago marcado como cobrado' : status === 'refunded' ? 'Pago reembolsado' : 'Pago actualizado');
  };

  const doLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const found = login(email.trim(), pass || 'demo');
      if (found?.role !== 'admin') {
        setLoginError('Esa cuenta no tiene permisos de administrador. Usa la cuenta demo.');
        return;
      }
      toast('Bienvenido al panel de administración');
    } catch (err) {
      setLoginError(err?.message || 'No se pudo iniciar sesión');
    }
  };

  const demoLogin = () => {
    setLoginError('');
    try {
      const admin = (getAllUsers() || []).find((u) => u.role === 'admin');
      if (admin) updateUser?.(admin.id, { active: true, role: 'admin', plan: 'admin', adsFree: true });
      login(admin?.email || 'admin@sonora.com', 'demo');
      toast('Sesión de administrador demo iniciada');
    } catch (err) {
      setLoginError(err?.message || 'No se pudo abrir la sesión demo');
    }
  };

  const stats = useMemo(() => {
    const total = users.length;
    const pro = users.filter((u) => u.plan === 'pro').length;
    const family = users.filter((u) => u.plan === 'family').length;
    const free = users.filter((u) => !u.plan || u.plan === 'free').length;
    const admins = users.filter((u) => u.role === 'admin').length;
    const active = users.filter((u) => u.active !== false).length;
    const inactive = total - active;
    const mrr = pro * cfg.prices.monthly + family * cfg.prices.family;
    const churn = total ? Math.round((inactive / total) * 100) : 0;
    return { total, pro, family, free, admins, active, inactive, mrr, arr: mrr * 12, churn };
  }, [users, cfg.prices]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (planFilter === 'active' && u.active === false) return false;
      if (planFilter === 'inactive' && u.active !== false) return false;
      if (planFilter !== 'all' && planFilter !== 'active' && planFilter !== 'inactive' && u.plan !== planFilter) return false;
      if (!q) return true;
      return `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q);
    });
  }, [users, userQuery, planFilter]);

  const subscriptions = useMemo(() => users
    .filter((u) => ['pro', 'family', 'admin'].includes(u.plan))
    .map((u) => ({
      ...u,
      renewAt: u.renewAt || Date.now() + 15 * 86400000,
      status: u.active === false ? 'Cancelada' : 'Activa',
      amount: planPrice(u.plan, cfg.prices),
    })), [users, cfg.prices]);

  const payments = useMemo(() => users
    .filter((u) => ['pro', 'family'].includes(u.plan))
    .map((u, i) => {
      const created = u.createdAt || Date.now() - (i + 1) * 86400000;
      const id = `INV-${String(1042 + i)}`;
      return {
        id,
        userId: u.id,
        name: u.name || u.email,
        email: u.email,
        plan: u.plan,
        amount: planPrice(u.plan, cfg.prices),
        date: created,
        method: ['Tarjeta', 'PSE', 'Nequi', 'MercadoPago'][i % 4],
        status: payStatus[id] || (i % 6 === 0 ? 'pending' : 'paid'),
      };
    }), [users, cfg.prices, payStatus]);

  const paidRevenue = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const pendingRevenue = payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  const refundedRevenue = payments.filter((p) => p.status === 'refunded').reduce((sum, p) => sum + p.amount, 0);

  const metrics = useMemo(() => {
    const base = Math.max(users.length, 1);
    const scale = range / 30;
    const streams = Math.round((base * 126 + 980) * scale);
    const hours = Math.round(streams * 0.055);
    const ai = Math.round(streams * 0.21);
    const searches = Math.round(streams * 0.34);
    const skip = Math.max(4, Math.round(38 - stats.active * 0.8));
    const series = Array.from({ length: 12 }, (_, i) => (
      Math.round((streams / 12) * (0.62 + ((i * 37 + base * 13) % 58) / 100))
    ));
    const max = Math.max(...series, 1);
    return { streams, hours, ai, searches, skip, series, max };
  }, [users.length, range, stats.active]);

  const devices = useMemo(() => users.flatMap((u) => (
    (Array.isArray(u.devices) ? u.devices : []).map((d, i) => ({
      id: d.id || `${u.id}-${i}`,
      user: u.name || u.email,
      name: d.name || d.platform || 'Dispositivo',
      at: d.at || d.createdAt || u.createdAt,
    }))
  )), [users]);

  if (!isAdmin) {
    return (
      <div className="page admin-page admin-modern">
        <div className="admin-gate admin-card">
          <span className="admin-gate-icon"><Icon name="lock" size={26} /></span>
          <h1>Panel de Administración</h1>
          <p className="muted">Acceso restringido. Inicia sesión con una cuenta de administrador para gestionar usuarios, suscripciones, métricas y pagos.</p>
          {loginError && <p className="admin-error">{loginError}</p>}
          <form className="admin-login-form" onSubmit={doLogin}>
            <label className="field">Correo
              <input type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">Contraseña
              <input type="password" value={pass} autoComplete="current-password" onChange={(e) => setPass(e.target.value)} />
            </label>
            <button className="btn primary" type="submit"><Icon name="lock" size={15} /> Entrar</button>
          </form>
          <button className="btn admin-demo-btn" type="button" onClick={demoLogin}>
            <Icon name="sparkles" size={15} /> Entrar como administrador demo
          </button>
          <small className="muted">Demo local: admin@sonora.com · contraseña de demostración</small>
          <button className="btn" type="button" onClick={() => nav('/')}>Volver al inicio</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page admin-page admin-modern">
      <header className="admin-header">
        <div>
          <h1><Icon name="settings" size={20} /> Panel de Administración</h1>
          <p className="muted">Usuarios, suscripciones, métricas de uso y control de pagos</p>
        </div>
        <div className="admin-user">
          <span className="avatar">{user?.email?.[0]?.toUpperCase()}</span>
          <div>
            <strong>{user?.name || 'Administrador'}</strong>
            <small>{user?.email}</small>
          </div>
          <button
            className="icon-btn sm"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            onClick={() => { logout(); nav('/'); }}
          ><Icon name="lock" size={15} /></button>
        </div>
      </header>

      <nav className="admin-tabs">
        <button className={`admin-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}><Icon name="chart" size={16} /> Visión general</button>
        <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}><Icon name="artist" size={16} /> Usuarios</button>
        <button className={`admin-tab ${tab === 'subscriptions' ? 'active' : ''}`} onClick={() => setTab('subscriptions')}><Icon name="star" size={16} /> Suscripciones</button>
        <button className={`admin-tab ${tab === 'metrics' ? 'active' : ''}`} onClick={() => setTab('metrics')}><Icon name="equalizer" size={16} /> Métricas de uso</button>
        <button className={`admin-tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}><Icon name="star" size={16} /> Control de pagos</button>
        <button className={`admin-tab ${tab === 'ads' ? 'active' : ''}`} onClick={() => setTab('ads')}><Icon name="globe" size={16} /> Anuncios</button>
        <button className={`admin-tab ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}><Icon name="device" size={16} /> Dispositivos</button>
        <button className={`admin-tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}><Icon name="link" size={16} /> Contenido</button>
        <button className={`admin-tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}><Icon name="sparkles" size={16} /> Categorías</button>
        <button className={`admin-tab ${tab === 'monitor' ? 'active' : ''}`} onClick={() => setTab('monitor')}><Icon name="pulse" size={16} /> QA Robot</button>
      </nav>

      {tab === 'overview' && (
        <>
          <section className="admin-grid">
            <div className="admin-card stat">
              <span className="stat-label">Usuarios totales</span>
              <strong className="stat-value">{stats.total}</strong>
              <small className="muted">{stats.active} activos · {stats.inactive} inactivos</small>
            </div>
            <div className="admin-card stat pro">
              <span className="stat-label">Pro</span>
              <strong className="stat-value">{stats.pro}</strong>
              <small className="muted">{money(cfg.prices.monthly)} / mes</small>
            </div>
            <div className="admin-card stat family">
              <span className="stat-label">Familiar</span>
              <strong className="stat-value">{stats.family}</strong>
              <small className="muted">{money(cfg.prices.family)} / mes</small>
            </div>
            <div className="admin-card stat">
              <span className="stat-label">Gratis</span>
              <strong className="stat-value">{stats.free}</strong>
              <small className="muted">Con anuncios</small>
            </div>
            <div className="admin-card stat">
              <span className="stat-label">MRR</span>
              <strong className="stat-value admin-money">{money(stats.mrr)}</strong>
              <small className="muted">ARR {money(stats.arr)}</small>
            </div>
            <div className="admin-card stat">
              <span className="stat-label">Churn</span>
              <strong className="stat-value">{stats.churn}%</strong>
              <small className="muted">{stats.admins} administradores</small>
            </div>
          </section>

          <section className="admin-grid two">
            <div className="admin-card">
              <div className="card-head">
                <h2>Distribución de planes</h2>
                <small className="muted">Cuentas registradas</small>
              </div>
              <div className="plan-bars">
                {[
                  { label: 'Gratis', value: stats.free, cls: 'free' },
                  { label: 'Pro', value: stats.pro, cls: 'pro' },
                  { label: 'Familiar', value: stats.family, cls: 'family' },
                  { label: 'Admin', value: stats.admins, cls: 'admin' },
                ].map((row) => (
                  <div className="plan-bar-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className="plan-bar"><i className={row.cls} style={{ width: `${stats.total ? (row.value / stats.total) * 100 : 0}%` }} /></div>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="admin-card">
              <div className="card-head">
                <h2>Actividad reciente</h2>
                <button className="btn tiny" onClick={() => setTab('users')}>Ver usuarios</button>
              </div>
              <div className="activity-list">
                {users.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5).map((u) => (
                  <div className="activity-row" key={u.id}>
                    <span className="avatar sm">{(u.name || u.email || '?')[0]?.toUpperCase()}</span>
                    <span><strong>{u.name || u.email}</strong><small>{u.email} · {dateLabel(u.createdAt)}</small></span>
                    <span className={`pill ${u.plan}`}>{u.plan || 'free'}</span>
                  </div>
                ))}
                {users.length === 0 && <p className="muted">Todavía no hay usuarios registrados.</p>}
              </div>
            </div>
          </section>

          <section className="admin-card">
            <div className="card-head"><h2>Accesos rápidos</h2></div>
            <div className="admin-quick">
              <button className="btn" onClick={() => setTab('users')}><Icon name="artist" size={15} /> Gestionar usuarios</button>
              <button className="btn" onClick={() => setTab('subscriptions')}><Icon name="star" size={15} /> Revisar suscripciones</button>
              <button className="btn" onClick={() => setTab('metrics')}><Icon name="equalizer" size={15} /> Ver métricas</button>
              <button className="btn" onClick={() => setTab('payments')}><Icon name="lock" size={15} /> Controlar pagos</button>
            </div>
          </section>
        </>
      )}

      {tab === 'users' && (
        <section className="admin-card">
          <div className="card-head admin-card-head">
            <h2>Gestión de usuarios</h2>
            <div className="admin-tools">
              <div className="admin-search">
                <Icon name="search" size={14} />
                <input
                  type="search"
                  placeholder="Buscar por nombre o correo"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
              </div>
              <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filtrar por plan">
                <option value="all">Todos los planes</option>
                <option value="free">Gratis</option>
                <option value="pro">Pro</option>
                <option value="family">Familiar</option>
                <option value="active">Solo activos</option>
                <option value="inactive">Solo inactivos</option>
              </select>
              <button className="btn small" onClick={refreshUsers}><Icon name="history" size={14} /> Actualizar</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar sm">{(u.name || u.email || '?')[0]?.toUpperCase()}</span>
                        <span>{u.name || '—'}{u.id === user?.id ? ' (tú)' : ''}</span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`pill ${u.plan || 'free'}`}>{u.plan || 'free'}</span></td>
                    <td><span className={`pill ${u.role}`}>{u.role || 'user'}</span></td>
                    <td><span className={`pill ${u.active === false ? 'off' : 'on'}`}>{u.active === false ? 'Inactivo' : 'Activo'}</span></td>
                    <td className="actions">
                      <button className="btn tiny" onClick={() => patchUser(u.id, { plan: 'free', adsFree: false })}>Gratis</button>
                      <button className="btn tiny primary" onClick={() => patchUser(u.id, { plan: 'pro', adsFree: true })}>Pro</button>
                      <button className="btn tiny" onClick={() => patchUser(u.id, { plan: 'family', adsFree: true })}>Familiar</button>
                      <button className="btn tiny" onClick={() => patchUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}>{u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>
                      {u.id !== user?.id && (
                        <button className="btn tiny danger" onClick={() => patchUser(u.id, { active: u.active === false })}>{u.active === false ? 'Activar' : 'Desactivar'}</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={6} className="muted">No hay usuarios que coincidan con el filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'subscriptions' && (
        <>
          <section className="admin-grid">
            <div className="admin-card stat"><span className="stat-label">Suscripciones activas</span><strong className="stat-value">{subscriptions.filter((s) => s.status === 'Activa').length}</strong></div>
            <div className="admin-card stat pro"><span className="stat-label">Planes Pro</span><strong className="stat-value">{stats.pro}</strong></div>
            <div className="admin-card stat family"><span className="stat-label">Planes familiares</span><strong className="stat-value">{stats.family}</strong></div>
            <div className="admin-card stat"><span className="stat-label">Ingreso mensual</span><strong className="stat-value admin-money">{money(stats.mrr)}</strong></div>
          </section>
          <section className="admin-card">
            <div className="card-head">
              <h2>Estado de suscripciones</h2>
              <small className="muted">Renovación y cancelación desde el panel</small>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Usuario</th><th>Plan</th><th>Estado</th><th>Próxima renovación</th><th>Importe</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id}>
                      <td><div className="user-cell"><span className="avatar sm">{(s.name || s.email || '?')[0]?.toUpperCase()}</span><span>{s.name || s.email}<small className="admin-cell-sub">{s.email}</small></span></div></td>
                      <td><span className={`pill ${s.plan}`}>{s.plan}</span></td>
                      <td><span className={`pill ${s.status === 'Activa' ? 'on' : 'off'}`}>{s.status}</span></td>
                      <td>{dateLabel(s.renewAt)}</td>
                      <td>{s.plan === 'admin' ? '—' : money(s.amount)}</td>
                      <td className="actions">
                        <button className="btn tiny primary" onClick={() => patchUser(s.id, { active: true, renewAt: Date.now() + 30 * 86400000 })}>Renovar</button>
                        <button className="btn tiny" onClick={() => patchUser(s.id, { plan: 'pro', renewAt: Date.now() + 30 * 86400000 })}>Cambiar a Pro</button>
                        <button className="btn tiny danger" onClick={() => patchUser(s.id, { plan: 'free', adsFree: false, renewAt: null })}>Cancelar</button>
                      </td>
                    </tr>
                  ))}
                  {subscriptions.length === 0 && <tr><td colSpan={6} className="muted">No hay suscripciones todavía.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'metrics' && (
        <>
          <section className="admin-grid">
            <div className="admin-card stat"><span className="stat-label">Reproducciones</span><strong className="stat-value">{metrics.streams.toLocaleString('es-CO')}</strong><small className="muted">Últimos {range} días</small></div>
            <div className="admin-card stat"><span className="stat-label">Horas escuchadas</span><strong className="stat-value">{metrics.hours.toLocaleString('es-CO')}</strong><small className="muted">Tiempo acumulado</small></div>
            <div className="admin-card stat"><span className="stat-label">Búsquedas</span><strong className="stat-value">{metrics.searches.toLocaleString('es-CO')}</strong><small className="muted">Global + Sonora</small></div>
            <div className="admin-card stat"><span className="stat-label">Skip rate</span><strong className="stat-value">{metrics.skip}%</strong><small className="muted">Cancelaciones tempranas</small></div>
          </section>
          <section className="admin-card">
            <div className="card-head">
              <h2>Uso por periodo</h2>
              <div className="segmented admin-range">
                {[7, 30, 90].map((d) => (
                  <button key={d} className={range === d ? 'sel' : ''} onClick={() => setRange(d)}>{d} días</button>
                ))}
              </div>
            </div>
            <div className="metric-bars" aria-label="Reproducciones por periodo">
              {metrics.series.map((value, i) => (
                <span key={i} className="metric-bar" title={`${value.toLocaleString('es-CO')} reproducciones`}>
                  <i style={{ height: `${Math.max(6, (value / metrics.max) * 100)}%` }} />
                </span>
              ))}
            </div>
          </section>
          <section className="admin-grid two">
            <div className="admin-card">
              <div className="card-head"><h2>Uso de funciones</h2></div>
              <div className="engagement-list">
                {[
                  { label: 'Reproducción automática', value: 78 },
                  { label: 'Listas guardadas', value: 54 },
                  { label: 'Búsqueda global', value: 67 },
                  { label: 'Letras y DJ', value: 41 },
                ].map((row) => (
                  <div className="engagement-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className="plan-bar"><i className="pro" style={{ width: `${row.value}%` }} /></div>
                    <strong>{row.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="admin-card">
              <div className="card-head"><h2>Resumen del catálogo</h2></div>
              <ul className="status-list">
                <li><span>Reproducciones con IA</span><span className="pill on">{metrics.ai.toLocaleString('es-CO')}</span></li>
                <li><span>Sesión media</span><span className="pill">{Math.max(1, Math.round(metrics.hours * 60 / Math.max(1, metrics.streams)))} min</span></li>
                <li><span>Usuarios activos</span><span className="pill on">{stats.active}</span></li>
                <li><span>Motor de búsqueda</span><span className="pill on">Activo</span></li>
              </ul>
            </div>
          </section>
        </>
      )}

      {tab === 'payments' && (
        <>
          <section className="admin-grid">
            <div className="admin-card stat"><span className="stat-label">Cobrado</span><strong className="stat-value admin-money">{money(paidRevenue)}</strong><small className="muted">{payments.filter((p) => p.status === 'paid').length} pagos</small></div>
            <div className="admin-card stat"><span className="stat-label">Pendiente</span><strong className="stat-value admin-money">{money(pendingRevenue)}</strong><small className="muted">{payments.filter((p) => p.status === 'pending').length} por cobrar</small></div>
            <div className="admin-card stat"><span className="stat-label">Reembolsado</span><strong className="stat-value admin-money">{money(refundedRevenue)}</strong><small className="muted">{payments.filter((p) => p.status === 'refunded').length} devoluciones</small></div>
            <div className="admin-card stat"><span className="stat-label">Ticket medio</span><strong className="stat-value admin-money">{money(payments.length ? paidRevenue / Math.max(1, payments.filter((p) => p.status === 'paid').length) : 0)}</strong></div>
          </section>

          <section className="admin-grid two">
            <div className="admin-card">
              <div className="card-head"><h2>Pasarela de pago</h2><small className="muted">Modo local</small></div>
              <div className="form-grid two">
                <label className="field">Pasarela activa
                  <select value={cfg.gateway.provider} onChange={(e) => setCfg({ ...cfg, gateway: { ...cfg.gateway, provider: e.target.value } })}>
                    <option value="local">Local (sin pasarela)</option>
                    <option value="wompi">Wompi</option>
                    <option value="payu">PayU</option>
                    <option value="mercadopago">MercadoPago</option>
                  </select>
                </label>
                <label className="field">Clave pública
                  <input type="text" placeholder="pk_test_..." value={cfg.gateway.publicKey} onChange={(e) => setCfg({ ...cfg, gateway: { ...cfg.gateway, publicKey: e.target.value } })} />
                </label>
              </div>
              <div className="card-actions">
                <button className="btn primary" onClick={() => saveCfg('Pasarela guardada')}><Icon name="check" size={14} /> Guardar configuración</button>
              </div>
            </div>
            <div className="admin-card">
              <div className="card-head"><h2>Precios (COP)</h2><small className="muted">Se aplican al catálogo de planes</small></div>
              <div className="form-grid">
                <label className="field">Mensual
                  <input type="number" value={cfg.prices.monthly} onChange={(e) => setCfg({ ...cfg, prices: { ...cfg.prices, monthly: +e.target.value } })} />
                </label>
                <label className="field">Anual
                  <input type="number" value={cfg.prices.annual} onChange={(e) => setCfg({ ...cfg, prices: { ...cfg.prices, annual: +e.target.value } })} />
                </label>
                <label className="field">Familiar
                  <input type="number" value={cfg.prices.family} onChange={(e) => setCfg({ ...cfg, prices: { ...cfg.prices, family: +e.target.value } })} />
                </label>
              </div>
              <div className="card-actions">
                <button className="btn primary" onClick={() => saveCfg('Precios guardados')}><Icon name="check" size={14} /> Guardar precios</button>
              </div>
            </div>
          </section>

          <section className="admin-card">
            <div className="card-head"><h2>Movimientos</h2><span className="pill on">Actualizado en local</span></div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead><tr><th>Factura</th><th>Usuario</th><th>Plan</th><th>Método</th><th>Fecha</th><th>Importe</th><th>Estado</th><th>Acción</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td><div className="user-cell"><span className="avatar sm">{(p.name || p.email || '?')[0]?.toUpperCase()}</span><span>{p.name}<small className="admin-cell-sub">{p.email}</small></span></div></td>
                      <td><span className={`pill ${p.plan}`}>{p.plan}</span></td>
                      <td>{p.method}</td>
                      <td>{dateLabel(p.date)}</td>
                      <td className="admin-money">{money(p.amount)}</td>
                      <td><span className={`pill ${p.status}`}>{p.status === 'paid' ? 'Cobrado' : p.status === 'pending' ? 'Pendiente' : 'Reembolsado'}</span></td>
                      <td>
                        {p.status === 'pending' && <button className="btn tiny primary" onClick={() => setPaymentStatus(p.id, 'paid')}>Marcar cobrado</button>}
                        {p.status === 'paid' && <button className="btn tiny danger" onClick={() => setPaymentStatus(p.id, 'refunded')}>Reembolsar</button>}
                        {p.status === 'refunded' && <button className="btn tiny" onClick={() => setPaymentStatus(p.id, 'paid')}>Reactivar</button>}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && <tr><td colSpan={8} className="muted">Aún no hay movimientos de pago.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'ads' && (
        <section className="admin-card">
          <div className="card-head">
            <h2>Anuncios para cuentas gratuitas</h2>
            <label className="toggle"><input type="checkbox" checked={cfg.ads.enabled} onChange={(e) => setCfg({ ...cfg, ads: { ...cfg.ads, enabled: e.target.checked } })} /> Activados</label>
          </div>
          <div className="form-grid two">
            <label className="field">Intervalo (canciones)
              <input type="number" value={cfg.ads.interval} min={5} max={20} onChange={(e) => setCfg({ ...cfg, ads: { ...cfg.ads, interval: +e.target.value } })} />
            </label>
            <label className="field">Omitir después (segundos)
              <input type="number" value={cfg.ads.skipAfter} min={5} max={15} onChange={(e) => setCfg({ ...cfg, ads: { ...cfg.ads, skipAfter: +e.target.value } })} />
            </label>
            <label className="field span2">Proveedor URL (script/iframe)
              <input type="text" value={cfg.ads.provider} placeholder="https://..." onChange={(e) => setCfg({ ...cfg, ads: { ...cfg.ads, provider: e.target.value } })} />
            </label>
          </div>
          <div className="card-actions">
            <button className="btn primary" onClick={() => saveCfg('Configuración de anuncios guardada')}><Icon name="check" size={14} /> Guardar configuración</button>
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <section className="admin-card">
          <div className="card-head">
            <h2>Dispositivos vinculados</h2>
            <button
              className="btn small"
              onClick={() => {
                const current = users.find((u) => u.id === user?.id);
                if (!current) return;
                const list = Array.isArray(current.devices) ? current.devices : [];
                const label = typeof navigator !== 'undefined' ? (navigator.userAgentData?.platform || 'Navegador web') : 'Navegador web';
                patchUser(current.id, { devices: [...list, { id: `dev_${Date.now()}`, name: label, at: Date.now() }] });
              }}
            ><Icon name="plus" size={14} /> Registrar este dispositivo</button>
          </div>
          {devices.length === 0 ? (
            <p className="muted">Sin dispositivos registrados aún. Usa “Registrar este dispositivo” para añadir el navegador actual.</p>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead><tr><th>Usuario</th><th>Dispositivo</th><th>Último acceso</th></tr></thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}><td>{d.user}</td><td>{d.name}</td><td>{dateLabel(d.at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'content' && (
        <section className="admin-grid two">
          <div className="admin-card">
            <div className="card-head"><h2>Catálogo</h2></div>
            <p className="muted">Forzar actualización del catálogo en caliente y limpiar caché.</p>
            <div className="card-actions">
              <button className="btn primary" onClick={() => fetch('/api/update?force=1', { method: 'POST' }).catch(() => {})}><Icon name="globe" size={14} /> Forzar actualización de catálogo</button>
              <button className="btn" onClick={() => fetch('/api/clear-cache', { method: 'POST' }).catch(() => {})}>Limpiar caché</button>
            </div>
          </div>
          <div className="admin-card">
            <div className="card-head"><h2>Estado general</h2></div>
            <ul className="status-list">
              <li><span>Servidor API</span><span className="pill on">OK</span></li>
              <li><span>Búsqueda Sonora</span><span className="pill on">Activa</span></li>
              <li><span>Resolver multi-fuente</span><span className="pill on">Activo</span></li>
              <li><span>Anuncios</span><span className={`pill ${cfg.ads.enabled ? 'on' : 'off'}`}>{cfg.ads.enabled ? 'Activos' : 'Desactivados'}</span></li>
            </ul>
          </div>
        </section>
      )}

      {tab === 'categories' && <AdminCategories toast={toast} />}
      {tab === 'monitor' && <AdminErrors toast={toast} />}
    </div>
  );
}
