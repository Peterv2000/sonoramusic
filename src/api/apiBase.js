/* ══════════════════════════════════════════════════════════════════════════
   Base pública del API (web + APK).

   La web se despliega en Vercel/Netlify y el API en Render/Railway/Fly, así
   que cada petición debe apuntar al backend público, no al dominio del
   frontend. Se resuelve en este orden:

     1. `window.__SONORA_API_BASE__` (permite cambiar la URL sin recompilar,
        útil para pruebas en la APK).
     2. `localStorage['sonora-api-base']` (configuración manual en el móvil).
     3. `VITE_API_BASE_URL` en tiempo de compilación (recomendado: variable de
        entorno de Vercel/Netlify).
     4. Cadena vacía → rutas relativas (desarrollo local con `npm run serve`).

   Las rutas absolutas (`https://…`) y las rutas internas que no son del API
   (por ejemplo un blob:) se devuelven tal cual.
   ══════════════════════════════════════════════════════════════════════════ */

function readRuntimeOverride() {
  try {
    if (typeof window !== 'undefined' && window.__SONORA_API_BASE__) {
      return String(window.__SONORA_API_BASE__);
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('sonora-api-base');
      if (saved) return String(saved);
    }
  } catch { /* almacenamiento bloqueado */ }
  return '';
}

const COMPILED = (() => {
  try {
    return String(import.meta.env?.VITE_API_BASE_URL || '');
  } catch {
    return '';
  }
})();

/** URL base sin barra final (puede quedar vacía en desarrollo). */
export const API_BASE = String(readRuntimeOverride() || COMPILED).replace(/\/+$/, '');

/** ¿La app apunta a un backend externo (Vercel → Render, APK → Render)? */
export function isRemoteApi() {
  return /^https?:\/\//i.test(API_BASE);
}

/** Convierte una ruta del API en URL absoluta cuando hay base configurada. */
export function apiUrl(path) {
  const value = String(path || '');
  if (!value) return API_BASE;
  if (/^(?:https?:|blob:|data:)/i.test(value)) return value;
  if (!API_BASE) return value;
  return `${API_BASE}${value.startsWith('/') ? value : `/${value}`}`;
}

/** URL para EventSource (SSE) con la misma base que el resto del API. */
export function eventUrl(path = '/api/v1/events') {
  return apiUrl(path);
}

/** Guarda una base distinta (p. ej. desde el panel de administración móvil). */
export function setApiBase(base) {
  const value = String(base || '').trim().replace(/\/+$/, '');
  try {
    if (value) localStorage.setItem('sonora-api-base', value);
    else localStorage.removeItem('sonora-api-base');
  } catch { /* sin almacenamiento */ }
  try { window.__SONORA_API_BASE__ = value; } catch { /* noop */ }
  return value;
}

export default apiUrl;
