import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { Toasts } from '../Shell.jsx';
import { useLoad, Empty } from '../ui.jsx';

// Shown instead of the app when the account is banned: the reason, and a way to appeal.
export function Banned() {
  const { logout, toasts } = useApp();
  const nav = useNavigate();
  const [s, reload, err] = useLoad(() => apiFetch('/api/bans/mine'), []);
  const [text, setText] = useState(''); const [msg, setMsg] = useState('');
  const send = async () => {
    const message = text.trim(); if (!message) return;
    try { await post('/api/bans/appeal', { message }); setText(''); setMsg(''); reload(); } catch (e) { setMsg(e.detail || 'تعذّر إرسال الطعن'); }
  };
  const form = (
    <div className="glass" style={{ padding: '16px 18px' }}>
      <div className="form-field" style={{ marginBottom: 8 }}><input type="text" placeholder="اكتب سبب الطعن..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} /></div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 11 }} onClick={send}>إرسال الطعن</button>
      <div style={{ fontSize: '.78rem', marginTop: 8, textAlign: 'center', color: 'var(--danger)' }}>{msg}</div>
    </div>
  );
  return (
    <>
      <div className="view active">
        <div className="quiz-top"><div className="quiz-count">الحساب محظور</div><div style={{ width: 38 }} /></div>
        <div className="prof-header glass">
          <div className="prof-header-avatar" style={{ background: 'linear-gradient(145deg, var(--danger), #ff8b8f)' }}>⛔</div>
          <div><div className="prof-header-name">تم إيقاف هذا الحساب</div><div className="prof-header-title">{s && s.reason ? 'السبب: ' + s.reason : '—'}</div></div>
        </div>
        <div className="section-block">
          <div className="section-title">تقديم طعن</div>
          {s === undefined ? null : s === null ? <Empty>{err?.detail || 'تعذّر الاتصال بالخادم'}</Empty>
            : s.status === 'appealed' ? <div className="glass" style={{ padding: '16px 18px' }}><div style={{ fontWeight: 700, marginBottom: 6 }}>طعنك قيد المراجعة</div><div style={{ fontSize: '.82rem', color: 'var(--ink-soft)' }}>"{s.appeal_message}"</div></div>
              : s.status === 'active' && s.appeal_message ? <>
                <div className="glass" style={{ padding: '16px 18px', marginBottom: 12 }}><div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>تم رفض الطعن السابق</div><div style={{ fontSize: '.82rem', color: 'var(--ink-soft)' }}>"{s.appeal_message}"</div></div>{form}</>
                : form}
        </div>
        <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', padding: 13 }} onClick={async () => { await logout(); nav('/welcome'); }}><Ic n="logout" />تسجيل الخروج</button>
      </div>
      <Toasts toasts={toasts} />
    </>
  );
}
