import { useEffect, useRef, useState } from 'react';
import { apiFetch, post, put, del, upload, mediaUrl } from '../../lib/api.js';
import { useApp } from '../../lib/app.jsx';
import { useAdmin } from '../ctx.js';
import { Card, Loading, Badge, useData } from '../ui.jsx';

const initialsOf = (n) => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const fmtDT = (iso) => (iso ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z').toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
function ago(iso) {
  if (!iso) return 'لم يظهر';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (m < 1) return 'الآن'; if (m < 60) return `قبل ${m} د`; if (m < 1440) return `قبل ${Math.round(m / 60)} س`; if (m < 43200) return `قبل ${Math.round(m / 1440)} يوم`;
  return d.toLocaleDateString('en-GB');
}

// ------------------------------------------------------------------ support inbox (chats with students)
function Thread({ id, back }) {
  const A = useAdmin();
  const [d, setD] = useState(null); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const load = async (quiet) => {
    try { const x = await apiFetch('/api/admin/support/threads/' + id); setD(prev => (quiet && prev && JSON.stringify([prev.status, prev.messages.map(m => m.id)]) === JSON.stringify([x.status, x.messages.map(m => m.id)]) ? prev : x)); }
    catch (e) { A.toast(e.detail || 'تعذّر فتح المحادثة', 'error'); back(); }
  };
  useEffect(() => { load(false); const t = setInterval(() => load(true), 6000); return () => clearInterval(t); }, [id]); // eslint-disable-line
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [d && d.messages.length]); // eslint-disable-line
  if (!d) return <Loading />;
  const st = d.student;
  const send = async () => {
    const body = text.trim(); if (!body) return; setBusy(true);
    try { await post(`/api/admin/support/threads/${id}/messages`, { body }); setText(''); await load(false); } catch (e) { A.toast(e.detail || 'تعذّر الإرسال', 'error'); } finally { setBusy(false); }
  };
  const setStatus = async (status) => {
    try { await post(`/api/admin/support/threads/${id}/status`, { status }); A.toast(status === 'closed' ? 'أُغلقت المحادثة' : 'أُعيد فتح المحادثة'); if (status === 'closed') back(); else load(false); } catch (e) { A.toast(e.detail || 'تعذّر التنفيذ', 'error'); }
  };
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={back}>→ المحادثات</button>
        <span style={{ marginInlineStart: 'auto' }}><button className="btn btn-ghost" onClick={() => setStatus(d.status === 'open' ? 'closed' : 'open')}>{d.status === 'open' ? 'تم الحل — إغلاق المحادثة' : 'إعادة فتح'}</button></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div className="cell-avatar" style={{ background: 'var(--accent)', width: 48, height: 48 }}>{initialsOf(st.name)}</div>
        <div><div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{st.name} {d.status === 'closed' ? <span className="badge">مغلقة</span> : null}</div>
          <div className="cell-sub" dir="auto">{st.email}{st.phone ? ' · ' + st.phone : ''}{st.university ? ' · ' + st.university : ''}{st.stage ? ' · ' + st.stage : ''}{st.banned ? <> · <b style={{ color: 'var(--danger)' }}>محظور</b></> : null}</div></div>
      </div>
      <div className="sup-msgs" ref={box}>{d.messages.map(m => <div key={m.id} className={'sup-msg ' + (m.from_staff ? 'staff' : 'student')}>{m.body}<small>{m.from_staff ? (m.staff_name || 'الدعم') + ' · ' : ''}{fmtDT(m.at)}</small></div>)}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
        <textarea rows={2} maxLength={2000} disabled={busy} placeholder="اكتب ردّك... (Enter للإرسال، Shift+Enter لسطر جديد)" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, padding: '12px 14px', borderRadius: 14, border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', resize: 'vertical' }} />
        <button className="btn" disabled={busy} onClick={send}>إرسال</button>
      </div>
      {d.status === 'closed' && <div className="cell-sub" style={{ marginTop: 8 }}>المحادثة مغلقة — أي رد منك يعيد فتحها.</div>}
    </Card>
  );
}
export function Support() {
  const [filter, setFilter] = useState('open'); const [q, setQ] = useState(''); const [open, setOpen] = useState(null); const [qd, setQd] = useState('');
  useEffect(() => { const t = setTimeout(() => setQd(q), 300); return () => clearTimeout(t); }, [q]);
  const { data: rows, error, reload } = useData(() => apiFetch(`/api/admin/support/threads?status=${filter}&q=${encodeURIComponent(qd)}`), [filter, qd]);
  if (open) return <Thread id={open} back={() => { setOpen(null); reload(); }} />;
  return (
    <Card title="الدعم — محادثات الطلاب">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {[['open', 'مفتوحة'], ['closed', 'مغلقة'], ['all', 'الكل']].map(([k, l]) => <button key={k} className={'cat-tab' + (k === filter ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>)}
        <input className="search-input" placeholder="ابحث باسم الطالب أو بريده..." value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      </div>
      {error ? <div className="empty-row">{error}</div> : !rows ? <Loading /> : rows.map(r => (
        <div key={r.id} className={'sup-row' + (r.unread ? ' unread' : '')} onClick={() => setOpen(r.id)}>
          <div className="cell-avatar" style={{ background: 'var(--accent)' }}>{initialsOf(r.student.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>{r.student.name} {r.status === 'closed' ? <span className="badge">مغلقة</span> : null}</div>
            <div className="cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.last_from_staff ? 'أنت: ' : ''}{r.last}</div></div>
          <div style={{ textAlign: 'end', flex: 'none' }}><div className="cell-sub">{fmtDT(r.updated_at)}</div>{r.unread ? <span className="sup-pill">{r.unread}</span> : null}</div>
        </div>
      ))}
      {rows && !rows.length && <div className="empty-row">{filter === 'open' ? 'لا توجد محادثات مفتوحة 🎉' : 'لا توجد محادثات'}</div>}
    </Card>
  );
}

// ------------------------------------------------------------------ my profile (any staff account)
export function MyProfile() {
  const A = useAdmin(); const { user, setUser } = useApp();
  const [f, setF] = useState({ name: user.full_name, phone: user.phone || '', caption: user.caption || '' });
  const [pw, setPw] = useState({ old: '', n1: '', n2: '' });
  const { data: sessions } = useData(() => apiFetch('/auth/me/sessions').catch(() => []), []);
  const { data: activity } = useData(() => (A.perms.has('dashboard.analytics') ? apiFetch(`/api/admin/logs/search?user_id=${user.id}&limit=8`).then(r => r.items) : Promise.resolve(null)), []);
  const photo = useRef(null);
  const field = { width: '100%', padding: '11px 13px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', fontSize: '.88rem' };
  const Lab = ({ children }) => <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 700, margin: '12px 0 6px' }}>{children}</label>;
  const save = async () => { if (f.name.trim().length < 2) return A.toast('الاسم مطلوب', 'error'); try { setUser(await put('/auth/me/basic', { full_name: f.name.trim(), phone: f.phone, caption: f.caption })); A.toast('تم حفظ بياناتك'); } catch (e) { A.toast(e.detail || 'تعذّر الحفظ', 'error'); } };
  const uploadPhoto = async (file) => { if (!file) return; const fd = new FormData(); fd.append('file', file); try { setUser(await upload('/auth/me/photo', fd)); A.toast('تم تحديث صورتك'); } catch (e) { A.toast(e.detail || 'تعذّر رفع الصورة', 'error'); } };
  const removePhoto = async () => { if (!await A.dialogs.confirm('إزالة صورتك الشخصية؟')) return; try { setUser(await del('/auth/me/photo')); A.toast('أُزيلت الصورة'); } catch (e) { A.toast(e.detail || 'تعذّرت الإزالة', 'error'); } };
  const changePw = async () => {
    if (pw.n1.length < 8) return A.toast('كلمة المرور الجديدة 8 أحرف على الأقل', 'error');
    if (pw.n1 !== pw.n2) return A.toast('كلمتا المرور غير متطابقتين', 'error');
    try { await post('/auth/change-password', { current_password: pw.old, new_password: pw.n1 }); setPw({ old: '', n1: '', n2: '' }); setUser(await apiFetch('/auth/me')); A.toast('تم تغيير كلمة المرور'); } catch (e) { A.toast(e.detail || 'تعذّر التغيير', 'error'); }
  };
  const twofa = () => A.dialogs.form({ title: 'التحقق بخطوتين', submitLabel: 'إغلاق', fields: [{ id: 't', type: 'custom', render: () => <TwoFactor A={A} user={user} setUser={setUser} /> }], onSubmit: async () => {} });
  return (
    <div className="acct-cols">
      <div className="acct-col">
        <Card title="بياناتي">
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <div className="me-avatar">{user.photo_url ? <img src={mediaUrl(user.photo_url)} alt="" /> : initialsOf(user.full_name)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn" onClick={() => photo.current.click()}>{user.photo_url ? 'تغيير الصورة' : 'رفع صورة'}</button>
              {user.photo_url && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={removePhoto}>إزالة الصورة</button>}
              <span className="cell-sub">صورة مربعة أوضح (JPG أو PNG).</span>
              <input ref={photo} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
            </div>
          </div>
          <Lab>الاسم الكامل</Lab><input type="text" maxLength={120} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={field} />
          <Lab>رقم الهاتف</Lab><input type="tel" maxLength={30} dir="ltr" value={f.phone} placeholder="07xxxxxxxxx" onChange={e => setF({ ...f, phone: e.target.value })} style={{ ...field, textAlign: 'start' }} />
          <Lab>المسمى أو نبذة قصيرة (تظهر للطلاب عند ردّك على رسائلهم)</Lab><input type="text" maxLength={200} value={f.caption} placeholder="مثال: مشرف الدعم" onChange={e => setF({ ...f, caption: e.target.value })} style={field} />
          <Lab>البريد الإلكتروني</Lab><input type="text" dir="ltr" value={user.email} disabled style={{ ...field, opacity: .7, textAlign: 'start' }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><Badge kind={user.role}>{user.role}</Badge><span className="cell-sub">انضممت {user.created_at ? fmtDT(user.created_at) : '—'}</span></div>
          <button className="btn" style={{ marginTop: 16 }} onClick={save}>حفظ التغييرات</button>
        </Card>
      </div>
      <div className="acct-col">
        <Card title="كلمة المرور والأمان">
          <div className="cell-sub" style={{ marginBottom: 6 }}>{user.has_password ? 'غيّر كلمة مرورك. سيُسجَّل خروجك من أجهزتك الأخرى.' : 'حسابك يدخل عبر Google — تقدر تحدد كلمة مرور أيضًا.'}</div>
          {user.has_password && <><Lab>كلمة المرور الحالية</Lab><input type="password" autoComplete="current-password" value={pw.old} onChange={e => setPw({ ...pw, old: e.target.value })} style={field} /></>}
          <Lab>كلمة المرور الجديدة (8 أحرف على الأقل)</Lab><input type="password" autoComplete="new-password" value={pw.n1} onChange={e => setPw({ ...pw, n1: e.target.value })} style={field} />
          <Lab>أعد كتابتها</Lab><input type="password" autoComplete="new-password" value={pw.n2} onChange={e => setPw({ ...pw, n2: e.target.value })} style={field} />
          <button className="btn" style={{ marginTop: 14 }} onClick={changePw}>تغيير كلمة المرور</button>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}><b>التحقق بخطوتين</b><span className="cell-sub" style={{ display: 'block' }}>{user.totp_enabled ? 'مفعّل ✓' : 'غير مفعّل — يُنصح بتفعيله لحسابات الإدارة'}</span></span>
            <button className="btn btn-ghost" onClick={twofa}>{user.totp_enabled ? 'إدارته' : 'تفعيله'}</button>
          </div>
        </Card>
        <Card title="أجهزتي">
          {(sessions || []).map((x, i) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--glass-border)', fontSize: '.84rem' }}>
            <span style={{ flex: 1 }}><b>{x.device_label}</b><span className="cell-sub mono" dir="ltr" style={{ display: 'block', textAlign: 'start' }}>{x.ip_address || 'IP غير مسجّل'}</span></span><span className="cell-sub">{fmtDT(x.created_at)}</span><Badge kind="active">نشط</Badge></div>)}
          {sessions && !sessions.length && <div className="empty-row">لا يوجد</div>}
        </Card>
        {activity && <Card title="آخر نشاطي">{activity.map((x, i) => <div key={i} className="activity-row"><span className="activity-dot" /><span className="activity-text">{x.action}</span><span className="activity-time">{ago(x.at)}</span></div>)}{!activity.length && <div className="empty-row">لا يوجد نشاط مسجّل</div>}</Card>}
      </div>
    </div>
  );
}

function TwoFactor({ A, user, setUser }) {
  const [secret, setSecret] = useState(''); const [code, setCode] = useState(''); const [msg, setMsg] = useState(null);
  const refresh = async () => setUser(await apiFetch('/auth/me'));
  const act = async (path, ok) => { try { await post(path, { code: code.trim() }); await refresh(); setMsg({ t: ok, ok: true }); } catch (e) { setMsg({ t: e.detail || 'رمز غير صحيح', ok: false }); } };
  if (user.totp_enabled) return (
    <div>
      <div className="item-card glass" style={{ alignItems: 'center' }}><div className="item-body"><div className="item-title">التحقق بخطوتين مفعّل ✓</div><div className="item-meta">حسابك محمي برمز إضافي من تطبيق المصادقة</div></div></div>
      <div className="form-field" style={{ marginTop: 12 }}><input type="text" placeholder="أدخل الرمز الحالي لتعطيله" value={code} onChange={e => setCode(e.target.value)} /></div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--danger)' }} onClick={() => act('/auth/2fa/disable', 'تم التعطيل ✓')}>تعطيل التحقق بخطوتين</button>
      {msg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.t}</div>}
    </div>
  );
  return (
    <div>
      <div className="item-meta" style={{ marginBottom: 10 }}>التحقق بخطوتين غير مفعّل — فعّله لحماية إضافية لحسابك عبر تطبيق مصادقة مثل Google Authenticator.</div>
      {!secret && <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => { try { setSecret((await post('/auth/2fa/setup')).secret); } catch (e) { A.toast(e.detail || 'تعذّر بدء الإعداد', 'error'); } }}>بدء الإعداد</button>}
      {secret && <>
        <div className="item-meta">افتح تطبيق المصادقة واختر «إدخال المفتاح يدوياً»، ثم أدخل هذا المفتاح:</div>
        <div className="mono" style={{ direction: 'ltr', textAlign: 'center', fontSize: '.95rem', fontWeight: 700, padding: 10, margin: '8px 0', background: 'var(--glass-bg-strong)', borderRadius: 'var(--radius-sm)', letterSpacing: 2 }}>{secret}</div>
        <div className="form-field"><input type="text" placeholder="أدخل الرمز المكوّن من 6 أرقام من التطبيق" value={code} onChange={e => setCode(e.target.value)} /></div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => act('/auth/2fa/enable', 'تم التفعيل ✓')}>تفعيل</button>
      </>}
      {msg && <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.t}</div>}
    </div>
  );
}
