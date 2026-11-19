import { useEffect, useRef, useState } from 'react';
import { apiFetch, post } from '../lib/api.js';

// The floating Kiur assistant of the dashboard (every role): asks /api/ai/chat with the page that is open.
const SUGGESTIONS = {
  professor: ['اقترح 5 أسئلة اختيارات عن موضوع ...', 'كيف أرفع ملف وأولّد منه أسئلة؟', 'كيف أضيف مساعدًا وأحدد صلاحياته؟'],
  assistant: ['ما الذي أستطيع فعله بصلاحياتي؟', 'ساعدني بصياغة سؤال صح/خطأ', 'كيف أضيف امتحانًا؟'],
  reseller: ['كيف آخذ أكواد جديدة؟', 'كيف أسلّم الكود للطالب؟', 'ماذا أفعل إن وصلت للحد الأقصى؟'],
  admin: ['كيف أضيف قسمًا وجامعات ومراحل بسرعة؟', 'كيف أنشئ حساب مشرف أو مدير متجر؟', 'اشرح لي الأدوار والصلاحيات'],
};

export default function AiAssistant({ user, pageTitle }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);                 // {cls: 'user'|'bot'|'err', text}
  const [history, setHistory] = useState([]);           // what the model sees: {role, content}
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [know, setKnow] = useState('');
  const [showSugg, setShowSugg] = useState(true);
  const box = useRef(null);
  const first = (user.full_name || '').split(' ')[0] || '';
  const sugg = SUGGESTIONS[user.role] || SUGGESTIONS.admin;

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs, open]);
  useEffect(() => {
    if (!open) return;
    apiFetch('/api/ai/status').then(st => setKnow(`مدرَّب على ${(st.knowledge.questions || 0).toLocaleString('en-US')} سؤال من بنك المنصة` + (st.enabled ? '' : ' · وضع البحث (الكتابة الكاملة غير مفعّلة)'))).catch(() => {});
  }, [open]);

  const clear = () => { setMsgs([]); setHistory([]); setShowSugg(true); };
  const send = async (raw) => {
    const q = (raw ?? text).trim(); if (!q || busy) return;
    setText(''); setShowSugg(false); setBusy(true);
    const next = [...history, { role: 'user', content: q }];
    setMsgs(m => [...m, { cls: 'user', text: q }, { cls: 'bot', text: '…', pending: true }]);
    try {
      const res = await post('/api/ai/chat', { messages: next.slice(-12), context: 'الصفحة المفتوحة الآن في لوحة التحكم: ' + (pageTitle || '') });
      setHistory([...next, { role: 'assistant', content: res.reply }]);
      setMsgs(m => {
        const out = m.filter(x => !x.pending).concat({ cls: 'bot', text: res.reply });
        if (res.sources && res.sources.length && res.mode === 'ai') out.push({ cls: 'src', text: '📚 من بنك الأسئلة: ' + res.sources.map(s => s.text.slice(0, 60)).join(' · ') });
        return out;
      });
    } catch (e) {
      setMsgs(m => m.filter(x => !x.pending).concat({ cls: 'err', text: e.detail || 'تعذّر الوصول إلى المساعد' }));
    } finally { setBusy(false); }
  };

  return (
    <>
      <button className="ai-fab" style={{ display: 'grid' }} onClick={() => setOpen(o => !o)} aria-label="المساعد الذكي" title="المساعد الذكي">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>
      </button>
      <div className={'ai-panel' + (open ? ' open' : '')} role="dialog" aria-label="المساعد الذكي">
        <div className="ai-head"><span style={{ flex: 1 }}>✨ مساعد Kiur<br /><span style={{ fontWeight: 600, fontSize: '.66rem', color: 'var(--ink-faint)' }}>{know}</span></span>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={clear} title="محادثة جديدة" aria-label="محادثة جديدة">↺</button>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setOpen(false)} aria-label="إغلاق">✕</button></div>
        <div className="ai-msgs" ref={box}>
          {!msgs.length && <div className="ai-msg bot">أهلاً {first} 👋 أنا مساعد Kiur. أعرف المنصة ودورك فيها — اسألني أو اختر اقتراحًا.</div>}
          {msgs.map((m, i) => (m.cls === 'src' ? <div key={i} className="ai-src">{m.text}</div> : <div key={i} className={'ai-msg ' + m.cls}>{m.text}</div>))}
        </div>
        {showSugg && !msgs.length && <div className="ai-sugg">{sugg.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
        <div className="ai-input">
          <textarea placeholder="اسألني أي شيء عن المنصة أو عملك..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn" disabled={busy} onClick={() => send()}>إرسال</button>
        </div>
      </div>
    </>
  );
}
