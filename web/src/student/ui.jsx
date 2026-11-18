import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';

// Run an async loader on mount / when deps change.
// Returns [value, reload, error]; value is undefined while loading and null on failure.
export function useLoad(fn, deps) {
  const [v, setV] = useState(undefined); const [err, setErr] = useState(null);
  const n = useRef(0);
  const run = () => {
    const my = ++n.current;
    return fn().then(x => { if (my === n.current) { setV(x); setErr(null); } }).catch(e => { if (my === n.current) { setV(null); setErr(e); } });
  };
  useEffect(() => { run(); return () => { n.current++; }; }, deps); // eslint-disable-line
  return [v, run, err, setV];
}

// the backend sends naive UTC timestamps; add Z so JS does not read them as local time
export const asUtc = iso => (iso ? new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z') : null);
export function fmtDate(iso, lang) {
  const d = asUtc(iso); if (!d) return '';
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-IQ', { day: 'numeric', month: 'short' });
}
export function fmtDateTime(iso, lang) {
  const d = asUtc(iso); if (!d) return '';
  return d.toLocaleString(lang === 'en' ? 'en-GB' : 'ar-IQ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const Empty = ({ children }) => <div className="empty-row">{children}</div>;

export function useCatalogTree() {
  const [tree] = useLoad(() => apiFetch('/api/catalog/tree'), []);
  return tree || [];
}
