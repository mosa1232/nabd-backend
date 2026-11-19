import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, post, put, del, upload, getToken, mediaUrl } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { PERM_LABELS } from '../nav.js';
import { Card, AddBtn, StKpis, Table, Badge, SmallBtn, TrashBtn, Loading, numAr, useData } from '../ui.jsx';

// store, summer training, files, import/export and resellers management
const fmtIQD = (n) => (n || 0).toLocaleString('en-US') + ' د.ع';
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((b || 0) / 1024)) + ' KB');
const FIELD = { padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', fontSize: '.86rem' };
const initialsOf = (n) => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
function ago(iso) {
  if (!iso) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (m < 1) return 'الآن'; if (m < 60) return `قبل ${m} د`; if (m < 1440) return `قبل ${Math.round(m / 60)} س`; if (m < 43200) return `قبل ${Math.round(m / 1440)} يوم`;
  return d.toLocaleDateString('en-GB');
}
const Chips = ({ items, value, onPick, children }) => (
  <div className="ops-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
    {items.map(([k, l, n]) => <button key={k} className={'cat-tab' + (k === value ? ' on' : '')} onClick={() => onPick(k)}>{l}{n != null ? <> <b>{n}</b></> : null}</button>)}
    {children}
  </div>
);
const Search = ({ value, onChange, placeholder }) => <input type="text" className="q" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />;

// download a file that needs the signed-in session
async function downloadFile(path, filename) {
  const res = await fetch(path, { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {}, credentials: 'include' });
  if (!res.ok) throw new Error('فشل التنزيل');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  return blob;
}

// ------------------------------------------------------------------ store
const ORDER_STATUS = { pending: 'قيد الانتظار', paid: 'مدفوع', fulfilled: 'مُسلَّم', cancelled: 'ملغي' };
const ORDER_BADGE = { pending: 'idle', paid: 'active', fulfilled: 'active', cancelled: 'disabled' };
const PRODUCT_TYPES = { digital: 'رقمي', physical: 'ملموس', course: 'كورس' };

export function Store() {
  const A = useAdmin();
  const [tab, setTab] = useState('orders');
  const orders = useData(() => apiFetch('/api/admin/store/orders'), []);
  const products = useData(() => apiFetch('/api/admin/store/products'), []);
  const cats = useData(() => apiFetch('/api/admin/store/categories'), []);
  const [status, setStatus] = useState('all'); const [q, setQ] = useState(''); const [shown, setShown] = useState(25); const [pq, setPq] = useState('');
  const ords = orders.data || [], prods = products.data || [], catList = cats.data || [];
  const reloadAll = () => { orders.reload(); products.reload(); cats.reload(); };
  const catName = (id) => (catList.find(c => c.id === id) || {}).name || 'بدون قسم';
  const cnt = (k) => ords.filter(o => o.status === k).length;
  const paidSum = ords.filter(o => ['paid', 'fulfilled'].includes(o.status)).reduce((a, o) => a + o.total, 0);
  const today = ords.filter(o => new Date(/Z$/.test(o.created_at) ? o.created_at : o.created_at + 'Z').toDateString() === new Date().toDateString()).length;

  const setOrderStatus = async (o, st) => {
    const label = { paid: 'تأكيد الدفع (يصدر أكواد التفعيل للمشتري إن كان فيها)', fulfilled: 'تسجيل التسليم', cancelled: 'إلغاء الطلب' }[st];
    if (label && !await A.dialogs.confirm(`${label}؟`)) return;
    try {
      const r = await put('/api/admin/store/orders/' + o.id + '/status?' + new URLSearchParams({ status: st }));
      const n = (r && r.granted_activation_codes || []).length;
      A.toast('تم تحديث حالة الطلب' + (n ? ` — أُصدر ${n} كود` : '')); orders.reload();
    } catch (e) { A.toast(e.detail || 'تعذّر تحديث الحالة', 'error'); orders.reload(); }
  };

  const subjectOptions = async () => {
    const opts = [{ value: '', label: '— بدون (ليس كود تفعيل)' }, { value: '__vip__', label: 'VIP — كود تفعيل لكل المواد' }];
    try {
      const tree = await apiFetch('/api/catalog/tree');
      tree.forEach(sec => (sec.universities || []).forEach(u => (u.stages || []).forEach(st => (st.subjects || []).forEach(s => opts.push({ value: s.id, label: `${s.name} — ${u.name} / ${st.name}` })))));
    } catch { /* keep the two fixed options */ }
    return opts;
  };
  const productForm = async (cur) => {
    const subs = await subjectOptions();
    A.dialogs.form({
      title: cur ? 'تعديل منتج' : 'إضافة منتج',
      fields: [
        { id: 'name', label: 'اسم المنتج', type: 'text', value: cur ? cur.name : '' },
        { id: 'price', label: 'السعر (د.ع)', type: 'number', value: cur ? cur.price : 0 },
        { id: 'type', label: 'النوع', type: 'select', value: cur ? cur.type : 'digital', options: Object.entries(PRODUCT_TYPES).map(([value, label]) => ({ value, label })) },
        { id: 'categoryId', label: 'قسم المتجر', type: 'select', value: cur ? (cur.category_id || '') : '', options: [{ value: '', label: '— بدون قسم' }].concat(catList.map(c => ({ value: c.id, label: c.name }))) },
        { id: 'subjectId', label: 'كود تفعيل لأي مادة؟', type: 'select', value: cur && cur.is_activation_code ? (cur.grants_subject_id || '__vip__') : '', options: subs },
      ],
      onSubmit: async (v) => {
        if (!v.name.trim()) throw { detail: 'اسم المنتج مطلوب' };
        const body = { name: v.name.trim(), price: parseInt(v.price, 10) || 0, type: v.type, is_activation_code: v.subjectId !== '', grants_subject_id: v.subjectId === '__vip__' ? null : (v.subjectId || null), category_id: v.categoryId || null };
        if (cur) await put('/api/admin/store/products/' + cur.id, body); else await post('/api/admin/store/products', body);
        products.reload();
      },
    });
  };
  const deleteProduct = async (p) => {
    if (!await A.dialogs.confirm('حذف هذا المنتج نهائياً؟')) return;
    try { await del('/api/admin/store/products/' + p.id); products.reload(); } catch (e) { A.toast(e.detail || 'تعذّر حذف المنتج', 'error'); }
  };
  const categoryForm = (cur) => A.dialogs.form({
    title: cur ? 'تعديل قسم المتجر' : 'إضافة قسم للمتجر',
    fields: [{ id: 'name', label: 'اسم القسم', type: 'text', value: cur ? cur.name : '' }, { id: 'order', label: 'الترتيب (الأصغر يظهر أولاً)', type: 'number', value: cur ? cur.sort_order : catList.length }],
    onSubmit: async (v) => {
      if (!v.name.trim()) throw { detail: 'اسم القسم مطلوب' };
      const body = { name: v.name.trim(), sort_order: parseInt(v.order, 10) || 0 };
      if (cur) await put('/api/admin/store/categories/' + cur.id, body); else await post('/api/admin/store/categories', body);
      cats.reload();
    },
  });
  const deleteCategory = async (c) => {
    if (!await A.dialogs.confirm('حذف هذا القسم؟ المنتجات داخله لن تُحذف، بل تصبح بدون قسم.')) return;
    try { await del('/api/admin/store/categories/' + c.id); reloadAll(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); }
  };

  const ql = q.trim().toLowerCase();
  const list = ords.filter(o => (status === 'all' || o.status === status) && (!ql || [o.buyer_name, o.buyer_email, ...(o.items || []).map(i => i.product_name)].some(v => (v || '').toLowerCase().includes(ql))));
  const sold = {}; ords.filter(o => ['paid', 'fulfilled'].includes(o.status)).forEach(o => (o.items || []).forEach(i => { sold[i.product_name] = (sold[i.product_name] || 0) + i.qty; }));
  const pl = prods.filter(p => !pq.trim() || p.name.toLowerCase().includes(pq.trim().toLowerCase()));
  const counts = {}; prods.forEach(p => { if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1; });

  return (
    <>
      <StKpis items={[['طلبات تنتظر إجراء', numAr(cnt('pending')), cnt('pending') ? 'قيد الانتظار' : ''], ['إيرادات مؤكدة', fmtIQD(paidSum), `${numAr(cnt('paid') + cnt('fulfilled'))} طلب مدفوع`], ['طلبات اليوم', numAr(today)], ['المنتجات', numAr(prods.length)], ['ملغية', numAr(cnt('cancelled'))]]} />
      <div className="tabs" style={{ margin: '4px 0 14px' }}>{[['orders', 'الطلبات'], ['products', 'المنتجات'], ['categories', 'الأقسام']].map(([k, l]) => <button key={k} className={'tab-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'orders' && <Card title="طلبات المتجر">
        <Chips items={[['all', 'الكل', ords.length], ...Object.keys(ORDER_STATUS).map(k => [k, ORDER_STATUS[k], cnt(k)])]} value={status} onPick={k => { setStatus(k); setShown(25); }}>
          <Search value={q} onChange={v => { setQ(v); setShown(25); }} placeholder="ابحث باسم المشتري أو بريده أو المنتج..." />
        </Chips>
        {orders.loading && !orders.data ? <Loading /> : orders.error ? <div className="empty-row">{orders.error}</div> : !list.length ? <div className="empty-row">لا توجد طلبات بهذه المواصفات</div> : list.slice(0, shown).map(o => (
          <div className="notif-card" key={o.id}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800 }}>{o.buyer_name} <Badge kind={ORDER_BADGE[o.status] || 'idle'}>{ORDER_STATUS[o.status] || o.status}</Badge></div>
                <div className="cell-sub" dir="ltr" style={{ textAlign: 'start' }}>{o.buyer_email}</div>
                <div style={{ marginTop: 8, fontSize: '.84rem', lineHeight: 1.9 }}>{(o.items || []).map((i, k) => <span key={k}>{k ? ' · ' : ''}{i.product_name} <span className="cell-sub">×{i.qty}</span></span>)}{!(o.items || []).length && '—'}</div>
                {(o.delivery_name || o.delivery_address) && <div className="ban-quote"><b>التوصيل:</b> {o.delivery_name || ''} {o.delivery_phone ? <> · <span dir="ltr">{o.delivery_phone}</span></> : null}<br />{o.delivery_address || ''}</div>}
              </div>
              <div style={{ textAlign: 'end' }}><div className="mono" style={{ fontWeight: 800, fontSize: '1.05rem' }}>{fmtIQD(o.total)}</div><div className="cell-sub">{o.payment_method === 'cod' ? 'عند الاستلام' : 'زين كاش'} · {ago(o.created_at)}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {o.status === 'pending' && <button className="btn" style={{ padding: '6px 14px', fontSize: '.76rem' }} onClick={() => setOrderStatus(o, 'paid')}>تأكيد الدفع</button>}
              {o.status === 'paid' && <button className="btn" style={{ padding: '6px 14px', fontSize: '.76rem' }} onClick={() => setOrderStatus(o, 'fulfilled')}>تم التسليم</button>}
              {['pending', 'paid'].includes(o.status) && <SmallBtn danger onClick={() => setOrderStatus(o, 'cancelled')}>إلغاء الطلب</SmallBtn>}
              <select value={o.status} onChange={e => e.target.value !== o.status && setOrderStatus(o, e.target.value)} style={{ fontSize: '.74rem', padding: '5px 8px', marginInlineStart: 'auto' }}>{Object.keys(ORDER_STATUS).map(k => <option key={k} value={k}>{ORDER_STATUS[k]}</option>)}</select>
            </div>
          </div>
        ))}
        {list.length > shown && <div style={{ textAlign: 'center', marginTop: 10 }}><SmallBtn onClick={() => setShown(s => s + 25)}>عرض المزيد ({numAr(list.length - shown)})</SmallBtn></div>}
      </Card>}

      {tab === 'products' && <Card title="المنتجات" actions={<AddBtn onClick={() => productForm(null)}>إضافة منتج</AddBtn>}>
        <div className="ops-filters" style={{ marginBottom: 12 }}><Search value={pq} onChange={setPq} placeholder="ابحث باسم المنتج..." /></div>
        {products.loading && !products.data ? <Loading /> : !pl.length ? <div className="empty-row">لا توجد منتجات</div> : (
          <div className="media-grid">{pl.map(p => (
            <div className="media-card" key={p.id}>
              <div className="media-thumb" style={{ height: 84, fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>{fmtIQD(p.price)}</div>
              <div className="media-info"><div className="n" title={p.name}>{p.name}</div>
                <div className="m">{PRODUCT_TYPES[p.type] || p.type} · {catName(p.category_id)}</div>
                <div>{p.is_activation_code && <Badge kind="active">كود تفعيل</Badge>} <span className="cell-sub">بيع {numAr(sold[p.name] || 0)}</span></div></div>
              <div className="media-acts"><button className="btn btn-ghost" onClick={() => productForm(p)}>تعديل</button><button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteProduct(p)}>حذف</button></div>
            </div>))}</div>)}
      </Card>}

      {tab === 'categories' && <Card title="أقسام المتجر" actions={<AddBtn onClick={() => categoryForm(null)}>إضافة قسم</AddBtn>}>
        <Table head={['القسم', 'الترتيب', 'المنتجات', '']} empty="لا توجد أقسام بعد — أضف أول قسم للمتجر">
          {catList.map(c => <tr key={c.id}><td className="cell-name">{c.name}</td><td>{c.sort_order}</td><td>{counts[c.id] || 0}</td>
            <td style={{ textAlign: 'end' }}><div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><SmallBtn onClick={() => categoryForm(c)}>تعديل</SmallBtn><TrashBtn label="حذف القسم" onClick={() => deleteCategory(c)} /></div></td></tr>)}
        </Table>
      </Card>}
    </>
  );
}

// ------------------------------------------------------------------ summer training
const summerState = (t) => {
  const today = new Date().toISOString().slice(0, 10);
  if (t.ends_on && t.ends_on < today) return 'ended';
  if (t.starts_on && t.starts_on > today) return 'upcoming';
  return t.starts_on || t.ends_on ? 'running' : 'open';
};
const SUMMER_STATE = { ended: ['انتهت', 'disabled'], upcoming: ['قادمة', 'idle'], running: ['جارية', 'active'], open: ['بدون موعد', 'idle'] };

export function Summer() {
  const A = useAdmin();
  const { data, loading, error, reload } = useData(() => apiFetch('/api/admin/summer-trainings'), []);
  const { data: cat } = useData(() => apiFetch('/api/admin/catalog').catch(() => []), []);
  const sections = useMemo(() => (cat || []).filter(r => r.type === 'section'), [cat]);
  const secName = (id) => (sections.find(s => s.id === id) || {}).name;
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState('');
  const all = data || [];
  const n = (f) => all.filter(f).length;
  const body = (t, over) => ({ title: t.title, description: t.description || '', location: t.location || '', starts_on: t.starts_on || '', ends_on: t.ends_on || '', apply_url: t.apply_url || '', section_id: t.section_id || null, is_active: t.is_active, ...over });
  const toggle = async (t) => { try { await put('/api/admin/summer-trainings/' + t.id, body(t, { is_active: !t.is_active })); A.toast(t.is_active ? 'أُخفيت الفرصة عن الطلاب' : 'صارت ظاهرة للطلاب'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر التنفيذ', 'error'); } };
  const remove = async (t) => { if (!await A.dialogs.confirm('حذف فرصة التدريب نهائياً؟')) return; try { await del('/api/admin/summer-trainings/' + t.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  const edit = (cur) => A.dialogs.form({
    title: cur ? 'تعديل فرصة تدريب' : 'إضافة فرصة تدريب صيفي',
    fields: [
      { id: 'sectionId', label: 'القسم — يراها طلاب هذا القسم فقط', type: 'select', value: cur ? (cur.section_id || '') : '', options: [{ value: '', label: 'كل الأقسام' }].concat(sections.map(s => ({ value: s.id, label: s.name }))) },
      { id: 'title', label: 'العنوان', type: 'text', value: cur ? cur.title : '' },
      { id: 'location', label: 'المكان (مستشفى / مؤسسة)', type: 'text', value: cur ? cur.location : '' },
      { id: 'startsOn', label: 'تاريخ البداية', type: 'text', value: cur ? cur.starts_on : '', placeholder: '2027-07-01' },
      { id: 'endsOn', label: 'تاريخ النهاية', type: 'text', value: cur ? cur.ends_on : '', placeholder: '2027-08-15' },
      { id: 'applyUrl', label: 'رابط التقديم (اختياري)', type: 'text', value: cur ? cur.apply_url : '', placeholder: 'https://', dir: 'ltr' },
      { id: 'description', label: 'التفاصيل', type: 'textarea', rows: 4, value: cur ? cur.description : '' },
      { id: 'active', label: 'الحالة', type: 'select', value: cur && !cur.is_active ? '0' : '1', options: [{ value: '1', label: 'ظاهر للطلاب' }, { value: '0', label: 'مخفي' }] },
    ],
    onSubmit: async (v) => {
      if (!v.title.trim()) throw { detail: 'العنوان مطلوب' };
      if (v.applyUrl.trim() && !/^https?:\/\//i.test(v.applyUrl.trim())) throw { detail: 'رابط التقديم يجب أن يبدأ بـ http:// أو https://' };
      const b = { title: v.title.trim(), description: v.description.trim(), location: v.location.trim(), starts_on: v.startsOn.trim(), ends_on: v.endsOn.trim(), apply_url: v.applyUrl.trim(), section_id: v.sectionId || null, is_active: v.active === '1' };
      if (cur) await put('/api/admin/summer-trainings/' + cur.id, b); else await post('/api/admin/summer-trainings', b);
      reload();
    },
  });
  const ql = q.trim().toLowerCase();
  const list = all.filter(t => (filter === 'all' || (filter === 'visible' && t.is_active) || (filter === 'hidden' && !t.is_active) || summerState(t) === filter) && (!ql || [t.title, t.location, t.description].some(v => (v || '').toLowerCase().includes(ql))));
  return (
    <>
      <StKpis items={[['كل الفرص', numAr(all.length)], ['ظاهرة للطلاب', numAr(n(t => t.is_active))], ['مخفية', numAr(n(t => !t.is_active))], ['جارية الآن', numAr(n(t => t.is_active && summerState(t) === 'running'))], ['منتهية', numAr(n(t => summerState(t) === 'ended'))]]} />
      <Card title="التدريب الصيفي" actions={<AddBtn onClick={() => edit(null)}>إضافة فرصة</AddBtn>}>
        <Chips items={[['all', 'الكل', all.length], ['visible', 'ظاهرة', n(t => t.is_active)], ['hidden', 'مخفية', n(t => !t.is_active)], ['upcoming', 'قادمة', n(t => summerState(t) === 'upcoming')], ['ended', 'منتهية', n(t => summerState(t) === 'ended')]]} value={filter} onPick={setFilter}>
          <Search value={q} onChange={setQ} placeholder="ابحث بالعنوان أو المكان..." />
        </Chips>
        {loading && !data ? <Loading /> : error ? <div className="empty-row">{error}</div> : !list.length ? <div className="empty-row">لا توجد فرص بهذه المواصفات — أضف واحدة وتظهر لطلاب القسم المختار</div> : list.map(t => {
          const [sl, sb] = SUMMER_STATE[summerState(t)];
          return (
            <div className="notif-card" key={t.id} style={t.is_active ? undefined : { opacity: .75 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{t.title} <Badge kind={sb}>{sl}</Badge> {!t.is_active && <Badge kind="disabled">مخفية</Badge>}</div>
                  <div className="cell-sub" style={{ marginTop: 4 }}>📍 {t.location || 'بدون مكان'} · 🎓 {secName(t.section_id) || 'كل الأقسام'} · 📅 <bdi dir="ltr">{[t.starts_on, t.ends_on].filter(Boolean).join(' → ') || 'بدون موعد'}</bdi></div>
                  {t.description && <div className="ban-quote" style={{ marginTop: 8 }}>{t.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {t.apply_url && <SmallBtn onClick={() => window.open(t.apply_url, '_blank', 'noopener')}>رابط التقديم</SmallBtn>}
                  <SmallBtn onClick={() => toggle(t)}>{t.is_active ? 'إخفاء' : 'إظهار'}</SmallBtn>
                  <SmallBtn onClick={() => edit(t)}>تعديل</SmallBtn>
                  <SmallBtn danger onClick={() => remove(t)}>حذف</SmallBtn>
                </div>
              </div>
            </div>);
        })}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ files
const mediaKind = (f) => {
  const t = (f.content_type || '').toLowerCase(), n = (f.filename || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return 'image';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(n)) return 'video';
  return 'other';
};

export function Media() {
  const A = useAdmin();
  const { data, loading, reload } = useData(() => apiFetch('/api/admin/media').catch(() => []), []);
  const [type, setType] = useState('all'); const [q, setQ] = useState('');
  const [status, setStatus] = useState(null); const input = useRef(null);
  const files = data || [];
  const by = (k) => files.filter(f => mediaKind(f) === k).length;
  const ql = q.trim().toLowerCase();
  const list = files.filter(f => (type === 'all' || mediaKind(f) === type) && (!ql || (f.filename || '').toLowerCase().includes(ql)));
  const pick = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    setStatus({ text: 'جارٍ رفع الملف... 0%', color: 'var(--ink-faint)' });
    const fd = new FormData(); fd.append('file', file);
    try { await upload('/api/admin/media/upload', fd, p => setStatus({ text: `جارٍ رفع الملف... ${p}%`, color: 'var(--ink-faint)' })); setStatus({ text: 'تم رفع الملف بنجاح', color: 'var(--success)' }); reload(); }
    catch (err) { setStatus({ text: err.detail || 'تعذّر رفع الملف', color: 'var(--danger)' }); }
  };
  const remove = async (f) => { if (!await A.dialogs.confirm(`حذف الملف «${f.filename}» نهائيًا؟ أي مكان يستعمله سيفقده.`)) return; try { await del('/api/admin/media/' + f.id); A.toast('حُذف الملف'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  const copy = async (url) => { try { await navigator.clipboard.writeText(url); A.toast('نُسخ الرابط'); } catch { A.toast('تعذّر النسخ', 'error'); } };
  return (
    <>
      <StKpis items={[['الملفات', numAr(files.length)], ['الحجم الكلي', fmtSize(files.reduce((a, f) => a + (f.size_bytes || 0), 0))], ['صور', numAr(by('image'))], ['PDF', numAr(by('pdf'))], ['فيديو', numAr(by('video'))]]} />
      <Card title="إدارة الملفات" actions={<><button className="btn" onClick={() => input.current && input.current.click()}>+ رفع ملف</button><input type="file" ref={input} style={{ display: 'none' }} onChange={pick} /></>}>
        {status && <div style={{ padding: '0 4px 10px', fontSize: '.78rem', color: status.color }}>{status.text}</div>}
        <Chips items={[['all', 'الكل'], ['image', 'صور'], ['pdf', 'PDF'], ['video', 'فيديو'], ['other', 'أخرى']]} value={type} onPick={setType}>
          <Search value={q} onChange={setQ} placeholder="ابحث باسم الملف..." />
        </Chips>
        {loading && !data ? <Loading /> : !list.length ? <div className="empty-row">لا توجد ملفات</div> : (
          <div className="media-grid">{list.map(f => { const k = mediaKind(f), url = mediaUrl(f.url); return (
            <div className="media-card" key={f.id}>
              <div className="media-thumb">{k === 'image' ? <img loading="lazy" src={url} alt="" /> : <span style={{ fontWeight: 800 }}>{k === 'pdf' ? 'PDF' : k === 'video' ? 'فيديو' : 'ملف'}</span>}</div>
              <div className="media-info"><div className="n" title={f.filename}>{f.filename}</div><div className="m">{fmtSize(f.size_bytes || 0)} · {ago(f.created_at)}</div></div>
              <div className="media-acts"><button className="btn btn-ghost" onClick={() => copy(location.origin + url)}>نسخ الرابط</button><button className="btn btn-ghost" onClick={() => window.open(url, '_blank', 'noopener')}>فتح</button><button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(f)}>حذف</button></div>
            </div>); })}</div>)}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ import / export
const EXPORT_SETS = [
  ['students', 'الطلاب', 'الاسم والبريد والهاتف والجامعة والمرحلة والحالة'],
  ['questions', 'الأسئلة', 'بنك الأسئلة كاملًا مع الخيارات والمواد'],
  ['orders', 'الطلبات', 'طلبات المتجر والمشترين والمبالغ'],
  ['logs', 'سجل النشاطات', 'كل الإجراءات المسجّلة على المنصة'],
];

export function ImportExport() {
  const A = useAdmin();
  const { data: counts, reload } = useData(() => apiFetch('/api/admin/export/summary').catch(() => ({})), []);
  const [pick, setPick] = useState(['students', 'questions']);
  const [msg, setMsg] = useState(() => { try { const l = localStorage.getItem('kiur_last_export'); return l ? 'آخر تصدير: ' + new Date(l).toLocaleString('ar-IQ') : ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false); const [file, setFile] = useState(null); const [result, setResult] = useState(null); const [over, setOver] = useState(false);
  const input = useRef(null);
  const c = counts || {};
  const doExport = async () => {
    if (!pick.length) return A.toast('اختر بيانات واحدة على الأقل للتصدير', 'error');
    setBusy(true); setMsg('جارٍ تجهيز الملف…');
    try {
      const blob = await downloadFile('/api/admin/export?datasets=' + pick.join(','), `Kiur-${new Date().toISOString().slice(0, 10)}.xlsx`);
      try { localStorage.setItem('kiur_last_export', new Date().toISOString()); } catch { /* private mode */ }
      setMsg(`تم التصدير — ${fmtSize(blob.size)}`);
    } catch { setMsg('تعذّر تصدير البيانات'); A.toast('تعذّر تصدير البيانات', 'error'); }
    setBusy(false);
  };
  const template = async () => { try { await downloadFile('/api/admin/import/template/students', 'قالب طلاب.xlsx'); } catch { A.toast('تعذّر تنزيل القالب', 'error'); } };
  const doImport = async () => {
    if (!file) return A.toast('اختر ملفًا أولًا', 'error');
    setBusy(true); setResult({ pending: true });
    const fd = new FormData(); fd.append('file', file);
    try { const d = await upload('/api/admin/import', fd); setResult({ data: d }); reload(); }
    catch (e) { setResult({ error: e.detail || 'تعذّر الاستيراد' }); }
    setBusy(false);
  };
  return (
    <>
      <StKpis items={EXPORT_SETS.map(([k, l]) => [l, numAr(c[k] || 0), 'سجل'])} />
      <div className="st-two">
        <Card title="تصدير البيانات (Excel)">
          <div className="cell-sub" style={{ marginBottom: 12 }}>اختر ما تريد في ملف واحد، كل نوع بورقة (Sheet) مستقلة.</div>
          {EXPORT_SETS.map(([k, l, d]) => (
            <label key={k} className={'ie-ds' + (pick.includes(k) ? ' on' : '')}>
              <input type="checkbox" checked={pick.includes(k)} onChange={e => setPick(p => e.target.checked ? [...p, k] : p.filter(x => x !== k))} />
              <span style={{ flex: 1 }}><b>{l}</b><span className="cell-sub" style={{ display: 'block' }}>{d}</span></span><span className="mono">{numAr(c[k] || 0)}</span>
            </label>))}
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={busy} onClick={doExport}>تصدير الملف</button>
          <div className="cell-sub" style={{ marginTop: 10 }}>{msg}</div>
        </Card>
        <Card title="استيراد الطلاب (Excel)">
          <div className="ie-steps">
            <div><b>١</b> نزّل القالب واملأه (الاسم، البريد، الجامعة، المرحلة). <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '.74rem', marginInlineStart: 8 }} onClick={template}>قالب الطلاب</button></div>
            <div><b>٢</b> اسحب الملف هنا أو اضغط لاختياره.</div>
          </div>
          <div className={'dropzone' + (over ? ' over' : '')} onClick={() => input.current && input.current.click()} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); setFile(e.dataTransfer.files[0] || null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
            <div>{file ? <><b>{file.name}</b><span className="cell-sub" style={{ display: 'block' }}>{fmtSize(file.size)} — اضغط للتغيير</span></> : 'اسحب ملف Excel هنا أو اضغط للاختيار'}</div>
          </div>
          <input type="file" ref={input} accept=".xlsx" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] || null)} />
          <div className="ie-steps" style={{ marginTop: 12 }}><div><b>٣</b> اضغط استيراد — الموجود مسبقًا (نفس البريد) يُتخطّى ولا يتكرر.</div></div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} disabled={busy} onClick={doImport}>استيراد</button>
          {result && <div style={{ marginTop: 14 }}>
            {result.pending && <div className="cell-sub">جارٍ الاستيراد…</div>}
            {result.error && <div style={{ color: 'var(--danger)', fontSize: '.84rem' }}>{result.error}</div>}
            {result.data && <>
              <StKpis items={[['أُضيف', numAr(result.data.created)], ['تُخطّي (مكرر)', numAr(result.data.skipped || 0)], ['صفوف بها خطأ', numAr((result.data.errors || []).length)]]} />
              {(result.data.errors || []).length ? <><div style={{ fontWeight: 800, fontSize: '.82rem', margin: '10px 0 6px' }}>الصفوف التي لم تُستورد</div>
                <div className="ban-quote" style={{ maxHeight: 200, overflow: 'auto' }}>{result.data.errors.map((e, i) => <div key={i}>• {typeof e === 'string' ? e : JSON.stringify(e)}</div>)}</div></>
                : <div className="cell-sub" style={{ color: 'var(--success)' }}>تم الاستيراد بدون أخطاء.</div>}
            </>}
          </div>}
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ resellers (management)
const RESELLER_PERMS = ['codes.view', 'codes.generate'].map(c => ({ value: c, label: PERM_LABELS[c] }));

function ResellerPage({ r, back, reloadList }) {
  const A = useAdmin();
  const [perms, setPerms] = useState(r.permissions || []); const [quota, setQuota] = useState(r.code_quota == null ? '' : String(r.code_quota));
  const [count, setCount] = useState('10');
  const codes = useData(() => apiFetch('/api/admin/resellers/' + r.id + '/codes'), [r.id]);
  const left = r.code_quota == null ? 'بلا حد' : numAr(Math.max(0, r.code_quota - r.codes_held));
  const save = async () => { try { await put('/api/admin/resellers/' + r.id, { permissions: perms, code_quota: quota === '' ? null : parseInt(quota, 10) }); A.toast('تم الحفظ'); reloadList(); } catch (e) { A.toast(e.detail || 'تعذّر الحفظ', 'error'); } };
  const generate = async () => {
    const n = parseInt(count, 10); if (!n || n < 1 || n > 100) return A.toast('العدد من 1 إلى 100', 'error');
    try { const res = await post('/api/admin/resellers/' + r.id + '/codes?count=' + n); A.toast(`تم توليد ${res.codes.length} كود`); reloadList(); codes.reload(); } catch (e) { A.toast(e.detail || 'تعذّر التوليد', 'error'); }
  };
  const copy = async (code) => { try { await navigator.clipboard.writeText(code); A.toast('نُسخ الكود'); } catch { A.toast('تعذّر النسخ', 'error'); } };
  const list = codes.data || []; const idle = list.filter(c => c.status === 'idle'), used = list.filter(c => c.status !== 'idle');
  const label = { active: 'مفعّل', expired: 'منتهي' };
  const row = (c, dim) => (
    <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--glass-border)', opacity: dim ? .7 : 1 }}>
      <span className="mono" dir="ltr" style={{ fontWeight: 800, minWidth: 120 }}>{c.code}</span><span className="cell-sub" style={{ flex: 1 }}>{c.subject_name}</span>
      {dim ? <span className="badge">{label[c.status] || c.status}</span> : <SmallBtn onClick={() => copy(c.code)}>نسخ</SmallBtn>}
    </div>);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={back}>→ المندوبون</button>
        {A.perms.has('users.manage') && <button className="btn btn-ghost" style={{ marginInlineStart: 'auto' }} onClick={() => A.go('accounts')}>صفحة الحسابات</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div className="cell-avatar" style={{ background: 'var(--accent)', width: 60, height: 60, fontSize: '1.3rem' }}>{initialsOf(r.full_name)}</div>
        <div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{r.full_name}</div><div className="cell-sub mono" dir="ltr" style={{ textAlign: 'start' }}>{r.email}</div>
          <div style={{ marginTop: 4 }}>{r.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</div></div>
      </div>
      <StKpis items={[['بحوزته', numAr(r.codes_held)], ['باع', numAr(r.codes_sold)], ['الحصة', r.code_quota == null ? 'بلا حد' : numAr(r.code_quota)], ['المتبقي من الحصة', left]]} />
      <div className="acct-cols">
        <div className="acct-col"><Card title="الصلاحيات والحصة">
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>{RESELLER_PERMS.map(o => (
            <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.86rem' }}>
              <input type="checkbox" checked={perms.includes(o.value)} onChange={e => setPerms(p => e.target.checked ? [...p, o.value] : p.filter(x => x !== o.value))} /> {o.label}</label>))}</div>
          <label style={{ fontSize: '.78rem', fontWeight: 700 }}>أقصى عدد أكواد يحملها (فارغ = بلا حد)</label>
          <input type="number" min="0" value={quota} onChange={e => setQuota(e.target.value)} style={{ ...FIELD, width: '100%', margin: '6px 0 12px' }} />
          <button className="btn" onClick={save}>حفظ</button></Card></div>
        <div className="acct-col"><Card title="توليد أكواد">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" min="1" max="100" value={count} onChange={e => setCount(e.target.value)} style={{ ...FIELD, width: 110 }} />
            <button className="btn" onClick={generate}>ولّد</button>
            <span className="cell-sub">من 1 إلى 100 بالمرة، وتدخل رصيد المندوب مباشرة.</span></div></Card></div>
      </div>
      <Card title="أكواد المندوب" style={{ marginTop: 16 }}>
        {codes.loading && !codes.data ? <Loading /> : codes.error ? <div className="empty-row">{codes.error}</div> : <>
          {idle.length ? <><div style={{ fontWeight: 800, fontSize: '.84rem', marginBottom: 4 }}>متاحة غير مباعة ({numAr(idle.length)})</div>{idle.map(c => row(c, false))}</> : <div className="cell-sub">لا توجد أكواد متاحة حاليًا.</div>}
          {used.length ? <><div style={{ fontWeight: 800, fontSize: '.84rem', margin: '16px 0 4px' }}>مباعة أو مستعملة ({numAr(used.length)})</div>{used.map(c => row(c, true))}</> : null}
        </>}
      </Card>
    </>
  );
}

export function Resellers() {
  const A = useAdmin();
  const { data, loading, error, reload } = useData(() => apiFetch('/api/admin/resellers'), []);
  const [open, setOpen] = useState(null); const [q, setQ] = useState('');
  const all = data || [];
  const add = () => A.dialogs.form({
    title: 'مندوب جديد',
    fields: [
      { id: 'fullName', label: 'الاسم الكامل', type: 'text' },
      { id: 'email', label: 'البريد الإلكتروني', type: 'text', dir: 'ltr' },
      { id: 'password', label: 'كلمة المرور (8 أحرف على الأقل)', type: 'password' },
      { id: 'perms', label: 'ماذا يستطيع هذا المندوب أن يفعل؟', type: 'checks', value: ['codes.view', 'codes.generate'], options: RESELLER_PERMS },
      { id: 'quota', label: 'أقصى عدد أكواد يحملها (اتركه فارغاً = بلا حد)', type: 'number', value: '' },
    ],
    onSubmit: async (v) => {
      if (!v.fullName.trim() || !v.email.trim()) throw { detail: 'الاسم والبريد مطلوبان' };
      await post('/api/admin/resellers', { full_name: v.fullName.trim(), email: v.email.trim(), password: v.password, permissions: v.perms, code_quota: v.quota === '' ? null : parseInt(v.quota, 10) });
      reload();
    },
  });
  const cur = open && all.find(r => r.id === open);
  if (cur) return <ResellerPage r={cur} back={() => setOpen(null)} reloadList={reload} />;
  const ql = q.trim().toLowerCase();
  const list = all.filter(r => !ql || r.full_name.toLowerCase().includes(ql) || r.email.toLowerCase().includes(ql));
  return (
    <Card title="المندوبون" actions={<AddBtn onClick={add}>إضافة مندوب</AddBtn>}>
      <input className="search-input" placeholder="ابحث بالاسم أو البريد..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      {loading && !data ? <Loading /> : error ? <div className="empty-row">{error}</div> : (
        <div className="cat-grid">
          {list.map(r => (
            <div className="cat-card" key={r.id} onClick={() => setOpen(r.id)}>
              <div className="cat-avatar">{(initialsOf(r.full_name).charAt(0)) || '?'}</div>
              <div className="cat-card-name">{r.full_name}</div>
              <div className="cat-card-sub">بحوزته {numAr(r.codes_held)} · باع {numAr(r.codes_sold)} · {r.code_quota == null ? 'بلا حد' : `الحصة ${numAr(r.code_quota)}`}</div>
              <div>{r.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</div>
            </div>))}
          <div className="cat-card addnew" onClick={add}>+ مندوب</div>
        </div>)}
    </Card>
  );
}
