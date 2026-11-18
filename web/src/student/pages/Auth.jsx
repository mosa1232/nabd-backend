import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post, put } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { Toasts } from '../Shell.jsx';

// Where a freshly signed-in user goes first
export function nextRouteFor(u) {
  if (u && u.profile_complete === false) return '/complete-profile';
  if (u && u.needs_credentials) return '/set-credentials';
  return '/';
}

function AuthPage({ children }) {
  const { toasts } = useApp();
  useEffect(() => { document.body.classList.add('auth-mode'); return () => document.body.classList.remove('auth-mode'); }, []);
  return <><div className="view active"><div className="auth-view">{children}</div></div><Toasts toasts={toasts} /></>;
}

const Field = ({ icon, ...props }) => <div className="signin-field">{icon}<input {...props} /></div>;
const UserIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>;
const MailIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
const LockIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;

export function Login({ register = false }) {
  const { t, startSession, user, booted, pending } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState(register ? 'register' : 'login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => { if (booted && pending.current.twofa) nav('/2fa', { replace: true }); }, [booted, pending, nav]);
  if (booted && user) return <Navigate to={nextRouteFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return setMsg(t('enterEmailPassword') === 'enterEmailPassword' ? 'أدخل البريد الإلكتروني وكلمة المرور' : t('enterEmailPassword'));
    if (mode === 'register' && !name.trim()) return setMsg('أدخل اسمك الكامل');
    setBusy(true); setMsg('');
    try {
      const data = mode === 'register'
        ? await post('/auth/register', { email: email.trim(), password, full_name: name.trim() })
        : await post('/auth/login', { email: email.trim(), password });
      if (data.requires_2fa) { pending.current.twofa = data.pending_token; return nav('/2fa'); }
      const u = startSession(data);
      nav(nextRouteFor(u), { replace: true });
    } catch (err) { setMsg(err.detail || 'تعذّر تسجيل الدخول'); }
    finally { setBusy(false); }
  };

  const google = () => { window.location.href = '/auth/google/login'; };
  const reg = mode === 'register';
  return (
    <AuthPage>
      <form className="signin-form" onSubmit={submit} noValidate>
        <div className="signin-brand"><img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="" width="48" height="48" /><span className="display" style={{ fontSize: '1.15rem', fontWeight: 700 }}>Kiur</span></div>
        <div className="signin-title">{t('welcomeBack')}</div>
        <div className="signin-sub">{t('signinSub')}</div>
        {reg && <><label className="signin-label" htmlFor="authName">{t('fullName')}</label>
          <Field id="authName" icon={UserIcon} type="text" autoComplete="name" placeholder={t('fullName')} value={name} onChange={e => setName(e.target.value)} /></>}
        <label className="signin-label" htmlFor="authEmail">{t('email')}</label>
        <Field id="authEmail" icon={MailIcon} type="text" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" placeholder={t('enterEmail')} value={email} onChange={e => setEmail(e.target.value)} />
        <label className="signin-label" htmlFor="authPassword">{t('password')}</label>
        <Field id="authPassword" icon={LockIcon} type="password" autoComplete={reg ? 'new-password' : 'current-password'} placeholder={t('enterPassword')} value={password} onChange={e => setPassword(e.target.value)} />
        <div className="signin-row"><button className="signin-link" type="button" onClick={() => nav('/forgot')}>{t('forgotPassword')}</button></div>
        {msg && <div className="signin-msg" style={{ display: 'block', color: 'var(--danger)' }}>{msg}</div>}
        <button className="signin-submit" type="submit" disabled={busy}>{reg ? 'إنشاء الحساب' : t('login')}</button>
        <p className="signin-p">
          <span>{reg ? 'عندك حساب؟' : t('noAccount')}</span>
          <button className="signin-link" type="button" onClick={() => { setMode(reg ? 'login' : 'register'); setMsg(''); }}>{reg ? 'سجّل دخولك' : t('createAccount')}</button>
        </p>
        <div className="signin-or">{t('orWith')}</div>
        <button className="signin-social google-btn" type="button" onClick={google}>
          <svg viewBox="0 0 512 512" aria-hidden="true"><path d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456C103.821,274.792,107.225,292.797,113.47,309.408z" fill="#FBBB00" /><path d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z" fill="#518EF8" /><path d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z" fill="#28B446" /><path d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0C318.115,0,375.068,22.126,419.404,58.936z" fill="#F14336" /></svg>
          <span>{t('continueWithGoogleBtn')}</span>
        </button>
        <div className="signin-terms">{t('termsNotice')}</div>
      </form>
    </AuthPage>
  );
}

// six boxes that mirror one code; paste/autofill spreads across them
function OtpBoxes({ value, onChange, onComplete }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const set = (arr) => { const code = arr.join(''); onChange(code); if (/^\d{6}$/.test(code)) onComplete?.(code); };
  const fill = (from, text) => {
    const ds = (text || '').replace(/\D/g, '').split('');
    const arr = [...digits]; let i = from;
    for (const d of ds) { if (i > 5) break; arr[i++] = d; }
    set(arr); refs.current[Math.min(i, 5)]?.focus();
  };
  return (
    <div className="otp-inputs">
      {digits.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }} className={'otp-digit' + (d ? ' filled' : '')} type="text" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} aria-label={String(i + 1)} value={d}
          onChange={e => { const v = e.target.value; if (v.length > 1) return fill(i, v); const arr = [...digits]; arr[i] = v.replace(/\D/g, ''); set(arr); if (arr[i] && i < 5) refs.current[i + 1]?.focus(); }}
          onKeyDown={e => { if (e.key === 'Backspace' && !digits[i] && i > 0) { const arr = [...digits]; arr[i - 1] = ''; set(arr); refs.current[i - 1]?.focus(); e.preventDefault(); } }}
          onPaste={e => { e.preventDefault(); fill(i, e.clipboardData.getData('text')); }} />
      ))}
    </div>
  );
}

export function TotpVerify() {
  const { t, startSession, pending, booted } = useApp();
  const nav = useNavigate();
  const [code, setCode] = useState(''); const [msg, setMsg] = useState(''); const [shake, setShake] = useState(false);
  useEffect(() => { if (booted && !pending.current.twofa) nav('/login', { replace: true }); }, [booted, pending, nav]);
  const submit = async (c = code) => {
    if (!/^\d{6}$/.test(c)) return setMsg('أدخل رمز مكوّن من 6 أرقام');
    try {
      const data = await post('/auth/2fa/verify', { pending_token: pending.current.twofa, code: c });
      pending.current.twofa = null;
      const u = startSession(data);
      nav(nextRouteFor(u), { replace: true });
    } catch (e) { setMsg(e.detail || 'رمز غير صحيح'); setCode(''); setShake(true); setTimeout(() => setShake(false), 500); }
  };
  return (
    <AuthPage>
      <form className="otp-card glass" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
        <button className="otp-exit" type="button" onClick={() => { pending.current.twofa = null; nav('/login'); }} aria-label={t('close')}>×</button>
        <div className="prof-header-avatar" style={{ background: 'linear-gradient(145deg, var(--accent), var(--accent-2))', margin: '0 auto' }}><Ic n="shield" color="#fff" size={22} /></div>
        <span className="otp-heading">{t('totpTitle')}</span>
        <p className="otp-subheading">{t('totpSub')}</p>
        <div className={shake ? 'shake' : ''}><OtpBoxes value={code} onChange={setCode} onComplete={submit} /></div>
        {msg && <div style={{ fontSize: '.78rem', textAlign: 'center', marginTop: -6, color: 'var(--danger)' }}>{msg}</div>}
        <button className="btn otp-verify" type="submit">{t('confirm')}</button>
        <p className="otp-resend"><span>{t('totpNoCodeHint')}</span> <button type="button" onClick={() => { pending.current.twofa = null; nav('/login'); }}>{t('useAnotherAccount')}</button></p>
      </form>
    </AuthPage>
  );
}

export function SetCredentials() {
  const { t, user, setUser, booted } = useApp();
  const nav = useNavigate();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [p2, setP2] = useState(''); const [msg, setMsg] = useState('');
  if (booted && !user) return <Navigate to="/welcome" replace />;
  const submit = async (e) => {
    e.preventDefault();
    if (!u.trim() || !p) return setMsg(t('credFill'));
    if (p !== p2) return setMsg(t('credMismatch'));
    try { const me = await post('/auth/me/credentials', { username: u.trim(), password: p }); setUser(me); nav(nextRouteFor(me), { replace: true }); }
    catch (err) { setMsg(err.detail || 'تعذّر الحفظ'); }
  };
  return (
    <AuthPage>
      <form className="auth-card glass" onSubmit={submit} autoComplete="off">
        <div className="auth-title">{t('credTitle')}</div>
        <div className="auth-sub">{t('credSub')}</div>
        <div className="form-field"><input type="text" dir="ltr" autoCapitalize="none" spellCheck="false" autoComplete="username" maxLength={30} placeholder={t('credUsername')} value={u} onChange={e => setU(e.target.value)} /></div>
        <div className="form-field"><input type="password" autoComplete="new-password" placeholder={t('credPassword')} value={p} onChange={e => setP(e.target.value)} /></div>
        <div className="form-field"><input type="password" autoComplete="new-password" placeholder={t('credPassword2')} value={p2} onChange={e => setP2(e.target.value)} /></div>
        {msg && <div style={{ fontSize: '.78rem', marginBottom: 10, textAlign: 'center', color: 'var(--danger)' }}>{msg}</div>}
        <button className="btn" type="submit" style={{ width: '100%', justifyContent: 'center', padding: 12 }}>{t('credSave')}</button>
      </form>
    </AuthPage>
  );
}

const deptName = st => st.department_name || 'القسم العام';

export function CompleteProfile() {
  const { t, user, setUser, toast, booted } = useApp();
  const nav = useNavigate();
  const [tree, setTree] = useState([]);
  const [f, setF] = useState({ name: user?.full_name || '', phone: '', sec: user?.section_id || '', uni: user?.university_id || '', dept: '', grad: user?.section_id ? '0' : '', stage: user?.stage_id || '' });
  const [code, setCode] = useState(''); const [codeMsg, setCodeMsg] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => { apiFetch('/api/catalog/tree').then(setTree).catch(() => setTree([])); }, []);
  useEffect(() => { if (user?.full_name && !f.name) setF(x => ({ ...x, name: user.full_name })); }, [user]); // eslint-disable-line
  const section = tree.find(s => s.id === f.sec);
  const uni = section?.universities.find(u => u.id === f.uni);
  const depts = useMemo(() => (uni ? [...new Set(uni.stages.map(deptName))] : []), [uni]);
  useEffect(() => {  // a single department is picked for you; a known stage selects its department
    if (!uni) return;
    if (f.stage && !f.dept) { const st = uni.stages.find(x => x.id === f.stage); if (st) return setF(x => ({ ...x, dept: deptName(st) })); }
    if (depts.length === 1 && f.dept !== depts[0]) setF(x => ({ ...x, dept: depts[0] }));
  }, [uni, depts]); // eslint-disable-line
  const stages = uni && f.dept ? uni.stages.filter(st => deptName(st) === f.dept) : [];
  const set = (k, v, reset = {}) => setF(x => ({ ...x, [k]: v, ...reset }));
  if (booted && !user) return <Navigate to="/welcome" replace />;

  const verify = async () => {
    const c = code.trim();
    if (c.length < 4) return setCodeMsg({ ok: false, text: t('verifyEnter') });
    setCodeMsg({ ok: null, text: '…' });
    try {
      const res = await post('/api/verify/redeem', { code: c });
      const me = await apiFetch('/auth/me'); setUser(me);
      toast(t('verifiedOk') + ' ' + (res.verified_name || ''));
      nav(nextRouteFor(me), { replace: true });
    } catch (e) { setCodeMsg({ ok: false, text: e.detail || t('verifyFailed') }); }
  };
  const save = async () => {
    if (!f.name.trim() || !f.sec || !f.uni || f.grad === '') return setMsg({ ok: false, text: 'الرجاء تعبئة الحقول المطلوبة (رقم الهاتف اختياري)' });
    const isGrad = f.grad === '1';
    if (!isGrad && !f.stage) return setMsg({ ok: false, text: 'الرجاء اختيار المرحلة الدراسية' });
    setMsg({ ok: null, text: 'جارٍ الحفظ...' });
    try {
      const me = await put('/auth/me/profile', { full_name: f.name.trim(), phone: f.phone.trim(), section_id: f.sec, university_id: f.uni, is_graduate: isGrad, stage_id: isGrad ? null : f.stage });
      setUser(me); nav(nextRouteFor(me), { replace: true });
    } catch (e) { setMsg({ ok: false, text: e.detail || 'تعذّر حفظ البيانات' }); }
  };
  const col = m => (m.ok === false ? 'var(--danger)' : 'var(--ink-faint)');
  return (
    <AuthPage>
      <div className="auth-card glass">
        <div className="auth-title">{t('completeProfileTitle')}</div>
        <div className="auth-sub">{t('completeProfileSub')}</div>
        <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--track, rgba(0,0,0,.05))', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '.86rem', marginBottom: 2 }}>{t('gateVerifyTitle')}</div>
          <div className="item-meta" style={{ marginBottom: 8 }}>{t('gateVerifySub')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={14} placeholder="XXXX-XXXX" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verify()}
              style={{ flex: 1, minWidth: 0, textTransform: 'uppercase', letterSpacing: '.12em', textAlign: 'center', fontWeight: 700, padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--glass-border, rgba(0,0,0,.15))', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
            <button className="btn" onClick={verify}>{t('verifyBtn')}</button>
          </div>
          {codeMsg && <div style={{ fontSize: '.78rem', marginTop: 8, color: col(codeMsg) }}>{codeMsg.text}</div>}
        </div>
        <div className="item-meta" style={{ textAlign: 'center', marginBottom: 10 }}>{t('gateOrManual')}</div>
        <div className="form-field"><input type="text" placeholder={t('threeDigitName')} value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="form-field"><input type="tel" placeholder={t('phoneOptional')} value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
        <div className="form-field"><select value={f.sec} onChange={e => set('sec', e.target.value, { uni: '', dept: '', stage: '' })}>
          <option value="">{t('selectCollege')}</option>{tree.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="form-field"><select value={f.uni} disabled={!section} onChange={e => set('uni', e.target.value, { dept: '', stage: '' })}>
          <option value="">{t('selectUniversity')}</option>{(section?.universities || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="form-field"><select value={f.dept} disabled={!uni} onChange={e => set('dept', e.target.value, { stage: '' })}>
          <option value="">{t('selectDept')}</option>{depts.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className="form-field"><select value={f.grad} onChange={e => set('grad', e.target.value)}>
          <option value="">{t('studentOrGraduate')}</option><option value="0">{t('stillStudent')}</option><option value="1">{t('graduated')}</option></select></div>
        {f.grad !== '1' && <div className="form-field"><select value={f.stage} disabled={!(uni && f.dept)} onChange={e => set('stage', e.target.value)}>
          <option value="">{t('selectStage')}</option>{stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}</select></div>}
        {msg && <div style={{ fontSize: '.78rem', marginBottom: 10, textAlign: 'center', color: col(msg) }}>{msg.text}</div>}
        <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={save}>{t('saveAndContinue')}</button>
      </div>
    </AuthPage>
  );
}

export function Landing() {
  const { t, user, booted } = useApp();
  const nav = useNavigate();
  if (booted && user) return <Navigate to={nextRouteFor(user)} replace />;
  return (
    <AuthPage>
      <div className="signin-form" style={{ textAlign: 'center' }}>
        <div className="signin-brand" style={{ justifyContent: 'center' }}><img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="" width="64" height="64" /></div>
        <div className="signin-title display" style={{ fontSize: '1.7rem' }}>Kiur</div>
        <div className="signin-sub">{t('footerNote')}</div>
        <button className="signin-submit" onClick={() => nav('/login')}>{t('login')}</button>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: 13, marginTop: 10 }} onClick={() => nav('/register')}>{t('createAccount')}</button>
      </div>
    </AuthPage>
  );
}
