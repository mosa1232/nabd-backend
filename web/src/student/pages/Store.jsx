import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, dateLocale } from '../../lib/app.jsx';
import { apiFetch, post } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { PageHead } from './Bank.jsx';
import { asUtc, Empty } from '../ui.jsx';

const svg = (d, sw = 2) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ICONS = {
  key: svg(<><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></>),
  play: svg(<><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" /></>),
  bag: svg(<><path d="M6 8V6a4 4 0 0 1 4 -4h0a4 4 0 0 1 4 4v2" /><rect x="4" y="8" width="16" height="13" rx="2" /></>),
};
const TYPE_ICON = { digital: 'key', course: 'play', physical: 'bag' };
const TYPE_BADGE = { digital: 'رقمي', course: 'كورس', physical: 'منتج' };
const TYPE_DESC = { digital: 'productDescDigital', course: 'productDescCourse', physical: 'productDescPhysical' };
const fmtPrice = n => n.toLocaleString('en-US') + ' د.ع';
const CART_ICON = svg(<><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>);

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

export function Store() {
  const { t } = useApp();
  const nav = useNavigate();
  const S = useStore();
  const [filter, setFilter] = useState('all');
  const [added, setAdded] = useState(null);
  const timer = useRef(null);
  useEffect(() => { S.load(); }, []); // eslint-disable-line
  const products = S.products;
  const chips = [['all', t('filterAll')]]
    .concat((S.cats || []).filter(c => (products || []).some(p => p.category_id === c.id)).map(c => ['cat:' + c.id, c.name]))
    .concat([['digital', t('filterDigital')], ['physical', t('filterPhysical')]]);
  const list = !products ? [] : filter === 'all' ? products : filter.startsWith('cat:') ? products.filter(p => p.category_id === filter.slice(4)) : products.filter(p => p.type === filter);
  const addIt = p => { S.add(p.id); setAdded(p.id); clearTimeout(timer.current); timer.current = setTimeout(() => setAdded(null), 1100); };
  return (
    <div className="view active">
      <div className="page-head">
        <div className="page-head-main">
          <button className="icon-btn page-back" onClick={() => nav('/')} aria-label="back"><Ic n="back" sw={2.4} /></button>
          <div><div className="page-title">{t('storeTitle')}</div><div className="page-sub">{t('storeSub')}</div></div>
        </div>
        <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: '.8rem' }} onClick={() => nav('/store/orders')}>{t('ordersTitle')}</button>
        <button className="icon-btn" style={{ position: 'relative' }} onClick={() => nav('/store/cart')} aria-label="cart">
          {CART_ICON}<span className="cart-badge" style={{ display: S.count > 0 ? 'grid' : 'none' }}>{S.count}</span>
        </button>
      </div>
      <div className="filter-chips">{chips.map(([k, text]) => <button key={k} className={'filter-chip' + (k === filter ? ' active' : '')} onClick={() => setFilter(k)}>{text}</button>)}</div>
      <div className="product-grid">
        {products === null ? <div className="empty-state" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '28px 16px', color: 'var(--ink-faint)', fontSize: '.86rem' }}>جارٍ التحميل...</div>
          : !list.length ? <div className="empty-state" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '28px 16px', color: 'var(--ink-faint)', fontSize: '.86rem' }}>{products.length ? t('noProductsInCategory') : t('noProductsAvailable')}</div>
            : list.map(p => (
              <div className="product-card glass" key={p.id}>
                <div className="product-shine" /><div className="product-glow" />
                <div className="product-icon-wrap"><span className={'product-badge ' + (p.type === 'physical' ? 'physical' : 'digital')}>{TYPE_BADGE[p.type] || p.type}</span>{ICONS[TYPE_ICON[p.type] || 'key']}</div>
                <div><div className="product-name">{p.name}</div><div className="product-desc">{TYPE_DESC[p.type] ? t(TYPE_DESC[p.type]) : ''}</div></div>
                <div className="product-foot">
                  <div className="product-price mono">{fmtPrice(p.price)}</div>
                  <button className={'product-add' + (added === p.id ? ' added' : '')} onClick={() => addIt(p)} aria-label={t('addToCart')} title={t('addToCart')}>
                    {added === p.id ? svg(<path d="m5 12.5 4.5 4.5L19 7" />, 2.6) : svg(<path d="M4 12h16M12 4v16" />, 2.4)}
                  </button>
                </div>
              </div>))}
      </div>
    </div>
  );
}

export function Cart() {
  const { t } = useApp();
  const nav = useNavigate();
  const S = useStore();
  useEffect(() => { if (S.products === null) S.load(); }, []); // eslint-disable-line
  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/store')} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{t('cartTitle')}</div><div style={{ width: 38 }} />
      </div>
      <div className="item-list" style={{ marginBottom: 16 }}>
        {!S.lines.length ? <div className="cart-empty glass">{svg(<><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>, 1.6)}السلة فارغة</div>
          : S.lines.map(({ p, qty }) => (
            <div className="cart-item glass" key={p.id}>
              <div className="cart-item-icon">{ICONS[TYPE_ICON[p.type] || 'key']}</div>
              <div className="cart-item-body"><div className="cart-item-name">{p.name}</div><div className="cart-item-price mono">{fmtPrice(p.price)}</div></div>
              <div className="qty-stepper"><button className="qty-btn" onClick={() => S.change(p.id, -1)}>−</button><span className="qty-value">{qty}</span><button className="qty-btn" onClick={() => S.change(p.id, 1)}>+</button></div>
            </div>))}
      </div>
      {S.lines.length > 0 && <div className="cart-summary glass" style={{ display: 'flex' }}>
        <div className="summary-row"><span>المجموع الفرعي</span><b className="mono">{fmtPrice(S.total)}</b></div>
        <div className="summary-row total"><span>الإجمالي</span><b className="mono">{fmtPrice(S.total)}</b></div>
        <div className="summary-note">{S.hasPhysical ? 'يتضمن الطلب منتجات ملموسة — يتوفر خيار الدفع عند الاستلام' : 'طلب رقمي بالكامل — يتم التفعيل فور تأكيد الدفع'}</div>
        <button className="btn" style={{ justifyContent: 'center', marginTop: 8 }} onClick={() => nav('/store/checkout')}>متابعة الشراء</button>
      </div>}
    </div>
  );
}

// The card is a picture of the chosen payment method and how it settles — never a place to type a card number.
function PayCard({ method, amount, name }) {
  const { t } = useApp();
  const [flipped, setFlipped] = useState(false);
  const zain = method === 'zaincash';
  return (
    <>
      <button className={'pay-card' + (flipped ? ' flipped' : '')} type="button" data-method={method} onClick={() => setFlipped(f => !f)} aria-label={t('payCardFlip')}>
        <span className="pay-card-inner">
          <span className="pay-card-face">
            <span className="pay-card-brand">{zain ? 'ZAIN CASH' : 'CASH ON DELIVERY'}</span>
            <span className="pay-card-chip" aria-hidden="true" />
            <svg className="pay-card-wave" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8.5 7.5a6 6 0 0 1 0 9" /><path d="M12 5a9.5 9.5 0 0 1 0 14" /><path d="M15.5 2.5a13 13 0 0 1 0 19" /></svg>
            <span className="pay-card-amount">{fmtPrice(amount)}</span>
            <span className="pay-card-label">{t('payCardHolder')}</span>
            <span className="pay-card-name">{name}</span>
            <span className="pay-card-mark" aria-hidden="true"><i /><i /></span>
          </span>
          <span className="pay-card-face pay-card-back">
            <span className="pay-card-strip" aria-hidden="true" />
            <span className="pay-card-note"><b>{zain ? t('payZainHowTitle') : t('payCodHowTitle')}</b><span>{zain ? t('payZainHowBody') : t('payCodHowBody')}</span></span>
          </span>
        </span>
      </button>
      <div className="pay-card-hint">{t('payCardHint')}</div>
    </>
  );
}

export function Checkout() {
  const { t, user } = useApp();
  const nav = useNavigate();
  const S = useStore();
  const [pay, setPay] = useState('zaincash');
  const [d, setD] = useState({ name: '', phone: '', address: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (S.products === null) S.load(); }, []); // eslint-disable-line
  useEffect(() => { if (S.products && !S.lines.length && !done) nav('/store/cart', { replace: true }); }, [S.products]); // eslint-disable-line
  const physical = S.hasPhysical;
  const confirm = async () => {
    if (physical && (!d.name.trim() || !d.phone.trim() || !d.address.trim())) return setErr('الرجاء تعبئة الاسم ورقم الهاتف والعنوان لإتمام طلب فيه منتج ملموس');
    if (!S.lines.length) return setErr('السلة فارغة');
    setErr(''); setBusy(true);
    try {
      const body = { items: S.lines.map(l => ({ product_id: l.p.id, qty: l.qty })), payment_method: physical ? pay : 'zaincash' };
      if (physical) { body.delivery_name = d.name.trim(); body.delivery_phone = d.phone.trim(); body.delivery_address = d.address.trim(); }
      const order = await post('/api/store/orders', body);
      setDone({ order, pay: body.payment_method });
    } catch (e) { setErr(e.detail || 'تعذّر إرسال الطلب — حاول مرة أخرى'); }
    finally { setBusy(false); }
  };
  const method = physical ? pay : 'zaincash';
  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/store/cart')} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{t('checkoutTitle')}</div><div style={{ width: 38 }} />
      </div>
      {done ? (
        <div className="confirm-panel glass">
          <div className="confirm-icon">{svg(<path d="M20 6 9 17l-5-5" />, 2.4)}</div>
          <div className="confirm-title">تم إرسال طلبك بنجاح</div>
          <div className="confirm-sub">رقم الطلب <span className="mono">{done.order.id}</span> — {done.pay === 'zaincash' ? 'سيتم تفعيل طلبك فور تأكيد الدفع عبر زين كاش' : 'سيتواصل معك المندوب لتأكيد التوصيل'}</div>
          {done.order.granted_activation_codes && done.order.granted_activation_codes.length > 0 && (
            <div className="glass" style={{ padding: '14px 16px', marginTop: 14, textAlign: 'start' }}>
              <div style={{ fontWeight: 700, fontSize: '.82rem', marginBottom: 6 }}>تم تفعيل كود التفعيل تلقائياً على حسابك</div>
              {done.order.granted_activation_codes.map((c, i) => <div key={i} className="mono" style={{ fontSize: '.85rem' }}>{c}</div>)}
            </div>)}
          <button className="btn" onClick={() => { S.clear(); nav('/'); }}>العودة للرئيسية</button>
        </div>
      ) : (
        <div className="invoice glass">
          <div className="invoice-title">{svg(<><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" /><path d="M9 7h6M9 11h6M9 15h4" /></>)}<span>{t('checkoutTitle')}</span></div>
          <div className="invoice-steps">
            <div className="invoice-step"><span>{t('invoiceItems')}</span>
              <div className="invoice-lines">{S.lines.map(l => <Fragment key={l.p.id}><span>{l.p.name} <span className="muted">× {l.qty}</span></span><span>{fmtPrice(l.p.price * l.qty)}</span></Fragment>)}</div></div>
            <hr />
            <div className="invoice-step"><span>{t('invoiceShipping')}</span>
              {physical ? <>
                <div className="form-field"><input type="text" placeholder="الاسم الكامل" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></div>
                <div className="form-field"><input type="tel" placeholder="رقم الهاتف" value={d.phone} onChange={e => setD({ ...d, phone: e.target.value })} /></div>
                <div className="form-field" style={{ marginBottom: 0 }}><input type="text" placeholder="العنوان — المحافظة، المنطقة، أقرب نقطة دالة" value={d.address} onChange={e => setD({ ...d, address: e.target.value })} /></div>
              </> : <p>{t('invoiceNoShipping')}</p>}
              {err && <div style={{ color: 'var(--danger)', fontSize: '.78rem', marginTop: 8 }}>{err}</div>}
            </div>
            <hr />
            <div className="invoice-step"><span>{t('invoicePaymentMethod')}</span>
              <div><PayCard key={method} method={method} amount={S.total} name={(user?.full_name || '').trim() || '—'} /></div>
              <div className="pay-options">
                <button className={'pay-option' + (method === 'zaincash' ? ' active' : '')} onClick={() => setPay('zaincash')}>
                  <span className="pay-icon">{svg(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 14h4" /></>)}</span>
                  <span className="pay-body"><span className="pay-title">زين كاش (ZainCash)</span><span className="pay-sub">دفع فوري إلكتروني</span></span><span className="pay-radio" />
                </button>
                <button className={'pay-option' + (method === 'cod' ? ' active' : '') + (physical ? '' : ' disabled')} onClick={() => physical && setPay('cod')}>
                  <span className="pay-icon">{svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2Z" /></>)}</span>
                  <span className="pay-body"><span className="pay-title">الدفع عند الاستلام</span><span className="pay-sub">{physical ? 'يدفع نقداً عند وصول المندوب' : 'متاح فقط عند وجود منتج ملموس بالسلة'}</span></span><span className="pay-radio" />
                </button>
              </div>
            </div>
            <hr />
            <div className="invoice-step"><span>{t('invoicePayment')}</span>
              <div className="invoice-lines"><span>{t('invoiceItemCount')}</span><span>{S.count}</span><span>{t('invoiceSubtotal')}</span><span>{fmtPrice(S.total)}</span></div></div>
          </div>
          <div className="invoice-foot"><span className="invoice-price">{fmtPrice(S.total)}</span><button className="btn" disabled={busy} onClick={confirm}>{t('confirmOrder')}</button></div>
        </div>)}
    </div>
  );
}

export function MyOrders() {
  const { t, lang } = useApp();
  const nav = useNavigate();
  const [orders, setOrders] = useState(undefined); const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => { apiFetch('/api/store/orders').then(setOrders).catch(e => { setErr(e.detail || 'تعذّر تحميل الطلبات'); setOrders(null); }); }, []);
  const label = { pending: t('orderPending'), paid: t('orderPaid'), fulfilled: t('orderFulfilled'), cancelled: t('orderCancelled') };
  const lvl = { pending: 0, paid: 1, fulfilled: 2, cancelled: -1 };
  const copy = c => { try { navigator.clipboard && navigator.clipboard.writeText(c); } catch { /* ignore */ } setCopied(c); };
  return (
    <div className="view active">
      <PageHead title={t('ordersTitle')} sub={t('ordersSub')} back="/store" />
      <div style={{ padding: '0 16px 100px' }}>
        {orders === undefined ? <Empty>{t('loading')}</Empty> : orders === null ? <Empty>{err}</Empty> : !orders.length ? <Empty>{t('orderNone')}</Empty> : orders.map(o => {
          const L = lvl[o.status];
          return (
            <div className="ord-card" key={o.id}>
              <div className="ord-top"><div><b>{label[o.status] || o.status}</b>
                <div className="cell-sub" style={{ fontSize: '.76rem', opacity: .7 }}>{asUtc(o.created_at).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' })} · {o.payment_method === 'cod' ? t('orderCod') : t('orderZain')}</div></div>
                <b>{fmtPrice(o.total)}</b></div>
              <div style={{ marginTop: 10, fontSize: '.86rem', lineHeight: 1.9 }}>{o.items.map((i, k) => <span key={k}>{k ? ' · ' : ''}{i.name} <span style={{ opacity: .65 }}>×{i.qty}</span></span>)}</div>
              <div className="ord-steps">{['pending', 'paid', 'fulfilled'].map((k, i) => <div key={k} className={'ord-step ' + (L === -1 ? 'bad' : i <= L ? 'on' : '')}><i />{label[k].split(' — ')[0]}</div>)}</div>
              {o.status === 'pending' && <div className="item-meta" style={{ marginTop: 6 }}>{t('orderWaiting')}</div>}
              {o.delivery && <div className="item-meta" style={{ marginTop: 8 }}><b>{t('orderDelivery')}:</b> {o.delivery.name || ''} · <span dir="ltr">{o.delivery.phone || ''}</span><br />{o.delivery.address || ''}</div>}
              {o.codes.length > 0 && <>
                <div style={{ marginTop: 10, fontWeight: 800, fontSize: '.84rem' }}>{t('orderCodes')}</div>
                {o.codes.map(c => <div className="ord-code" key={c.code}><b>{c.code}</b><span style={{ flex: 1, fontSize: '.76rem', opacity: .75 }}>{c.subject || 'VIP'}</span>
                  <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '.72rem' }} onClick={() => copy(c.code)}>{copied === c.code ? t('orderCopied') : t('orderCopy')}</button></div>)}
                <div className="item-meta" style={{ marginTop: 6 }}>{t('orderRedeem')}</div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
