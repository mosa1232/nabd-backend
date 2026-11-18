import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, numLocal, dateLocale } from '../../lib/app.jsx';
import { apiFetch, post, put, del, upload, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { OtpBoxes, deptName } from './Auth.jsx';
import { useLoad, useCatalogTree, fmtDate, asUtc, Empty } from '../ui.jsx';

const svg = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const Chev = () => <svg className="more-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>;
const inkMsg = m => (m ? (m.ok === false ? 'var(--danger)' : m.ok ? 'var(--success, #1f9d68)' : 'var(--ink-faint)') : undefined);

function pathTags(tree, u, t) {
  const section = tree.find(s => s.id === u.section_id);
  const uni = section?.universities.find(x => x.id === u.university_id);
  const stage = uni?.stages.find(x => x.id === u.stage_id);
  const tags = [];
  if (section) tags.push(section.name);
  if (uni) tags.push(uni.name);
  if (u.is_graduate) tags.push(t('graduated')); else if (stage) tags.push(stage.name);
  return { tags, section, uni, stage };
}

function AvatarBox({ u, style, as: As = 'div', ...rest }) {
  const ini = (u.full_name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  return <As className="prof-header-avatar" style={{ background: 'linear-gradient(145deg, var(--accent), var(--accent-2))', overflow: 'hidden', ...style }} {...rest}>
    {u.photo_url ? <img src={mediaUrl(u.photo_url)} alt={u.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ini}</As>;
}

// ---------------------------------------------------------------- overview
function Overview() {
  const { t, lang } = useApp();
  const nav = useNavigate();
  const nf = n => numLocal(n, lang);
  const [st] = useLoad(() => apiFetch('/auth/me/stats'), []);
  const [rows] = useLoad(() => apiFetch('/auth/me/performance'), []);
  const [prog] = useLoad(() => apiFetch('/api/me/progress'), []);
  const [saved] = useLoad(() => apiFetch('/api/me/saved-questions').catch(() => []), []);
  const [hist] = useLoad(() => apiFetch('/auth/me/history'), []);
  const HIST_LABEL = { exam: 'امتحان', order: 'طلب', code: 'تفعيل كود' };
  const HIST_ICON = {
    exam: svg(<><rect x="6" y="4" width="12" height="16" rx="2" /><path d="m9.5 13 2 2 4-4" /></>),
    order: svg(<><path d="M6 8V6a4 4 0 0 1 4 -4h0a4 4 0 0 1 4 4v2" /><rect x="4" y="8" width="16" height="13" rx="2" /></>),
    code: svg(<><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></>),
  };
  const kpi = (v, k, icon) => <div className="kpi-card glass"><div><div className="kpi-value">{v}</div><div className="kpi-label">{t(k)}</div></div><span className="kpi-icon">{svg(icon)}</span></div>;
  const sum = k => (prog || []).reduce((a, r) => a + (r[k] || 0), 0);
  const total = sum('total'), tried = sum('answered');
  const cell = (v, l) => <div className="sd-cell" key={l}><b>{v}</b><span>{t(l)}</span></div>;
  return (
    <div className="tab-panel active">
      <div className="kpi-grid">
        {kpi(st && st.accuracy_pct != null ? st.accuracy_pct + '%' : '—', 'kpiAccuracy', <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>)}
        {kpi(st?.answered_today ?? '—', 'kpiToday', <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>)}
        {kpi(st?.streak_days ?? '—', 'kpiStreak', <path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.7.7-3.2 1.5-4.4C9.4 9.8 12 8 12 3Z" />)}
        {kpi(st?.rank ? <>#{st.rank} <small className="kpi-of">{t('rankOf') === 'rankOf' ? 'of' : t('rankOf')} {st.total_ranked}</small></> : '—', 'kpiRank', <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />)}
      </div>
      <div className="card-grid">
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('subjectSummary')}</span><span className="panel-note">{t('subjectSummaryNote')}</span></div>
          {rows === undefined ? <Empty>{t('loading')}</Empty> : !rows || !rows.length ? <Empty>{t('noSubjectData')}</Empty> : rows.map(r => (
            <div className="mastery-row" key={r.subject_id || r.subject_name}>
              <div className="mastery-top"><span className="mastery-name">{r.subject_name}</span><span className="mastery-meta">{r.correct}/{r.answered} · {r.accuracy_pct}%</span></div>
              <div className="mastery-track"><div className="mastery-fill" style={{ width: r.accuracy_pct + '%' }} /></div>
            </div>))}
        </div>
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('recentActivity')}</span></div>
          <div className="item-list">
            {hist === undefined ? <Empty>جارٍ التحميل...</Empty> : !hist ? <Empty>تعذّر تحميل النشاط</Empty> : !hist.length ? <Empty>ما اكو نشاط مسجّل بعد</Empty> : hist.map((e, i) => (
              <div className="item-card glass" key={i}>
                <div className={'item-icon ' + (e.type === 'exam' ? 'exam' : 'pdf')}>{HIST_ICON[e.type]}</div>
                <div className="item-body"><div className="item-title">{e.title}</div><div className="item-meta">{HIST_LABEL[e.type] || ''} · {e.detail} · {fmtDate(e.at, lang)}</div></div>
              </div>))}
          </div>
        </div>
      </div>
      <div className="panel glass" style={{ marginTop: 16 }}>
        <div className="panel-head"><span className="panel-title">{t('stDetailTitle')}</span></div>
        {prog === undefined ? <Empty>{t('loading')}</Empty> : !prog ? <Empty>{t('noSubjectData')}</Empty> : <>
          <div className="sd-grid">{cell(nf(total), 'stBank')}{cell(nf(tried), 'stTried')}{cell(nf(sum('mastered')), 'stMastered')}{cell(nf(sum('to_review')), 'stReview')}{cell((total ? Math.round(100 * tried / total) : 0) + '%', 'stCoverage')}{cell(nf((saved || []).length), 'stSavedN')}</div>
          {prog.length ? <>
            <div className="item-meta" style={{ margin: '16px 0 6px', fontWeight: 800 }}>{t('stBySubject')}</div>
            {prog.map(r => <div className="mastery-row" key={r.subject_id}><div className="mastery-top"><span className="mastery-name">{r.name}</span><span className="mastery-meta">{r.answered}/{r.total} · {r.accuracy === null ? '—' : r.accuracy + '%'}</span></div>
              <div className="mastery-track"><div className="mastery-fill" style={{ width: (r.total ? Math.round(100 * r.answered / r.total) : 0) + '%' }} /></div></div>)}
          </> : null}
        </>}
      </div>
      <div className="more-list" style={{ marginTop: 16 }}>
        <button className="more-row" onClick={() => nav('/store/orders')}><span className="more-ic">{svg(<><path d="M6 8V6a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2" /><rect x="4" y="8" width="16" height="13" rx="2" /></>)}</span><span className="more-label">{t('ordersTitle')}</span><Chev /></button>
        <button className="more-row" onClick={() => nav('/support')}><span className="more-ic">{svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />)}</span><span className="more-label">{t('moreHelp')}</span><Chev /></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- details
function Details() {
  const { t, lang, user: u } = useApp();
  const nav = useNavigate();
  const tree = useCatalogTree();
  const { section, uni, stage } = pathTags(tree, u, t);
  const none = <span style={{ opacity: .55 }}>{t('detNotSet')}</span>;
  const dt = iso => (iso ? asUtc(iso).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' }) : none);
  const row = (l, v) => <div className="det-row" key={l}><span className="det-l">{t(l)}</span><span className="det-v">{v || none}</span></div>;
  const blk = (title, rows) => <div className="panel glass" style={{ marginBottom: 14 }}><div className="panel-head"><span className="panel-title">{t(title)}</span></div>{rows}</div>;
  return (
    <div className="tab-panel active">
      {blk('detPersonal', [row('detName', u.full_name), row('detUsername', u.username && <span dir="ltr">{u.username}</span>), row('detEmail', <span dir="ltr">{u.email || ''}</span>), row('detPhone', u.phone && <span dir="ltr">{u.phone}</span>)])}
      {blk('detAcademic', [row('detSection', section?.name), row('detUniversity', uni?.name), row('detStage', u.is_graduate ? t('detGrad') : stage?.name), row('detStatus', u.is_graduate ? t('detGrad') : t('detStudent'))])}
      {blk('detAccountInfo', [row('detJoined', dt(u.created_at)), row('detLastLogin', dt(u.last_login)), row('detVerified', u.verified_at ? t('detVerifiedYes') + ' · ' + (u.verified_name || '') : t('detVerifiedNo')), row('detTwoFa', u.totp_enabled ? t('detOn') : t('detOff')), row('detPwChanged', u.password_changed_at ? dt(u.password_changed_at) : '')])}
      <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 14 }} onClick={() => nav('/account/edit')}>{t('detEditBtn')}</button>
    </div>
  );
}

// ---------------------------------------------------------------- learning
const groupByEyebrow = (rows, t) => {
  const m = new Map();
  for (const r of rows) { const k = (r.eyebrow || '').trim() || t('noResults'); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
function TopicCounts({ rows, emptyKey }) {
  const { t } = useApp();
  if (rows === undefined) return <Empty>{t('loading')}</Empty>;
  if (!rows || !rows.length) return <Empty>{t(emptyKey)}</Empty>;
  return groupByEyebrow(rows, t).slice(0, 8).map(([name, n]) => (
    <div className="mastery-row" key={name}><div className="mastery-top"><span className="mastery-name">{name}</span><span className="mastery-meta">{n} {t('questionsCount')}</span></div>
      <div className="mastery-track"><div className="mastery-fill" style={{ width: Math.round(n / rows.length * 100) + '%' }} /></div></div>));
}
const CODE_VALIDITY_DAYS = 365;
function Learning() {
  const { t } = useApp();
  const nav = useNavigate();
  const [mist] = useLoad(() => apiFetch('/api/me/mistakes'), []);
  const [saved] = useLoad(() => apiFetch('/api/me/saved-questions'), []);
  const [acts, reload] = useLoad(() => apiFetch('/api/activation/mine'), []);
  const [code, setCode] = useState(''); const [msg, setMsg] = useState(null);
  const redeem = async () => {
    const c = code.trim(); if (!c) return;
    setMsg({ ok: null, text: 'جارٍ التفعيل...' });
    try { const r = await post('/api/activation/redeem', { code: c }); setCode(''); setMsg({ ok: true, text: 'تم التفعيل بنجاح — ' + r.subject_name }); reload(); }
    catch (e) { setMsg({ ok: false, text: e.detail || 'تعذّر تفعيل الكود — تأكد من صحته أو أن الخادم متصل' }); }
  };
  return (
    <div className="tab-panel active">
      <div className="card-grid">
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('weakTopics')}</span><button className="panel-note" onClick={() => nav('/review')} style={{ color: 'var(--accent)' }}>{t('openReview')}</button></div>
          <TopicCounts rows={mist} emptyKey="noWeakTopics" />
        </div>
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('savedQuestions')}</span></div>
          <TopicCounts rows={saved} emptyKey="noSaved" />
        </div>
        <div className="panel glass" style={{ gridColumn: '1/-1' }}>
          <div className="panel-head"><span className="panel-title">{t('activation')}</span></div>
          <div>
            {acts === undefined ? null : !acts ? <Empty>{t('activationsLoadFailed')}</Empty> : !acts.length ? <Empty>{t('noActivationsYet')}</Empty> : acts.map((a, i) => {
              const daysLeft = a.expires_at ? Math.max(0, Math.ceil((asUtc(a.expires_at) - new Date()) / 86400000)) : null;
              const pct = daysLeft != null ? Math.round(Math.min(100, daysLeft / CODE_VALIDITY_DAYS * 100)) : 0;
              return <div className="continue-card glass" style={{ cursor: 'default' }} key={i}><div className="continue-ring" style={{ '--p': pct }} />
                <div className="continue-body"><div className="continue-eyebrow">{a.subject_name}</div><div className="continue-title mono">{a.code_masked}</div>
                  <div className="continue-meta">{daysLeft != null ? t('expiresIn') + ' ' + daysLeft + ' ' + t('days') : ''}</div></div></div>;
            })}
          </div>
          <div className="form-field" style={{ marginBottom: 8 }}><input type="text" placeholder={t('activationCodePlaceholder')} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && redeem()} /></div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 11 }} onClick={redeem}>{t('activateCode')}</button>
          {msg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: inkMsg(msg) }}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- security
function Security() {
  const { t, lang, user, setUser, setDeviceMode, logout } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(null); // 'username' | 'password' | 'totp'
  const flip = k => setOpen(o => (o === k ? null : k));
  const [uname, setUname] = useState(user.username || ''); const [unameMsg, setUnameMsg] = useState(null);
  const [curPw, setCurPw] = useState(''); const [newPw, setNewPw] = useState(''); const [pwMsg, setPwMsg] = useState(null);
  const [sessions] = useLoad(() => apiFetch('/auth/me/sessions'), []);
  const [dev, setDev] = useState(() => { try { return localStorage.getItem('kiur_device') || 'auto'; } catch { return 'auto'; } });

  const saveUname = async () => {
    const v = uname.trim();
    if (!v) return setUnameMsg({ ok: false, text: t('credFill') });
    try { setUser(await post('/auth/me/credentials', { username: v })); setUnameMsg({ ok: true, text: t('unameSaved') }); }
    catch (e) { setUnameMsg({ ok: false, text: e.detail || 'تعذّر الحفظ' }); }
  };
  const savePw = async () => {
    if (!newPw) return setPwMsg({ ok: false, text: 'أدخل كلمة المرور الجديدة' });
    try {
      await post('/auth/change-password', { current_password: curPw, new_password: newPw });
      setPwMsg({ ok: true, text: 'تم تحديث كلمة المرور بنجاح' }); setCurPw(''); setNewPw('');
      try { setUser(await apiFetch('/auth/me')); } catch { /* keep */ }
    } catch (e) { setPwMsg({ ok: false, text: e.detail || 'تعذّر تحديث كلمة المرور' }); }
  };
  const changed = user.password_changed_at;
  const pwMeta = !user.has_password ? t('noPasswordGoogleOnly') : changed ? `${t('passwordSet')} · ${t('lastChanged')} ${asUtc(changed).toLocaleDateString(dateLocale(lang))}` : t('passwordSet');
  const s = sessions && sessions[0];
  let sessMeta = '—';
  if (s) {
    const mins = Math.max(0, Math.round((Date.now() - asUtc(s.created_at)) / 60000));
    const since = mins < 60 ? `منذ ${mins} دقيقة` : mins < 1440 ? `منذ ${Math.round(mins / 60)} ساعة` : `منذ ${Math.round(mins / 1440)} يوم`;
    sessMeta = `${s.device_label}${s.ip_address ? ' · ' + s.ip_address : ''} — دخول ${since} · هذا الجهاز فقط مسموح له بالدخول حالياً`;
  }
  const icoUser = svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>);
  return (
    <div className="tab-panel active">
      <div className="card-grid">
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('security')}</span></div>
          <div className="item-list">
            <div className="item-card glass"><div className="item-icon exam">{icoUser}</div>
              <div className="item-body"><div className="item-title">{t('unameTitle')}</div><div className="item-meta mono" dir="auto">{user.username || t('unameNone')}</div></div>
              <button className="btn btn-ghost item-action" onClick={() => flip('username')}>{t('change')}</button></div>
            {open === 'username' && <div className="glass" style={{ padding: '16px 18px' }}>
              <div className="form-field" style={{ marginBottom: 8 }}><input type="text" dir="ltr" autoCapitalize="none" spellCheck="false" maxLength={30} placeholder={t('unamePlaceholder')} value={uname} onChange={e => setUname(e.target.value)} /></div>
              <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 11 }} onClick={saveUname}>{t('unameSave')}</button>
              {unameMsg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: inkMsg(unameMsg) }}>{unameMsg.text}</div>}
            </div>}
            <div className="item-card glass"><div className="item-icon pdf">{svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>)}</div>
              <div className="item-body"><div className="item-title">{t('changePassword')}</div><div className="item-meta">{pwMeta}</div></div>
              <button className="btn btn-ghost item-action" onClick={() => flip('password')}>{t('change')}</button></div>
            {open === 'password' && <div className="glass" style={{ padding: '16px 18px' }}>
              <div className="form-field"><input type="password" placeholder={t('currentPasswordPlaceholder')} value={curPw} onChange={e => setCurPw(e.target.value)} /></div>
              <div className="form-field" style={{ marginBottom: 8 }}><input type="password" placeholder={t('newPasswordPlaceholder')} value={newPw} onChange={e => setNewPw(e.target.value)} /></div>
              <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 11 }} onClick={savePw}>{t('savePassword')}</button>
              {pwMsg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: inkMsg(pwMsg) }}>{pwMsg.text}</div>}
            </div>}
            <div className="item-card glass"><div className="item-icon exam">{svg(<><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3Z" /><path d="m9.5 12 2 2 4-4" /></>)}</div>
              <div className="item-body"><div className="item-title">{t('twoFactor')}</div><div className="item-meta">{user.totp_enabled ? 'مفعّل — حسابك محمي برمز إضافي' : 'غير مفعّل'}</div></div>
              <button className="btn btn-ghost item-action" onClick={() => flip('totp')}>{user.totp_enabled ? 'تعطيل' : 'تفعيل'}</button></div>
            {open === 'totp' && <TotpForm onDone={() => setOpen(null)} />}
          </div>
        </div>
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('devViewTitle')}</span></div>
          <div className="dev-switch">{[['auto', 'devAuto'], ['phone', 'devPhone'], ['desktop', 'devDesktop']].map(([k, l]) => <button key={k} className={dev === k ? 'on' : ''} onClick={() => { setDeviceMode(k); setDev(k); }}>{t(l)}</button>)}</div>
          <div className="item-meta" style={{ marginTop: 8 }}>{t('devViewNote')}</div>
        </div>
        <div className="panel glass">
          <div className="panel-head"><span className="panel-title">{t('devicesSessions')}</span></div>
          <div className="item-list"><div className="item-card glass"><div className="item-icon exam">{svg(<><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>)}</div>
            <div className="item-body"><div className="item-title">{t('currentDevice')}</div><div className="item-meta">{sessions === undefined ? 'جارٍ التحميل...' : sessMeta}</div></div></div></div>
          <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 12 }} onClick={async () => { await logout(); nav('/welcome'); }}><Ic n="logout" /><span>{t('logout')}</span></button>
        </div>
      </div>
    </div>
  );
}

function TotpForm({ onDone }) {
  const { user, setUser, toast } = useApp();
  const on = !!user.totp_enabled;
  const [secret, setSecret] = useState(null); const [code, setCode] = useState(''); const [msg, setMsg] = useState(null); const [k, setK] = useState(0);
  const start = async () => { try { setSecret((await post('/auth/2fa/setup')).secret); } catch (e) { toast(e.detail || 'تعذّر بدء الإعداد'); } };
  const confirm = async (c) => {
    try {
      await post(on ? '/auth/2fa/disable' : '/auth/2fa/enable', { code: (c || code).trim() });
      setUser(await apiFetch('/auth/me'));
      setMsg({ ok: true, text: on ? 'تم التعطيل ✓' : 'تم التفعيل ✓' }); setTimeout(onDone, 900);
    } catch (e) { setMsg({ ok: false, text: e.detail || 'رمز غير صحيح' }); setCode(''); setK(x => x + 1); }
  };
  return (
    <div className="glass" style={{ padding: '16px 18px' }}>
      {on ? <>
        <div className="item-meta" style={{ textAlign: 'center' }}>أدخل الرمز الحالي لتعطيله</div>
        <OtpBoxes key={k} value={code} onChange={setCode} onComplete={confirm} />
        <button className="btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--danger)' }} onClick={() => confirm()}>تعطيل التحقق بخطوتين</button>
      </> : !secret ? <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={start}>بدء الإعداد</button> : <>
        <div className="item-meta" style={{ marginTop: 10 }}>افتح تطبيق مصادقة مثل Google Authenticator، واختر "إدخال المفتاح يدوياً"، ثم أدخل هذا المفتاح:</div>
        <div className="mono" style={{ direction: 'ltr', textAlign: 'center', fontSize: '.95rem', fontWeight: 700, padding: 10, margin: '8px 0', background: 'var(--track)', borderRadius: 12, letterSpacing: 2 }}>{secret}</div>
        <div className="item-meta" style={{ textAlign: 'center' }}>أدخل الرمز المكوّن من 6 أرقام</div>
        <OtpBoxes key={k} value={code} onChange={setCode} onComplete={confirm} />
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => confirm()}>تفعيل</button>
      </>}
      {msg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: inkMsg(msg) }}>{msg.text}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- page
export function Account() {
  const { t, lang, user } = useApp();
  const nav = useNavigate();
  const tree = useCatalogTree();
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('kiur_acc_tab') || 'overview'; } catch { return 'overview'; } });
  useEffect(() => { try { sessionStorage.setItem('kiur_acc_tab', tab); } catch { /* ignore */ } }, [tab]);
  const { tags } = pathTags(tree, user, t);
  const TABS = [['overview', 'tabOverview'], ['details', 'tabDetails'], ['learning', 'tabLearning'], ['security', 'tabSecurity']];
  return (
    <div className="view active">
      <div className="page-head">
        <div className="page-head-main">
          <button className="icon-btn page-back" onClick={() => nav('/')} aria-label="back"><Ic n="back" sw={2.4} /></button>
          <div><div className="page-title">{t('accountTitle')}</div><div className="page-sub">{t('accountSub')}</div></div>
        </div>
        <span className="page-chip">{new Date().toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <div className="prof-header glass" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <AvatarBox u={user} />
          <div style={{ minWidth: 0 }}>
            <div className="prof-header-name">{user.full_name || '—'}</div>
            <div className="prof-header-title mono">{user.phone || user.email || ''}</div>
            <div className="prof-tags">{tags.map((x, i) => <span key={i} className="prof-tag">{x}</span>)}</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => nav('/account/edit')}>{svg(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />)}<span>{t('editProfile')}</span></button>
      </div>
      <div className="tabs" style={{ marginTop: 16 }}>{TABS.map(([k, l]) => <button key={k} className={'tab-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === 'overview' && <Overview />}
      {tab === 'details' && <Details />}
      {tab === 'learning' && <Learning />}
      {tab === 'security' && <Security />}
    </div>
  );
}

// ---------------------------------------------------------------- edit
export function AccountEdit() {
  const { t, user, setUser, toast } = useApp();
  const nav = useNavigate();
  const tree = useCatalogTree();
  const fileRef = useRef(null);
  const [capOpen, setCapOpen] = useState(false); const [cap, setCap] = useState(user.caption || '');
  const [skills, reloadSkills] = useLoad(() => apiFetch('/auth/me/skills'), []);
  const [newSkill, setNewSkill] = useState('');
  const { tags } = pathTags(tree, user, t);
  const [pathOpen, setPathOpen] = useState(false);
  const [f, setF] = useState({ sec: '', uni: '', dept: '', grad: '', stage: '' });
  const [pathMsg, setPathMsg] = useState(null);

  const photo = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { setUser(await upload('/auth/me/photo', fd)); toast(t('photoUpdated')); } catch { toast(t('photoUploadFailed')); }
  };
  const saveCaption = async () => {
    try { setUser(await put('/auth/me/caption', { caption: cap.trim() })); setCapOpen(false); toast(t('saved')); } catch (e) { toast(e.detail || t('saveFailed')); }
  };
  const addSkill = async () => {
    const text = newSkill.trim(); if (!text) return;
    try { await post('/auth/me/skills', { text }); setNewSkill(''); reloadSkills(); } catch (e) { toast(e.detail || t('addSkillFailed')); }
  };
  const rmSkill = async (id) => { try { await del('/auth/me/skills/' + id); reloadSkills(); } catch (e) { toast(e.detail || t('deleteFailed')); } };

  const openPath = () => {
    if (pathOpen) return setPathOpen(false);
    const sec = tree.find(s => s.id === user.section_id);
    const uni = sec?.universities.find(u => u.id === user.university_id);
    const st = uni?.stages.find(x => x.id === user.stage_id);
    setF({ sec: user.section_id || '', uni: user.university_id || '', dept: st ? deptName(st) : '', grad: user.is_graduate === true ? '1' : user.is_graduate === false ? '0' : '', stage: user.stage_id || '' });
    setPathMsg(null); setPathOpen(true);
  };
  const section = tree.find(s => s.id === f.sec);
  const uni = section?.universities.find(u => u.id === f.uni);
  const depts = useMemo(() => (uni ? [...new Set(uni.stages.map(deptName))] : []), [uni]);
  useEffect(() => { if (uni && depts.length === 1 && f.dept !== depts[0]) setF(x => ({ ...x, dept: depts[0] })); }, [uni, depts]); // eslint-disable-line
  const stages = uni && f.dept ? uni.stages.filter(s => deptName(s) === f.dept) : [];
  const set = (k, v, reset = {}) => setF(x => ({ ...x, [k]: v, ...reset }));
  const savePath = async () => {
    if (!f.sec || !f.uni || f.grad === '') return setPathMsg({ ok: false, text: 'الرجاء تعبئة جميع الحقول' });
    const grad = f.grad === '1';
    if (!grad && !f.stage) return setPathMsg({ ok: false, text: 'الرجاء اختيار المرحلة الدراسية' });
    setPathMsg({ ok: null, text: 'جارٍ الحفظ...' });
    try {
      setUser(await put('/auth/me/profile', { full_name: user.full_name, phone: user.phone || '', section_id: f.sec, university_id: f.uni, is_graduate: grad, stage_id: grad ? null : f.stage }));
      setPathOpen(false); toast(t('pathUpdated'));
    } catch (e) { setPathMsg({ ok: false, text: e.detail || 'تعذّر الحفظ' }); }
  };
  const summary = user.section_id && user.university_id ? (tags.join(' · ') || 'لم تُحدَّد بعد') : 'لم تُحدَّد بعد';
  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/account')} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{t('editProfile')}</div><div style={{ width: 38 }} />
      </div>
      <div className="prof-header glass">
        <AvatarBox u={user} as="button" onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer', border: 'none', position: 'relative' }} aria-label={t('changePhoto')} />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { photo(e.target.files[0]); e.target.value = ''; }} />
        <div>
          <div className="prof-header-name">{user.full_name || '—'}</div>
          <div className="item-meta" style={{ marginTop: 6, cursor: 'pointer' }} onClick={() => { setCap(user.caption || ''); setCapOpen(o => !o); }}>{user.caption || t('addCaptionPrompt')}</div>
          {capOpen && <div className="form-field" style={{ marginTop: 8, maxWidth: 280 }}>
            <input type="text" maxLength={200} placeholder={t('captionPlaceholder')} value={cap} onChange={e => setCap(e.target.value)} />
            <button className="btn btn-ghost" style={{ marginTop: 6, padding: '6px 14px', fontSize: '.75rem' }} onClick={saveCaption}>{t('save')}</button>
          </div>}
        </div>
      </div>
      <div className="section-block">
        <div className="section-title">{t('skills')}</div>
        <div className="glass" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {skills === undefined ? null : !skills ? <span className="item-meta">تعذّر تحميل المهارات</span> : !skills.length ? <span className="item-meta">ما أضفت أي مهارة بعد</span> :
              skills.map(s => <span key={s.id} className="prof-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{s.text}<span onClick={() => rmSkill(s.id)} style={{ cursor: 'pointer', fontWeight: 900 }}>×</span></span>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" maxLength={40} placeholder={t('addSkillPlaceholder')} value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', fontFamily: 'inherit', fontSize: '.85rem', color: 'var(--ink)' }} />
            <button className="btn" style={{ padding: '0 16px', fontSize: '.8rem' }} onClick={addSkill}>{t('add')}</button>
          </div>
        </div>
      </div>
      <div className="section-block">
        <div className="section-title">{t('studyPath')}</div>
        <div className="item-list">
          <div className="item-card glass"><div className="item-icon exam"><Ic n="prof" /></div>
            <div className="item-body"><div className="item-title">{t('sectionUniStage')}</div><div className="item-meta">{summary}</div></div>
            <button className="btn btn-ghost item-action" onClick={openPath}>{t('edit')}</button></div>
          {pathOpen && <div className="glass" style={{ padding: '16px 18px' }}>
            <div className="form-field"><select value={f.sec} onChange={e => set('sec', e.target.value, { uni: '', dept: '', stage: '' })}><option value="">{t('selectSection')}</option>{tree.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="form-field"><select value={f.uni} disabled={!section} onChange={e => set('uni', e.target.value, { dept: '', stage: '' })}><option value="">{t('selectUniversity')}</option>{(section?.universities || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div className="form-field"><select value={f.dept} disabled={!uni} onChange={e => set('dept', e.target.value, { stage: '' })}><option value="">{t('selectDept')}</option>{depts.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            <div className="form-field"><select value={f.grad} onChange={e => set('grad', e.target.value)}><option value="">{t('studentOrGraduate')}</option><option value="0">{t('stillStudent')}</option><option value="1">{t('graduated')}</option></select></div>
            {f.grad !== '1' && <div className="form-field"><select value={f.stage} disabled={!(uni && f.dept)} onChange={e => set('stage', e.target.value)}><option value="">{t('selectStage')}</option>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
            <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 11 }} onClick={savePath}>{t('save')}</button>
            {pathMsg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: inkMsg(pathMsg) }}>{pathMsg.text}</div>}
          </div>}
        </div>
      </div>
    </div>
  );
}
