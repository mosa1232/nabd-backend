import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { PageHead } from './Bank.jsx';
import { useLoad, Empty } from '../ui.jsx';

const COLORS = ['#4C5FE0', '#FF8A5B', '#7B6EF6', '#1FAE72'];
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const fmtSec = sec => { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
const fmtLong = s => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h > 0 ? `${h}س ${m}د` : `${m}د`; };
const stats = c => {
  const totalSeconds = c.lectures.reduce((a, l) => a + (l.duration_seconds || 0), 0);
  const done = c.lectures.filter(l => l.done).length;
  return { totalSeconds, pct: c.lectures.length ? Math.round(done / c.lectures.length * 100) : 0 };
};
const PLAY = <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7Z" /></svg>;
const PAUSE = <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
const REPLAY = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v6h6" /><path d="M20 12A8 8 0 1 0 6 6.3L4 10" /></svg>;
const pdfIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>;
const examIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="m9.5 13 2 2 4-4" /></svg>;

export function Academy() {
  const { t } = useApp();
  const nav = useNavigate();
  const [courses] = useLoad(() => apiFetch('/api/courses'), []);
  const [q, setQ] = useState('');
  const all = Array.isArray(courses) ? courses : [];
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter(c => c.title.toLowerCase().includes(needle) || (c.instructor || '').toLowerCase().includes(needle)) : all;
  return (
    <div className="view active">
      <PageHead title={t('academyTitle')} sub={t('academySub')} back="/" />
      <div className="form-field" style={{ margin: '0 16px 12px' }}><input type="text" placeholder={t('searchCoursePlaceholder')} value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="course-grid">
        {courses === undefined ? <Empty>{t('loading')}</Empty> : !list.length ? <Empty>{q ? t('noMatchingResults') : t('noCoursesYet')}</Empty> : list.map(c => {
          const st = stats(c);
          const color = COLORS[all.indexOf(c) % COLORS.length];
          return (
            <button key={c.id} className="course-card glass" onClick={() => nav('/academy/' + c.id)}>
              <div className="course-thumb" style={{ background: `linear-gradient(145deg, ${color}, var(--accent-2))` }}><svg viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M8 5v14l11-7Z" /></svg></div>
              <div className="course-info">
                <div className="course-title">{c.title}</div><div className="course-instructor">{c.instructor}</div>
                <div className="course-meta"><span>{c.lectures.length} محاضرة</span><span>·</span><span>{fmtLong(st.totalSeconds)}</span></div>
                <div className="course-progress-track"><div className="course-progress-fill" style={{ width: st.pct + '%' }} /></div>
              </div>
              <span className="course-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Course() {
  const { id } = useParams();
  const { t, toast } = useApp();
  const nav = useNavigate();
  const [courses] = useLoad(() => apiFetch('/api/courses'), []);
  const all = Array.isArray(courses) ? courses : [];
  const course = all.find(c => String(c.id) === String(id));
  const color = COLORS[Math.max(0, all.indexOf(course)) % COLORS.length];
  const [tab, setTab] = useState('lectures');
  const [idx, setIdx] = useState(null);
  const [doneIds, setDoneIds] = useState({});
  const [speedIdx, setSpeedIdx] = useState(1);
  const [paused, setPaused] = useState(true); const [ended, setEnded] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const videoRef = useRef(null);
  const [materials, , , ] = useLoad(() => (course ? apiFetch('/api/courses/' + course.id + '/materials').catch(() => ({ booklets: [], exams: [] })) : Promise.resolve(null)), [course?.id]);

  // open at the first lecture not finished yet
  useEffect(() => {
    if (!course || idx !== null) return;
    const i = course.lectures.findIndex(l => !l.done);
    setIdx(i === -1 ? 0 : i);
  }, [course]); // eslint-disable-line
  const lec = course && idx !== null ? course.lectures[idx] : null;
  const isDone = l => !!(l.done || doneIds[l.id]);
  useEffect(() => { if (lec?.id) post('/auth/me/recent-view', { content_type: 'lecture', content_id: lec.id }).catch(() => {}); }, [lec?.id]);
  useEffect(() => { const v = videoRef.current; if (v) v.playbackRate = SPEEDS[speedIdx]; }, [speedIdx, lec?.id]);
  useEffect(() => { setPaused(true); setEnded(false); setTime({ cur: 0, dur: 0 }); }, [lec?.id]);

  const stat = useMemo(() => (course ? stats(course) : { totalSeconds: 0 }), [course]);
  const toggle = () => { const v = videoRef.current; if (!v || !lec?.video_url) return; if (v.paused) { if (v.ended) v.currentTime = 0; v.play(); } else v.pause(); };
  const scrub = e => {
    const v = videoRef.current; if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const ratio = rtl ? (rect.right - e.clientX) / rect.width : (e.clientX - rect.left) / rect.width;
    v.currentTime = Math.max(0, Math.min(1, ratio)) * v.duration;
  };
  const onEnded = () => {
    setEnded(true);
    if (lec && !isDone(lec)) { setDoneIds(d => ({ ...d, [lec.id]: true })); apiFetch('/api/courses/lectures/' + lec.id + '/complete', { method: 'POST' }).catch(() => {}); }
  };
  const glyph = !paused ? PAUSE : ended ? REPLAY : PLAY;
  const recordBooklet = bid => post('/auth/me/recent-view', { content_type: 'booklet', content_id: bid }).catch(() => {});

  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/academy')} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{course ? course.title : t('loading')}</div><div style={{ width: 38 }} />
      </div>
      {courses !== undefined && !course && <Empty>{t('noCoursesYet')}</Empty>}
      {course && lec && <>
        <div className="player-card glass">
          <div className="player-screen" style={{ background: `linear-gradient(160deg, ${color}, var(--accent-2))` }}>
            {lec.video_url
              ? <video className="player-video" ref={videoRef} playsInline preload="metadata" src={mediaUrl(lec.video_url)} style={{ display: 'block' }}
                onPlay={() => { setPaused(false); setEnded(false); }} onPause={() => setPaused(true)} onEnded={onEnded}
                onTimeUpdate={e => setTime({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })} />
              : <div className="player-no-video" style={{ display: 'flex' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}><path d="M23 7l-7 5 7 5V7Z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg><span>{t('noVideoYet')}</span></div>}
            <div className="player-top-controls"><button className="player-pill" onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)}>x{SPEEDS[speedIdx]}</button></div>
            {lec.video_url && <button className="player-center-btn" onClick={toggle} aria-label="play">{glyph}</button>}
            <div className="player-lecture-title">{lec.title}</div>
          </div>
          <div className="player-controls-bar">
            {lec.video_url && <button className="icon-btn" onClick={toggle} style={{ width: 32, height: 32 }}>{glyph}</button>}
            <div className="player-scrub" onClick={scrub}><div className="player-scrub-fill" style={{ width: (time.dur ? time.cur / time.dur * 100 : 0) + '%' }} /></div>
            <span className="player-time mono">{fmtSec(time.cur)} / {time.dur ? fmtSec(time.dur) : lec.video_url ? fmtSec(lec.duration_seconds) : '00:00'}</span>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="continue-title" style={{ fontSize: '1.05rem' }}>{course.title}</div>
          <div className="continue-meta" style={{ marginTop: 3 }}>{course.instructor} · {course.lectures.length} محاضرة · {fmtLong(stat.totalSeconds)}</div>
        </div>
        <div className="tabs">
          {[['lectures', 'lectures'], ['booklets', 'booklets'], ['quizzes', 'quizzes']].map(([k, l]) => <button key={k} className={'tab-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{t(l)}</button>)}
        </div>
        {tab === 'lectures' && <div className="tab-panel active"><div className="item-list">
          {course.lectures.map((l, i) => (
            <button key={l.id} className={'item-card lecture-item glass' + (i === idx ? ' current' : '') + (isDone(l) ? ' done' : '')} onClick={() => setIdx(i)}>
              <span className="lecture-num">{isDone(l) ? '✓' : i + 1}</span>
              <span className="item-body"><span className="item-title">{l.title}</span><span className="item-meta mono">{fmtSec(l.duration_seconds)}</span></span>
              <span className="lecture-play">{i === idx && !paused ? PAUSE : PLAY}</span>
            </button>))}
        </div></div>}
        {tab === 'booklets' && <div className="tab-panel active"><div className="item-list">
          {!materials ? <Empty>{materials === undefined ? t('loading') : t('noBookletsForCourse')}</Empty> : !materials.booklets.length ? <Empty>{t('noBookletsForCourse')}</Empty> : materials.booklets.map(b => (
            <div className="item-card glass" key={b.id}>
              <div className="item-icon pdf">{pdfIcon}</div>
              <div className="item-body"><div className="item-title">{b.title}</div><div className="item-meta">{b.pages} صفحة · PDF</div></div>
              {b.file_url ? <a className="btn btn-ghost item-action" href={mediaUrl(b.file_url)} target="_blank" rel="noopener noreferrer" onClick={() => recordBooklet(b.id)}>{t('open')}</a>
                : <button className="btn btn-ghost item-action" style={{ opacity: .6 }} onClick={() => toast(t('noFileYet'))}>{t('open')}</button>}
            </div>))}
        </div></div>}
        {tab === 'quizzes' && <div className="tab-panel active"><div className="item-list">
          {!materials ? <Empty>{materials === undefined ? t('loading') : t('noQuizzesForCourse')}</Empty> : !materials.exams.length ? <Empty>{t('noQuizzesForCourse')}</Empty> : materials.exams.map(e => (
            <div className="item-card glass" key={e.id}>
              <div className="item-icon exam">{examIcon}</div>
              <div className="item-body"><div className="item-title">{e.title}</div><div className="item-meta">{e.question_count} سؤال · {e.duration_minutes} دقيقة{e.exam_type === 'practical' ? <> · <b>عملي (صور)</b></> : null}</div></div>
              <button className="btn item-action" onClick={() => nav('/exam/' + e.id)}>{t('start')}</button>
            </div>))}
        </div></div>}
      </>}
    </div>
  );
}
