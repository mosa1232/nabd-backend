import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch, post, put, del } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { ALL_STAFF_PERMS, PERM_LABELS } from '../nav.js';
import { Card, AddBtn, Table, Badge, RowActions, SmallBtn, Loading, fmtDate, useData } from '../ui.jsx';

const ROLE_NAME = { owner: 'المالك', admin: 'أدمن', student: 'طالب', professor: 'أستاذ', reseller: 'مندوب', supervisor: 'مشرف', store_manager: 'مدير المتجر', assistant: 'مساعد دكتور', representative: 'ممثل عام' };
const ROLE_OPTIONS = [
  ['student', 'طالب'], ['professor', 'دكتور'], ['assistant', 'مساعد دكتور'], ['reseller', 'مندوب'], ['representative', 'ممثل عام (توثيق الطلاب)'],
  ['store_manager', 'مدير المتجر'], ['supervisor', 'مشرف'], ['admin', 'أدمن (مدير المنصة)'], ['owner', 'المالك (كل الصلاحيات)'],
].map(([value, label]) => ({ value, label }));
// who may hand out which roles: only an owner makes owners, only an admin makes admins / supervisors / store managers
const roleOptionsFor = (mine, current) => {
  const list = mine === 'owner' ? ROLE_OPTIONS : mine === 'admin' ? ROLE_OPTIONS.filter(o => !['owner', 'admin'].includes(o.value)) : ROLE_OPTIONS.filter(o => !['admin', 'supervisor', 'store_manager'].includes(o.value));
  return current && !list.some(o => o.value === current) ? ROLE_OPTIONS : list;
};
const STAFF_PERM_OPTIONS = ALL_STAFF_PERMS.map(c => ({ value: c, label: PERM_LABELS[c] }));
const RESELLER_PERMS = ['codes.view', 'codes.generate'].map(c => ({ value: c, label: PERM_LABELS[c] }));
const initialsOf = (n) => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const RoleBadge = ({ role }) => <span className={'badge badge-' + role}>{ROLE_NAME[role] || role}</span>;
const SEL = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', fontSize: '.86rem' };

// the catalogue as college type -> university -> departments / stages
async function loadScopeTree() {
  const rows = await apiFetch('/api/admin/catalog');
  const secs = []; let sec = null, uni = null, dept = null;
  rows.forEach(r => {
    if (r.type === 'section') { sec = { id: r.id, name: r.name, unis: [] }; secs.push(sec); uni = dept = null; }
    else if (r.type === 'university' && sec) { uni = { id: r.id, name: r.name, depts: [], stages: [] }; sec.unis.push(uni); dept = null; }
    else if (r.type === 'department' && uni) { dept = { id: r.id, name: r.name }; uni.depts.push(dept); }
    else if (r.type === 'stage' && uni) { uni.stages.push({ id: r.id, name: r.name, dept: dept ? dept.id : null }); }
  });
  return secs;
}
async function subjectOptions() {
  const rows = await apiFetch('/api/admin/catalog');
  let dept = '', stage = '';
  return rows.filter(r => { if (r.type === 'department') dept = r.name; if (r.type === 'stage') stage = r.name; return r.type === 'subject' && (r._ctx = `${dept} — ${stage}`); })
    .map(r => ({ value: r.id, label: `${r.name} (${r._ctx})` }));
}

// where a representative works: each level narrows the next and stays locked until the one above is chosen
export function ScopeField({ tree, value, onChange }) {
  const [v, setV] = useState(() => {
    const out = { sec: '', uni: value?.uni || '', dept: value?.dept || '', stage: value?.stage || '' };
    if (out.uni) { const s0 = tree.find(sx => sx.unis.some(u => u.id === out.uni)); if (s0) out.sec = s0.id; }
    return out;
  });
  const set = (k, val) => {
    const n = { ...v, [k]: val };
    if (k === 'sec') n.uni = n.dept = n.stage = ''; if (k === 'uni') n.dept = n.stage = ''; if (k === 'dept') n.stage = '';
    setV(n); onChange({ uni: n.uni, dept: n.dept, stage: n.stage });
  };
  const sec = tree.find(x => x.id === v.sec); const uni = sec && sec.unis.find(x => x.id === v.uni);
  const stages = uni ? uni.stages.filter(st => !v.dept || st.dept === v.dept) : [];
  const Sel = ({ label, k, opts, first, locked }) => (
    <><label style={{ fontSize: '.72rem', color: 'var(--ink-faint)', display: 'block', margin: '8px 0 4px' }}>{label}</label>
      <select style={SEL} disabled={locked} value={v[k]} onChange={e => set(k, e.target.value)}><option value="">{first}</option>{opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></>
  );
  return <div><Sel label="① نوع الكلية" k="sec" opts={tree} first="اختر نوع الكلية…" /><Sel label="② الجامعة" k="uni" opts={sec ? sec.unis : []} first="اختر الجامعة…" locked={!sec} />
    <Sel label="③ القسم (اختياري)" k="dept" opts={uni ? uni.depts : []} first="كل الأقسام" locked={!uni} /><Sel label="④ المرحلة (اختياري)" k="stage" opts={stages} first="كل المراحل" locked={!uni} /></div>;
}

function usePeople() {
  const { data: accounts, error, reload } = useData(() => apiFetch('/api/admin/users'), []);
  const { data: profs } = useData(() => apiFetch('/api/admin/professors').catch(() => []), []);
  const { data: catalog } = useData(() => apiFetch('/api/admin/catalog').catch(() => []), []);
  const profBy = useMemo(() => Object.fromEntries((profs || []).map(p => [p.user_id, p])), [profs]);
  const nameBy = useMemo(() => Object.fromEntries((catalog || []).map(r => [r.id, r.name])), [catalog]);
  return { accounts, error, reload, profBy, nameBy };
}

export function useUserForms(A, reload) {
  const addUser = async (presetRole, skipSearch) => {
    if (!skipSearch && FIND_WORD[presetRole]) return findAccountFlow(A, presetRole, { reload, createNew: () => addUser(presetRole, true) });
    let subjects = []; let tree = []; let professors = [];
    try { subjects = await subjectOptions(); } catch { /* shown below */ }
    try { tree = await loadScopeTree(); } catch { /* only for representatives */ }
    try { professors = (await apiFetch('/api/admin/professors')).map(r => ({ value: r.user_id, label: r.full_name })); } catch { /* only for assistants */ }
    A.dialogs.form({
      title: 'إضافة مستخدم',
      fields: [
        { id: 'fullName', label: 'الاسم الكامل' }, { id: 'email', label: 'البريد الإلكتروني', dir: 'ltr' }, { id: 'phone', type: 'tel', label: 'رقم الهاتف (اختياري)', placeholder: '07xxxxxxxxx' },
        { id: 'password', type: 'password', label: 'كلمة المرور (8 أحرف على الأقل)' },
        { id: 'role', type: 'select', label: 'الدور', value: presetRole || 'student', options: roleOptionsFor(A.user.role) },
        { id: 'parentUserId', type: 'select', label: 'الدكتور (للمساعد فقط)', value: '', options: [{ value: '', label: 'لا ينطبق — ليس مساعداً' }, ...professors], show: v => v.role === 'assistant' },
        { id: 'scope', type: 'custom', show: v => v.role === 'representative', render: ({ setValue }) => <div><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الكلية التي يمثّلها (للممثل العام فقط)</label><ScopeField tree={tree} value={{}} onChange={setValue} /></div> },
        { id: 'perms', type: 'checks', label: 'الصلاحيات (للأدمن والمشرف ومدير المتجر فقط) — للأدمن: بدون اختيار = صلاحيات كاملة', value: [], options: STAFF_PERM_OPTIONS, show: v => ['admin', 'supervisor', 'store_manager'].includes(v.role) },
        { id: 'subjectId', type: 'select', label: 'المادة (للدكتور فقط)', value: '', options: [{ value: '', label: 'لا ينطبق — ليس دكتوراً' }, ...subjects], show: v => v.role === 'professor' },
        { id: 'title', label: 'اللقب العلمي (للدكتور فقط)', value: 'أستاذ مساعد', show: v => v.role === 'professor' },
      ],
      onSubmit: async (v) => {
        if (!v.fullName.trim() || !v.email.trim()) throw { detail: 'الاسم والبريد الإلكتروني مطلوبان' };
        if (v.role === 'professor' && !v.subjectId) throw { detail: subjects.length ? 'اختر المادة التي يدرّسها الدكتور' : 'أضف مادة في "المناهج" أولاً، ثم أنشئ حساب الدكتور' };
        const scope = v.scope || {};
        if (v.role === 'representative' && !scope.uni) throw { detail: 'اختر نوع الكلية ثم الجامعة التي يمثّلها الممثل العام' };
        await post('/api/admin/users', {
          full_name: v.fullName.trim(), email: v.email.trim(), role: v.role, phone: (v.phone || '').trim() || null, password: v.password || null,
          subject_id: v.role === 'professor' ? v.subjectId : null, title: v.role === 'professor' ? (v.title || '').trim() : null,
          parent_user_id: v.role === 'assistant' ? (v.parentUserId || null) : null,
          scope_university_id: v.role === 'representative' ? scope.uni : null, scope_stage_id: v.role === 'representative' ? (scope.stage || null) : null, scope_department_id: v.role === 'representative' ? (scope.dept || null) : null,
          permissions: v.role === 'reseller' ? ['codes.view', 'codes.generate'] : (['supervisor', 'store_manager', 'admin'].includes(v.role) ? v.perms : []),
        });
        reload();
      },
    });
  };
  const editUser = async (a) => {
    let tree = []; let professors = [];
    try { tree = await loadScopeTree(); } catch { /* only for representatives */ }
    try { professors = (await apiFetch('/api/admin/professors')).map(r => ({ value: r.user_id, label: r.full_name })); } catch { /* only for assistants */ }
    A.dialogs.form({
      title: 'تعديل مستخدم',
      fields: [
        { id: 'fullName', label: 'الاسم الكامل', value: a.full_name }, { id: 'email', label: 'البريد الإلكتروني', value: a.email, dir: 'ltr' }, { id: 'phone', type: 'tel', label: 'رقم الهاتف', value: a.phone || '' },
        { id: 'password', type: 'password', label: 'كلمة مرور جديدة (اتركه فارغاً للإبقاء على الحالية)' },
        { id: 'role', type: 'select', label: 'الدور', value: a.role, options: roleOptionsFor(A.user.role, a.role) },
        { id: 'parentUserId', type: 'select', label: 'الدكتور (للمساعد فقط)', value: a.parent_user_id || '', options: [{ value: '', label: 'لا ينطبق — ليس مساعداً' }, ...professors], show: v => v.role === 'assistant' },
        { id: 'scope', type: 'custom', show: v => v.role === 'representative', value: { uni: a.scope_university_id || '', dept: a.scope_department_id || '', stage: a.scope_stage_id || '' },
          render: ({ value, setValue }) => <div><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الكلية التي يمثّلها (للممثل العام فقط)</label><ScopeField tree={tree} value={value} onChange={setValue} /></div> },
        { id: 'perms', type: 'checks', label: 'صلاحيات إضافية (للمشرف ومدير المتجر فقط)', value: a.extra_permissions || [], options: STAFF_PERM_OPTIONS, show: v => ['supervisor', 'store_manager'].includes(v.role) },
      ],
      onSubmit: async (v) => {
        if (!v.fullName.trim() || !v.email.trim()) throw { detail: 'الاسم والبريد الإلكتروني مطلوبان' };
        const body = { full_name: v.fullName.trim(), email: v.email.trim(), role: v.role, phone: (v.phone || '').trim(), password: v.password || null };
        if (v.role === 'assistant') body.parent_user_id = v.parentUserId || null;
        if (v.role === 'representative') {
          const scope = v.scope || {};
          if (!scope.uni) throw { detail: 'اختر نوع الكلية ثم الجامعة التي يمثّلها الممثل العام' };
          body.scope_university_id = scope.uni; body.scope_stage_id = scope.stage || null; body.scope_department_id = scope.dept || null;
        }
        if (['supervisor', 'store_manager'].includes(v.role)) body.permissions = v.perms;
        await put('/api/admin/users/' + a.id, body);
        reload();
      },
    });
  };
  const ban = (a) => A.dialogs.form({ title: 'حظر ' + a.full_name, fields: [{ id: 'reason', label: 'سبب الحظر', placeholder: 'مثال: مشاركة الحساب' }],
    onSubmit: async (v) => { if (!v.reason.trim()) throw { detail: 'سبب الحظر مطلوب' }; await post('/api/admin/users/' + a.id + '/ban?' + new URLSearchParams({ reason: v.reason.trim() })); reload(); } });
  const unban = async (a) => { try { await post('/api/admin/users/' + a.id + '/unban'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر رفع الحظر', 'error'); } };
  const reset2fa = async (a) => {
    if (!await A.dialogs.confirm(`سيتم إيقاف التحقق بخطوتين عن حساب ${a.full_name} — يستخدم هذا عند فقدان الهاتف أو تطبيق المصادقة. متابعة؟`)) return;
    try { await post('/api/admin/users/' + a.id + '/2fa/reset'); A.toast('تم إلغاء التحقق بخطوتين عن الحساب'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر إعادة التعيين', 'error'); }
  };
  const assignSubject = async (a) => {
    let subjects = []; try { subjects = await subjectOptions(); } catch { /* handled below */ }
    if (!subjects.length) return A.toast('أضف مادة في "المناهج" أولاً', 'error');
    A.dialogs.form({ title: 'مادة الدكتور — ' + a.full_name, fields: [
      { id: 'mode', type: 'select', label: 'الإجراء', value: 'set', options: [{ value: 'set', label: 'تغيير مادته الأساسية' }, { value: 'add', label: 'إضافة مادة ثانية يدرّسها (قسم أو مرحلة أخرى)' }] },
      { id: 'subjectId', type: 'select', label: 'المادة', value: subjects[0].value, options: subjects }, { id: 'title', label: 'اللقب العلمي', value: 'أستاذ مساعد' }],
    onSubmit: async (v) => {
      const body = { subject_id: v.subjectId, title: (v.title || '').trim() || 'أستاذ مساعد' };
      if (v.mode === 'add') await post(`/api/admin/professors/${a.id}/subjects`, body); else await put('/api/admin/professors/' + a.id, body);
      reload();
    } });
  };
  // permanent deletion: only for an account with no activity or content (a duplicate, a mistake); otherwise the server refuses and says why
  const remove = async (a, done) => {
    if (!await A.dialogs.confirm(`حذف حساب «${a.full_name}» نهائياً؟ لا يمكن التراجع. يُحذف فقط إذا لم يكن له نشاط أو محتوى، وإلا يُرفض الحذف (واستخدم الحظر بدلاً منه).`)) return;
    try { await del('/api/admin/users/' + a.id); A.toast('تم حذف الحساب'); reload(); if (done) done(); }
    catch (e) { A.toast(e.detail || 'تعذّر حذف الحساب', 'error'); }
  };
  return { addUser, editUser, ban, unban, reset2fa, assignSubject, remove };
}

// ------------------------------------------------------------------ accounts table
const CHIPS = [['all', 'الكل'], ['owner', 'المالك'], ['admin', 'أدمن'], ['supervisor', 'مشرف'], ['store_manager', 'مدراء المتجر'], ['professor', 'دكاترة'], ['assistant', 'مساعدون'], ['reseller', 'مندوبون'], ['representative', 'ممثلون'], ['student', 'طلاب']];
export function Accounts() {
  const A = useAdmin();
  const { accounts, error, reload, profBy } = usePeople();
  const f = useUserForms(A, reload);
  const [role, setRole] = useState('all'); const [q, setQ] = useState(''); const [shown, setShown] = useState(100);
  const loc = useLocation(); const qp = new URLSearchParams(loc.search); const from = qp.get('from');
  const [openId, setOpenId] = useState(qp.get('open'));
  useEffect(() => { setOpenId(new URLSearchParams(loc.search).get('open')); }, [loc.search]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (accounts || []).filter(a => (role === 'all' || a.role === role) && (!s || a.full_name.toLowerCase().includes(s) || a.email.toLowerCase().includes(s) || (a.phone || '').includes(s)));
  }, [accounts, role, q]);
  if (error) return <Card>{error}</Card>;
  if (!accounts) return <Loading />;
  const openAcct = openId && accounts.find(x => x.id === openId);
  if (openAcct) return <AccountPage a={openAcct} back={() => { if (from) A.go(from); else { setOpenId(null); if (qp.get('open')) A.go('accounts'); } }} backLabel={from ? '→ رجوع' : '→ الحسابات'} f={f} reload={reload} />;
  return (
    <>
      <div className="filter-chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {CHIPS.map(([k, l]) => <button key={k} className={'filter-chip' + (role === k ? ' active' : '')} onClick={() => { setRole(k); setShown(100); }}>{l}</button>)}
      </div>
      <Card title="الحسابات" actions={<AddBtn onClick={() => f.addUser()}>إضافة مستخدم</AddBtn>}>
        <div className="ops-filters"><input type="text" className="q" placeholder="ابحث بالاسم أو البريد أو الهاتف..." value={q} onChange={e => { setQ(e.target.value); setShown(100); }} /><span className="cell-sub">{list.length} حساب</span></div>
        <Table head={['المستخدم', 'الهاتف', 'الدور', 'الحالة', 'التواريخ', '']} empty="لا يوجد نتائج">
          {list.slice(0, shown).map(a => (
            <tr key={a.id}>
              <td style={{ cursor: 'pointer' }} onClick={() => setOpenId(a.id)}><div className="cell-user"><div className="cell-avatar" style={{ background: 'var(--accent)' }}>{initialsOf(a.full_name)}</div><div><div className="cell-name">{a.full_name}</div><div className="cell-sub mono">{a.email}</div></div></div></td>
              <td className="mono" dir="ltr" style={{ textAlign: 'end' }}>{a.phone || '—'}</td>
              <td><RoleBadge role={a.role} />{a.verified_at ? <> <Badge kind="active">✓ موثّق</Badge></> : null}
                {a.role === 'professor' && (profBy[a.id]?.subject_name ? <div className="cell-sub">{profBy[a.id].subject_name}</div>
                  : <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '.66rem', marginTop: 4, color: 'var(--danger)' }} onClick={() => f.assignSubject(a)}>⚠ بدون مادة — أسنِد</button>)}</td>
              <td>{a.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</td>
              <td><div className="cell-sub">انضم {fmtDate(a.created_at)}</div><div className="cell-sub">آخر دخول {fmtDate(a.last_login)}</div></td>
              <RowActions>
                <SmallBtn onClick={() => setOpenId(a.id)}>التفاصيل</SmallBtn>
                {a.totp_enabled && <SmallBtn onClick={() => f.reset2fa(a)} title="يلغي التحقق بخطوتين عن هذا الحساب">إعادة تعيين 2FA</SmallBtn>}
                {a.is_banned ? <SmallBtn onClick={() => f.unban(a)}>رفع الحظر</SmallBtn> : <SmallBtn danger onClick={() => f.ban(a)}>حظر</SmallBtn>}
                <SmallBtn onClick={() => f.editUser(a)}>تعديل</SmallBtn>
              </RowActions>
            </tr>
          ))}
        </Table>
        {list.length > shown && <div className="ops-pager"><button className="btn btn-ghost" onClick={() => setShown(s => s + 100)}>عرض المزيد</button></div>}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ doctors / representatives as cards
function PeopleCards({ role, word }) {
  const A = useAdmin();
  const { accounts, error, reload, profBy, nameBy } = usePeople();
  const f = useUserForms(A, reload);
  const [q, setQ] = useState('');
  if (error) return <Card>{error}</Card>;
  if (!accounts) return <Loading />;
  const s = q.trim().toLowerCase();
  const list = accounts.filter(a => a.role === role && a.email !== 'platform@kiur.internal' && !a.email.endsWith('@kiur.internal') && (!s || a.full_name.toLowerCase().includes(s) || a.email.toLowerCase().includes(s)));
  const sub = (a) => {
    if (role === 'professor') {
      const p = profBy[a.id]; const subs = p && p.subjects && p.subjects.length ? p.subjects.map(x => x.subject_name).join('، ') : (p && p.subject_name) || '';
      return subs || <span style={{ color: 'var(--danger)' }}>بدون مادة</span>;
    }
    const bits = [a.scope_university_id && nameBy[a.scope_university_id], a.scope_department_id && nameBy[a.scope_department_id], a.scope_stage_id && nameBy[a.scope_stage_id]].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'بدون نطاق';
  };
  return (
    <Card>
      <div className="ops-filters"><input type="text" className="q" placeholder={`ابحث عن ${word}...`} value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="cat-grid">
        {list.map(a => (
          <div key={a.id} className="cat-card" onClick={() => A.go(`accounts?open=${a.id}&from=${role === 'professor' ? 'doctors' : 'reps'}`)}>
            <div className="cat-avatar">{a.photo_url ? <img src={a.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initialsOf(a.full_name)}</div>
            <div className="cat-card-name">{a.full_name}</div>
            <div className="cat-card-sub">{sub(a)}</div>
            <div>{a.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</div>
          </div>
        ))}
        <div className="cat-card addnew" onClick={() => f.addUser(role)}>+ {word}</div>
      </div>
    </Card>
  );
}
export const Doctors = () => <PeopleCards role="professor" word="دكتور" />;
export const Reps = () => <PeopleCards role="representative" word="ممثل" />;

// ------------------------------------------------------------------ one account, in full
const fmtDT = (iso) => {
  if (!iso) return '—';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); if (isNaN(d)) return '—';
  return <bdi dir="ltr">{d.toLocaleDateString('en-GB')} {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</bdi>;
};
const fmtIQD = (n) => (n || 0).toLocaleString('en-US') + ' د.ع';
const Row = ({ label, children, mono }) => (
  <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--glass-border)', fontSize: '.86rem', alignItems: 'center' }}>
    <span style={{ width: 130, color: 'var(--ink-faint)', flex: 'none' }}>{label}</span>
    <span style={{ flex: 1, wordBreak: 'break-all', ...(mono ? { fontFamily: 'monospace', direction: 'ltr', textAlign: 'end' } : null) }}>{children}</span>
  </div>
);

// college -> university -> department -> stage, for moving a student
function PlacementField({ tree, value, onChange }) {
  const [v, setV] = useState(() => {
    const out = { sec: '', uni: value.uni || '', dept: '', stage: value.stage || '' };
    const s0 = tree.find(s => s.unis.some(u => u.id === out.uni)); if (s0) out.sec = s0.id;
    const u0 = s0 && s0.unis.find(u => u.id === out.uni); const st0 = u0 && u0.stages.find(x => x.id === out.stage); if (st0 && st0.dept) out.dept = st0.dept;
    return out;
  });
  const set = (k, val) => { const n = { ...v, [k]: val }; if (k === 'sec') n.uni = n.dept = n.stage = ''; if (k === 'uni') n.dept = n.stage = ''; if (k === 'dept') n.stage = ''; setV(n); onChange({ uni: n.uni, stage: n.stage }); };
  const sec = tree.find(x => x.id === v.sec); const uni = sec && sec.unis.find(x => x.id === v.uni);
  const stages = uni ? uni.stages.filter(st => !v.dept || st.dept === v.dept) : [];
  const Sel = ({ label, k, opts, locked }) => (
    <><label style={{ fontSize: '.72rem', color: 'var(--ink-faint)', display: 'block', margin: '8px 0 4px' }}>{label}</label>
      <select style={SEL} disabled={locked} value={v[k]} onChange={e => set(k, e.target.value)}><option value="">—</option>{opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></>
  );
  return <div><Sel label="الكلية" k="sec" opts={tree} /><Sel label="الجامعة" k="uni" opts={sec ? sec.unis : []} locked={!sec} /><Sel label="القسم" k="dept" opts={uni ? uni.depts : []} locked={!uni} /><Sel label="المرحلة" k="stage" opts={stages} locked={!uni} /></div>;
}

function AccountPage({ a, back, backLabel = '→ الحسابات', f, reload }) {
  const A = useAdmin();
  const owner = A.user && A.user.role === 'owner'; const adminLike = owner || (A.user && A.user.role === 'admin');
  const ov = useData(() => apiFetch('/api/admin/users/' + a.id + '/overview').catch(() => null), [a.id, a.is_banned, a.totp_enabled]);
  const names = useData(() => apiFetch('/api/admin/catalog').then(rows => Object.fromEntries(rows.filter(r => r.id).map(r => [r.id, r.name]))).catch(() => ({})), []);
  const nm = (id) => (id && names.data && names.data[id]) || '—';
  const [pw, setPw] = useState(null);
  const o = ov.data;
  const showPw = async () => {
    try { const r = await apiFetch('/api/admin/users/' + a.id + '/password'); setPw(r.password || ''); } catch (e) { A.toast(e.detail || 'تعذّر الإظهار', 'error'); }
  };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); A.toast('نُسخت'); } catch { A.toast('تعذّر النسخ', 'error'); } };
  // ---- edit in place (same fields as the old account page): identity, study path, work, scope, permissions
  const [ed, setEd] = useState(false);
  const [fv, setFv] = useState({});
  const [opts, setOpts] = useState({ tree: [], professors: [] });
  const [saving, setSaving] = useState(false);
  const heldPerms = a.role === 'admin' ? (a.effective_permissions || []).filter(x => ALL_STAFF_PERMS.includes(x)) : (a.extra_permissions || []);
  // the cards that follow the role: while editing they follow the role picked in the form, so a student turned into
  // a representative gets the scope picker (and a reseller gets quota and permissions) right away
  const rr = ed ? (fv.role || a.role) : a.role;
  const isStaff = ['supervisor', 'store_manager', 'admin'].includes(rr);
  const permsEditable = isStaff && (rr !== 'admin' || owner);
  const roleOptions = roleOptionsFor(A.user && A.user.role, a.role);
  const set = (k, v) => setFv(x => ({ ...x, [k]: v }));
  const STAFF_DEFAULT = { admin: ALL_STAFF_PERMS.slice(), supervisor: ['dashboard.analytics', 'users.ban', 'content.manage', 'catalog.manage'], store_manager: ['store.manage', 'resellers.manage'] };
  const changeRole = (v) => setFv(x => ({ ...x, role: v,
    rsPerms: v === 'reseller' && !x.rsPerms.length ? ['codes.view', 'codes.generate'] : x.rsPerms,
    perms: STAFF_DEFAULT[v] && !x.perms.length ? STAFF_DEFAULT[v] : x.perms }));
  const startEdit = async () => {
    let tree = []; let professors = [];
    try { tree = await loadScopeTree(); } catch { /* only for students and representatives */ }
    try { professors = (await apiFetch('/api/admin/professors')).map(r => ({ value: r.user_id, label: r.full_name })); } catch { /* only for assistants */ }
    setOpts({ tree, professors });
    setFv({ full_name: a.full_name, email: a.email, username: a.username || '', phone: a.phone || '', role: a.role, password: '', parent: a.parent_user_id || '',
      quota: a.code_quota == null ? '' : String(a.code_quota), rsPerms: a.extra_permissions || [],
      scope: { uni: a.scope_university_id || '', dept: a.scope_department_id || '', stage: a.scope_stage_id || '' }, perms: heldPerms, place: { uni: a.university_id || '', stage: a.stage_id || '' } });
    setEd(true);
  };
  const save = async () => {
    const role = fv.role || a.role;
    if (!fv.full_name.trim() || !fv.email.trim()) return A.toast('الاسم والبريد الإلكتروني مطلوبان', 'error');
    const body = { full_name: fv.full_name.trim(), email: fv.email.trim(), username: fv.username.trim(), role, phone: fv.phone.trim(), password: fv.password || null };
    if (role === 'assistant') body.parent_user_id = fv.parent || null;
    if (role === 'reseller') { body.code_quota = fv.quota === '' ? null : Number(fv.quota); body.permissions = fv.rsPerms; }
    if (role === 'representative') {
      if (!fv.scope.uni) return A.toast('اختر نوع الكلية ثم الجامعة التي يمثّلها', 'error');
      body.scope_university_id = fv.scope.uni; body.scope_department_id = fv.scope.dept || null; body.scope_stage_id = fv.scope.stage || null;
    }
    if (['supervisor', 'store_manager'].includes(role) || (role === 'admin' && owner && permsEditable)) body.permissions = fv.perms;
    setSaving(true);
    try {
      await put('/api/admin/users/' + a.id, body);
      if (a.role === 'student' && role === 'student') await put('/api/admin/users/' + a.id + '/placement', { university_id: fv.place.uni || null, stage_id: fv.place.stage || null });
      A.toast('تم حفظ التغييرات'); setEd(false); reload(); ov.reload();
    } catch (e) { A.toast(e.detail || 'تعذّر الحفظ', 'error'); }
    setSaving(false);
  };
  const badges = (list) => list.length ? list.map(p => <span key={p} className="badge badge-active" style={{ margin: 2 }}>{PERM_LABELS[p] || p}</span>) : <span className="cell-sub">لا توجد</span>;
  const IN = { ...SEL, width: '100%' };
  const checks = (opts2, value, onChange) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>{opts2.map(o => (
    <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.84rem' }}>
      <input type="checkbox" checked={value.includes(o.value)} onChange={e => onChange(e.target.checked ? [...value, o.value] : value.filter(x => x !== o.value))} style={{ width: 16, height: 16, padding: 0 }} /> {o.label}</label>))}</div>;
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={back}>{backLabel}</button>
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          {ed ? <><button className="btn btn-ghost" onClick={() => setEd(false)}>إلغاء</button><button className="btn" disabled={saving} onClick={save}>حفظ التغييرات</button></> : <button className="btn" onClick={startEdit}>تعديل</button>}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div className="cell-avatar" style={{ background: 'var(--accent)', width: 60, height: 60, fontSize: '1.3rem' }}>{a.photo_url ? <img src={a.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initialsOf(a.full_name)}</div>
        <div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{a.full_name}</div>{(a.caption || (o && o.caption)) ? <div className="cell-sub">{a.caption || o.caption}</div> : null}
          <div style={{ marginTop: 4 }}><RoleBadge role={a.role} /> {a.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</div></div>
      </div>
      <div className="acct-cols">
        <div className="acct-col">
          <Card title="البيانات الشخصية" style={{ marginBottom: 14 }}>
            {ed ? <>
              <Row label="الاسم الكامل"><input style={IN} value={fv.full_name} onChange={e => set('full_name', e.target.value)} /></Row>
              <Row label="البريد الإلكتروني"><input style={{ ...IN, direction: 'ltr' }} value={fv.email} onChange={e => set('email', e.target.value)} /></Row>
              <Row label="اسم المستخدم (للدخول)"><input style={{ ...IN, direction: 'ltr' }} value={fv.username} placeholder="اختياري — أحرف إنجليزية وأرقام" onChange={e => set('username', e.target.value)} /></Row>
              <Row label="رقم الهاتف"><input style={{ ...IN, direction: 'ltr' }} type="tel" value={fv.phone} placeholder="07xxxxxxxxx" onChange={e => set('phone', e.target.value)} /></Row>
              <Row label="الدور"><select style={IN} value={fv.role} onChange={e => changeRole(e.target.value)}>{roleOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Row>
              <Row label="كلمة مرور جديدة"><input style={IN} type="text" value={fv.password} placeholder="اتركه فارغًا للإبقاء على الحالية" onChange={e => set('password', e.target.value)} /></Row>
            </> : <>
              <Row label="الاسم الكامل">{a.full_name}</Row><Row label="البريد الإلكتروني" mono>{a.email}</Row>
              <Row label="اسم المستخدم (للدخول)" mono={!!a.username}>{a.username || <span className="cell-sub">غير محدد</span>}</Row>
              <Row label="رقم الهاتف" mono={!!a.phone}>{a.phone || 'لم يُدخل'}</Row><Row label="الدور">{ROLE_NAME[a.role] || a.role}</Row>
              {o && o.caption ? <Row label="النبذة">{o.caption}</Row> : null}
            </>}
          </Card>
          {rr === 'student' && <Card title="الدراسة" style={{ marginBottom: 14 }}>
            {ed ? <PlacementField tree={opts.tree} value={fv.place} onChange={v => set('place', v)} /> : <>
              <Row label="الكلية">{nm(a.section_id)}</Row><Row label="الجامعة">{nm(a.university_id)}</Row><Row label="المرحلة">{a.is_graduate ? 'متخرج' : nm(a.stage_id)}</Row></>}
          </Card>}
          {rr === 'assistant' && <Card title="العمل" style={{ marginBottom: 14 }}>
            {ed ? <Row label="يعمل مع الدكتور"><select style={IN} value={fv.parent} onChange={e => set('parent', e.target.value)}><option value="">—</option>{opts.professors.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Row>
              : <Row label="يعمل مع الدكتور">{(names.data && names.data[a.parent_user_id]) || (opts.professors.find(x => x.value === a.parent_user_id) || {}).label || a.parent_user_id || '—'}</Row>}</Card>}
          {rr === 'reseller' && <Card title="المندوب" style={{ marginBottom: 14 }}>
            {ed ? <>
              <Row label="حصة الأكواد"><input style={IN} type="number" min="0" value={fv.quota} placeholder="فارغ = بلا حد" onChange={e => set('quota', e.target.value)} /></Row>
              <Row label="الصلاحيات">{checks(RESELLER_PERMS, fv.rsPerms, v => set('rsPerms', v))}</Row></> : <>
              <Row label="حصة الأكواد">{a.code_quota == null ? 'بلا حد' : a.code_quota}</Row><Row label="الصلاحيات">{badges(a.extra_permissions || [])}</Row>
              <div style={{ marginTop: 12 }}><button className="btn btn-ghost" onClick={() => A.go('resellers')}>فتح صفحة المندوب (الأكواد والتوليد)</button></div></>}</Card>}
          {rr === 'representative' && <Card title="نطاق الممثل" style={{ marginBottom: 14 }}>
            {ed ? <ScopeField tree={opts.tree} value={fv.scope} onChange={v => set('scope', v)} /> : <>
              <Row label="يمثّل">{nm(a.scope_university_id)}</Row><Row label="القسم">{a.scope_department_id ? nm(a.scope_department_id) : 'كل الأقسام'}</Row><Row label="المرحلة">{a.scope_stage_id ? nm(a.scope_stage_id) : 'كل المراحل'}</Row></>}</Card>}
          {isStaff && <Card title={rr === 'admin' ? 'صلاحيات الأدمن' : 'الصلاحيات الإضافية'} style={{ marginBottom: 14 }}>
            {ed && permsEditable ? <>{checks(STAFF_PERM_OPTIONS, fv.perms, v => set('perms', v))}{rr === 'admin' && <div className="cell-sub" style={{ marginTop: 8 }}>الأدمن يرى ويفعل ما تحدده هنا فقط. الصلاحيات من صلاحية المالك وحده.</div>}</> : badges(heldPerms)}</Card>}
          {o && o.teaches && o.teaches.length > 0 && !ed && <Card title="المواد التي يدرّسها" style={{ marginBottom: 14 }}>{o.teaches.map((t, i) => <span key={i} className="cat-chip">{t.subject}</span>)}</Card>}
        </div>
        <div className="acct-col">
          <Card title="الحساب والأمان" style={{ marginBottom: 14 }}>
            <Row label="كلمة المرور">{a.has_password ? <>معيّنة{a.password_changed_at ? <> — آخر تغيير {fmtDT(a.password_changed_at)}</> : null}</> : 'غير معيّنة (يدخل عبر Google)'}
              {adminLike && a.has_password && <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <SmallBtn onClick={showPw}>إظهار كلمة المرور</SmallBtn>
                {pw != null && (pw ? <><span className="mono" dir="ltr" style={{ fontSize: '1.05rem', fontWeight: 800, userSelect: 'all' }}>{pw}</span><SmallBtn onClick={() => copy(pw)}>نسخ</SmallBtn></>
                  : <span className="cell-sub">غير متوفرة بعد — تظهر بعد أن يسجّل دخوله مرة أخرى أو تعيّن له كلمة جديدة من «تعديل».</span>)}</div>}</Row>
            {o && <Row label="ربط Google">{o.has_google ? 'مربوط' : 'غير مربوط'}</Row>}
            <Row label="التحقق بخطوتين">{a.totp_enabled ? 'مفعّل' : 'غير مفعّل'}</Row>
            <Row label="الحالة">{a.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</Row>
            {a.role === 'student' && <Row label="التوثيق">{a.verified_at ? <>موثّق باسم «{a.verified_name || ''}» — {fmtDT(a.verified_at)}</> : 'غير موثّق'}</Row>}
            <Row label="تاريخ الانضمام">{fmtDT(a.created_at)}</Row><Row label="آخر دخول">{fmtDT(a.last_login)}</Row>
            {o && <Row label="اللغة / المظهر">{(o.language || '—') + ' / ' + (o.theme || '—')}</Row>}
          </Card>
          {(a.is_banned || a.totp_enabled || a.role !== 'owner') && <Card title="إجراءات" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {a.is_banned ? <button className="btn btn-ghost" onClick={() => f.unban(a)}>رفع الحظر</button> : (['admin', 'owner'].includes(a.role) ? null : <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => f.ban(a)}>حظر</button>)}
              {a.totp_enabled && <button className="btn btn-ghost" onClick={() => f.reset2fa(a)}>إعادة تعيين 2FA</button>}
              {a.role !== 'owner' && a.id !== A.user.id && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => f.remove(a, back)}>حذف الحساب</button>}
            </div></Card>}
        </div>
      </div>
      {ov.loading && !o ? <Loading /> : o && (
        <Card title="النشاط">
          {a.role === 'student' && <><Row label="الأسئلة المجابة">{o.answered}{o.accuracy != null ? ` — دقة ${o.accuracy}%` : ''}</Row><Row label="الامتحانات المنجزة">{o.exams_done}{o.exam_pct != null ? ` — معدل ${o.exam_pct}%` : ''}</Row></>}
          <Row label="الطلبات">{o.orders.count} طلب — {fmtIQD(o.orders.total)}</Row>
          <div style={{ marginTop: 10, fontWeight: 700, fontSize: '.82rem' }}>الاشتراكات</div>
          {o.subscriptions.length ? o.subscriptions.map((s, i) => <div className="activity-row" key={i}><span className="activity-dot" /><span className="activity-text">{s.subject}</span><span className="activity-time">{s.expires_at ? 'حتى ' + fmtDate(s.expires_at) : 'بلا انتهاء'}</span></div>) : <div className="cell-sub">لا توجد اشتراكات مفعّلة</div>}
          <div style={{ marginTop: 12, fontWeight: 700, fontSize: '.82rem' }}>الأجهزة وعناوين IP</div>
          <div className="cell-sub" style={{ marginBottom: 8 }}>{o.devices_total} تسجيل دخول — {o.distinct_devices} جهاز مختلف — {o.distinct_ips} عنوان IP</div>
          {o.devices.length ? o.devices.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.2fr) minmax(110px,1fr) minmax(120px,1fr) 70px', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--glass-border)', fontSize: '.82rem' }}>
              <span>{d.label}</span><span style={{ textAlign: 'start', fontFamily: 'monospace' }}><bdi dir="ltr">{d.ip || '—'}</bdi></span><span>{fmtDT(d.at)}</span><span>{d.active ? <Badge kind="active">نشط</Badge> : null}</span></div>)) : <div className="cell-sub">لا يوجد</div>}
          {o.bans.length > 0 && <><div style={{ marginTop: 12, fontWeight: 700, fontSize: '.82rem' }}>سجل الحظر</div>{o.bans.map((b, i) => <div className="activity-row" key={i}><span className="activity-dot" /><span className="activity-text">{b.reason} <span className="cell-sub">({b.status})</span></span><span className="activity-time">{fmtDate(b.at)}</span></div>)}</>}
          {o.activity.length > 0 && <><div style={{ marginTop: 12, fontWeight: 700, fontSize: '.82rem' }}>آخر الإجراءات</div>{o.activity.map((l, i) => <div className="activity-row" key={i}><span className="activity-dot" /><span className="activity-text">{l.action}</span><span className="activity-time">{fmtDate(l.at)}</span></div>)}</>}
        </Card>
      )}
    </>
  );
}

// ------------------------------------------------------------------ add: search an existing account first
export const FIND_WORD = { professor: 'دكتور', representative: 'ممثل', reseller: 'مندوب', admin: 'أدمن', supervisor: 'مشرف', store_manager: 'مدير متجر' };
const SECTION_OF_ROLE = { professor: 'doctors', representative: 'reps', reseller: 'resellers', admin: 'admins', supervisor: 'admins', store_manager: 'admins' };

function FindAccountList({ accounts, role, onPick, onNew }) {
  const [q, setQ] = useState('');
  const staff = ['admin', 'supervisor', 'store_manager'].includes(role);
  const s = q.trim().toLowerCase();
  const list = s ? accounts.filter(a => a.role !== role && a.role !== 'owner' && (staff || a.role !== 'admin') && [a.full_name, a.email, a.phone, a.username].some(v => (v || '').toLowerCase().includes(s))).slice(0, 30) : [];
  return (
    <div>
      <input type="text" autoComplete="off" placeholder="اكتب اسم أو بريد..." value={q} onChange={e => setQ(e.target.value)} autoFocus style={{ width: '100%', marginBottom: 12 }} />
      {!s && <div className="cell-sub" style={{ padding: '8px 2px' }}>ابدأ الكتابة لتظهر النتائج</div>}
      {list.map(a => (
        <div key={a.id} onClick={() => onPick(a)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, borderRadius: 14, border: '1px solid var(--glass-border)', background: 'var(--glass-bg-strong)', cursor: 'pointer' }}>
          <div className="cell-avatar" style={{ background: 'var(--accent)' }}>{initialsOf(a.full_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{a.full_name}</div><div className="cell-sub mono" dir="ltr" style={{ textAlign: 'start' }}>{a.email}</div></div>
          <RoleBadge role={a.role} />
        </div>))}
      {s && !list.length && <div className="empty-row">لا توجد حسابات مطابقة</div>}
      <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={onNew}>لا أجده — إنشاء حساب جديد</button>
    </div>
  );
}

// "add a doctor / representative / reseller / admin…": first look for an account that already exists (a student who
// signed up, say) and turn it into that role; only if there is none, create a fresh account.
export async function findAccountFlow(A, role, { reload, createNew }) {
  let accounts = []; try { accounts = await apiFetch('/api/admin/users'); } catch { /* shown as "no matches" */ }
  const word = FIND_WORD[role];
  const closeTop = () => document.querySelector('.page-layer .page-back')?.click();
  const pick = async (a) => {
    closeTop();
    const common = `${a.full_name}${a.role !== 'student' ? ' — يتحول من ' + (ROLE_NAME[a.role] || a.role) : ''}`;
    const save = async (extra, after) => {
      await put('/api/admin/users/' + a.id, { email: a.email, full_name: a.full_name, role, ...extra });
      if (after) await after();
      A.toast(`صار ${a.full_name} ${word}`); reload && reload(); A.go(SECTION_OF_ROLE[role]);
    };
    if (role === 'professor') {
      let subjects = []; try { subjects = await subjectOptions(); } catch { /* handled below */ }
      if (!subjects.length) return A.toast('أضف مادة في "المناهج" أولاً', 'error');
      A.dialogs.form({ title: 'تعيين دكتور: ' + common, fields: [
        { id: 'subjectId', type: 'select', label: 'المادة التي يدرّسها', value: subjects[0].value, options: subjects },
        { id: 'title', label: 'اللقب العلمي', value: 'أستاذ مساعد' }],
      onSubmit: (v) => save({}, () => put('/api/admin/professors/' + a.id, { subject_id: v.subjectId, title: (v.title || '').trim() || 'أستاذ مساعد' })) });
    } else if (role === 'reseller') {
      A.dialogs.form({ title: 'تعيين مندوب: ' + common, fields: [
        { id: 'perms', type: 'checks', label: 'ماذا يستطيع هذا المندوب أن يفعل؟', value: ['codes.view', 'codes.generate'], options: RESELLER_PERMS },
        { id: 'quota', type: 'number', label: 'أقصى عدد أكواد يحملها (فارغ = بلا حد)', value: '' }],
      onSubmit: (v) => save({ permissions: v.perms, code_quota: v.quota === '' ? null : parseInt(v.quota, 10) }) });
    } else if (['admin', 'supervisor', 'store_manager'].includes(role)) {
      const initial = role === 'admin' ? ALL_STAFF_PERMS.slice() : role === 'supervisor' ? ['dashboard.analytics', 'users.ban', 'content.manage', 'catalog.manage'] : ['store.manage', 'resellers.manage'];
      A.dialogs.form({ title: 'تعيين ' + word + ': ' + common, fields: [
        { id: 'perms', type: 'checks', label: role === 'admin' ? 'صلاحيات هذا الأدمن (وحدك كمالك تغيّرها لاحقًا)' : 'الصلاحيات', value: initial, options: STAFF_PERM_OPTIONS }],
      onSubmit: (v) => save({ permissions: v.perms }) });
    } else {
      let tree = []; try { tree = await loadScopeTree(); } catch { /* handled below */ }
      if (!tree.length) return A.toast('أضف كلية وجامعة في "المناهج" أولاً', 'error');
      A.dialogs.form({ title: 'تعيين ممثل: ' + common, fields: [
        { id: 'scope', type: 'custom', value: {}, render: ({ setValue }) => <div><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الكلية التي يمثّلها: اختر نوع الكلية ثم الجامعة (والقسم والمرحلة اختياري)</label><ScopeField tree={tree} value={{}} onChange={setValue} /></div> }],
      onSubmit: async (v) => {
        const sc = v.scope || {}; if (!sc.uni) throw { detail: 'اختر نوع الكلية ثم الجامعة التي يمثّلها' };
        await save({ scope_university_id: sc.uni, scope_department_id: sc.dept || null, scope_stage_id: sc.stage || null });
      } });
    }
  };
  A.dialogs.form({
    title: 'إضافة ' + word, submitLabel: 'إغلاق',
    note: `ابحث عن حساب موجود (طالب سجّل بالمنصة مثلًا) بالاسم أو البريد أو الهاتف أو اسم المستخدم، واختره ليصير ${word}.`,
    fields: [{ id: 'f', type: 'custom', render: () => <FindAccountList accounts={accounts} role={role} onPick={pick} onNew={() => { closeTop(); createNew(); }} /> }],
    onSubmit: async () => {},
  });
}