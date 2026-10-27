import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthCtx = createContext(null);

const LS_USER = 'ritmo_user';
const LS_USERS = 'ritmo_users';

const DEFAULT_ADMIN = {
  id: 'admin_001',
  email: 'admin@ritmo.com',
  name: 'Administrador',
  role: 'admin',
  plan: 'admin',
  createdAt: Date.now(),
  devices: [],
  adsFree: true,
  active: true,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_USER);
      if (raw) return JSON.parse(raw);
    } catch {}
    // Ensure admin exists
    try {
      const rawUsers = localStorage.getItem(LS_USERS);
      if (!rawUsers) {
        localStorage.setItem(LS_USERS, JSON.stringify([DEFAULT_ADMIN]));
      } else {
        const users = JSON.parse(rawUsers);
        if (!users.find(u => u.email === DEFAULT_ADMIN.email)) {
          users.push(DEFAULT_ADMIN);
          localStorage.setItem(LS_USERS, JSON.stringify(users));
        }
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    try {
      if (user) localStorage.setItem(LS_USER, JSON.stringify(user));
      else localStorage.removeItem(LS_USER);
    } catch {}
  }, [user]);

  const getAllUsers = () => {
    try {
      const raw = localStorage.getItem(LS_USERS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [DEFAULT_ADMIN];
  };

  const saveUsers = (users) => {
    try {
      localStorage.setItem(LS_USERS, JSON.stringify(users));
    } catch {}
  };

  const login = (email, pass) => {
    const users = getAllUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (found && found.active === false) throw new Error('Cuenta desactivada');
    const u = found || {
      id: 'u_' + Date.now().toString(36),
      email: email.toLowerCase(),
      name: email.split('@')[0],
      role: 'user',
      plan: 'free',
      createdAt: Date.now(),
      devices: [],
      adsFree: false,
      active: true,
    };
    if (!found) {
      users.push(u);
      saveUsers(users);
    } else {
      // Update current user in list
      const idx = users.findIndex(x => x.id === found.id);
      users[idx] = u;
      saveUsers(users);
    }
    setUser(u);
    return u;
  };

  const register = (email, pass, name) => {
    const users = getAllUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('Este correo ya está registrado');
    }
    const u = {
      id: 'u_' + Date.now().toString(36),
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      role: 'user',
      plan: 'free',
      createdAt: Date.now(),
      devices: [],
      adsFree: false,
      active: true,
    };
    users.push(u);
    saveUsers(users);
    setUser(u);
    return u;
  };

  const logout = () => setUser(null);
  const upgrade = (plan = 'pro') => {
    setUser(u => {
      if (!u) return u;
      const updated = { ...u, plan, adsFree: plan !== 'free' && plan !== 'guest' };
      const users = getAllUsers();
      const idx = users.findIndex(x => x.id === u.id);
      if (idx >= 0) { users[idx] = updated; saveUsers(users); }
      return updated;
    });
  };

  const updateUser = (id, patch) => {
    const users = getAllUsers();
    const idx = users.findIndex(x => x.id === id);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...patch };
      saveUsers(users);
      if (user && user.id === id) setUser(users[idx]);
    }
  };

  const value = useMemo(() => ({
    user,
    login,
    register,
    logout,
    upgrade,
    updateUser,
    getAllUsers,
    isAdmin: user?.role === 'admin',
    isPro: user?.plan === 'pro' || user?.plan === 'family' || user?.role === 'admin',
    isFree: user?.plan === 'free' && user?.role !== 'admin',
  }), [user]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

