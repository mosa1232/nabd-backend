import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp, numLocal } from '../../lib/app.jsx';
import { apiFetch, put, mediaUrl } from '../../lib/api.js';
import { Ic, SecIcon } from '../../lib/icons.jsx';

export const PageHead = ({ title, sub, back }) => {
  const nav = useNavigate();
  return (
    <div className="page-head"><div className="page-head-main">
      {back !== false && <button className="icon-btn page-back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} aria-label="back"><Ic n="back" sw={2.4} /></button>}
      <div><div className="page-title">{title}</div>{sub ? <div className="page-sub">{sub}</div> : null}</div>
    </div></div>
  );
};

// section keys: booklet:<id> | lecture:<id> | general | all
export const secOpts = (key) => (key.startsWith('booklet:') ? { booklet_id: key.slice(8) } : key.startsWith('lecture:') ? { lecture_id: key.slice(8) } : key === 'general' ? { general: true } : {});
const studiedKey = (uid, k) => 'kiur_studied_' + uid + '_' + k;
const isStudied = (uid, k) => { try { return localStorage.getItem(studiedKey(uid, k)) === '1'; } catch { return false; } };
const markStudied = (uid, k) => { try { localStorage.setItem(studiedKey(uid, k), '1'); } catch { /* ignore */ } };

export function quizUrl(subjectId, name, opts) {
  const q = new URLSearchParams({ name: name || '' });
  if (opts?.booklet_id) q.set('booklet_id', opts.booklet_id);
  if (opts?.lecture_id) q.set('lecture_id', opts.lecture_id);
  if (opts?.general) q.set('general', '1');
  if (opts && (opts.shuffle || opts.booklet_id || opts.lecture_id || opts.general)) q.set('exam', '1');
  return `/quiz/${subjectId}?${q.toString()}`;
}

const PAL = ['#5B6CF0', '#F59E0B', '#14B8A6', '#E11D48', '#8B5CF6', '#0EA5E9'];

export function BankSelect() {
  const { t, lang, user, setUser, toast } = useApp();
  const nav = useNavigate();
  const [mine, setMine] = useState(null); const [prog, setProg] = useState({}); const [err, setErr] = useState('');

  const load = async () => {
    setErr('');
    try {
      const m = await apiFetch('/api/catalog/mine'); setMine(m);
      const p = {}; try { (await apiFetch('/api/me/progress')).forEach(x => { p[x.subject_id] = x; }); } catch { /* cards work without numbers */ }
      setProg(p);
    } catch (e) { setMine(null); setErr(e.detail || t('pearlsLoadFailed')); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const switchStage = async (id) => {
    try { setUser(await put('/auth/me/stage', { stage_id: id })); await load(); } catch (e) { toast(e.detail || t('pearlsLoadFailed')); }
  };
  const all = Object.values(prog);
  const tot = all.reduce((x, g) => x + (g.total || 0), 0), tried = all.reduce((x, g) => x + (g.answered || 0), 0), mastered = all.reduce((x, g) => x + (g.mastered || 0), 0);
  const accs = all.filter(g => g.accuracy != null);
  const accAll = accs.length ? Math.round(accs.reduce((x, g) => x + g.accuracy, 0) / accs.length) : null;
  const nf = n => numLocal(n, lang);

  return (
    <div className="view active">
      <PageHead title={t('bankTitle')} sub={t('bankSub')} back="/" />
      {mine && <>
        <div className="bk-context"><span>{[mine.section?.name, mine.university?.name].filter(Boolean).join(' · ')}</span></div>
        {mine.stages.length > 1 && <div className="bk-stages">{mine.stages.map(st => <button key={st.id} className={st.id === mine.stage?.id ? 'on' : ''} onClick={() => switchStage(st.id)}>{st.name}</button>)}</div>}
        <div className="bk-sum">{[[nf(tot), 'bkTotal'], [nf(tried), 'bkTried'], [nf(mastered), 'stMastered'], [accAll == null ? '—' : accAll + '%', 'bkAccAll']].map(([v, k]) => <div key={k}><b>{v}</b><span>{t(k)}</span></div>)}</div>
        <div className="bk-actions"><button className="btn btn-ghost" onClick={() => nav('/review')}>{t('bkReviewMistakes')}</button></div>
        <div className="bk-grid">
          {mine.subjects.map((s, i) => {
            const g = prog[s.id] || { total: 0, answered: 0, to_review: 0, accuracy: null };
            const pct = g.total ? Math.round(100 * g.answered / g.total) : 0;
            return (
              <button key={s.id} className="bk-card" style={{ '--c': PAL[i % PAL.length] }} onClick={() => nav(`/bank/${s.id}`, { state: { name: s.name } })}>
                <div className="bk-ring" style={{ '--p': pct }}><span>{pct}%</span></div>
                <div className="bk-body">
                  <div className="bk-name">{s.name}</div>
                  {g.total ? <>
                    <div className="bk-sub">{t('bankProgress').replace('{a}', g.answered).replace('{b}', g.total)}</div>
                    <div className="bk-pills">
                      {g.accuracy != null && <span className={'bs-pill ' + (g.accuracy >= 70 ? 'hi' : g.accuracy >= 50 ? 'mid' : 'lo')}>{t('bankAcc')} {g.accuracy}%</span>}
                      {g.to_review ? <span className="bs-pill lo">{g.to_review} {t('bankReview')}</span> : null}
                    </div></> : <div className="bk-sub">{t('bankNoQ')}</div>}
                </div>
                <span className="bk-go">{t(g.answered ? 'bkContinue' : 'bkStart')}</span>
              </button>
            );
          })}
        </div>
        {!mine.subjects.length && <div className="empty-row">{t('noSubjectsForStage')}</div>}
      </>}
      {!mine && !err && <div className="empty-row">{t('loading')}</div>}
      {err && <div className="empty-row">{err}</div>}
    </div>
  );
}

export function BankSections() {
  const { subjectId } = useParams();
  const { t, user } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const [name, setName] = useState(useLocation().state?.name || '');
  useEffect(() => {
    apiFetch('/api/subjects/' + subjectId + '/bank-sections').then(r => { setD(r); if (!name && r.subject_name) setName(r.subject_name); }).catch(e => setErr(e.detail || t('pearlsLoadFailed')));
  }, [subjectId]); // eslint-disable-line

  const rows = d?.sections || [];
  const card = (key, kind, title, sub, count, tried) => {
    const pct = count ? Math.round(100 * tried / count) : 0;
    return (
      <button key={key} className={'bsec-card ' + kind} onClick={() => nav(`/bank/${subjectId}/study/${encodeURIComponent(key)}`, { state: { title, name } })}>
        <span className="bsec-ic"><SecIcon kind={kind} /></span>
        <span className="bsec-main"><b>{title}</b>{sub ? <small>{sub}</small> : null}
          <span className="bsec-meta">{count} {t('questionsCount')} · {t('bsecTried')} {tried}{isStudied(user?.id, key) ? <> · <em>✓ {t('bsecRead')}</em></> : null}</span>
          <span className="bsec-bar"><i style={{ width: pct + '%' }} /></span></span>
        <span className="bsec-go">{t('bsecOpen')}</span>
      </button>
    );
  };
  return (
    <div className="view active">
      <PageHead title={name || '—'} sub={t('bsecSub')} back="/bank" />
      <div className="bsec-list">
        {!d && !err && <div className="empty-row">{t('loading')}</div>}
        {err && <div className="empty-row">{err}</div>}
        {d && (d.total
          ? <>{card('all', 'all', t('bsecAll'), '', d.total, rows.reduce((a, r) => a + r.tried, 0))}{rows.map(r => card(r.key, r.kind, r.title, r.course, r.count, r.tried))}</>
          : <div className="empty-row">{t('bankNoQ')}</div>)}
      </div>
    </div>
  );
}

export function BankStudy() {
  const { subjectId, key: rawKey } = useParams();
  const key = decodeURIComponent(rawKey);
  const { t, user } = useApp();
  const nav = useNavigate();
  const st = useLocation().state || {};
  const [rows, setRows] = useState(null); const [err, setErr] = useState('');
  const title = st.title || '—';
  useEffect(() => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(secOpts(key)).map(([k, v]) => [k, String(v)])));
    apiFetch('/api/subjects/' + subjectId + '/study?' + qs.toString()).then(r => { setRows(r); window.scrollTo(0, 0); }).catch(e => setErr(e.detail || t('pearlsLoadFailed')));
  }, [subjectId, key]); // eslint-disable-line

  const start = () => { markStudied(user?.id, key); nav(quizUrl(subjectId, (st.name ? st.name + ' — ' : '') + title, { ...secOpts(key), shuffle: true })); };
  return (
    <div className="view active">
      <PageHead title={title} sub={(st.name ? st.name + ' · ' : '') + (rows ? rows.length + ' ' + t('questionsCount') : '')} back={`/bank/${subjectId}`} />
      <div className="bst-bar glass">
        <div><b>{t('bstStep1')}</b><span>{t('bstStep2')}</span></div>
        <button className="btn" onClick={start}>{t('bstStartExam')}</button>
      </div>
      <div className="bst-list">
        {!rows && !err && <div className="empty-row">{t('loading')}</div>}
        {err && <div className="empty-row">{err}</div>}
        {rows && !rows.length && <div className="empty-row">{t('bankNoQ')}</div>}
        {rows && rows.map((q, i) => (
          <article key={q.id || i} className="bst-q">
            <div className="bst-qh"><span className="bst-n">{i + 1}</span>{q.eyebrow ? <span className="bst-tag">{q.eyebrow}</span> : null}</div>
            <div className="bst-text">{q.text}</div>
            {q.image_url ? <img src={mediaUrl(q.image_url)} alt="" className="bst-img" /> : null}
            {q.qtype === 'essay'
              ? <div className="bst-ans"><b>{t('bstModel')}</b><p>{q.model_answer}</p></div>
              : <div className="bst-choices">{q.choices.map((c, j) => <div key={j} className={'bst-ch ' + (c.is_correct ? 'ok' : '')}><i>{c.is_correct ? '✓' : ''}</i><span>{c.text}</span></div>)}</div>}
            {q.rationale ? <div className="bst-why"><b>{t('bstWhy')}</b> {q.rationale}</div> : null}
          </article>
        ))}
      </div>
      {rows && rows.length > 0 && <button className="btn bst-end" onClick={start}>{t('bstStartExam')}</button>}
    </div>
  );
}
