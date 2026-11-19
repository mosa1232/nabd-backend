// One place that talks to the FastAPI backend. Same origin in production
// (Caddy forwards /api, /auth ... to the app); the Vite dev server proxies
// them to localhost:8000.
export const API_BASE_URL = '';

let token = null;                    // kept in memory only, like the old app
let onUnauthorized = null;
export const getToken = () => token;
export const setToken = t => { token = t || null; };
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };
// the dashboard adds X-Subject-Id / X-Teacher-Id / X-View-As per request path
let headerHook = null;
export const setHeaderHook = fn => { headerHook = fn; };
const extraHeaders = path => (headerHook ? headerHook(path) || {} : {});

export async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE_URL + path, {
    ...options,
    credentials: 'include',          // the httpOnly session cookie restores a login
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...extraHeaders(path),
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
  if (res.status === 204) return null;
  // always JSON; if something in front of the API answers with HTML or text, fail with a clear message
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch {
    const err = new Error('رد غير صالح من الخادم');
    err.status = res.status;
    throw err;
  }
}

export const post = (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const put = (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
export const mediaUrl = u => (u ? (u.startsWith('http') ? u : API_BASE_URL + u) : '');

export const del = (path) => apiFetch(path, { method: 'DELETE' });

// multipart upload with a progress callback (percent); rejects with {detail, status} like apiFetch
export function upload(path, formData, onProgress, extra) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', API_BASE_URL + path);
    x.withCredentials = true;
    const h = { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extraHeaders(path), ...(extra || {}) };
    Object.keys(h).forEach(k => { if (h[k]) x.setRequestHeader(k, h[k]); });
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(100 * e.loaded / e.total)); };
    x.onerror = () => reject({ detail: 'انقطع الاتصال أثناء الرفع — تأكد من الإنترنت وأعد المحاولة' });
    x.ontimeout = () => reject({ detail: 'انتهت مهلة الرفع — جرّب ملفًا أصغر أو إنترنتًا أسرع' });
    x.onload = () => {
      let data = null; try { data = JSON.parse(x.responseText); } catch { /* not JSON */ }
      if (x.status >= 200 && x.status < 300) return resolve(data);
      if (x.status === 401 && token && onUnauthorized) { token = null; onUnauthorized(''); }
      const detail = data && typeof data.detail === 'string' ? data.detail
        : x.status === 413 ? 'الملف كبير جدًا' : x.status >= 500 ? 'خطأ في الخادم — حاول مرة أخرى بعد قليل' : 'تعذّر الرفع';
      reject({ detail, status: x.status });
    };
    x.send(formData);
  });
}
