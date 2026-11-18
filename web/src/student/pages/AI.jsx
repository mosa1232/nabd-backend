import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp, dateLocale } from '../../lib/app.jsx';
import { apiFetch, post, put, del } from '../../lib/api.js';
import { aiPage } from '../aiContext.js';
import { useLoad, Empty, asUtc } from '../ui.jsx';

const SPARK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>;
const I_DUP = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
const I_DEL = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>;
const I_OPEN = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
const I_SHARE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4" /></svg>;
const I_PLUS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;

// A small, safe markdown: **bold**, `code`, bullet and numbered lists. Built as React nodes — nothing is ever injected as HTML.
function inline(text) {
  const out = []; const re = /\*\*(.+?)\*\*|`([^`]+)`/g; let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <b key={k++}>{m[1]}</b> : <code key={k++}>{m[2]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function Md({ text }) {
  const blocks = []; let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  (text || '').split('\n').forEach((ln, i) => {
    const b = ln.match(/^\s*[-*•]\s+(.*)/), n = ln.match(/^\s*\d+[.)]\s+(.*)/);
    if (b || n) {
      const tag = b ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [], key: 'l' + i }; }
      list.items.push((b || n)[1]);
    } else { flush(); if (ln.trim()) blocks.push({ tag: 'p', text: ln, key: 'p' + i }); }
  });
  flush();
  return blocks.map(bl => bl.tag === 'p' ? <p key={bl.key}>{inline(bl.text)}</p>
    : bl.tag === 'ul' ? <ul key={bl.key}>{bl.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>
      : <ol key={bl.key}>{bl.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>);
}

async function copyText(txt, toast, t) {
  try { await navigator.clipboard.writeText(txt); }
  catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); }
  toast(t('aiCopiedToast'));
}

export function AiList() {
  const { t, lang, toast } = useApp();
  const nav = useNavigate();
  const [rows, reload, err] = useLoad(() => apiFetch('/api/ai/conversations'), []);
  const create = async () => { try { const c = await post('/api/ai/conversations'); nav('/ai/' + c.id); } catch (e) { toast(e.detail || t('aiUnavailable')); } };
  const dup = async (id) => { try { await post(`/api/ai/conversations/${id}/duplicate`); toast(t('aiDupToast')); reload(); } catch (e) { toast(e.detail || ''); } };
  const rm = async (id) => { if (!window.confirm(t('aiDelConfirm'))) return; try { await del('/api/ai/conversations/' + id); toast(t('aiDelToast')); reload(); } catch (e) { toast(e.detail || ''); } };
  return (
    <div className="view active">
      <div className="page-head">
        <div className="page-head-main">
          <button className="icon-btn page-back" onClick={() => nav('/')} aria-label="back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
          <div><div className="page-title">{t('aiNavTitle')}</div><div className="page-sub">{t('aiListSub')}</div></div>
        </div>
        <button className="btn" onClick={create}>{t('aiNew')}</button>
      </div>
      <div className="aic-list">
        {rows === undefined ? <Empty>{t('loading')}</Empty> : rows === null ? <Empty>{err?.detail || t('aiUnavailable')}</Empty> : !rows.length
          ? <div className="aic-empty"><span className="aic-big">{SPARK}</span><b>{t('aiNavTitle')}</b><p>{t('aiEmptyList')}</p><button className="btn" onClick={create}>{t('aiNew')}</button></div>
          : rows.map(c => (
            <div className="aic-card" key={c.id}>
              <span className="aic-av">{SPARK}</span>
              <button className="aic-main" onClick={() => nav('/ai/' + c.id)}><b>{c.title}</b>{c.preview ? <span>{c.preview}</span> : null}
                <small>{c.count} {t('aiMsgsN')} · {asUtc(c.updated_at).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })}</small></button>
              <div className="aic-btns">
                <button title={t('aiOpenTab')} onClick={() => window.open(location.origin + '/ai/' + c.id, '_blank')}>{I_OPEN}</button>
                <button title={t('aiDup')} onClick={() => dup(c.id)}>{I_DUP}</button>
                <button className="del" title={t('aiDel')} onClick={() => rm(c.id)}>{I_DEL}</button>
              </div>
            </div>))}
      </div>
    </div>
  );
}

export function AiChat() {
  const { id } = useParams();
  const { t, toast } = useApp();
  const nav = useNavigate();
  const [conv, setConv] = useState(undefined);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => {
    let off = false; setConv(undefined);
    apiFetch('/api/ai/conversations/' + id).then(c => { if (!off) setConv(c); }).catch(e => { toast(e.detail || t('aiUnavailable')); nav('/ai', { replace: true }); });
    return () => { off = true; };
  }, [id]); // eslint-disable-line
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [conv, busy]);

  const send = async (override) => {
    const content = (override ?? text).trim();
    if (!content || busy || !conv) return;
    setText(''); setErr(''); setBusy(true);
    setConv(c => ({ ...c, messages: [...c.messages, { id: 'tmp', role: 'user', content }] }));
    try {
      const r = await post(`/api/ai/conversations/${id}/messages`, { content });
      setConv(c => ({ ...c, title: r.title || c.title, messages: [...c.messages.filter(m => m.id !== 'tmp'), r.user, r.assistant] }));
    } catch (e) {
      setConv(c => ({ ...c, messages: c.messages.filter(m => m.id !== 'tmp') }));
      setErr(e.detail || t('aiUnavailable')); setText(content);
    } finally { setBusy(false); }
  };
  const transcript = () => conv.title + '\n\n' + conv.messages.map(m => (m.role === 'user' ? t('aiYouLbl') : t('aiBotLbl')) + ': ' + m.content).join('\n\n') + '\n\n— Kiur';
  const rename = async () => {
    const name = window.prompt(t('aiRenamePrompt'), conv.title);
    if (!name || !name.trim()) return;
    try { const r = await put('/api/ai/conversations/' + id, { title: name.trim() }); setConv(c => ({ ...c, title: r.title })); } catch (e) { toast(e.detail || ''); }
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: conv.title, text: transcript() }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(transcript(), toast, t);
  };
  const dup = async () => { try { await post(`/api/ai/conversations/${id}/duplicate`); toast(t('aiDupToast')); nav('/ai'); } catch (e) { toast(e.detail || ''); } };
  const rm = async () => { if (!window.confirm(t('aiDelConfirm'))) return; try { await del('/api/ai/conversations/' + id); toast(t('aiDelToast')); nav('/ai'); } catch (e) { toast(e.detail || ''); } };

  const msgs = conv?.messages || [];
  return (
    <div className="view active">
      <div className="page-head">
        <div className="page-head-main">
          <button className="icon-btn page-back" onClick={() => nav('/ai')} aria-label="back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
          <div style={{ minWidth: 0 }}><div className="page-title aic-title" onClick={rename}>{conv ? conv.title : '—'}</div><div className="page-sub">{t('aiTitle')}</div></div>
        </div>
      </div>
      <div className="aic-actions">
        <button className="aic-act" onClick={() => conv && copyText(transcript(), toast, t)}>{I_DUP}<span>{t('aiCopyAll')}</span></button>
        <button className="aic-act" onClick={() => conv && share()}>{I_SHARE}<span>{t('aiShare')}</span></button>
        <button className="aic-act" onClick={dup}>{I_PLUS}<span>{t('aiDup')}</span></button>
        <button className="aic-act" onClick={() => window.open(location.origin + '/ai/' + id, '_blank')}>{I_OPEN}<span>{t('aiOpenTab')}</span></button>
        <button className="aic-act aic-danger" onClick={rm}>{I_DEL}<span>{t('aiDel')}</span></button>
      </div>
      <div className="aic-chat glass">
        <div className="aic-msgs" ref={box}>
          {conv === undefined ? <Empty>{t('loading')}</Empty> : !msgs.length
            ? <div className="aic-empty"><span className="aic-big">{SPARK}</span><b>{t('aiTitle')}</b><p>{t('aiIntro')}</p></div>
            : msgs.map(m => m.role === 'user'
              ? <div className="aic-row user" key={m.id}><div className="aic-msg user">{m.content}</div></div>
              : <div className="aic-row bot" key={m.id}><span className="aic-av">{SPARK}</span><div className="aic-msg bot"><div className="aic-md"><Md text={m.content} /></div>
                <button className="aic-cp" onClick={() => copyText(m.content, toast, t)}>{t('aiCopyMsg')}</button></div></div>)}
          {busy && <div className="aic-row bot"><span className="aic-av">{SPARK}</span><div className="aic-msg bot"><span className="aic-dots"><i /><i /><i /></span></div></div>}
          {err && <div className="aic-msg err">{err}</div>}
        </div>
        {conv && !msgs.length && <div className="ai-sugg">{[t('aiSugg1'), t('aiSugg2'), t('aiSugg3')].map(x => <button key={x} onClick={() => send(x)}>{x}</button>)}</div>}
        <form className="aic-input" onSubmit={e => { e.preventDefault(); send(); }}>
          <textarea rows={1} maxLength={4000} placeholder={t('aiPlaceholder')} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="aic-send" type="submit" disabled={busy} aria-label={t('aiSend')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg></button>
        </form>
      </div>
    </div>
  );
}

// The round button at the corner: on a quiz question it opens a small chat panel
// that knows the question on screen; everywhere else it goes to the saved chats.
export function AiFab() {
  const { t } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState([]);       // [{role, content}]
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [know, setKnow] = useState('');
  const msgs = useRef(null);
  const onQuiz = loc.pathname.startsWith('/quiz/');
  const hidden = loc.pathname.startsWith('/ai');
  useEffect(() => { if (!onQuiz) setOpen(false); }, [onQuiz]);
  useEffect(() => { if (msgs.current) msgs.current.scrollTop = msgs.current.scrollHeight; }, [hist, busy, open]);
  useEffect(() => {
    if (!open || know) return;
    apiFetch('/api/ai/status').then(st => { if (st.knowledge.questions) setKnow(`${t('aiTrained')} ${st.knowledge.questions.toLocaleString('en-US')} ${t('aiQuestions')}`); }).catch(() => {});
  }, [open]); // eslint-disable-line

  if (hidden) return null;
  const ask = async (content, withQuestion = true) => {
    content = (content ?? text).trim(); if (!content || busy) return;
    setText(''); setErr('');
    const next = [...hist, { role: 'user', content }];
    setHist(next); setBusy(true);
    try {
      const res = await post('/api/ai/chat', { messages: next.slice(-12), context: withQuestion ? aiPage.get() : '' });
      setHist(h => [...h, { role: 'assistant', content: res.reply, sources: res.mode === 'ai' ? res.sources : null }]);
    } catch (e) { setHist(next.slice(0, -1)); setErr(e.detail || t('aiUnavailable')); setText(content); }
    finally { setBusy(false); }
  };
  const sugg = [t('aiSugg1'), t('aiSugg2'), t('aiSugg3')];
  if (aiPage.get()) sugg.unshift(t('aiExplainQ'));
  return (
    <>
      <button className="ai-fab" style={{ display: 'grid' }} aria-label={t('aiNavTitle')} title={t('aiNavTitle')} onClick={() => (onQuiz ? setOpen(o => !o) : nav('/ai'))}>{SPARK}</button>
      <div className={'ai-panel' + (open ? ' open' : '')} role="dialog" aria-label={t('aiNavTitle')}>
        <div className="ai-head"><span style={{ flex: 1 }}><span>{t('aiTitle')}</span><br /><span className="ai-know">{know}</span></span>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => { setHist([]); setErr(''); }} aria-label="↺" title="↺">↺</button>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} aria-label="✕">✕</button>
        </div>
        <div className="ai-msgs" ref={msgs}>
          {!hist.length && <div className="ai-msg bot">{t('aiIntro')}</div>}
          {hist.map((m, i) => <Fragment key={i}>
            <div className={'ai-msg ' + (m.role === 'user' ? 'user' : 'bot')}>{m.content}</div>
            {m.sources && m.sources.length ? <div className="ai-src">📚 {t('aiSources')}: {m.sources.map(s => s.text.slice(0, 60)).join(' · ')}</div> : null}
          </Fragment>)}
          {busy && <div className="ai-msg bot">…</div>}
          {err && <div className="ai-msg err">{err}</div>}
        </div>
        {!hist.length && <div className="ai-sugg">{sugg.map((x, i) => <button key={i} onClick={() => ask(x, x === t('aiExplainQ'))}>{x}</button>)}</div>}
        <div className="ai-input">
          <textarea placeholder={t('aiPlaceholder')} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <button className="btn" disabled={busy} onClick={() => ask()}>{t('aiSend')}</button>
        </div>
      </div>
    </>
  );
}
