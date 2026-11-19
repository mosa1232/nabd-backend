import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------- icons
const I = {
  grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c1.2-3.5 3.6-5.3 6.5-5.3s5.3 1.8 6.5 5.3" /><circle cx="17.5" cy="8.5" r="2.6" /><path d="M16 14.8c2.2.4 3.7 1.9 4.5 4.2" /></>,
  book: <path d="M12 6c-2-1.5-5-2-8-1v13c3-1 6-.5 8 1 2-1.5 5-2 8-1V5c-3-1-6-.5-8 1Z" />,
  student: <><path d="M22 9 12 5 2 9l10 4 10-4Z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.5 5.5 13 13" /></>,
  media: <><rect x="3" y="4" width="18" height="15" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-4-4 3-3-2-4 4" /></>,
  log: <><path d="M12 7v5l3 3" /><circle cx="12" cy="12" r="9" /></>,
  importexport: <><path d="M8 17V3M4 7l4-4 4 4" /><path d="M16 7v14M20 17l-4 4-4-4" /></>,
  pdf: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></>,
  exam: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="m9.5 13 2 2 4-4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  shield: <><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3Z" /><path d="m9.5 12 2 2 4-4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
};
export function Icon({ n, size, sw = 2, style }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ ...(size ? { width: size, height: size } : null), ...style }} aria-hidden="true">{I[n]}</svg>;
}

// ---------------------------------------------------------------- small building blocks
export const Card = ({ title, actions, children, style, id }) => (
  <div className="dash-card glass" style={style} id={id}>
    {(title || actions) && <div className="dash-card-head">{title ? <span className="dash-card-title">{title}</span> : <span />}{actions}</div>}
    {children}
  </div>
);
export const AddBtn = ({ onClick, children, ghost }) => <button className={'btn' + (ghost ? ' btn-ghost' : '')} onClick={onClick}><Icon n="plus" sw={2.4} />{children}</button>;
export const KpiGrid = ({ items, cols }) => (
  <div className="kpi-grid" style={cols ? { gridTemplateColumns: `repeat(${cols},1fr)` } : undefined}>
    {items.map(([label, value], i) => <div key={i} className="kpi-card glass"><div className="kpi-label">{label}</div><div className="kpi-value mono">{value ?? '—'}</div></div>)}
  </div>
);
export const StKpis = ({ items }) => (
  <div className="st-kpis">{items.map(([label, value, sub], i) => <div key={i} className="st-kpi"><div className="l">{label}</div><div className="v mono">{value}</div>{sub ? <div className="s">{sub}</div> : null}</div>)}</div>
);
// `search="placeholder…"` adds a box above the table that hides the rows whose text does not match
export function Table({ head, children, empty, cols, search }) {
  const [q, setQ] = useState('');
  const wrap = useRef(null);
  useEffect(() => {
    if (!search || !wrap.current) return;
    const s = q.trim().toLowerCase();
    wrap.current.querySelectorAll('tbody tr').forEach(r => { r.style.display = !s || r.textContent.toLowerCase().includes(s) ? '' : 'none'; });
  });
  return (
    <>
      {search && <div className="ops-filters"><input type="text" className="q" placeholder={search} value={q} onChange={e => setQ(e.target.value)} /></div>}
      <div className="table-wrap" ref={wrap}><table className="dash-table"><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children && (Array.isArray(children) ? children.length : true) ? children : <tr><td colSpan={cols || head.length} className="empty-row">{empty || 'لا توجد بيانات'}</td></tr>}</tbody></table></div>
    </>
  );
}
export const Badge = ({ kind = 'idle', children }) => <span className={'badge badge-' + kind}>{children}</span>;
export const RowActions = ({ children }) => <td style={{ textAlign: 'end' }}><div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{children}</div></td>;
export const SmallBtn = ({ onClick, children, danger, title }) => <button className="btn btn-ghost" title={title} style={{ padding: '6px 14px', fontSize: '.72rem', ...(danger ? { color: 'var(--danger)' } : null) }} onClick={onClick}>{children}</button>;
export const TrashBtn = ({ onClick, label }) => (
  <button className="icon-btn" title={label} aria-label={label} style={{ width: 30, height: 30 }} onClick={onClick}><Icon n="trash" size={14} style={{ color: 'var(--danger)' }} /></button>
);
export const Loading = () => <div className="empty-row">جارٍ التحميل…</div>;
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const numAr = (n) => (n == null ? 0 : n).toLocaleString('en-US');

// ---------------------------------------------------------------- dialogs (forms as pages, confirm)
const DialogCtx = createContext(null);
export const useDialogs = () => useContext(DialogCtx);

const SEL = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit' };
const Label = ({ children }) => <label style={{ fontSize: '.75rem', color: 'var(--ink-faint)', display: 'block', marginBottom: 5 }}>{children}</label>;

// college type -> university -> department -> stage -> subject (+ "publish as" for a representative), inside one dialog
function WhereField({ spec, onChange }) {
  const [w, setW] = useState(() => {
    const base = { subject: spec.subject || '', teacher: spec.teacher || '', newName: '', pick: { sec: '', uni: '', dept: '', stage: '' } };
    const s = spec.mode === 'platform' ? spec.subs.find(x => x.id === base.subject) : null;
    if (s) base.pick = { sec: s.section?.id || '', uni: s.university?.id || '', dept: s.department?.id || '', stage: s.stage?.id || '' };
    return base;
  });
  const uniq = (arr, f) => { const m = new Map(); arr.forEach(x => { const v = f(x); if (v && !m.has(v.id)) m.set(v.id, v); }); return [...m.values()]; };
  // derive the auto-picked single choices without mutating
  const levels = [['sec', x => x.section, '① نوع الكلية'], ['uni', x => x.university, '② الجامعة'], ['dept', x => x.department, '③ القسم'], ['stage', x => x.stage, '④ المرحلة']];
  const view = useMemo(() => {
    if (spec.mode !== 'platform') {
      return { rows: [], subjects: spec.subs, subject: w.subject || (spec.subs.length === 1 ? spec.subs[0].id : ''), pick: w.pick };
    }
    let pool = spec.subs, open = true; const pick = { ...w.pick }; const rows = [];
    levels.forEach(([k, get, label]) => {
      const opts = open ? uniq(pool, get) : [];
      if (open && !pick[k] && opts.length === 1) pick[k] = opts[0].id;
      rows.push({ k, label, opts, locked: !open });
      if (open && pick[k]) pool = pool.filter(x => get(x) && get(x).id === pick[k]); else open = false;
    });
    const subjects = open ? pool.map(x => ({ id: x.id, name: x.name })) : [];
    return { rows, subjects, subject: w.subject || (open && subjects.length === 1 ? subjects[0].id : ''), pick };
  }, [w, spec]); // eslint-disable-line
  const value = { mode: spec.mode, subject: view.subject, teacher: w.teacher === '__new__' ? '' : w.teacher, wantsNew: w.teacher === '__new__', newName: w.newName.trim(), pick: view.pick };
  const last = useRef('');
  useEffect(() => { const s = JSON.stringify(value); if (s !== last.current) { last.current = s; onChange(value); } }); // eslint-disable-line
  const order = ['sec', 'uni', 'dept', 'stage', 'subject'];
  const set = (k, v) => setW(cur => {
    if (k === 'teacher') return { ...cur, teacher: v };
    if (k === 'subject') return { ...cur, subject: v };
    const pick = { ...view.pick, [k]: v }; order.slice(order.indexOf(k) + 1).forEach(x => { if (x !== 'subject') pick[x] = ''; });
    return { ...cur, pick, subject: '' };
  });
  const Sel = ({ label, k, opts, cur, locked }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.78rem', fontWeight: 700, marginBottom: 10 }}>{label}
      <select style={{ ...SEL, ...(locked ? { opacity: .5 } : null) }} disabled={locked} value={cur || ''} onChange={e => set(k, e.target.value)}>
        <option value="">اختر…</option>{opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
  );
  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>📍 {spec.title || 'وين تريد تنشر؟'}</div>
      {spec.mode === 'platform' && view.rows.map(r => <Sel key={r.k} label={r.label} k={r.k} opts={r.opts} cur={view.pick[r.k]} locked={r.locked} />)}
      <Sel label={spec.mode === 'platform' ? '⑤ المادة' : 'المادة'} k="subject" opts={view.subjects} cur={view.subject} locked={spec.mode === 'platform' && !view.subjects.length} />
      {spec.mode === 'platform' && <div className="cell-sub" style={{ marginBottom: 8 }}>تظهر للطلاب باسم المنصة.</div>}
      {spec.mode === 'rep' && <>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.78rem', fontWeight: 700, marginBottom: 10 }}>النشر باسم
          <select style={SEL} value={w.teacher} onChange={e => set('teacher', e.target.value)}>
            <option value="">باسمي (ممثل الدفعة)</option>{(spec.teachers || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="__new__">＋ دكتور جديد…</option></select></label>
        {w.teacher === '__new__' && <input type="text" style={{ ...SEL, marginBottom: 10 }} placeholder="اسم الدكتور (مثال: د. أحمد الجبوري)" value={w.newName} onChange={e => setW(c => ({ ...c, newName: e.target.value }))} />}
      </>}
    </div>
  );
}
export { WhereField };

function FormDialog({ spec, close }) {
  const [vals, setVals] = useState(() => Object.fromEntries(spec.fields.map(f => [f.id, f.type === 'checks' ? (f.value || []) : f.type === 'file' || f.type === 'where' ? null : (f.value ?? '')])));
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const setV = (id, v) => setVals(cur => ({ ...cur, [id]: v }));
  const submit = async () => {
    setBusy(true); setMsg({ text: spec.submitting || 'جارٍ الحفظ...', color: 'var(--ink-faint)' });
    try { await spec.onSubmit(vals, (text) => setMsg({ text, color: 'var(--ink-faint)' })); close(); }
    catch (e) { setMsg({ text: e.detail || e.message || 'حدث خطأ غير متوقع', color: 'var(--danger)' }); setBusy(false); }
  };
  return (
    <div className="page-layer" style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(10,15,30,.55)', zIndex: 999, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="dash-card glass" style={{ maxWidth: 400, width: '100%', maxHeight: '88vh', overflowY: 'auto' }}>
        <button type="button" className="btn btn-ghost page-back" onClick={close}>→ رجوع</button>
        <div className="dash-card-head"><span className="dash-card-title">{spec.title}</span></div>
        {spec.note ? <div className="item-meta" style={{ marginBottom: 12 }}>{spec.note}</div> : null}
        {spec.fields.map((f, i) => {
          const v = vals[f.id];
          if (f.type === 'where') return <div className="form-field" key={f.id}><WhereField spec={f} onChange={x => setV(f.id, x)} /></div>;
          if (f.type === 'custom') return <div className="form-field" key={f.id}>{f.render({ value: v, setValue: x => setV(f.id, x), values: vals })}</div>;
          return (
            <div className="form-field" key={f.id}>
              {f.label ? <Label>{f.label}</Label> : null}
              {f.type === 'select' && <select style={SEL} value={v} onChange={e => setV(f.id, e.target.value)}>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
              {f.type === 'textarea' && <textarea rows={f.rows || 8} placeholder={f.placeholder || ''} value={v} onChange={e => setV(f.id, e.target.value)} style={{ ...SEL, resize: 'vertical', lineHeight: 1.9 }} />}
              {f.type === 'file' && <input type="file" accept={f.accept || ''} onChange={e => { const file = e.target.files[0] || null; setV(f.id, file); f.onPick?.(file, setV, vals); }}
                style={{ width: '100%', padding: 12, border: '1.5px dashed var(--glass-border)', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg-strong)' }} />}
              {f.type === 'checks' && <div style={{ display: 'grid', gap: 8 }}>{f.options.map(o => (
                <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={v.includes(o.value)} onChange={e => setV(f.id, e.target.checked ? [...v, o.value] : v.filter(x => x !== o.value))} style={{ width: 16, height: 16, marginTop: 2, flex: 'none', padding: 0 }} />
                  <span>{o.label}</span></label>))}</div>}
              {!['select', 'textarea', 'file', 'checks'].includes(f.type) &&
                <input type={f.type || 'text'} value={v} placeholder={f.placeholder || ''} autoFocus={i === 0} dir={f.dir} onChange={e => setV(f.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && f.type !== 'textarea') submit(); }} />}
            </div>
          );
        })}
        {msg && <div style={{ fontSize: '.8rem', marginTop: 4, color: msg.color }}>{msg.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={submit}>{spec.submitLabel || 'حفظ'}</button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={close}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, resolve }) {
  return (
    <div className="page-layer" style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(10,15,30,.55)', zIndex: 1000, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="dash-card glass" style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ fontSize: '.9rem', lineHeight: 1.6 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)' }} onClick={() => resolve(true)}>تأكيد</button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => resolve(false)}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [form, setForm] = useState(null);
  const [conf, setConf] = useState(null);
  const open = useCallback((spec) => setForm({ spec, key: Math.random() }), []);
  const confirm = useCallback((message) => new Promise(resolve => setConf({ message, resolve: (r) => { setConf(null); resolve(r); } })), []);
  const value = useMemo(() => ({ form: open, confirm }), [open, confirm]);
  return (
    <DialogCtx.Provider value={value}>
      {children}
      {form && <FormDialog key={form.key} spec={form.spec} close={() => setForm(null)} />}
      {conf && <ConfirmDialog message={conf.message} resolve={conf.resolve} />}
    </DialogCtx.Provider>
  );
}

// fetch-on-mount hook with reload()
export function useData(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    try { const data = await fn(); if (my === seq.current) setState({ data, error: '', loading: false }); }
    catch (e) { if (my === seq.current) setState({ data: null, error: e.detail || e.message || 'تعذّر تحميل البيانات', loading: false }); }
  }, deps); // eslint-disable-line
  useEffect(() => { setState(s => ({ ...s, loading: true })); reload(); }, [reload]);
  return { ...state, reload };
}
