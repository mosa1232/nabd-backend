import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, del, mediaUrl } from '../../lib/api.js';
import { PageHead } from './Bank.jsx';
import { Ic } from '../../lib/icons.jsx';
import { useLoad, Empty } from '../ui.jsx';

export function Review() {
  const { t, toast } = useApp();
  const [tab, setTab] = useState('mistakes');
  const [mist] = useLoad(() => apiFetch('/api/me/mistakes'), []);
  const [saved, , , setSaved] = useLoad(() => apiFetch('/api/me/saved-questions'), []);
  const unsave = async (id) => {
    try { await del('/api/questions/' + id + '/save'); setSaved(list => list.filter(q => q.id !== id)); }
    catch (e) { toast(e.detail || t('removeFailed')); }
  };
  return (
    <div className="view active">
      <PageHead title={t('reviewTitle')} sub={t('reviewSub')} back="/" />
      <div className="tabs">
        <button className={'tab-btn' + (tab === 'mistakes' ? ' active' : '')} onClick={() => setTab('mistakes')}>{t('myMistakes')}</button>
        <button className={'tab-btn' + (tab === 'saved' ? ' active' : '')} onClick={() => setTab('saved')}>{t('savedQuestions')}</button>
      </div>
      {tab === 'mistakes' && <div className="tab-panel active"><div className="item-list">
        {mist === undefined ? <Empty>{t('loading')}</Empty> : !mist ? <Empty>{t('mistakesLoadFailed')}</Empty> : !mist.length ? <Empty>{t('noMistakesYet')}</Empty> : mist.map((r, i) => (
          <div className="item-card glass" key={r.id || i} style={{ alignItems: 'flex-start' }}>
            <div className="item-body">
              <div className="item-title">{r.text}</div>
              <div className="item-meta" style={{ color: 'var(--danger)' }}>{t('yourAnswer')}: {r.your_choice || '—'}</div>
              <div className="item-meta" style={{ color: 'var(--success)' }}>{t('correctAnswer')}: {r.correct_choice || '—'}</div>
              {r.rationale ? <div className="item-meta">{r.rationale}</div> : null}
            </div>
          </div>))}
      </div></div>}
      {tab === 'saved' && <div className="tab-panel active"><div className="item-list">
        {saved === undefined ? <Empty>{t('loading')}</Empty> : !saved ? <Empty>{t('savedLoadFailed')}</Empty> : !saved.length ? <Empty>{t('noSavedQuestionsYet')}</Empty> : saved.map(q => (
          <div className="item-card glass" key={q.id} style={{ alignItems: 'flex-start' }}>
            <div className="item-body"><div className="item-title">{q.text}</div><div className="item-meta">{q.eyebrow || ''}</div></div>
            <button className="btn btn-ghost item-action" onClick={() => unsave(q.id)}>{t('remove')}</button>
          </div>))}
      </div></div>}
    </div>
  );
}

const ini = n => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const AV = { background: 'var(--accent-2)', color: '#fff', fontWeight: 700, overflow: 'hidden' };
const Img = ({ src }) => <img src={mediaUrl(src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;

export function Leaderboard() {
  const { t } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState('rank');
  const [scope, setScope] = useState('university');
  const [q, setQ] = useState(''); const [found, setFound] = useState(null);
  const [rows, , rowsErr] = useLoad(() => apiFetch('/auth/leaderboard?scope=' + encodeURIComponent(scope)), [scope]);
  const [sum] = useLoad(() => apiFetch('/auth/leaderboard/summary?scope=' + encodeURIComponent(scope)).catch(() => null), [scope]);
  const [perf] = useLoad(() => apiFetch('/auth/me/performance'), []);
  const timer = useRef(null);
  const search = (v) => {
    setQ(v); clearTimeout(timer.current);
    if (!v.trim()) return setFound(null);
    setFound('loading');
    timer.current = setTimeout(async () => {
      try { setFound(await apiFetch('/api/students/search?q=' + encodeURIComponent(v.trim()))); } catch { setFound('err'); }
    }, 250);
  };
  return (
    <div className="view active">
      <PageHead title={t('leaderboardTitle')} sub={t('leaderboardSub')} back="/" />
      <div className="form-field" style={{ margin: '0 16px 10px' }}><input type="text" placeholder={t('searchStudentPlaceholder')} value={q} onChange={e => search(e.target.value)} /></div>
      {found ? <div className="item-list" style={{ padding: '0 16px' }}>
        {found === 'loading' ? <Empty>جارٍ البحث...</Empty> : found === 'err' ? <Empty>تعذّر البحث</Empty> : !found.length ? <Empty>ما اكو نتائج</Empty> : found.map(s => (
          <div className="item-card glass" key={s.id} style={{ cursor: 'pointer' }} onClick={() => nav('/students/' + s.id)}>
            <div className="item-icon" style={AV}>{s.photo_url ? <Img src={s.photo_url} /> : ini(s.full_name)}</div>
            <div className="item-body"><div className="item-title">{s.full_name}</div>{s.caption ? <div className="item-meta">{s.caption}</div> : null}</div>
          </div>))}
      </div> : <div>
        <div className="tabs">
          <button className={'tab-btn' + (tab === 'rank' ? ' active' : '')} onClick={() => setTab('rank')}>{t('rankTab')}</button>
          <button className={'tab-btn' + (tab === 'perf' ? ' active' : '')} onClick={() => setTab('perf')}>{t('myReportTab')}</button>
        </div>
        {tab === 'rank' && <div className="tab-panel active">
          <div className="form-field" style={{ margin: '0 16px 8px' }}>
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="university">طلاب جامعتي</option><option value="stage">طلاب مرحلتي</option><option value="department">طلاب قسمي</option>
              <option value="section">طلاب كليتي (كل الجامعات)</option><option value="all">كل طلاب المنصة</option>
            </select>
          </div>
          <div className="item-meta" style={{ margin: '0 16px 8px' }}>{sum ? (sum.my_rank ? `ترتيبك #${sum.my_rank} من ${sum.total} (${sum.label})` : `${sum.total} طالب (${sum.label})`) : ''}</div>
          <div className="item-list">
            {rows === undefined ? <Empty>جارٍ التحميل...</Empty> : !rows ? <Empty>{rowsErr?.detail || 'تعذّر تحميل الترتيب'}</Empty> : !rows.length ? <Empty>{t('noRankingsYet')}</Empty> : rows.map(r => (
              <div className="item-card glass" key={r.user_id} style={{ cursor: 'pointer', ...(r.is_you ? { border: '1.5px solid var(--accent)' } : null) }} onClick={() => nav('/students/' + r.user_id)}>
                <div className="item-icon" style={AV}>{r.photo_url ? <Img src={r.photo_url} /> : '#' + r.rank}</div>
                <div className="item-body"><div className="item-title">{r.full_name}{r.is_you ? ' (أنت)' : ''}</div><div className="item-meta">#{r.rank} · {r.correct_count} إجابة صحيحة</div></div>
              </div>))}
          </div>
        </div>}
        {tab === 'perf' && <div className="tab-panel active"><div className="item-list">
          {perf === undefined ? <Empty>جارٍ التحميل...</Empty> : !perf ? <Empty>تعذّر تحميل التقرير</Empty> : !perf.length ? <Empty>جاوب على أسئلة حتى يظهر تقريرك</Empty> : perf.map(r => (
            <div className="item-card glass" key={r.subject_id || r.subject_name}>
              <div className="item-body"><div className="item-title">{r.subject_name}</div><div className="item-meta">{r.correct} صحيحة من {r.answered}</div></div>
              <div className="item-icon" style={{ background: r.accuracy_pct >= 60 ? 'var(--success)' : 'var(--danger)', color: '#fff', fontWeight: 700 }}>{r.accuracy_pct}%</div>
            </div>))}
        </div></div>}
      </div>}
    </div>
  );
}

export function StudentProfile() {
  const { id } = useParams();
  const { t } = useApp();
  const nav = useNavigate();
  const [p] = useLoad(() => apiFetch('/api/students/' + id + '/profile'), [id]);
  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{t('studentProfileTitle')}</div><div style={{ width: 38 }} />
      </div>
      {p === undefined && <div className="empty-row">{t('loading')}</div>}
      {p === null && <div className="empty-row">تعذّر تحميل الملف</div>}
      {p && <>
        <div className="prof-header glass">
          <div className="prof-header-avatar" style={{ background: 'linear-gradient(145deg, var(--accent), var(--accent-2))', overflow: 'hidden' }}>{p.photo_url ? <Img src={p.photo_url} /> : ini(p.full_name)}</div>
          <div><div className="prof-header-name">{p.full_name}</div><div className="item-meta">{p.caption || ''}</div></div>
        </div>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: 16 }}>
          <div className="glass" style={{ padding: 14, textAlign: 'center' }}><div className="item-meta">{t('rank')}</div><div className="prof-header-name" style={{ marginTop: 4 }}>{p.rank ? '#' + p.rank + ' / ' + p.total_ranked : '—'}</div></div>
          <div className="glass" style={{ padding: 14, textAlign: 'center' }}><div className="item-meta">{t('streak')}</div><div className="prof-header-name" style={{ marginTop: 4 }}>{p.streak_days}</div></div>
        </div>
        <div className="section-block">
          <div className="section-title">{t('skills')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px' }}>
            {p.skills.length ? p.skills.map((s, i) => <span key={i} className="prof-tag">{s}</span>) : <span className="item-meta">ما أضاف أي مهارة بعد</span>}
          </div>
        </div>
      </>}
    </div>
  );
}
