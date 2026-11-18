// One place that talks to the FastAPI backend. Same origin in production
// (Caddy forwards /api, /auth ... to the app); the Vite dev server proxies
// them to localhost:8000.
export const API_BASE_URL = '';

let token = null;                    // kept in memory only, like the old app
let onUnauthorized = null;
export const getToken = () => token;
export const setToken = t => { token = t || null; };
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

export async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE_URL + path, {
    ...options,
    credentials: 'include',          // the httpOnly session cookie restores a login
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.detail || ''; } catch { /* no JSON body */ }
    if (typeof detail !== 'string') detail = '';
    // 401 with a token = the session is gone (expired, or signed in on another device)
    if (res.status === 401 && token) {
      token = null;
      if (onUnauthorized) onUnauthorized(detail);
    }
    const err = new Error(detail || 'API ' + res.status);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const post = (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const put = (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
export const mediaUrl = u => (u ? (u.startsWith('http') ? u : API_BASE_URL + u) : '');
