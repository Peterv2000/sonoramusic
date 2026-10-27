import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('users');
  const [prices, setPrices] = useState({ monthly: 4900, annual: 39900, family: 7900 });

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
    <div className="page admin-page">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Panel de Administración</h1>
        <span style={{ opacity: 0.7 }}>{user?.email}</span>
      </header>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className={`chip ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Usuarios</button>
        <button className={`chip ${tab === 'plans' ? 'active' : ''}`} onClick={() => setTab('plans')}>Planes/Precios</button>
        <button className={`chip ${tab === 'ads' ? 'active' : ''}`} onClick={() => setTab('ads')}>Anuncios</button>
        <button className={`chip ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>Dispositivos</button>
        <button className={`chip ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Contenido/Updater</button>
      </nav>

      {tab === 'users' && (
        <section>
          <h2>Usuarios</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                  <th style={{ padding: 8 }}>Email</th>
                  <th style={{ padding: 8 }}>Plan</th>
                  <th style={{ padding: 8 }}>Rol</th>
                  <th style={{ padding: 8 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: 8 }}>admin@ritmo.com</td>
                  <td style={{ padding: 8 }}>admin</td>
                  <td style={{ padding: 8 }}>admin</td>
                  <td style={{ padding: 8 }}>-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'plans' && (
        <section>
          <h2>Precios (COP)</h2>
          <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
            <label>Mensual (COP)
              <input type="number" value={prices.monthly} onChange={(e) => setPrices({ ...prices, monthly: +e.target.value })} />
            </label>
            <label>Anual (COP)
              <input type="number" value={prices.annual} onChange={(e) => setPrices({ ...prices, annual: +e.target.value })} />
            </label>
            <label>Familiar (COP)
              <input type="number" value={prices.family} onChange={(e) => setPrices({ ...prices, family: +e.target.value })} />
            </label>
            <button className="btn primary">Guardar precios</button>
          </div>
        </section>
      )}

      {tab === 'ads' && (
        <section>
          <h2>Anuncios para cuentas gratuitas</h2>
          <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
            <label>Activar anuncios <input type="checkbox" defaultChecked /></label>
            <label>Cada cuántas canciones <input type="number" defaultValue={10} min={5} /></label>
            <label>Tiempo obligatorio antes de omitir (segundos) <input type="number" defaultValue={7} min={5} max={10} /></label>
            <label>Proveedor URL (script/iframe) <input type="text" placeholder="https://..." /></label>
            <button className="btn primary">Guardar configuración</button>
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <section>
          <h2>Dispositivos vinculados</h2>
          <p style={{ opacity: 0.7 }}>Sin dispositivos registrados aún.</p>
        </section>
      )}

      {tab === 'content' && (
        <section>
          <h2>Contenido</h2>
          <button className="btn" onClick={() => fetch('/api/update?force=1', { method: 'POST' }).catch(()=>{})}>Forzar actualización de catálogo</button>
        </section>
      )}
    </div>
  );
}
