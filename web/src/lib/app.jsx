import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, post, put, setToken, getToken, setUnauthorizedHandler } from './api.js';
import { dict } from '../i18n/dict.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// "phone" for a touch phone or any window <= 700px, otherwise "desktop"; ?device= or the saved choice wins.
function detectDevice() {
  let pref = null;
  try { pref = localStorage.getItem('kiur_device'); } catch { /* private mode */ }
  const q = /[?&]device=(phone|desktop)/.exec(location.search);
  if (q) pref = q[1];
  if (pref === 'phone' || pref === 'desktop') return pref;
  const ua = navigator.userAgent || '';
  const phoneUA = /Android|iPhone|iPod|Windows Phone|Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua);
  return phoneUA || window.innerWidth <= 700 ? 'phone' : 'desktop';
}

export function AppProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [booted, setBooted] = useState(false);
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem('kiur_lang') || 'ar'; } catch { return 'ar'; } });
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('kiur_dark') === '1'; } catch { return false; } });
  const [device, setDevice] = useState(detectDevice);
  const [toasts, setToasts] = useState([]);
  const pending = useRef({ twofa: null, reset: null });

  // ---- language / theme / device -> <html>
  useEffect(() => {
    const rtl = lang !== 'en';
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang === 'ku' ? 'ckb' : lang;
    try { localStorage.setItem('kiur_lang', lang); } catch { /* ignore */ }
  }, [lang]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('kiur_dark', dark ? '1' : '0'); } catch { /* ignore */ }
  }, [dark]);
  useEffect(() => {
    const apply = () => setDevice(detectDevice());
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
  useEffect(() => {
    const d = document.documentElement;
    d.classList.toggle('is-phone', device === 'phone');
    d.classList.toggle('is-desktop', device !== 'phone');
  }, [device]);

  const t = useCallback((key) => (dict[lang] || dict.ar)[key] || dict.ar[key] || key, [lang]);

  const toast = useCallback((message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list, { id, message }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 3200);
  }, []);

  const savePreference = useCallback((patch) => {
    if (getToken()) put('/auth/me/preferences', patch).catch(() => {});
  }, []);
  const setLang = useCallback((l) => { setLangState(l); savePreference({ language: l }); }, [savePreference]);
  const toggleTheme = useCallback(() => { setDark(d => { savePreference({ theme: d ? 'light' : 'dark' }); return !d; }); }, [savePreference]);
  const setDeviceMode = useCallback((m) => {
    try { if (m === 'auto') localStorage.removeItem('kiur_device'); else localStorage.setItem('kiur_device', m); } catch { /* ignore */ }
    setDevice(detectDevice());
  }, []);

  // ---- session
  const setUser = useCallback((u) => setUserState(u), []);
  const applyPrefs = useCallback((u) => {
    if (!u) return;
    if (u.language) setLangState(u.language);
    if (u.theme) setDark(u.theme === 'dark');
  }, []);
  const startSession = useCallback((data) => {
    setToken(data.access_token);
    setUserState(data.user);
    applyPrefs(data.user);
    return data.user;
  }, [applyPrefs]);
  const refreshUser = useCallback(async () => { const me = await apiFetch('/auth/me'); setUserState(me); return me; }, []);
  const logout = useCallback(async () => {
    if (getToken()) apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((detail) => {
      setUserState(null);
      toast(detail || t('sessionExpired') || 'انتهت الجلسة — سجّل الدخول من جديد');
    });
  }, [toast, t]);

  // boot: tokens handed back in the URL fragment (Google / reset e-mail), else the session cookie
  useEffect(() => {
    (async () => {
      const h = location.hash;
      const m = h.match(/access_token=([^&]+)/), m2 = h.match(/requires_2fa=1&pending_token=([^&]+)/), m3 = h.match(/reset_token=([^&]+)/);
      if (m || m2 || m3) history.replaceState(null, '', location.pathname + location.search);
      if (m3) pending.current.reset = decodeURIComponent(m3[1]);
      else if (m2) pending.current.twofa = decodeURIComponent(m2[1]);
      else if (m) {
        setToken(decodeURIComponent(m[1]));
        try { const me = await apiFetch('/auth/me'); setUserState(me); applyPrefs(me); } catch { setToken(null); }
      } else {
        try { startSession(await post('/auth/session/restore')); } catch { /* signed out */ }
      }
      setBooted(true);
    })();
  }, [applyPrefs, startSession]);

  const value = useMemo(() => ({
    user, setUser, booted, lang, setLang, t, dark, toggleTheme, device, setDeviceMode,
    toast, toasts, startSession, refreshUser, logout, pending,
  }), [user, setUser, booted, lang, setLang, t, dark, toggleTheme, device, setDeviceMode, toast, toasts, startSession, refreshUser, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Shared formatting helpers
export const initials = (name) => (name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
export const numLocal = (n, lang) => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'ar-IQ');
export const dateLocale = (lang) => (lang === 'en' ? 'en-GB' : 'ar-IQ');
