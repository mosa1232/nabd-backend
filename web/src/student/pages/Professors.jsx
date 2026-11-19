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

export function Professors() {
  const { t } = useApp();
  const nav = useNavigate();
  const [list] = useLoad(loadProfessors, []);
  const [rep] = useLoad(() => apiFetch('/api/professors/representative').catch(() => null), []);   // the class representative sits with the doctors
  const [filter, setFilter] = useState('all');
  const all = Array.isArray(list) ? list : [];
  const reps = rep && !rep.needs_stage ? rep.representatives : [];
  const repBooklets = rep && !rep.needs_stage ? rep.subjects.reduce((n, s) => n + s.booklets.length, 0) : 0;
  const subjects = ['all', ...new Set(all.map(p => p.subject_name).filter(Boolean))];
  const shown = filter === 'all' ? all : all.filter(p => p.subject_name === filter);
  return (
    <div className="view active">
      <PageHead title={t('professorsTitle')} sub={t('professorsSub')} back="/" />
      <div className="filter-chips">
        {subjects.map(s => <button key={s} className={'filter-chip' + (s === filter ? ' active' : '')} onClick={() => setFilter(s)}>{s === 'all' ? t('filterAll') : s}</button>)}
      </div>
      <div className="prof-list">
        {reps.length > 0 && filter === 'all' && (
          <button className="prof-card glass" onClick={() => nav('/representative')}>
            <div className="prof-avatar" style={{ background: 'linear-gradient(145deg, #1FAE72, var(--accent-2))' }}><Ic n="user" color="#fff" /></div>
            <div className="prof-info">
              <div className="prof-name">{t('tileRep')}</div>
              <div className="prof-meta">{reps.map(r => r.name).join('، ')}</div>
              <div className="prof-stats"><span>{pdfIcon}{repBooklets} ملزمة</span></div>
            </div>
            <span className="prof-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg></span>
          </button>
        )}
        {list === undefined ? <Empty>{t('loading')}</Empty> : !shown.length ? (reps.length > 0 && filter === 'all' ? null : <Empty>{t('noProfessorsYet')}</Empty>) : shown.map(p => {
          const color = COLORS[all.indexOf(p) % COLORS.length];
          return (
            <button key={p.id} className="prof-card glass" onClick={() => nav('/professors/' + p.id)}>
              <div className="prof-avatar" style={{ background: `linear-gradient(145deg, ${color}, var(--accent-2))`, overflow: 'hidden' }}>
                {p.photo_url ? <img src={mediaUrl(p.photo_url)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(p.name)}
              </div>
              <div className="prof-info">
                <div className="prof-name">{p.name}</div>
                <div className="prof-meta">{p.title} · {p.subject_name}{p.university_name ? ' · ' + p.university_name : ''}</div>
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
  const p = all.find(x => String(x.id) === String(id));
  const color = COLORS[Math.max(0, all.indexOf(p)) % COLORS.length];
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
            <div className="prof-header-title">{p.title} · {p.subject_name}</div>
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
              <div className="item-body"><div className="item-title">{b.title}</div><div className="item-meta">{b.pages} صفحة · PDF</div></div>
              {b.file_url
                ? <a className="btn btn-ghost item-action" href={mediaUrl(b.file_url)} target="_blank" rel="noopener noreferrer" onClick={() => recordView('booklet', b.id)}>{t('open')}</a>
                : <button className="btn btn-ghost item-action" style={{ opacity: .6 }} onClick={() => toast(t('noFileYet'))}>{t('open')}</button>}
            </div>))}
        </div></div>}
        {tab === 'banks' && <div className="tab-panel active"><div className="item-list">
          {!(p.banks || []).length ? <Empty>ما نشر الدكتور بنوك أسئلة بعد</Empty> : p.banks.map(b => (
            <div className="item-card glass" key={b.id}>
              <div className="item-icon exam">{bankIcon}</div>
              <div className="item-body"><div className="item-title">{b.name}</div><div className="item-meta">{b.count} سؤال · {p.subject_name}</div></div>
              <button className="btn item-action" onClick={() => nav('/bank/' + p.subject_id + '/study/' + encodeURIComponent('bank:' + b.id), { state: { title: b.name, name: p.subject_name } })}>ادرس</button>
            </div>))}
        </div></div>}
        {tab === 'exams' && <div className="tab-panel active"><div className="item-list">
          {!p.exams.length ? <Empty>{t('noExamsYet')}</Empty> : p.exams.map(e => (
            <div className="item-card glass" key={e.id}>
              <div className="item-icon exam">{examIcon}</div>
              <div className="item-body"><div className="item-title">{e.title}</div>
                <div className="item-meta">{e.question_count} سؤال · {e.duration_minutes} دقيقة{e.exam_type === 'practical' ? <> · <b>عملي (صور)</b></> : null}</div></div>
              <button className="btn item-action" onClick={() => nav('/exam/' + e.id)}>{t('start')}</button>
            </div>))}
        </div></div>}
      </>}
    </div>
  );
}
