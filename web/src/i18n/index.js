// Languages: one strings file per language (ar.js, en.js, ku.js), each loaded only when that
// language is shown. On kiur.online the language also comes from the address:
//   kiur.online (and ar.kiur.online) = Arabic, en.kiur.online = English, ku.kiur.online = Kurdish.
// Anywhere else (localhost, beta) the language is a saved choice that switches in place.
const loaders = { ar: () => import('./ar.js'), en: () => import('./en.js'), ku: () => import('./ku.js') };
const cache = {};

export const LANG_BASE = 'kiur.online';
// Switch to true once en.kiur.online and ku.kiur.online resolve to the server (DNS) and LANG_DOMAINS is set in .env.
// While false, kiur.online keeps switching language in place, exactly as before.
export const LANG_SUBDOMAINS = false;
export const LANGS = ['ar', 'en', 'ku'];

export async function loadLang(l) {
  const k = loaders[l] ? l : 'ar';
  if (!cache[k]) cache[k] = (await loaders[k]()).default;
  return cache[k];
}
export const translate = (l, key) => (cache[l] || {})[key] || (cache.ar || {})[key] || key;

// the language this address is for, or null when the address does not decide it
export function hostLang() {
  if (!LANG_SUBDOMAINS) return null;
  const h = (typeof location !== 'undefined' ? location.hostname : '').toLowerCase();
  if (h === LANG_BASE || h === 'www.' + LANG_BASE) return 'ar';
  const m = h.match(/^(ar|en|ku)\.(.+)$/);
  return m && m[2] === LANG_BASE ? m[1] : null;
}
export const langUrl = (l) => 'https://' + (l === 'ar' ? LANG_BASE : l + '.' + LANG_BASE);

export function initialLang() {
  const byHost = hostLang();
  if (byHost) return byHost;
  try { const s = localStorage.getItem('kiur_lang'); if (loaders[s]) return s; } catch { /* storage blocked */ }
  return 'ar';
}
export function applyLangToPage(l) {
  document.documentElement.dir = l === 'en' ? 'ltr' : 'rtl';
  document.documentElement.lang = l === 'ku' ? 'ckb' : l;
}
