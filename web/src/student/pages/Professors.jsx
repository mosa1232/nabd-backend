import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { PageHead } from './Bank.jsx';
import { useLoad, Empty } from '../ui.jsx';

const COLORS = ['#4C5FE0', '#7B6EF6', '#FF8A5B', '#1FAE72', '#E5484D'];
const initials = name => (name || '').replace('د. ', '').split(' ').map(w => w[0]).slice(0, 2).join('');
const pdfIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>;
const bankIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
const examIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="m9.5 13 2 2 4-4" /></svg>;

const loadProfessors = () => apiFetch('/api/professors');

// A doctor (or the platform) has one profile per subject; students see one card per person with all subjects together.
function mergeDoctors(list) {
  const map = new Map();
  for (const p of list) {
    const k = p.user_id || p.id;
    if (!map.has(k)) map.set(k, { key: k, first: p, profiles: [] });
    map.get(k).profiles.push(p);
  }
  return [...map.values()].map(g => ({
    ...g,
    subjects: [...new Set(g.profiles.map(p => p.subject_name).filter(Boolean))],
    booklets: g.profiles.flatMap(p => p.booklets.map(b => ({ ...b, subject_name: p.subject_name }))),
    exams: g.profiles.flatMap(p => p.exams.map(e => ({ ...e, subject_name: p.subject_name }))),
    banks: g.profiles.flatMap(p => (p.banks || []).map(b => ({ ...b, subject_id: p.subject_id, subject_name: p.subject_name }))),
  }));
}

export function Professors() {
  const { t } = useApp();
  const nav = useNavigate();
  const [list] = useLoad(loadProfessors, []);
  const [rep] = useLoad(() => apiFetch('/api/professors/representatives').catch(() => null), []);   // each class representative: one card, with the doctors
  const [filter, setFilter] = useState('all');
  const all = Array.isArray(list) ? list : [];
  const reps = rep && !rep.needs_stage ? rep.representatives : [];
  const subjects = ['all', ...new Set(all.map(p => p.subject_name).filter(Boolean))];
  const people = mergeDoctors(all);
  const shown = filter === 'all' ? people : people.filter(g => g.subjects.includes(filter));
  return (
    <div className="view active">
      <PageHead title={t('professorsTitle')} sub={t('professorsSub')} back="/" />
      <div className="filter-chips">
        {subjects.map(s => <button key={s} className={'filter-chip' + (s === filter ? ' active' : '')} onClick={() => setFilter(s)}>{s === 'all' ? t('filterAll') : s}</button>)}
      </div>
      <div className="prof-list">
        {filter === 'all' && reps.map(r => (
          <button key={r.id} className="prof-card glass" onClick={() => nav('/representative/' + r.id)}>
            <div className="prof-avatar" style={{ background: 'linear-gradient(145deg, #1FAE72, var(--accent-2))', overflow: 'hidden' }}>
              {r.photo_url ? <img src={mediaUrl(r.photo_url)} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(r.name)}
            </div>
            <div className="prof-info">
              <div className="prof-name">{r.name}</div>
              <div className="prof-meta">{t('tileRep')}{r.scope ? ' · ' + r.scope : ''}</div>
              <div className="prof-stats"><span>{pdfIcon}{r.booklets} ملزمة</span><span>{examIcon}{r.exams} امتحان</span>{r.banks ? <span>{bankIcon}{r.banks} {r.banks === 1 ? 'بنك' : 'بنوك'}</span> : null}</div>
            </div>
            <span className="prof-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg></span>
          </button>
        ))}
        {list === undefined ? <Empty>{t('loading')}</Empty> : !shown.length ? (reps.length > 0 && filter === 'all' ? null : <Empty>{t('noProfessorsYet')}</Empty>) : shown.map(g => {
          const p = { ...g.first, booklets: g.booklets, exams: g.exams, banks: g.banks };
          const color = COLORS[people.indexOf(g) % COLORS.length];
          return (
            <button key={g.key} className="prof-card glass" onClick={() => nav('/professors/' + g.first.id)}>
              <div className="prof-avatar" style={{ background: `linear-gradient(145deg, ${color}, var(--accent-2))`, overflow: 'hidden' }}>
                {p.photo_url ? <img src={mediaUrl(p.photo_url)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(p.name)}
              </div>
              <div className="prof-info">
                <div className="prof-name">{p.name}</div>
                <div className="prof-meta">{p.title} · {g.subjects.join('، ')}{p.university_name ? ' · ' + p.university_name : ''}</div>
                <div className="prof-stats"><span>{pdfIcon}{p.booklets.length} ملزمة</span><span>{examIcon}{p.exams.length} امتحان</span>{(p.banks || []).length ? <span>{bankIcon}{p.banks.length} {p.banks.length === 1 ? 'بنك' : 'بنوك'}</span> : null}</div>
              </div>
              <span className="prof-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Professor() {
  const { id } = useParams();
  const { t, toast } = useApp();
  const nav = useNavigate();
  const [list] = useLoad(loadProfessors, []);
  const [tab, setTab] = useState('booklets');
  const all = Array.isArray(list) ? list : [];
  const first = all.find(x => String(x.id) === String(id));
  const people = mergeDoctors(all);
  const g = first ? people.find(x => x.key === (first.user_id || first.id)) : null;   // all of this person's subjects together
  const p = g ? { ...g.first, booklets: g.booklets, exams: g.exams, banks: g.banks } : null;
  const several = !!g && g.subjects.length > 1;
  const color = COLORS[Math.max(0, people.indexOf(g)) % COLORS.length];
  const recordView = (type, cid) => post('/auth/me/recent-view', { content_type: type, content_id: cid }).catch(() => {});
  return (
    <div className="view active">
      <div className="quiz-top">
        <button className="icon-btn" onClick={() => nav('/professors')} aria-label="back"><Ic n="back" sw={2.4} /></button>
        <div className="quiz-count">{t('professorPageTitle')}</div><div style={{ width: 38 }} />
      </div>
      {list === undefined && <Empty>{t('loading')}</Empty>}
      {list !== undefined && !p && <Empty>{t('noProfessorsYet')}</Empty>}
      {p && <>
        <div className="prof-header glass">
          <div className="prof-header-avatar" style={{ background: `linear-gradient(145deg, ${color}, var(--accent-2))`, overflow: 'hidden' }}>
            {p.photo_url ? <img src={mediaUrl(p.photo_url)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initials(p.name)}
          </div>
          <div>
            <div className="prof-header-name">{p.name}</div>
            <div className="prof-header-title">{p.title} · {g.subjects.join('، ')}</div>
            <div className="prof-tags">{p.university_name ? <span className="prof-tag">{p.university_name}</span> : null}</div>
            {p.bio ? <div className="item-meta" style={{ marginTop: 8, maxWidth: 340 }}>{p.bio}</div> : null}
          </div>
        </div>
        <div className="tabs">
          <button className={'tab-btn' + (tab === 'booklets' ? ' active' : '')} onClick={() => setTab('booklets')}>{t('booklets')}</button>
          <button className={'tab-btn' + (tab === 'exams' ? ' active' : '')} onClick={() => setTab('exams')}>{t('exams')}</button>
          <button className={'tab-btn' + (tab === 'banks' ? ' active' : '')} onClick={() => setTab('banks')}>بنوك الأسئلة</button>
        </div>
        {tab === 'booklets' && <div className="tab-panel active"><div className="item-list">
          {!p.booklets.length ? <Empty>{t('noBookletsYet')}</Empty> : p.booklets.map(b => (
            <div className="item-card glass" key={b.id}>
              <div className="item-icon pdf">{pdfIcon}</div>
              <div className="item-body"><div className="item-title">{b.title}</div><div className="item-meta">{b.pages} صفحة · PDF{several ? ' · ' + b.subject_name : ''}</div></div>
              {b.file_url
                ? <a className="btn btn-ghost item-action" href={mediaUrl(b.file_url)} target="_blank" rel="noopener noreferrer" onClick={() => recordView('booklet', b.id)}>{t('open')}</a>
                : <button className="btn btn-ghost item-action" style={{ opacity: .6 }} onClick={() => toast(t('noFileYet'))}>{t('open')}</button>}
            </div>))}
        </div></div>}
        {tab === 'banks' && <div className="tab-panel active"><div className="item-list">
          {!(p.banks || []).length ? <Empty>ما نشر الدكتور بنوك أسئلة بعد</Empty> : p.banks.map(b => (
            <div className="item-card glass" key={b.id}>
              <div className="item-icon exam">{bankIcon}</div>
              <div className="item-body"><div className="item-title">{b.name}</div><div className="item-meta">{b.count} سؤال · {b.subject_name}</div></div>
              <button className="btn item-action" onClick={() => nav('/bank/' + b.subject_id + '/study/' + encodeURIComponent('bank:' + b.id), { state: { title: b.name, name: b.subject_name } })}>ادرس</button>
            </div>))}
        </div></div>}
        {tab === 'exams' && <div className="tab-panel active"><div className="item-list">
          {!p.exams.length ? <Empty>{t('noExamsYet')}</Empty> : p.exams.map(e => (
            <div className="item-card glass" key={e.id}>
              <div className="item-icon exam">{examIcon}</div>
              <div className="item-body"><div className="item-title">{e.title}</div>
                <div className="item-meta">{e.question_count} سؤال · {e.duration_minutes} دقيقة{e.exam_type === 'practical' ? <> · <b>عملي (صور)</b></> : null}{several ? ' · ' + e.subject_name : ''}</div></div>
              <button className="btn item-action" onClick={() => nav('/exam/' + e.id)}>{t('start')}</button>
            </div>))}
        </div></div>}
      </>}
    </div>
  );
}
