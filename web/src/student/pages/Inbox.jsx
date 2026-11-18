import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post } from '../../lib/api.js';
import { PageHead } from './Bank.jsx';
import { useLoad, Empty, asUtc, fmtDate } from '../ui.jsx';

export function Notifications() {
  const { t, lang } = useApp();
  const [list, , , setList] = useLoad(() => apiFetch('/api/me/notifications'), []);
  const markRead = async (n) => {
    if (n.read) return;
    setList(l => l.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    try { await post('/api/me/notifications/' + n.id + '/read'); } catch { /* the dot is cosmetic */ }
  };
  return (
    <div className="view active">
      <PageHead title={t('notificationsTitle')} sub={t('notificationsSub')} back="/" />
      <div className="item-list" style={{ padding: '0 16px' }}>
        {list === undefined ? <Empty>جارٍ التحميل...</Empty> : !list ? <Empty>تعذّر تحميل الإشعارات</Empty> : !list.length ? <Empty>{t('noNotificationsYet')}</Empty> : list.map(n => (
          <div key={n.id} className="item-card glass" style={{ alignItems: 'flex-start', cursor: 'pointer', ...(n.read ? null : { borderInlineStart: '3px solid var(--accent)' }) }} onClick={() => markRead(n)}>
            <div className="item-body">
              <div className="item-title">{n.title}</div>
              <div className="item-meta">{n.body}</div>
              <div className="item-meta" style={{ opacity: .6 }}>{fmtDate(n.created_at, lang)}</div>
            </div>
          </div>))}
      </div>
    </div>
  );
}

export function Support() {
  const { t, toast } = useApp();
  const [d, setD] = useState(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null); const sig = useRef('');

  const load = async (first) => {
    try {
      const x = await apiFetch('/api/support/thread');
      const s = JSON.stringify([x.thread && x.thread.status, x.messages.map(m => m.id)]);
      if (s === sig.current) return;
      sig.current = s;
      const el = box.current;
      const stick = first || !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 80);
      setD(x);
      if (stick) setTimeout(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, 30);
    } catch { if (first) setD(null); }
  };
  useEffect(() => {
    load(true);
    const h = setInterval(() => load(false), 6000);
    return () => clearInterval(h);
  }, []); // eslint-disable-line

  const send = async () => {
    const body = text.trim(); if (!body || busy) return;
    setBusy(true);
    try { await post('/api/support/messages', { body }); setText(''); sig.current = ''; await load(true); }
    catch (e) { toast(e.detail || 'تعذّر الإرسال'); }
    finally { setBusy(false); }
  };
  const when = iso => { const dt = asUtc(iso); return dt.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) + ' · ' + dt.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' }); };
  return (
    <div className="view active">
      <PageHead title={t('supportTitle')} sub={t('supportSub')} back="/" />
      <div className="sp-chat glass">
        <div className="sp-msgs" ref={box}>
          {d === undefined ? null : d === null ? <div className="sp-empty">تعذّر تحميل المحادثة</div> : d.messages.length ? d.messages.map(m => (
            <div key={m.id} className={'sp-msg ' + (m.from_staff ? 'staff' : 'me')}>{m.body}<small>{m.from_staff ? (m.staff_name || t('supportTeam')) + ' · ' : ''}{when(m.at)}</small></div>
          )) : <div className="sp-empty">{t('supportEmpty')}</div>}
        </div>
        {d && d.thread && d.thread.status === 'closed' && <div className="sp-closed" style={{ display: 'block' }}>{t('supportClosed')}</div>}
        <form className="sp-input" onSubmit={e => { e.preventDefault(); send(); }}>
          <textarea rows={1} maxLength={2000} placeholder={t('supportPlaceholder')} value={text} onChange={e => setText(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn" type="submit" disabled={busy}>{t('supportSend')}</button>
        </form>
      </div>
    </div>
  );
}
