import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { apiFetch } from '../lib/api.js';

// ---- the cart lives for the whole visit (memory only, like the old app) and the loaded products with it
const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);
export function StoreProvider({ children }) {
  const { user } = useApp();
  const [cart, setCart] = useState({});            // id -> qty
  const [products, setProducts] = useState(null);  // null = not loaded
  const [cats, setCats] = useState([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try { const r = await apiFetch('/api/store/products'); setProducts(Array.isArray(r) ? r : []); } catch (e) { setProducts([]); setErr(e.detail || ''); }
    try { const c = await apiFetch('/api/store/categories'); setCats(Array.isArray(c) ? c : []); } catch { setCats([]); }
  }, []);
  useEffect(() => { setCart({}); setProducts(null); }, [user?.id]);
  const add = id => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const change = (id, d) => setCart(c => { const n = { ...c }; n[id] = (n[id] || 0) + d; if (n[id] <= 0) delete n[id]; return n; });
  const clear = () => setCart({});
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const lines = ids.map(id => ({ p: (products || []).find(x => x.id === id), qty: cart[id] })).filter(l => l.p);
  const value = useMemo(() => ({
    cart, products, cats, err, load, add, change, clear, lines,
    count: Object.values(cart).reduce((a, b) => a + b, 0),
    total: lines.reduce((s, l) => s + l.p.price * l.qty, 0),
    hasPhysical: lines.some(l => l.p.type === 'physical'),
  }), [cart, products, cats, err]); // eslint-disable-line
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
