import { useMemo, useState } from 'react';
import { apiFetch, post, put } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { ALL_STAFF_PERMS, PERM_LABELS } from '../nav.js';
import { Card, AddBtn, Table, Badge, RowActions, SmallBtn, Loading, fmtDate, useData } from '../ui.jsx';

const ROLE_NAME = { owner: 'المالك', admin: 'أدمن', student: 'طالب', professor: 'أستاذ', reseller: 'مندوب', supervisor: 'مشرف', store_manager: 'مدير المتجر', assistant: 'مساعد دكتور', representative: 'ممثل عام' };
const ROLE_OPTIONS = [
  ['student', 'طالب'], ['professor', 'دكتور'], ['assistant', 'مساعد دكتور'], ['reseller', 'مندوب'], ['representative', 'ممثل عام (توثيق الطلاب)'],
  ['store_manager', 'مدير المتجر'], ['supervisor', 'مشرف'], ['admin', 'أدمن (مدير المنصة)'], ['owner', 'المالك (كل الصلاحيات)'],
].map(([value, label]) => ({ value, label }));
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

function useUserForms(A, reload) {
  const addUser = async (presetRole) => {
    let subjects = []; let tree = []; let professors = [];
    try { subjects = await subjectOptions(); } catch { /* shown below */ }
    try { tree = await loadScopeTree(); } catch { /* only for representatives */ }
    try { professors = (await apiFetch('/api/admin/professors')).map(r => ({ value: r.user_id, label: r.full_name })); } catch { /* only for assistants */ }
    A.dialogs.form({
      title: 'إضافة مستخدم',
      fields: [
        { id: 'fullName', label: 'الاسم الكامل' }, { id: 'email', label: 'البريد الإلكتروني', dir: 'ltr' }, { id: 'phone', type: 'tel', label: 'رقم الهاتف (اختياري)', placeholder: '07xxxxxxxxx' },
        { id: 'password', type: 'password', label: 'كلمة المرور (8 أحرف على الأقل)' },
        { id: 'role', type: 'select', label: 'الدور', value: presetRole || 'student', options: ROLE_OPTIONS.filter(o => o.value !== 'owner' || A.user.role === 'owner') },
        { id: 'parentUserId', type: 'select', label: 'الدكتور (للمساعد فقط)', value: '', options: [{ value: '', label: 'لا ينطبق — ليس مساعداً' }, ...professors] },
        { id: 'scope', type: 'custom', render: ({ setValue }) => <div><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الكلية التي يمثّلها (للممثل العام فقط)</label><ScopeField tree={tree} value={{}} onChange={setValue} /></div> },
        { id: 'perms', type: 'checks', label: 'الصلاحيات (للأدمن والمشرف ومدير المتجر فقط) — للأدمن: بدون اختيار = صلاحيات كاملة', value: [], options: STAFF_PERM_OPTIONS },
        { id: 'subjectId', type: 'select', label: 'المادة (للدكتور فقط)', value: '', options: [{ value: '', label: 'لا ينطبق — ليس دكتوراً' }, ...subjects] },
        { id: 'title', label: 'اللقب العلمي (للدكتور فقط)', value: 'أستاذ مساعد' },
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
        { id: 'role', type: 'select', label: 'الدور', value: a.role, options: ROLE_OPTIONS },
        { id: 'parentUserId', type: 'select', label: 'الدكتور (للمساعد فقط)', value: a.parent_user_id || '', options: [{ value: '', label: 'لا ينطبق — ليس مساعداً' }, ...professors] },
        { id: 'scope', type: 'custom', value: { uni: a.scope_university_id || '', dept: a.scope_department_id || '', stage: a.scope_stage_id || '' },
          render: ({ value, setValue }) => <div><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الكلية التي يمثّلها (للممثل العام فقط)</label><ScopeField tree={tree} value={value} onChange={setValue} /></div> },
        { id: 'perms', type: 'checks', label: 'صلاحيات إضافية (للمشرف ومدير المتجر فقط)', value: a.extra_permissions || [], options: STAFF_PERM_OPTIONS },
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
  return { addUser, editUser, ban, unban, reset2fa, assignSubject };
}

// ------------------------------------------------------------------ accounts table
const CHIPS = [['all', 'الكل'], ['owner', 'المالك'], ['admin', 'أدمن'], ['supervisor', 'مشرف'], ['store_manager', 'مدراء المتجر'], ['professor', 'دكاترة'], ['assistant', 'مساعدون'], ['reseller', 'مندوبون'], ['representative', 'ممثلون'], ['student', 'طلاب']];
export function Accounts() {
  const A = useAdmin();
  const { accounts, error, reload, profBy } = usePeople();
  const f = useUserForms(A, reload);
  const [role, setRole] = useState('all'); const [q, setQ] = useState(''); const [shown, setShown] = useState(100);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (accounts || []).filter(a => (role === 'all' || a.role === role) && (!s || a.full_name.toLowerCase().includes(s) || a.email.toLowerCase().includes(s) || (a.phone || '').includes(s)));
  }, [accounts, role, q]);
  if (error) return <Card>{error}</Card>;
  if (!accounts) return <Loading />;
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
              <td><div className="cell-user"><div className="cell-avatar" style={{ background: 'var(--accent)' }}>{initialsOf(a.full_name)}</div><div><div className="cell-name">{a.full_name}</div><div className="cell-sub mono">{a.email}</div></div></div></td>
              <td className="mono" dir="ltr" style={{ textAlign: 'end' }}>{a.phone || '—'}</td>
              <td><RoleBadge role={a.role} />{a.verified_at ? <> <Badge kind="active">✓ موثّق</Badge></> : null}
                {a.role === 'professor' && (profBy[a.id]?.subject_name ? <div className="cell-sub">{profBy[a.id].subject_name}</div>
                  : <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '.66rem', marginTop: 4, color: 'var(--danger)' }} onClick={() => f.assignSubject(a)}>⚠ بدون مادة — أسنِد</button>)}</td>
              <td>{a.is_banned ? <Badge kind="disabled">محظور</Badge> : <Badge kind="active">نشط</Badge>}</td>
              <td><div className="cell-sub">انضم {fmtDate(a.created_at)}</div><div className="cell-sub">آخر دخول {fmtDate(a.last_login)}</div></td>
              <RowActions>
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
          <div key={a.id} className="cat-card" onClick={() => f.editUser(a)}>
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
