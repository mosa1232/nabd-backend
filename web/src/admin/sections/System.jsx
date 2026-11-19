import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { ALL_STAFF_PERMS, PERM_LABELS } from '../nav.js';
import { Card, Loading, Badge, numAr, useData } from '../ui.jsx';
import { useUserForms, FIND_WORD } from './People.jsx';

const ROLE_NAME = { owner: 'المالك', admin: 'أدمن (مدير المنصة)', supervisor: 'مشرف', store_manager: 'مدير المتجر', professor: 'دكتور', assistant: 'مساعد دكتور', reseller: 'مندوب', representative: 'ممثل عام', student: 'طالب' };
const ROLE_DESC = {
  owner: 'كل شيء مفتوح. وهو الوحيد الذي يدير المالكين ويعيّن المدراء.',
  admin: 'يدير المنصة كاملة: الحسابات والمناهج والمتجر والإحصائيات، لكن لا يلمس حساب المالك.',
  supervisor: 'يعمل بالصلاحيات التي تُمنح له فقط (الإحصائيات، الحظر، المحتوى، المناهج مثلًا).',
  store_manager: 'يدير المتجر والمندوبين والطلبات.',
  professor: 'دكتور: بنك أسئلته وامتحاناته وملازمه وكورساته وطلابه ومساعديه.',
  assistant: 'مساعد دكتور: يعمل ضمن مادة الدكتور بالصلاحيات التي يمنحها له.',
  reseller: 'مندوب: يأخذ أكواد التفعيل ويبيعها ضمن حصته.',
  representative: 'ممثل عام: يرفع أسماء طلاب دفعته ويولّد أكواد التوثيق، وينزّل أسئلته وملازمه وامتحاناته ولمحاته كالدكتور (باسمه، ضمن جامعته ومرحلته).',
  student: 'طالب: يستخدم التطبيق للدراسة.',
};
const ROLE_ORDER = ['owner', 'admin', 'supervisor', 'store_manager', 'professor', 'assistant', 'reseller', 'representative', 'student'];
const initialsOf = (n) => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const RoleBadge = ({ role }) => <span className={'badge badge-' + role}>{ROLE_NAME[role] || role}</span>;
const fmtDT = (iso) => (iso ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z').toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function PersonCard({ a, sub, onOpen }) {
  return (
    <div className="cat-card" onClick={onOpen}>
      <div className="cat-avatar">{initialsOf(a.full_name)}</div>
      <div className="cat-card-name">{a.full_name}</div>
      <div className="cat-card-sub" dir="auto">{sub !== undefined ? sub : (a.caption || a.email)}</div>
      <div><RoleBadge role={a.role} /> {a.is_banned ? <Badge kind="disabled">محظور</Badge> : null}</div>
    </div>
  );
}

export function Roles() {
  const A = useAdmin();
  const { data: accounts, reload } = useData(() => apiFetch('/api/admin/users'), []);
  const f = useUserForms(A, reload);
  const { data: roles } = useData(() => apiFetch('/api/admin/roles').catch(() => []), []);
  const [open, setOpen] = useState(null);
  if (!accounts || !roles) return <Loading />;
  if (!open) {
    const by = Object.fromEntries(roles.map(r => [r.role, r]));
    return (
      <Card title="الأدوار">
        <div className="cat-grid">{ROLE_ORDER.map(r => (
          <div key={r} className="cat-card" onClick={() => setOpen(r)} style={{ alignItems: 'flex-start', textAlign: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}><span className="cat-card-name">{ROLE_NAME[r]}</span><RoleBadge role={r} /></div>
            <div className="cat-card-sub" style={{ lineHeight: 1.7 }}>{ROLE_DESC[r]}</div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{numAr((by[r] || {}).count)} <span className="cat-card-sub">حساب</span></div>
          </div>))}</div>
      </Card>
    );
  }
  const info = roles.find(x => x.role === open) || { permissions: [] };
  const members = accounts.filter(a => a.role === open);
  return (
    <Card>
      <button className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setOpen(null)}>→ الأدوار</button>
      <div className="cat-title2" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{ROLE_NAME[open]}{FIND_WORD[open] && <button className="btn" style={{ marginInlineStart: 'auto' }} onClick={() => f.addUser(open)}>+ إضافة</button>}</div>
      <div className="item-meta" style={{ marginBottom: 12, lineHeight: 1.8 }}>{ROLE_DESC[open]}</div>
      <div style={{ fontWeight: 800, fontSize: '.84rem', marginBottom: 6 }}>الصلاحيات الافتراضية</div>
      <div style={{ marginBottom: 18 }}>{info.permissions.length ? info.permissions.map(p => <span key={p} className="badge badge-active" style={{ margin: 2 }}>{PERM_LABELS[p] || p}</span>) : <span className="cell-sub">لا صلاحيات افتراضية — تُمنح لكل حساب على حدة</span>}</div>
      <div style={{ fontWeight: 800, fontSize: '.84rem', marginBottom: 8 }}>الحسابات ({numAr(members.length)})</div>
      <div className="cat-grid">{members.slice(0, 200).map(a => <PersonCard key={a.id} a={a} onOpen={() => A.go('accounts?open=' + a.id + '&from=roles')} />)}{!members.length && <div className="empty-row">لا توجد حسابات بهذا الدور</div>}</div>
      {members.length > 200 && <div className="cell-sub">يُعرض أول 200 فقط — استخدم صفحة الحسابات للبحث.</div>}
    </Card>
  );
}

function permSummary(a) {
  if (a.role === 'owner') return 'كل الصلاحيات';
  const held = (a.effective_permissions || []).filter(x => ALL_STAFF_PERMS.includes(x));
  if (held.length >= ALL_STAFF_PERMS.length) return 'كل الصلاحيات';
  return held.length ? `${held.length} من ${ALL_STAFF_PERMS.length} صلاحيات` : 'بدون صلاحيات';
}
export function Admins() {
  const A = useAdmin();
  const { data: accounts, reload } = useData(() => apiFetch('/api/admin/users'), []);
  const f = useUserForms(A, reload);
  const [q, setQ] = useState('');
  if (!accounts) return <Loading />;
  const s = q.trim().toLowerCase();
  const groups = [['owner', 'المالك'], ['admin', 'الأدمن'], ['supervisor', 'المشرف'], ['store_manager', 'مدراء المتجر']];
  const out = groups.map(([role, title]) => {
    const list = accounts.filter(a => a.role === role && (!s || a.full_name.toLowerCase().includes(s) || a.email.toLowerCase().includes(s)));
    return list.length ? <div key={role}><div style={{ fontWeight: 800, margin: '6px 0 10px' }}>{title} <span className="cell-sub">· {numAr(list.length)}</span></div><div className="cat-grid">{list.map(a => <PersonCard key={a.id} a={a} sub={permSummary(a)} onOpen={() => A.go('accounts?open=' + a.id + '&from=admins')} />)}</div></div> : null;
  }).filter(Boolean);
  return (
    <Card title="الأدمنية" actions={<span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn" onClick={() => f.addUser('admin')}>+ أدمن</button><button className="btn btn-ghost" onClick={() => f.addUser('supervisor')}>+ مشرف</button><button className="btn btn-ghost" onClick={() => f.addUser('store_manager')}>+ مدير متجر</button></span>}>
      <div className="ops-filters"><input type="text" className="q" placeholder="ابحث بالاسم أو البريد..." value={q} onChange={e => setQ(e.target.value)} /></div>
      {out.length ? out : <div className="empty-row">لا توجد نتائج</div>}
    </Card>
  );
}

export function Logs() {
  const A = useAdmin();
  const [q, setQ] = useState(''); const [days, setDays] = useState(7);
  const [rows, setRows] = useState([]); const [total, setTotal] = useState(0); const [busy, setBusy] = useState(false);
  const load = async (reset, qv = q, dv = days) => {
    setBusy(true);
    try {
      const d = await apiFetch(`/api/admin/logs/search?q=${encodeURIComponent(qv)}&days=${dv}&offset=${reset ? 0 : rows.length}&limit=50`);
      setRows(r => (reset ? d.items : r.concat(d.items))); setTotal(d.total);
    } catch (e) { A.toast(e.detail || 'تعذّر تحميل السجل', 'error'); } finally { setBusy(false); }
  };
  useEffect(() => { const t = setTimeout(() => load(true), 350); return () => clearTimeout(t); }, [q, days]); // eslint-disable-line
  const exportCsv = () => {
    const csv = '﻿' + ['الوقت,المستخدم,البريد,الإجراء,IP'].concat(rows.map(l => [l.at, l.user || '', l.email || '', l.action, l.ip || ''].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'activity-log.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Card title="سجل النشاطات" actions={<span className="cell-sub">{numAr(total)} إجراء</span>}>
      <div className="ops-filters">
        <input type="text" className="q" placeholder="ابحث بالإجراء أو المستخدم أو IP..." value={q} onChange={e => setQ(e.target.value)} />
        <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))}>{[[1, 'آخر 24 ساعة'], [7, 'آخر 7 أيام'], [30, 'آخر 30 يوم'], [0, 'كل السجل']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn btn-ghost" onClick={exportCsv}>تصدير CSV</button>
      </div>
      <div className="table-wrap"><table className="dash-table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>IP</th></tr></thead><tbody>
        {rows.map((l, i) => (
          <tr key={i}><td className="cell-sub">{fmtDT(l.at)}</td>
            <td>{l.user ? <><span style={{ fontWeight: 700 }}>{l.user}</span> {l.role ? <RoleBadge role={l.role} /> : null}<div className="cell-sub" dir="ltr" style={{ textAlign: 'start' }}>{l.email || ''}</div></> : <span className="cell-sub">—</span>}</td>
            <td>{l.action}</td><td className="mono" dir="ltr" style={{ textAlign: 'start' }}>{l.ip || '—'}</td></tr>
        ))}
        {!rows.length && <tr><td colSpan={4} className="empty-row">{busy ? 'جارٍ التحميل…' : 'لا توجد إجراءات'}</td></tr>}
      </tbody></table></div>
      {rows.length < total && <div className="ops-pager"><button className="btn btn-ghost" disabled={busy} onClick={() => load(false)}>عرض المزيد ({numAr(total - rows.length)} متبقي)</button></div>}
    </Card>
  );
}
