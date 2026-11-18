import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { PageHead, quizUrl } from './Bank.jsx';

const MARKS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);

export function Quiz() {
  const { subjectId } = useParams();
  const [sp] = useSearchParams();
  const { t, toast } = useApp();
  const nav = useNavigate();
  const name = sp.get('name') || '';
  const exam = sp.get('exam') === '1';
  const [qs, setQs] = useState(null);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState({});        // questionId -> {choiceId, correctId, rationale}
  const [essay, setEssay] = useState({});          // questionId -> revealed text
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoom] = useState(false);
  const log = useRef([]); const start = useRef(Date.now());

  useEffect(() => {
    let off = false;
    (async () => {
      let q = 'limit=10';
      if (exam) {
        q = 'limit=100&shuffle=true';
        if (sp.get('booklet_id')) q += '&booklet_id=' + encodeURIComponent(sp.get('booklet_id'));
        if (sp.get('lecture_id')) q += '&lecture_id=' + encodeURIComponent(sp.get('lecture_id'));
        if (sp.get('general')) q += '&general=true';
      }
      try {
        const data = await apiFetch('/api/subjects/' + subjectId + '/questions?' + q);
        const list = Array.isArray(data) ? data : [];
        if (exam) list.forEach(x => { if (x.qtype === 'mcq' && x.choices) x.choices = shuffle(x.choices); });   // an exam shuffles the options too
        if (!off) setQs(list);
      } catch { if (!off) setQs([]); }
    })();
    return () => { off = true; };
  }, [subjectId, sp.toString()]); // eslint-disable-line
  useEffect(() => { const id = setInterval(() => setElapsed(Math.floor((Date.now() - start.current) / 1000)), 1000); return () => clearInterval(id); }, []);

  const total = qs ? qs.length : 0;
  const q = qs && qs[qi];
  const done = q ? picked[q.id] : null;

  const finish = () => {
    const ok = log.current.filter(x => x.correct).length;
    nav('/quiz-summary', { state: { name, subjectId, search: sp.toString(), total, log: log.current, secs: Math.max(1, Math.round((Date.now() - start.current) / 1000)), ok } });
  };
  const go = (d) => { if (d > 0 && qi === total - 1) return finish(); setQi((qi + d + total) % total); };

  const choose = async (choice) => {
    if (done || !q) return;
    setPicked(p => ({ ...p, [q.id]: { choiceId: choice.id, pending: true } }));
    try {
      const r = await post('/api/questions/' + q.id + '/answer', { choice_id: choice.id });
      setPicked(p => ({ ...p, [q.id]: { choiceId: choice.id, correctId: r.correct_choice_id, rationale: r.rationale || '' } }));
      if (!log.current.some(x => x.id === q.id)) log.current.push({ id: q.id, text: q.text, correct: choice.id === r.correct_choice_id, picked: choice.text, right: (q.choices.find(c => c.id === r.correct_choice_id) || {}).text });
    } catch { setPicked(p => ({ ...p, [q.id]: { choiceId: choice.id, wrong: true } })); }
  };
  const reveal = async () => {
    try { const r = await apiFetch('/api/questions/' + q.id + '/model-answer'); setEssay(e => ({ ...e, [q.id]: r })); }
    catch (e) { toast(e.detail || t('pearlsLoadFailed')); }
  };
  const save = async () => {
    try { await post('/api/questions/' + q.id + '/save'); toast(t('questionSaved')); } catch (e) { toast(e.detail || t('questionSaveFailed')); }
  };
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');

  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/')} aria-label={t('back')}><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count"><span>{t('questionOf')}</span> <span className="mono">{total ? qi + 1 : 0}</span> / <span className="mono">{total}</span></div>
        <div className="quiz-timer"><Ic n="clock" /><span className="mono">{mm}</span></div>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: total ? ((qi + 1) / total * 100) + '%' : '0%' }} /></div>

      {qs && !total && <div className="q-card glass"><div className="q-body"><div className="q-text">{t('noQuestionsForStage')}</div></div></div>}
      {!qs && <div className="q-card glass"><div className="q-body"><div className="q-text">{t('loading')}</div></div></div>}
      {q && (
        <>
          <div className="q-card glass">
            {q.image_url && (
              <div className="q-image" onClick={() => setZoom(true)} style={{ backgroundImage: `url(${mediaUrl(q.image_url)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}>
                <div className="zoom-hint"><Ic n="check" size={0} /><span>{t('zoomHint')}</span></div>
              </div>
            )}
            <div className="q-body">
              <div className="q-eyebrow">{q.eyebrow || ''}</div>
              <div className="q-text">{q.text}</div>
              <button className="icon-btn" onClick={save} aria-label="save" style={{ position: 'absolute', left: 14, top: 14 }}><Ic n="review" /></button>
            </div>
            <div className="options">
              {q.qtype === 'essay'
                ? <>
                  <textarea rows={5} dir="auto" placeholder={t('essayPlaceholder')} style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--line, rgba(0,0,0,.15))', background: 'transparent', color: 'inherit', font: 'inherit', resize: 'vertical' }} />
                  <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 10 }} disabled={!!essay[q.id]} onClick={reveal}>{t('showModelAnswer')}</button>
                </>
                : q.choices.map((c, idx) => {
                  const state = done && !done.pending ? (done.correctId === c.id ? ' correct' : done.choiceId === c.id ? ' wrong' : '') : done && done.wrong && done.choiceId === c.id ? ' wrong' : '';
                  const mark = q.qtype === 'true_false' ? (idx === 0 ? '✓' : '✗') : (MARKS[idx] || idx + 1);
                  return <button key={c.id} className={'option' + state + (done ? ' locked' : '')} onClick={() => choose(c)}><span className="option-mark">{mark}</span><span>{c.text}</span></button>;
                })}
            </div>
          </div>
          <div className={'rationale glass' + ((done && !done.pending && !done.wrong) || essay[q.id] ? ' show' : '')}>
            <div className="rationale-inner">
              <div className="rationale-icon"><Ic n="check" /></div>
              <div><div className="rationale-text">
                {essay[q.id] ? <><strong>{t('modelAnswer')}</strong><br />{essay[q.id].model_answer}{essay[q.id].rationale ? <><br /><br />{essay[q.id].rationale}</> : null}</> : done?.rationale}
              </div></div>
            </div>
          </div>
        </>
      )}
      <div className="quiz-nav">
        <button className="btn btn-ghost" style={{ visibility: qi === 0 ? 'hidden' : 'visible' }} onClick={() => go(-1)}><Ic n="next" sw={2.4} /><span>{t('prev')}</span></button>
        <button className="btn btn-ghost" onClick={finish}>{t('sumEnd')}</button>
        <button className="btn" disabled={!total} onClick={() => go(1)}><span>{t('next')}</span><Ic n="back" sw={2.4} style={{ transform: 'rotate(180deg)' }} /></button>
      </div>
      {zoom && q?.image_url && <div className="lightbox show" onClick={() => setZoom(false)}><button className="lightbox-close" aria-label="close"><Ic n="back" color="#fff" /></button><div className="lightbox-img" style={{ backgroundImage: `url(${mediaUrl(q.image_url)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} /></div>}
    </div>
  );
}

export function QuizSummary() {
  const { t, toast } = useApp();
  const nav = useNavigate();
  const { state } = useLocation();
  useEffect(() => {
    if (!state) return;
    const pct = state.log.length ? Math.round(100 * state.ok / state.log.length) : 0;
    if (state.log.length) toast(pct >= 80 ? t('sumGreat') : pct >= 55 ? t('sumGood') : t('sumKeep'));
  }, []); // eslint-disable-line
  const s = useMemo(() => state || { log: [], total: 0, secs: 0, ok: 0, name: '' }, [state]);
  useEffect(() => { if (!state) nav('/bank', { replace: true }); }, [state, nav]);
  const bad = s.log.length - s.ok;
  const pct = s.log.length ? Math.round(100 * s.ok / s.log.length) : 0;
  const wrong = s.log.filter(x => !x.correct);
  const stat = (n, l) => <div className="sum-stat" key={l}><b>{n}</b><small>{l}</small></div>;
  return (
    <div className="view active">
      <div className="page-head"><div className="page-head-main"><div><div className="page-title">{t('sumTitle')}</div><div className="page-sub">{s.name}</div></div></div></div>
      <div className="glass sum-card">
        <div className="sum-ring" style={{ '--p': pct }}><span>{pct}%</span></div>
        <div className="sum-stats">
          {s.log.length
            ? [stat(s.ok, t('sumCorrect')), stat(bad, t('sumWrong')), stat(Math.max(0, s.total - s.log.length), t('sumSkipped')), stat(Math.floor(s.secs / 60) + ':' + String(s.secs % 60).padStart(2, '0'), t('sumTime'))]
            : <div className="sp-empty" style={{ gridColumn: '1/-1' }}>{t('sumNone')}</div>}
        </div>
      </div>
      {wrong.length > 0 && (
        <div className="glass" style={{ margin: '12px 16px', padding: '16px 18px' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{t('sumMistakes')}</div>
          {wrong.map(x => <div key={x.id} className="sum-miss">{x.text}<div className="cell-sub" style={{ fontSize: '.76rem', opacity: .75 }}>✗ {x.picked || ''} &nbsp; ✓ {x.right || ''}</div></div>)}
        </div>
      )}
      <div className="sum-actions">
        <button className="btn" onClick={() => nav(`/quiz/${s.subjectId}?${s.search}`)}>{t('sumAgain')}</button>
        <button className="btn btn-ghost" onClick={() => nav('/review')}>{t('sumReview')}</button>
        <button className="btn btn-ghost" onClick={() => nav('/bank')}>{t('sumSubjects')}</button>
      </div>
    </div>
  );
}
