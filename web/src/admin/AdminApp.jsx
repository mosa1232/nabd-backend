import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/app.jsx';
import { apiFetch, post } from '../lib/api.js';
import { useAreaStyle } from '../lib/useStyle.js';

const loadAdminCss = () => (import.meta.env.PROD ? import('./admin.css?url') : import('./admin.css?inline'));
import { ax, installHeaders, clearHeaders } from './state.js';
import { ROLE_LABELS, NAV_GROUP, itemsFor, isDashboardRole, viewAsGroupOf, permsOf, VIEWAS_WORD, VIEWAS_VIEW_GROUPS } from './nav.js';
import { Icon, DialogProvider, useDialogs } from './ui.jsx';
import { AdminCtx } from './ctx.js';
import AiAssistant from './AiAssistant.jsx';
import SECTIONS from './sections/index.jsx';

const NAV_ICONS = ['grid', 'users', 'book', 'student', 'ban', 'media', 'log', 'importexport', 'pdf', 'exam', 'key', 'chat', 'bell'];
const SELECT = { padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit' };

// ------------------------------------------------------------------ sign-in
function AdminLogin() {
  const { startSession, toast, pending } = useApp();
  const dlg = useDialogs();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('');
  const accept = (data) => {
    if (!isDashboardRole(data.user.role)) { setErr('هذا الحساب من نوع "طالب" — لوحة التحكم هذه للأدمن/الدكتور/المندوب فقط'); return; }
    startSession(data);
  };
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!email.trim() || !password) return setErr('أدخل البريد الإلكتروني وكلمة المرور');
    try {
      const data = await post('/auth/login', { email: email.trim(), password });
      if (data.requires_2fa) {
        dlg.form({ title: 'التحقق بخطوتين', fields: [{ id: 'code', label: 'أدخل الرمز من تطبيق المصادقة', placeholder: '123456', dir: 'ltr' }],
          onSubmit: async (v) => {
            if (!/^\d{6}$/.test(v.code.trim())) throw { detail: 'أدخل رمز مكوّن من 6 أرقام' };
            accept(await post('/auth/2fa/verify', { pending_token: data.pending_token, code: v.code.trim() }));
          } });
        return;
      }
      accept(data);
    } catch (e2) { setErr(e2.detail || 'تعذّر تسجيل الدخول — تأكد من البريد وكلمة المرور'); }
  };
  const forgot = () => dlg.form({ title: 'استعادة كلمة المرور', note: 'اكتب بريدك ونرسل لك رابطًا لتعيين كلمة مرور جديدة.', fields: [{ id: 'email', label: 'البريد الإلكتروني', dir: 'ltr' }],
    onSubmit: async (v) => { const r = await post('/auth/forgot-password', { email: v.email.trim() }); toast(r.message || 'إذا كان هذا البريد مسجّلاً، فقد أُرسل إليه رابط'); } });
  return (
    <div className="view" style={{ display: 'block' }}><div className="login-wrap"><div className="login-card glass">
      <div className="login-logo"><img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="Kiur" width="48" height="48" /><span className="display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Kiur — لوحة التحكم</span></div>
      <div className="login-title">تسجيل الدخول</div>
      <div className="login-sub">للأدمن والدكتور والمندوب — بحساب Google أو بالبريد وكلمة المرور</div>
      <button type="button" className="google-btn" onClick={() => { window.location.href = '/auth/google/login?next=admin'; }}><span className="google-mark">G</span><span>الدخول عبر Google</span></button>
      <div className="login-divider">أو بالبريد وكلمة المرور</div>
      <form onSubmit={submit}>
        <div className="form-field"><input type="text" inputMode="email" autoCapitalize="none" spellCheck="false" placeholder="البريد الإلكتروني أو اسم المستخدم" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-field" style={{ marginBottom: 8 }}><input type="password" placeholder="كلمة المرور" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        {err && <div style={{ fontSize: '.78rem', color: 'var(--danger)', marginBottom: 10 }}>{err}</div>}
        <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12 }}>تسجيل الدخول</button>
        <button type="button" onClick={forgot} style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', width: '100%', marginTop: 12, fontSize: '.78rem', fontWeight: 700, color: 'var(--accent)' }}>نسيت كلمة المرور؟</button>
      </form>
    </div></div></div>
  );
}

// ------------------------------------------------------------------ "view as" / "publish in" bar
function ContextBar({ sectionId, group, ctx, onReady }) {
  const { user } = useApp();
  const role = user.role;
  const staff = ['owner', 'admin', 'supervisor'].includes(role);
  const [accounts, setAccounts] = useState([]);
  const [platformInfo, setPlatformInfo] = useState(undefined);   // undefined = loading, null = none
  const [subs, setSubs] = useState([]);                          // a representative's / doctor's subjects
  const [teachers, setTeachers] = useState([]);
  const dlg = useDialogs();

  const { pick, setPick, plat, setPlat } = ctx;
  const g = group;                                              // doctor | reseller | rep | null
  const asRep = role === 'representative' || (staff && g === 'rep');

  // accounts to choose from (staff only)
  useEffect(() => { if (staff && g && !accounts.length) apiFetch('/api/admin/users').then(setAccounts).catch(() => {}); }, [staff, g]); // eslint-disable-line
  useEffect(() => { if (staff && g === 'doctor' && platformInfo === undefined) apiFetch('/api/admin/platform').then(setPlatformInfo).catch(() => setPlatformInfo(null)); }, [staff, g, platformInfo]);

  const list = useMemo(() => accounts.filter(a => a.role === VIEWAS_VIEW_GROUPS[g] && a.email !== 'platform@kiur.internal'), [accounts, g]);
  const canPlatform = staff && g === 'doctor' && !!platformInfo;
  const cur = pick[g] || (canPlatform ? '__platform__' : '');
  const usePlatform = canPlatform && cur === '__platform__';

  // a representative's subjects + doctor names (own account, or the one the owner opened)
  const repKey = asRep ? (role === 'representative' ? 'self' : pick.rep) : '';
  useEffect(() => {
    if (!asRep || !repKey) { setSubs([]); setTeachers([]); return; }
    ax.viewAs = staff ? pick.rep : '';
    apiFetch('/api/professors/me/subjects').then(s => { setSubs(s); if (!s.some(x => x.subject_id === ctx.subject)) ctx.setSubject(s[0] ? s[0].subject_id : ''); }).catch(() => setSubs([]));
    apiFetch('/api/professors/me/teachers').then(setTeachers).catch(() => setTeachers([]));
  }, [asRep, repKey, ctx.version]); // eslint-disable-line

  // publish the request context + tell the section when it may render
  useEffect(() => {
    if (staff && g === 'doctor') {
      ax.viewAs = usePlatform ? '' : cur; ax.subject = usePlatform ? plat.subject : ''; ax.teacher = '';
      onReady(usePlatform ? !!plat.subject : !!cur);
    } else if (staff && g === 'reseller') { ax.viewAs = cur; ax.subject = ''; ax.teacher = ''; onReady(!!cur); }
    else if (asRep) { ax.viewAs = staff ? pick.rep : ''; ax.subject = ctx.subject; ax.teacher = ctx.teacher; onReady(role === 'representative' ? !!ctx.subject : (!!pick.rep && !!ctx.subject) || sectionId === 'rep-codes'); }
    else if (staff && g === 'rep') { ax.viewAs = pick.rep; onReady(!!pick.rep); }
  }); // eslint-disable-line

  const changePick = (v) => { setPick(p => ({ ...p, [g]: v })); ctx.bump(); };
  const sel = SELECT;
  const subLabel = x => `${x.subject_name}${x.department_name ? ' — ' + x.department_name : ''}${x.stage_name ? ' — ' + x.stage_name : ''}`;

  // ----- platform cascade (college type -> university -> department -> stage -> subject)
  const pSubs = usePlatform ? platformInfo.subjects : [];
  const uniq = (arr, f) => { const m = new Map(); arr.forEach(x => { const v = f(x); if (v && !m.has(v.id)) m.set(v.id, v); }); return [...m.values()]; };
  const keys = [['sec', x => x.section, '① نوع الكلية'], ['uni', x => x.university, '② الجامعة'], ['dept', x => x.department, '③ القسم'], ['stage', x => x.stage, '④ المرحلة']];
  const eff = { ...plat }; let pool = pSubs; let open = true; const rows = [];
  keys.forEach(([k, get, label]) => {
    const opts = open ? uniq(pool, get) : [];
    if (open && !eff[k] && opts.length === 1) eff[k] = opts[0].id;
    rows.push({ k, label, opts, locked: !open });
    if (open && eff[k]) pool = pool.filter(x => get(x) && get(x).id === eff[k]); else open = false;
  });
  const subjOpts = open ? pool : [];
  const effSubject = plat.subject || (open && subjOpts.length === 1 && eff.stage ? subjOpts[0].id : '');
  useEffect(() => { if (usePlatform && effSubject && effSubject !== plat.subject) setPlat(p => ({ ...p, subject: effSubject })); }, [usePlatform, effSubject]); // eslint-disable-line
  const setLevel = (k, v) => {
    const order = ['sec', 'uni', 'dept', 'stage'];
    setPlat(p => { const n = { ...p, [k]: v, subject: '' }; order.slice(order.indexOf(k) + 1).forEach(x => { n[x] = ''; }); return n; });
    ctx.bump();
  };
  const setPlatSubject = (v) => { setPlat(p => ({ ...p, subject: v })); try { localStorage.setItem('kiur_platform_subject', v); } catch { /* ignore */ } ctx.bump(); };

  const addTeacher = () => dlg.form({
    title: 'إضافة دكتور', fields: [{ id: 'name', label: 'اسم الدكتور كما يظهر للطلاب (مثال: د. أحمد الجبوري)' }],
    onSubmit: async (v) => {
      if (!(v.name || '').trim()) throw { detail: 'اكتب اسم الدكتور' };
      const t = await post('/api/professors/me/teachers', { name: v.name.trim() });
      ctx.setTeacher(t.id); ctx.bump();
    },
  });

  if (!g && role !== 'representative') return null;
  if (role === 'representative' && !sectionId.startsWith('p-')) return null;
  const curSub = subs.find(x => x.subject_id === ctx.subject);
  return (
    <div id="viewAsBar" style={{ marginBottom: 16 }}>
      <div className="dash-card glass" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px' }}>
        {staff && g && <>
          <span style={{ fontWeight: 800, fontSize: '.86rem' }}>لوحة {VIEWAS_WORD[g]}:</span>
          <select style={{ ...sel, flex: 1, minWidth: 200 }} value={cur} onChange={e => changePick(e.target.value)}>
            {canPlatform && <option value="__platform__">🏛 {platformInfo.name} — باسم المنصة (بدون دكتور)</option>}
            {list.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            {!list.length && !canPlatform && <option value="">لا يوجد حسابات</option>}
          </select>
        </>}
        {usePlatform && <div style={{ flexBasis: '100%', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {rows.map(r => (
            <label key={r.k} style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.7rem', fontWeight: 700, opacity: .9 }}>{r.label}
              <select style={{ ...sel, ...(r.locked ? { opacity: .5 } : null) }} disabled={r.locked} value={eff[r.k] || ''} onChange={e => setLevel(r.k, e.target.value)}>
                <option value="">اختر…</option>{r.opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>))}
          <label style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.7rem', fontWeight: 700, opacity: .9 }}>⑤ المادة
            <select style={{ ...sel, ...(eff.stage ? null : { opacity: .5 }) }} disabled={!eff.stage} value={plat.subject || ''} onChange={e => setPlatSubject(e.target.value)}>
              <option value="">اختر…</option>{(eff.stage ? subjOpts : []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>}
        {asRep && subs.length > 0 && <>
          <span style={{ fontWeight: 800, fontSize: '.86rem' }}>المادة التي تنشر فيها:</span>
          <select style={{ ...sel, flex: 1, minWidth: 220 }} value={ctx.subject} onChange={e => { ctx.setSubject(e.target.value); ctx.bump(); }}>
            {subs.map(x => <option key={x.subject_id} value={x.subject_id}>{subLabel(x)}</option>)}</select>
          <select style={{ ...sel, flex: 1, minWidth: 200 }} value={ctx.teacher} onChange={e => { if (e.target.value === '__new__') addTeacher(); else { ctx.setTeacher(e.target.value); ctx.bump(); } }}>
            <option value="">النشر باسمي (ممثل الدفعة)</option>{teachers.map(t => <option key={t.id} value={t.id}>باسم: {t.name}</option>)}<option value="__new__">＋ إضافة دكتور جديد…</option></select>
        </>}
        {asRep && !subs.length && (role === 'representative' || pick.rep) && <div className="dash-card glass" style={{ padding: '12px 16px' }}>لا توجد مواد ضمن نطاقك كممثل — اطلب من الإدارة ضبط جامعتك ومرحلتك.</div>}
        <span className="cell-sub">
          {usePlatform ? (plat.subject ? `📍 النشر في: ${(pSubs.find(x => x.id === plat.subject) || {}).path || ''} — يظهر للطلاب باسم المنصة.` : '⚠ حدّد: نوع الكلية ← الجامعة ← القسم ← المرحلة ← المادة — لن يُنشر شيء قبل تحديد المكان.')
            : asRep ? (curSub ? `📍 ${ctx.teacher ? 'ما تنشره يظهر للطلاب باسم الدكتور المختار' : 'ما تنشره يظهر للطلاب باسمك (ممثل الدفعة)'} في: ${subLabel(curSub)}` : '')
            : staff && g ? 'أنت تتصرف كصاحب هذا الحساب — ما تغيّره يُحفظ باسمه.' : ''}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ shell
export function Shell() {
  const { user, logout, dark, toggleTheme, toast } = useApp();
  const nav = useNavigate();
  const { section: routeSection } = useParams();
  const dlg = useDialogs();
  const items = useMemo(() => itemsFor(user), [user]);
  const navId = routeSection || (items[0] || {}).id;
  const navItem = items.find(i => i.id === navId) || (routeSection === 'me' ? { id: 'me', label: 'ملفي الشخصي' } : undefined);
  const alias = navItem && navItem.alias;
  const sectionId = alias || navId;
  const staff = ['owner', 'admin', 'supervisor'].includes(user.role);
  const group = staff ? viewAsGroupOf(sectionId, alias ? 'rep' : null) : null;
  const usesBar = (staff && group) || (user.role === 'representative' && sectionId && sectionId.startsWith('p-'));

  const [pick, setPick] = useState({ doctor: '', reseller: '', rep: '' });
  const [plat, setPlat] = useState(() => { let s = ''; try { s = localStorage.getItem('kiur_platform_subject') || ''; } catch { /* ignore */ } return { sec: '', uni: '', dept: '', stage: '', subject: s }; });
  const [subject, setSubject] = useState(''); const [teacher, setTeacher] = useState('');
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(!usesBar);
  const [sbOpen, setSbOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('kiur_nav_open') || 'null') || []); } catch { return new Set(); } });
  const bump = useCallback(() => setVersion(v => v + 1), []);
  const setSubjectX = useCallback((v) => { setSubject(v); ax.subject = v; }, []);
  const setTeacherX = useCallback((v) => { setTeacher(v); ax.teacher = v; }, []);

  useEffect(() => { installHeaders(); return () => clearHeaders(); }, []);
  useEffect(() => { setReady(!usesBar); if (!usesBar) { ax.viewAs = ''; ax.subject = ''; ax.teacher = ''; } }, [sectionId, usesBar]);
  useEffect(() => { document.body.classList.toggle('sb-lock', sbOpen); return () => document.body.classList.remove('sb-lock'); }, [sbOpen]);
  useEffect(() => { setSbOpen(false); window.scrollTo(0, 0); }, [navId]);

  const ctx = useMemo(() => ({ user, perms: permsOf(user), pick, setPick, plat, setPlat, subject, setSubject: setSubjectX, teacher, setTeacher: setTeacherX, version, bump, dialogs: dlg, toast, go: (id) => nav('/admin/' + id) }),
    [user, pick, plat, subject, teacher, version, bump, dlg, toast, nav, setSubjectX, setTeacherX]);

  // sidebar groups
  const grouped = useMemo(() => {
    let cur = null; const order = [];
    items.forEach(it => { if (it.group) cur = it.group; it._g = NAV_GROUP[it.id] || it.group || cur; if (it._g && !order.includes(it._g)) order.push(it._g); });
    return order;
  }, [items]);
  const hasGroups = items.some(it => it._g);
  const isOpen = (g) => openGroups.has(g) || (items.find(i => i.id === navId) || {})._g === g || (!localStorage.getItem('kiur_nav_open') && grouped[0] === g);
  const toggleGroup = (g) => { const next = new Set(openGroups); if (isOpen(g)) next.delete(g); else next.add(g); setOpenGroups(next); try { localStorage.setItem('kiur_nav_open', JSON.stringify([...next])); } catch { /* ignore */ } };

  // unread support conversations: a red badge on «الدعم» (and on its group while that is closed)
  const [unread, setUnread] = useState(0);
  const canSupport = permsOf(user).has('support.manage');
  useEffect(() => {
    if (!canSupport) return undefined;
    let dead = false;
    const tick = () => apiFetch('/api/admin/support/unread').then(r => { if (!dead) setUnread((r && r.threads) || 0); }).catch(() => {});
    tick(); const t = setInterval(tick, 25000);
    return () => { dead = true; clearInterval(t); };
  }, [canSupport]);
  const badgeText = unread > 99 ? '99+' : String(unread);

  const Section = SECTIONS[sectionId];
  const NavBtn = ({ it }) => (
    <button className={'nav-item' + (it.id === navId ? ' active' : '')} onClick={() => nav('/admin/' + it.id)}>
      <Icon n={NAV_ICONS.includes(it.icon) ? it.icon : 'grid'} /><span>{it.label}</span>
      {it.id === 'support' && unread > 0 ? <span className="nav-badge">{badgeText}</span> : null}</button>
  );
  if (!navItem) return <div className="shell active"><div className="main"><div className="dash-content"><div className="dash-card glass">لا توجد صلاحيات مفعّلة لحسابك بعد — تواصل مع مسؤولك</div></div></div></div>;

  return (
    <AdminCtx.Provider value={ctx}>
      <div className="shell active" id="shell">
        <div className={'sidebar-backdrop' + (sbOpen ? ' show' : '')} onClick={() => setSbOpen(false)} />
        <aside className={'sidebar' + (sbOpen ? ' open' : '')} id="sidebar">
          <div className="sidebar-brand">
            <img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="Kiur" width="48" height="48" />
            <div><div className="sidebar-brand-name display">Kiur</div><div className="sidebar-brand-tag">لوحة التحكم</div></div>
            <button className="sidebar-close" onClick={() => setSbOpen(false)} aria-label="إغلاق القائمة">✕</button>
          </div>
          <div className="role-switch"><div className="role-pill active" style={{ cursor: 'default' }}>{ROLE_LABELS[user.role]}</div></div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {!hasGroups ? items.map(it => <NavBtn key={it.id} it={it} />)
              : [...items.filter(it => !it._g).map(it => <NavBtn key={it.id} it={it} />), ...grouped.map(g => {
                const open = isOpen(g);
                return (
                  <div key={g}>
                    <button className={'nav-group' + (open ? '' : ' closed')} onClick={() => toggleGroup(g)}><span>{g}</span><span className="nav-g-badge" style={unread > 0 && !open && items.some(it => it._g === g && it.id === 'support') ? { display: 'flex' } : undefined}>{unread > 0 && !open && items.some(it => it._g === g && it.id === 'support') ? badgeText : ''}</span>
                      <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
                    <div className={'nav-group-body' + (open ? '' : ' closed')}>{items.filter(it => it._g === g).map(it => <NavBtn key={it.id} it={it} />)}</div>
                  </div>
                );
              })]}
          </nav>
          <div className="sidebar-footer">
            <div className="admin-mini" style={{ cursor: 'pointer' }} title="ملفي الشخصي" onClick={() => nav('/admin/me')}>
              <div className="admin-mini-avatar">{(user.full_name || '؟').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('')}</div>
              <div style={{ minWidth: 0 }}><div className="admin-mini-name">{user.full_name}</div><div className="admin-mini-role">{ROLE_LABELS[user.role]}</div></div>
            </div>
            <button className="logout-row" onClick={async () => { await logout(); }}><Icon n="logout" />تسجيل الخروج</button>
          </div>
        </aside>

        <div className="main">
          <div className="dash-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="icon-btn hamburger-btn" onClick={() => setSbOpen(o => !o)} aria-label="القائمة"><Icon n="menu" /></button>
              <div className="dash-title">{navItem.label}</div>
            </div>
            <div className="dash-top-actions">
              <span className="live-badge"><span className="status-dot live" /><span>بيانات حقيقية</span></span>
              <button className="icon-btn" onClick={toggleTheme} aria-label="تبديل المظهر"><Icon n={dark ? 'moon' : 'sun'} /></button>
            </div>
          </div>
          <div className="dash-content" id="dashContent">
            {usesBar && <ContextBar sectionId={sectionId} group={group} ctx={ctx} onReady={setReady} />}
            <section className="dash-section active" id={'sec-' + sectionId}>
              {ready ? (Section ? <Section key={sectionId + '|' + version + '|' + (alias ? 'rep' : '')} /> : <Moving id={sectionId} label={navItem.label} />) : null}
            </section>
          </div>
        </div>
        <AiAssistant user={user} pageTitle={navItem.label} />
      </div>
    </AdminCtx.Provider>
  );
}

function Moving({ label }) {
  return (
    <div className="dash-card glass" style={{ textAlign: 'center', padding: 28 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>«{label}» قيد النقل للنسخة الجديدة</div>
      <div className="item-meta" style={{ marginBottom: 16 }}>تعمل كاملة على لوحة التحكم الحالية.</div>
      <a className="btn" href="/admin-legacy">افتح لوحة التحكم الحالية</a>
    </div>
  );
}

export default function AdminApp() {
  const styled = useAreaStyle(loadAdminCss);
  const { user, booted, logout } = useApp();
  const nav = useNavigate();
  useEffect(() => { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; }, []);
  // a student session found here is signed out: this dashboard is for staff only
  useEffect(() => { if (booted && user && !isDashboardRole(user.role)) logout(); }, [booted, user, logout]);
  if (!booted || !styled) return null;
  return (
    <DialogProvider>
      {user && isDashboardRole(user.role) ? <ShellRoutes nav={nav} /> : <AdminLogin />}
      <ToastHost />
    </DialogProvider>
  );
}
function ShellRoutes() { return <Shell />; }
function ToastHost() {
  const { toasts } = useApp();
  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none', width: '100%', maxWidth: 420, padding: '0 16px' }}>
      {toasts.map(x => <div key={x.id} style={{ pointerEvents: 'auto', background: x.error ? 'var(--danger)' : 'var(--ink)', color: '#fff', padding: '12px 18px', borderRadius: 12, fontSize: '.85rem', boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '100%', textAlign: 'center' }}>{x.message}</div>)}
    </div>
  );
}
export { Navigate };
