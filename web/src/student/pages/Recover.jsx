import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { post } from '../../lib/api.js';
import { Toasts } from '../Shell.jsx';

function Card({ title, sub, children }) {
  const { toasts } = useApp();
  useEffect(() => { document.body.classList.add('auth-mode'); return () => document.body.classList.remove('auth-mode'); }, []);
  return (
    <>
      <div className="view active"><div className="auth-view"><div className="auth-card glass">
        <div className="auth-logo"><img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="Kiur" width="48" height="48" /><span className="display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Kiur</span></div>
        <div className="auth-title">{title}</div><div className="auth-sub">{sub}</div>
        {children}
      </div></div></div>
      <Toasts toasts={toasts} />
    </>
  );
}
const Msg = ({ m }) => (m ? <div style={{ fontSize: '.8rem', marginTop: 12, textAlign: 'center', lineHeight: 1.8, color: m.ok === true ? 'var(--success)' : m.ok === false ? 'var(--danger)' : 'var(--ink-faint)' }}>{m.text}</div> : null);

export function Forgot() {
  const { t } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState(''); const [m, setM] = useState(null);
  const send = async () => {
    if (!email.trim()) return setM({ ok: false, text: t('enterEmailFirst') });
    setM({ ok: null, text: t('sending') });
    try { const r = await post('/auth/forgot-password', { email: email.trim() }); setM({ ok: true, text: r.message || t('resetLinkSent') }); }
    catch (e) { setM({ ok: false, text: e.detail || t('resetSendFailed') }); }
  };
  return (
    <Card title={t('forgotTitle')} sub={t('forgotSub')}>
      <div className="form-field"><input type="text" inputMode="email" autoCapitalize="none" spellCheck="false" placeholder={t('email')} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} /></div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 13 }} onClick={send}>{t('forgotSendBtn')}</button>
      <Msg m={m} />
      <button type="button" onClick={() => nav('/login')} style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', width: '100%', marginTop: 14 }}><span className="link-accent">{t('backToLogin')}</span></button>
    </Card>
  );
}

export function Reset() {
  const { t, pending } = useApp();
  const nav = useNavigate();
  const [p, setP] = useState(''); const [p2, setP2] = useState(''); const [m, setM] = useState(null);
  const save = async () => {
    if (p.length < 8) return setM({ ok: false, text: t('passwordTooShort') });
    if (p !== p2) return setM({ ok: false, text: t('passwordsDoNotMatch') });
    setM({ ok: null, text: t('saving') });
    try {
      await post('/auth/reset-password', { token: pending.current.reset, new_password: p });
      pending.current.reset = null;
      setM({ ok: true, text: t('passwordResetDone') });
      setTimeout(() => nav('/login'), 1600);
    } catch (e) { setM({ ok: false, text: e.detail || t('resetFailed') }); }
  };
  return (
    <Card title={t('resetTitle')} sub={t('resetSub')}>
      <div className="form-field"><input type="password" placeholder={t('newPasswordPlaceholder')} value={p} onChange={e => setP(e.target.value)} /></div>
      <div className="form-field"><input type="password" placeholder={t('repeatPasswordPlaceholder')} value={p2} onChange={e => setP2(e.target.value)} /></div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 13 }} onClick={save}>{t('resetSaveBtn')}</button>
      <Msg m={m} />
    </Card>
  );
}
