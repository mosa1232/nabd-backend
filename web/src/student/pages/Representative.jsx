import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch, post, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';
import { PageHead } from './Bank.jsx';
import { useLoad, Empty } from '../ui.jsx';

const pdfIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>;
const bankIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
const examIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="m9.5 13 2 2 4-4" /></svg>;

// The class representative's page: the subjects of the student's stage, then (after picking one) the booklets,
// exams and question banks the representative published for it.
export function Representative() {
  const { subjectId } = useParams();
  const { t, toast } = useApp();
  const nav = useNavigate();
  const [data] = useLoad(() => apiFetch('/api/professors/representative'), []);
  const subjects = data?.subjects || [];
  const subject = subjectId ? subjects.find(s => s.subject_id === subjectId) : null;
  const reps = data?.representatives || [];
  const recordView = (cid) => post('/auth/me/recent-view', { content_type: 'booklet', content_id: cid }).catch(() => {});

  const head = (
    <PageHead title={subject ? subject.subject_name : t('repTitle')} sub={subject ? (reps.map(r => r.name).join('، ') || '') : t('repSub')}
      back={subject ? '/representative' : '/'} />
  );
  if (data === undefined) return <div className="view active">{head}<Empty>{t('loading')}</Empty></div>;
  if (data === null || data.needs_stage) return <div className="view active">{head}<Empty>{t('repNoStage')}</Empty></div>;

  // step 2: one subject's content
  if (subjectId) {
    if (!subject) return <div className="view active">{head}<Empty>{t('repNoSubjects')}</Empty></div>;
    const empty = !subject.booklets.length && !subject.exams.length && !subject.banks.length;
    return (
      <div className="view active">
        {head}
        {empty && <Empty>{t('repEmptySubject')}</Empty>}
        {subject.booklets.length > 0 && <div className="section-block">
          <div className="section-title">{t('booklets')}</div>
          <div className="item-list">
            {subject.booklets.map(b => (
              <div className="item-card glass" key={b.id}>
                <div className="item-icon pdf">{pdfIcon}</div>
                <div className="item-body"><div className="item-title">{b.title}</div><div className="item-meta">{b.pages} {t('pagesWord')} · PDF</div></div>
                {b.file_url
                  ? <a className="btn btn-ghost item-action" href={mediaUrl(b.file_url)} target="_blank" rel="noopener noreferrer" onClick={() => recordView(b.id)}>{t('open')}</a>
                  : <button className="btn btn-ghost item-action" style={{ opacity: .6 }} onClick={() => toast(t('noFileYet'))}>{t('open')}</button>}
              </div>))}
          </div>
        </div>}
        {subject.exams.length > 0 && <div className="section-block">
          <div className="section-title">{t('exams')}</div>
          <div className="item-list">
            {subject.exams.map(e => (
              <div className="item-card glass" key={e.id}>
                <div className="item-icon exam">{examIcon}</div>
                <div className="item-body"><div className="item-title">{e.title}</div><div className="item-meta">{e.question_count} {t('questionsWord')} · {e.duration_minutes} {t('minutesWord')}</div></div>
                <button className="btn item-action" onClick={() => nav('/exam/' + e.id)}>{t('start')}</button>
              </div>))}
          </div>
        </div>}
        {subject.banks.length > 0 && <div className="section-block">
          <div className="section-title">{t('banksTab')}</div>
          <div className="item-list">
            {subject.banks.map(b => (
              <div className="item-card glass" key={b.id}>
                <div className="item-icon exam">{bankIcon}</div>
                <div className="item-body"><div className="item-title">{b.name}</div><div className="item-meta">{b.count} {t('questionsWord')} · {subject.subject_name}</div></div>
                <button className="btn item-action" onClick={() => nav('/bank/' + subject.subject_id + '/study/' + encodeURIComponent('bank:' + b.id), { state: { title: b.name, name: subject.subject_name } })}>{t('studyBtn')}</button>
              </div>))}
          </div>
        </div>}
      </div>
    );
  }

  // step 1: the subjects
  return (
    <div className="view active">
      {head}
      {!reps.length && <Empty>{t('repNone')}</Empty>}
      {reps.length > 0 && !subjects.length && <Empty>{t('repNoSubjects')}</Empty>}
      <div className="prof-list">
        {subjects.map(s => (
          <button key={s.subject_id} className="prof-card glass" onClick={() => nav('/representative/' + s.subject_id)}>
            <div className="prof-avatar" style={{ background: 'linear-gradient(145deg, #4C5FE0, var(--accent-2))' }}><Ic n="bankQ" color="#fff" /></div>
            <div className="prof-info">
              <div className="prof-name">{s.subject_name}</div>
              <div className="prof-stats"><span>{pdfIcon}{s.booklets.length} {t('repCountBooklets')}</span><span>{examIcon}{s.exams.length} {t('repCountExams')}</span>{s.banks.length ? <span>{bankIcon}{s.banks.length} {t('repCountBanks')}</span> : null}</div>
            </div>
            <span className="prof-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg></span>
          </button>
        ))}
      </div>
    </div>
  );
}
