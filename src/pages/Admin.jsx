import { useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

export default function Admin() {
  const { user, isAdmin, getAllUsers, updateUser } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('overview');
  const [prices, setPrices] = useState({ monthly: 4900, annual: 39900, family: 7900 });
  const [users, setUsers] = useState(() => {
    try { return getAllUsers ? getAllUsers() : []; } catch { return []; }
  });
  const [adsCfg, setAdsCfg] = useState({ enabled: true, interval: 10, skipAfter: 7, provider: '' });

  const stats = useMemo(() => {
    const total = users.length;
    const pro = users.filter(u => u.plan === 'pro').length;
    const family = users.filter(u => u.plan === 'family').length;
    const free = users.filter(u => u.plan === 'free').length;
    const admins = users.filter(u => u.role === 'admin').length;
    const active = users.filter(u => u.active !== false).length;
    return { total, pro, family, free, admins, active };
  }, [users]);

  const refreshUsers = () => {
    try { setUsers(getAllUsers ? getAllUsers() : []); } catch {}
  };

  if (!isAdmin) {
    return (
      <div className="page">
        <h1>Acceso denegado</h1>
        <p>Solo administradores pueden acceder a este panel.</p>
        <button className="btn" onClick={() => nav('/')}>Volver al inicio</button>
      </div>
    );
  }

  return (
    <div className="page admin-page admin-modern">
      <header className="admin-header">
        <div>
          <h1><Icon name="settings" size={20} /> Panel de Administración</h1>
          <p className="muted">Gestiona usuarios, planes, pagos, anuncios y estado de la plataforma</p>
        </div>
        <div className="admin-user">
          <span className="avatar">{user?.email?.[0]?.toUpperCase()}</span>
          <div>
            <strong>{user?.name || 'Administrador'}</strong>
            <small>{user?.email}</small>
          </div>
        </div>
      </header>
      <nav className="admin-tabs">
        <button className={`admin-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}><Icon name="charts" size={16} /> Visión general</button>
        <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}><Icon name="profile" size={16} /> Usuarios</button>
        <button className={`admin-tab ${tab === 'plans' ? 'active' : ''}`} onClick={() => setTab('plans')}><Icon name="star" size={16} /> Planes y Pagos</button>
        <button className={`admin-tab ${tab === 'ads' ? 'active' : ''}`} onClick={() => setTab('ads')}><Icon name="globe" size={16} /> Anuncios</button>
        <button className={`admin-tab ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}><Icon name="settings" size={16} /> Dispositivos</button>
        <button className={`admin-tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}><Icon name="link" size={16} /> Contenido / Updater</button>
      </nav>

      {tab === 'overview' && (
        <section className="admin-grid">
          <div className="admin-card stat">
            <span className="stat-label">Usuarios totales</span>
            <strong className="stat-value">{stats.total}</strong>
            <small className="muted">{stats.active} activos</small>
          </div>
          <div className="admin-card stat">
            <span className="stat-label">Gratis</span>
            <strong className="stat-value">{stats.free}</strong>
          </div>
          <div className="admin-card stat pro">
            <span className="stat-label">Pro</span>
            <strong className="stat-value">{stats.pro}</strong>
          </div>
          <div className="admin-card stat family">
            <span className="stat-label">Familiar</span>
            <strong className="stat-value">{stats.family}</strong>
          </div>
          <div className="admin-card stat admin">
            <span className="stat-label">Administradores</span>
            <strong className="stat-value">{stats.admins}</strong>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="admin-card">
          <div className="card-head">
            <h2>Gestión de usuarios</h2>
            <button className="btn small" onClick={refreshUsers}><Icon name="history" size={14} /> Actualizar</button>
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
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><div className="user-cell"><span className="avatar sm">{(u.name||u.email)[0]?.toUpperCase()}</span><span>{u.name || '-'}</span></div></td>
                    <td>{u.email}</td>
                    <td><span className={`pill ${u.plan}`}>{u.plan}</span></td>
                    <td><span className={`pill ${u.role}`}>{u.role}</span></td>
                    <td><span className={`pill ${u.active===false?'off':'on'}`}>{u.active===false?'Inactivo':'Activo'}</span></td>
                    <td className="actions">
                      <button className="btn tiny" onClick={() => { updateUser?.(u.id, { plan: 'free', adsFree: false }); refreshUsers(); }}>Gratis</button>
                      <button className="btn tiny primary" onClick={() => { updateUser?.(u.id, { plan: 'pro', adsFree: true }); refreshUsers(); }}>Pro</button>
                      <button className="btn tiny" onClick={() => { updateUser?.(u.id, { plan: 'family', adsFree: true }); refreshUsers(); }}>Familiar</button>
                      <button className="btn tiny" onClick={() => { updateUser?.(u.id, { role: u.role==='admin'?'user':'admin' }); refreshUsers(); }}>{u.role==='admin'?'Quitar admin':'Hacer admin'}</button>
                      <button className="btn tiny danger" onClick={() => { updateUser?.(u.id, { active: u.active===false }); refreshUsers(); }}>{u.active===false?'Activar':'Desactivar'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'plans' && (
        <section className="admin-grid two">
          <div className="admin-card">
            <div className="card-head">
              <h2>Precios (COP)</h2>
              <small className="muted">Actualizados para coincidir con la app</small>
            </div>
            <div className="form-grid">
              <label className="field">Mensual
                <input type="number" value={prices.monthly} onChange={(e) => setPrices({ ...prices, monthly: +e.target.value })} />
              </label>
              <label className="field">Anual
                <input type="number" value={prices.annual} onChange={(e) => setPrices({ ...prices, annual: +e.target.value })} />
              </label>
              <label className="field">Familiar
                <input type="number" value={prices.family} onChange={(e) => setPrices({ ...prices, family: +e.target.value })} />
              </label>
            </div>
            <div className="card-actions">
              <button className="btn primary">Guardar precios</button>
              <button className="btn">Sincronizar con /pro</button>
            </div>
          </div>
          <div className="admin-card">
            <div className="card-head">
              <h2>Control de pagos</h2>
            </div>
            <p className="muted">Integración lista para conectar pasarela (Wompi/PayU/MercadoPago). Actualmente modo local.</p>
            <div className="form-grid">
              <label className="field">Pasarela activa
                <select defaultValue="local">
                  <option value="local">Local (sin pasarela)</option>
                  <option value="wompi">Wompi</option>
                  <option value="payu">PayU</option>
                  <option value="mercadopago">MercadoPago</option>
                </select>
              </label>
              <label className="field">Clave pública
                <input type="text" placeholder="pk_test_..." />
              </label>
            </div>
            <div className="card-actions">
              <button className="btn">Guardar configuración</button>
            </div>
          </div>
        </section>
      )}

      {tab === 'ads' && (
        <section className="admin-card">
          <div className="card-head">
            <h2>Anuncios para cuentas gratuitas</h2>
            <label className="toggle"><input type="checkbox" checked={adsCfg.enabled} onChange={(e)=>setAdsCfg({...adsCfg,enabled:e.target.checked})} /> Activados</label>
          </div>
          <div className="form-grid two">
            <label className="field">Intervalo (canciones)
              <input type="number" value={adsCfg.interval} min={5} max={20} onChange={(e)=>setAdsCfg({...adsCfg,interval:+e.target.value})} />
            </label>
            <label className="field">Omitir después (segundos)
              <input type="number" value={adsCfg.skipAfter} min={5} max={15} onChange={(e)=>setAdsCfg({...adsCfg,skipAfter:+e.target.value})} />
            </label>
            <label className="field span2">Proveedor URL (script/iframe)
              <input type="text" value={adsCfg.provider} placeholder="https://..." onChange={(e)=>setAdsCfg({...adsCfg,provider:e.target.value})} />
            </label>
          </div>
          <div className="card-actions">
            <button className="btn primary">Guardar configuración</button>
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <section className="admin-card">
          <div className="card-head">
            <h2>Dispositivos vinculados</h2>
            <button className="btn small">Limpiar inactivos</button>
          </div>
          <p className="muted">Sin dispositivos registrados aún. Se registrarán al iniciar sesión desde distintas sesiones.</p>
        </section>
      )}

      {tab === 'content' && (
        <section className="admin-grid two">
          <div className="admin-card">
            <div className="card-head">
              <h2>Catálogo</h2>
            </div>
            <p className="muted">Forzar actualización del catálogo en caliente y limpiar caché.</p>
            <div className="card-actions">
              <button className="btn primary" onClick={() => fetch('/api/update?force=1', { method: 'POST' }).catch(()=>{})}><Icon name="globe" size={14} /> Forzar actualización de catálogo</button>
              <button className="btn" onClick={() => fetch('/api/clear-cache', { method: 'POST' }).catch(()=>{})}>Limpiar caché</button>
            </div>
          </div>
          <div className="admin-card">
            <div className="card-head">
              <h2>Estado general</h2>
            </div>
            <ul className="status-list">
              <li><span>Servidor API</span><span className="pill on">OK</span></li>
              <li><span>Búsqueda YouTube</span><span className="pill on">Activo</span></li>
              <li><span>Resolver multi-fuente</span><span className="pill on">Activo</span></li>
              <li><span>Anuncios</span><span className="pill on">Configurable</span></li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
