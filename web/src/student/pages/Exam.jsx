import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { useLoad } from '../ui.jsx';

const utc = s => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z').getTime();
const mmss = secs => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

// A real exam attempt. The server owns the clock for practical (image-station) exams:
// station = elapsed / seconds_per_question, so reloading never gives extra time.
export function Exam() {
  const { examId } = useParams();
  const { t, toast } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState(null);           // {attemptId, title, type, stationSec}
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(0);        // seconds left in the whole exam
  const [elapsed, setElapsed] = useState(0);  // practical: seconds since the attempt started
  const started = useRef(false);
  const doneRef = useRef(false);
  const stateRef = useRef({});
  stateRef.current = { d, items, idx };

  useEffect(() => {
    if (started.current) return;            // StrictMode runs effects twice in dev
    started.current = true;
    (async () => {
      try {
        const data = await post('/api/exams/' + examId + '/start');
        const type = data.exam_type || 'mcq';
        const stationSec = data.seconds_per_question || 0;
        const qs = data.questions;
        let i = qs.findIndex(it => !it.answered); if (i === -1) i = 0;
        let el = 0, dur = (data.duration_minutes || 30) * 60;
        if (type === 'practical' && stationSec) {
          el = Math.max(0, Math.floor((utc(data.server_now) - utc(data.started_at)) / 1000));
          dur = Math.max(1, qs.length * stationSec - el);
          i = Math.min(Math.floor(el / stationSec), qs.length - 1);
        }
        setItems(qs); setIdx(i); setElapsed(el); setLeft(dur);
        setD({ attemptId: data.attempt_id, title: data.exam_title, type, stationSec });
      } catch (e) { toast(e.detail || t('examStartFailed')); nav('/', { replace: true }); }
    })();
  }, []); // eslint-disable-line

  const finish = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const { d: dd } = stateRef.current;
    try {
      await post(`/api/exams/attempts/${dd.attemptId}/finish`);
      nav(`/exam-result/${dd.attemptId}`, { replace: true });
    } catch (e) { doneRef.current = false; toast(e.detail || t('examFinishFailed')); }
  };

  // one-second tick
  useEffect(() => {
    if (!d) return undefined;
    const stationed = d.type === 'practical' && d.stationSec;
    const h = setInterval(() => {
      setLeft(l => l - 1);
      if (stationed) setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(h);
  }, [d]);
  useEffect(() => { if (d && left <= 0) finish(); }, [left]); // eslint-disable-line
  const stationed = !!(d && d.type === 'practical' && d.stationSec);
  useEffect(() => {  // the next station opens by itself
    if (!stationed) return;
    const i = Math.min(Math.floor(elapsed / d.stationSec), items.length - 1);
    if (i !== idx) setIdx(i);
  }, [elapsed]); // eslint-disable-line

  if (!d) return <div className="view active"><div className="empty-row" style={{ marginTop: 80 }}>{t('loading')}</div></div>;
  const it = items[idx];
  const isLast = idx === items.length - 1;
  const timer = stationed ? mmss(Math.max(0, d.stationSec - (elapsed % d.stationSec))) : mmss(Math.max(0, left));

  const pick = async (choiceId) => {
    setItems(list => list.map((x, i) => (i === idx ? { ...x, your_choice_id: choiceId, answered: true } : x)));
    try { await post(`/api/exams/attempts/${d.attemptId}/items/${it.item_id}/answer`, { choice_id: choiceId }); }
    catch (e) { toast(e.detail || t('answerSaveFailed')); }
  };
  const exit = () => { if (window.confirm(t('exitExamConfirm'))) { doneRef.current = true; nav('/'); } };

  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={exit} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{d.title}</div>
        <div className="quiz-timer"><Ic n="clock" /><span className="mono">{timer}</span></div>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: ((idx + 1) / items.length * 100) + '%' }} /></div>
      <div className="q-card glass">
        <div className="q-body">
          <div className="q-eyebrow">{stationed ? `محطة ${idx + 1} من ${items.length}` : (it.eyebrow || '')}</div>
          {it.image_url && <img src={mediaUrl(it.image_url)} alt="" style={{ display: 'block', width: '100%', maxHeight: '46vh', objectFit: 'contain', borderRadius: 12, marginBottom: 14, background: '#00000008' }} />}
          <div className="q-text">{it.text}</div>
        </div>
        <div className="options">
          {it.choices.map((c, i) => (
            <button key={c.id} className={'option' + (it.your_choice_id === c.id ? ' selected' : '')} onClick={() => pick(c.id)}>
              <span className="option-mark">{['أ', 'ب', 'ج', 'د'][i] || i + 1}</span><span>{c.text}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="quiz-nav">
        <button className="btn btn-ghost" style={{ visibility: stationed || idx === 0 ? 'hidden' : 'visible' }} onClick={() => setIdx(i => Math.max(0, i - 1))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg><span>{t('prev')}</span>
        </button>
        {!isLast && !stationed && <button className="btn" onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))}>
          <span>{t('next')}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg>
        </button>}
        {isLast && <button className="btn" style={{ background: 'var(--success)' }} onClick={finish}>{t('examFinish')}</button>}
      </div>
    </div>
  );
}

export function ExamResult() {
  const { attemptId } = useParams();
  const { t } = useApp();
  const nav = useNavigate();
  const [r, , err] = useLoad(() => apiFetch(`/api/exams/attempts/${attemptId}/result`), [attemptId]);
  const pct = r && r.total ? Math.round(r.score / r.total * 100) : 0;
  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/')} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{t('examResultTitle')}</div><div style={{ width: 38 }} />
      </div>
      {r === undefined && <div className="empty-row">{t('loading')}</div>}
      {r === null && <div className="empty-row">{err?.detail || t('examFinishFailed')}</div>}
      {r && <>
        <div className="confirm-panel glass" style={{ margin: 16 }}>
          <div className="confirm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
          <div className="confirm-title">{r.score} / {r.total}</div>
          <div className="confirm-sub">نسبة النجاح: {pct}%</div>
        </div>
        <div className="item-list" style={{ padding: '0 16px' }}>
          {r.items.map((it, i) => (
            <div className="item-card glass" key={i} style={{ alignItems: 'flex-start' }}>
              <div className="item-icon" style={{ background: it.is_correct ? 'var(--success)' : 'var(--danger)', color: '#fff' }}>{i + 1}</div>
              <div className="item-body">
                {it.image_url && <img src={mediaUrl(it.image_url)} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 10, marginBottom: 8 }} />}
                <div className="item-title">{it.text}</div>
                <div className="item-meta" style={{ color: it.is_correct ? 'var(--success)' : 'var(--danger)' }}>{it.is_correct ? 'إجابة صحيحة' : 'إجابة خاطئة'}</div>
                {it.rationale ? <div className="item-meta">{it.rationale}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}
