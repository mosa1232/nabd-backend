import { useMemo, useRef, useState } from 'react';
import { apiFetch, post, del, upload, getToken } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { Card, AddBtn, KpiGrid, Table, Badge, RowActions, SmallBtn, Loading, fmtDate, useData } from '../ui.jsx';

async function download(path, fallback) {
  const res = await fetch(path, { credentials: 'include', headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  if (!res.ok) { let d = ''; try { d = (await res.json()).detail; } catch { /* no body */ } throw new Error(d || 'تعذّر التنزيل'); }
  const blob = await res.blob();
  let name = fallback; const m = /filename\*=UTF-8''([^;]+)/i.exec(res.headers.get('content-disposition') || '');
  if (m) { try { name = decodeURIComponent(m[1]); } catch { /* keep fallback */ } }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ------------------------------------------------------------------ representative: student rosters -> verification codes
const REP_STATUS = { unused: ['غير مستخدم', 'idle'], used: ['وُثّق', 'active'], revoked: ['ملغى', 'disabled'] };
export function RepCodes() {
  const A = useAdmin();
  const { data: me } = useData(() => apiFetch('/api/rep/me'), []);
  const { data: batches, error, reload } = useData(() => apiFetch('/api/rep/batches'), []);
  const [file, setFile] = useState(null); const [stage, setStage] = useState(''); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  if (error) return <Card>{error}</Card>;
  if (!batches || !me) return <Loading />;
  const send = async () => {
    if (!file) return setMsg({ t: 'اختر ملف Excel أولاً', err: true });
    const fd = new FormData(); fd.append('file', file); fd.append('stage_id', stage || '');
    setBusy(true); setMsg({ t: 'جارٍ توليد الأكواد…' });
    try {
      const res = await upload('/api/rep/batches', fd);
      setMsg({ t: `تم توليد ${res.total} كود` + (res.duplicates_skipped ? ` — وتم تجاهل ${res.duplicates_skipped} اسم مكرر (${res.duplicate_names.slice(0, 3).join('، ')}…)` : '') + '. نزّل الملف من الجدول بالأسفل.' });
      setFile(null); if (fileInput.current) fileInput.current.value = ''; reload();
    } catch (e) { setMsg({ t: e.detail || 'تعذّر الرفع', err: true }); } finally { setBusy(false); }
  };
  const dl = (path, name) => download(path, name).catch(e => A.toast(e.message, 'error'));
  const remove = async (b) => { if (!await A.dialogs.confirm('حذف هذه الدفعة وكل أكوادها؟ (لا يمكن إن كان أحد الطلاب قد استعمل كودًا منها)')) return; try { await del('/api/rep/batches/' + b.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  const show = async (b) => {
    let open; try { open = await apiFetch('/api/rep/batches/' + b.id); } catch (e) { return A.toast(e.detail || 'تعذّر التحميل', 'error'); }
    A.dialogs.form({ title: open.filename || 'الدفعة', note: `${open.stage} · ${open.total} اسم · وُثّق ${open.used}`, submitLabel: 'تنزيل Excel',
      fields: [{ id: 'list', type: 'custom', render: () => <BatchCodes batch={open} A={A} onChanged={reload} /> }],
      onSubmit: async () => { await download('/api/rep/batches/' + b.id + '/download', 'أكواد التوثيق.xlsx'); } });
  };
  return (
    <>
      <Card title="أكواد توثيق الطلاب" style={{ marginBottom: 16 }}>
        <div className="item-meta" style={{ marginBottom: 6 }}>نطاقك: {[me.university, me.college, me.stage || 'كل المراحل'].filter(Boolean).join(' — ')}</div>
        <div className="item-meta" style={{ marginBottom: 14 }}>{me.batches} دفعة · {me.codes} كود · {me.verified} طالب وثّق حسابه</div>
        <div className="item-meta" style={{ marginBottom: 12, lineHeight: 1.9 }}>١) ارفع ملف Excel (.xlsx) فيه أسماء الطلاب في العمود الأول (أو تحت عنوان «الاسم»). ٢) يولّد النظام <b>كودًا لكل اسم</b>. ٣) نزّل الملف (الاسم + الكود) ووزّع الأكواد على طلابك. ٤) يدخل الطالب كوده في تطبيقه فيُوثَّق حسابه ويُربط بجامعته ومرحلته تلقائيًا. الكود يُستعمل مرة واحدة فقط.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-field" style={{ margin: 0, flex: 1, minWidth: 220 }}><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)', display: 'block', marginBottom: 5 }}>ملف الأسماء (.xlsx — حتى 5000 اسم)</label><input ref={fileInput} type="file" accept=".xlsx" onChange={e => setFile(e.target.files[0])} /></div>
          {!me.stage_locked && <div className="form-field" style={{ margin: 0, minWidth: 180 }}><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)', display: 'block', marginBottom: 5 }}>المرحلة</label>
            <select value={stage} onChange={e => setStage(e.target.value)}><option value="">كل المراحل</option>{me.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
          {me.stage_locked && <input type="hidden" />}
          <button className="btn" disabled={busy} onClick={send}>رفع وتوليد الأكواد</button>
          <button className="btn btn-ghost" onClick={() => dl('/api/rep/template', 'قالب أسماء الطلاب.xlsx')}>تنزيل قالب</button>
        </div>
        {msg && <div style={{ fontSize: '.8rem', marginTop: 10, color: msg.err ? 'var(--danger)' : 'var(--ink)' }}>{msg.t}</div>}
      </Card>
      <Card title="الدفعات المرفوعة">
        <Table head={['الملف', 'المرحلة', 'الأسماء', 'وُثّق', 'التاريخ', '']} empty="لا توجد دفعات بعد — ارفع أول ملف أسماء">
          {batches.map(b => (
            <tr key={b.id}><td className="cell-name">{b.filename || '—'}</td><td>{b.stage}</td><td>{b.total}</td><td>{b.used} <span className="cell-sub">من {b.total}</span></td><td>{fmtDate(b.created_at)}</td>
              <RowActions><button className="btn" style={{ padding: '6px 12px', fontSize: '.7rem' }} onClick={() => dl('/api/rep/batches/' + b.id + '/download', 'أكواد التوثيق.xlsx')}>تنزيل Excel</button><SmallBtn onClick={() => show(b)}>عرض الأكواد</SmallBtn><SmallBtn danger onClick={() => remove(b)}>حذف</SmallBtn></RowActions></tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function BatchCodes({ batch, A, onChanged }) {
  const [codes, setCodes] = useState(batch.codes); const [q, setQ] = useState('');
  const rows = useMemo(() => codes.filter(c => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.code.toLowerCase().includes(q.trim().toLowerCase())), [codes, q]);
  const refresh = async () => { const b = await apiFetch('/api/rep/batches/' + batch.id); setCodes(b.codes); onChanged(); };
  const revoke = async (c) => { if (!await A.dialogs.confirm('إلغاء هذا الكود؟ لن يعمل بعد الآن.')) return; try { await post('/api/rep/codes/' + c.id + '/revoke'); await refresh(); } catch (e) { A.toast(e.detail || 'تعذّر الإلغاء', 'error'); } };
  const regen = async (c) => { if (!await A.dialogs.confirm('استبدال هذا الكود بكود جديد؟ القديم سيتوقف عن العمل.')) return; try { const r = await post('/api/rep/codes/' + c.id + '/regenerate'); A.toast('الكود الجديد: ' + r.code); await refresh(); } catch (e) { A.toast(e.detail || 'تعذّر الاستبدال', 'error'); } };
  return (
    <div>
      <input type="text" placeholder="ابحث بالاسم أو الكود..." value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
      <Table head={['الاسم', 'الكود', 'الحالة', '']} empty="لا نتائج">
        {rows.map(c => {
          const [label, kind] = REP_STATUS[c.status];
          return <tr key={c.id}><td className="cell-name">{c.name}</td><td className="mono" dir="ltr" style={{ textAlign: 'end', opacity: c.status === 'unused' ? 1 : .55 }}>{c.code}</td><td><Badge kind={kind}>{label}</Badge></td>
            <RowActions>{c.status !== 'used' && <><SmallBtn onClick={() => regen(c)}>كود جديد</SmallBtn>{c.status === 'unused' && <SmallBtn danger onClick={() => revoke(c)}>إلغاء</SmallBtn>}</>}</RowActions></tr>;
        })}
      </Table>
    </div>
  );
}

// ------------------------------------------------------------------ reseller
export function ResellerOverview() {
  const { data: s, error } = useData(() => apiFetch('/api/reseller/summary'), []);
  if (error) return <Card>{error}</Card>;
  if (!s) return <Loading />;
  const series = s.weekly_sales || []; const max = Math.max(...series.map(d => d.count ?? d.value ?? 0), 1);
  const WEEKDAY = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];
  return (
    <>
      <KpiGrid cols={3} items={[['أكواد متاحة', s.available], ['أكواد مباعة', s.sold], ['أكواد مفعّلة', s.activated]]} />
      <Card title="المبيعات آخر 7 أيام">
        <div className="bar-chart">{series.map((d, i) => {
          const v = d.count ?? d.value ?? 0;
          return <div key={i} className="bar-col"><div className="bar-fill" style={{ height: Math.max(6, (v / max) * 100) + 'px' }} /><div className="bar-label">{d.date ? WEEKDAY[new Date(d.date + 'T00:00:00').getDay()] : ''}</div></div>;
        })}</div>
      </Card>
    </>
  );
}
export function ResellerSales() {
  const { data: codes, error } = useData(() => apiFetch('/api/reseller/codes'), []);
  if (error) return <Card>{error}</Card>;
  if (!codes) return <Loading />;
  const sold = codes.filter(c => c.sold_at);
  return (
    <Card title="سجل المبيعات">
      <Table head={['الكود', 'الحالة', 'تاريخ البيع']} empty="لا توجد أكواد مباعة بعد">
        {sold.map(c => <tr key={c.code}><td className="mono">{c.code}</td><td><Badge kind={c.status === 'active' ? 'active' : 'idle'}>{c.status === 'active' ? 'مفعّل' : 'غير مفعّل'}</Badge></td><td>{fmtDate(c.sold_at)}</td></tr>)}
      </Table>
    </Card>
  );
}
export function ResellerCodes() {
  const A = useAdmin();
  const can = (p) => A.perms.has(p);
  const { data: me } = useData(() => apiFetch('/api/reseller/me').catch(() => null), []);
  const { data: codes, error, reload } = useData(() => (can('codes.view') ? apiFetch('/api/reseller/codes') : Promise.resolve([])), []);
  if (error) return <Card>{error}</Card>;
  if (!codes) return <Loading />;
  const take = async () => {
    const options = [{ value: '', label: 'VIP — جميع المواد' }];
    try { const tree = await apiFetch('/api/catalog/tree'); for (const sc of tree) for (const u of sc.universities || []) for (const st of u.stages || []) for (const sj of st.subjects || []) options.push({ value: sj.id, label: `${sj.name} — ${u.name} / ${st.name}` }); } catch { /* VIP only */ }
    A.dialogs.form({ title: 'أخذ كود', fields: [{ id: 'count', type: 'number', label: 'الكمية', value: 1 }, { id: 'subjectId', type: 'select', label: 'الخدمة', value: '', options }],
      onSubmit: async (v) => {
        const count = parseInt(v.count, 10); if (!count || count < 1) throw { detail: 'عدد غير صالح' };
        const p = new URLSearchParams({ count }); if (v.subjectId) p.set('subject_id', v.subjectId);
        const res = await post('/api/reseller/codes?' + p.toString()); A.toast(`تم أخذ ${res.codes.length} كود بنجاح`); reload();
      } });
  };
  const label = { active: 'مفعّل', idle: 'متاح', expired: 'منتهي' };
  return (
    <Card>
      {me && <div className="item-meta" style={{ marginBottom: 10 }}>{me.code_quota == null ? `لديك ${me.codes_held} كود — بدون حد أقصى` : `لديك ${me.codes_held} كود من أصل ${me.code_quota} — المتبقي لك ${me.quota_left}`}</div>}
      {can('codes.generate') && <button className="btn" style={{ marginBottom: 12 }} onClick={take}>+ أخذ كود</button>}
      <div className="dash-card-head"><span className="dash-card-title">الأكواد</span></div>
      <Table head={['الكود', 'المادة', 'الحالة', 'تاريخ البيع']} empty={can('codes.view') ? 'لا توجد أكواد بعد — اضغط "أخذ كود"' : 'لا تملك صلاحية عرض الأكواد — يمكنك فقط أخذ أكواد جديدة'}>
        {codes.map(c => <tr key={c.code}><td className="mono">{c.code}</td><td>{c.subject_name}</td><td><Badge kind={c.status === 'idle' ? 'idle' : c.status === 'active' ? 'active' : 'disabled'}>{label[c.status] || c.status}</Badge></td><td>{c.sold_at ? fmtDate(c.sold_at) : '—'}</td></tr>)}
      </Table>
    </Card>
  );
}
export { AddBtn };
