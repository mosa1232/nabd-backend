import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, dateLocale } from '../../lib/app.jsx';
import { apiFetch, post, mediaUrl } from '../../lib/api.js';
import { Ic } from '../../lib/icons.jsx';

const TILES = [
  { to: '/bank', icon: 'bankQ', key: 'tileBank' },
  { to: '/anatomy', icon: 'anatomy', key: 'anatomyTitle' },
  { to: '/professors', icon: 'prof', key: 'tileProf' },
  { to: '/store', icon: 'store', key: 'tileStore' },
  { to: '/review', icon: 'review', key: 'tileReview' },
  { to: '/pearls', icon: 'heart', key: 'pearlsTitle' },
  { to: '/leaderboard', icon: 'trophy', key: 'tileLeaderboard' },
  { to: '/ai', icon: 'ai', key: 'aiNavTitle' },
  { to: null, icon: 'play', key: 'tileVideo', soon: true },
  { to: null, icon: 'sun', key: 'summerTitle', soon: true },
];

const useLoad = (fn, deps) => {
  const [v, setV] = useState(null);
  useEffect(() => { let off = false; fn().then(x => { if (!off) setV(x); }).catch(() => { if (!off) setV(null); }); return () => { off = true; }; }, deps); // eslint-disable-line
  return v;
};

function Verify() {
  const { t, user, setUser, toast } = useApp();
  const [code, setCode] = useState(''); const [m, setM] = useState(null); const [busy, setBusy] = useState(false);
  if (!(user && user.role === 'student' && !user.verified_at)) return null;
  const go = async () => {
    const c = code.trim();
    if (c.length < 4) return setM({ ok: false, text: t('verifyEnter') });
    setBusy(true); setM({ ok: null, text: '…' });
    try {
      const res = await post('/api/verify/redeem', { code: c });
      setUser(await apiFetch('/auth/me')); setCode(''); setM(null);
      toast(t('verifiedOk') + ' ' + (res.verified_name || ''));
    } catch (e) { setM({ ok: false, text: e.detail || t('verifyFailed') }); } finally { setBusy(false); }
  };
  return (
    <div className="glass" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{t('verifyTitle')}</div>
      <div className="item-meta" style={{ marginBottom: 10 }}>{t('verifySub')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="form-field" style={{ flex: 1, minWidth: 170, margin: 0 }}>
          <input type="text" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={14} placeholder="XXXX-XXXX" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()}
            style={{ textTransform: 'uppercase', letterSpacing: '.12em', textAlign: 'center', fontWeight: 700 }} />
        </div>
        <button className="btn" disabled={busy} onClick={go}>{t('verifyBtn')}</button>
      </div>
      {m && <div style={{ fontSize: '.8rem', marginTop: 8, color: m.ok === false ? 'var(--danger)' : 'var(--ink-faint)' }}>{m.text}</div>}
    </div>
  );
}

function PathCard() {
  const { t, user } = useApp();
  const nav = useNavigate();
  const tags = useLoad(async () => {
    if (!user?.section_id || !user?.university_id) return [];
    const tree = await apiFetch('/api/catalog/tree');
    const section = tree.find(s => s.id === user.section_id);
    const uni = section?.universities.find(u => u.id === user.university_id);
    const stage = uni?.stages.find(st => st.id === user.stage_id);
    const out = [];
    if (section) out.push(section.name);
    if (uni) out.push(uni.name);
    if (user.is_graduate) out.push(t('graduated')); else if (stage) out.push(stage.name);
    if (user.verified_at) out.push('✓ ' + t('verifiedBadge'));
    return out;
  }, [user?.section_id, user?.university_id, user?.stage_id, user?.is_graduate, user?.verified_at]);
  if (!tags || !tags.length) return null;
  return (
    <button className="glass" style={{ display: 'flex', width: '100%', textAlign: 'start', padding: '12px 16px', marginBottom: 12, cursor: 'pointer', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={() => nav('/account/edit')}>
      <div className="item-meta" style={{ margin: 0 }}>{t('pathLabel')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{tags.map((x, i) => <span key={i} className="prof-tag">{x}</span>)}</div>
    </button>
  );
}

function Continue({ c }) {
  const { t } = useApp();
  const nav = useNavigate();
  const Next = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" transform="rotate(180 12 12)" /></svg>;
  return (
    <>
      {c?.course && (
        <button className="continue-card glass" style={{ width: '100%', cursor: 'pointer', display: 'flex', marginBottom: 12 }} onClick={() => nav('/academy/' + c.course.course_id)}>
          <div className="continue-ring" style={{ '--p': c.course.pct }} />
          <div className="continue-body"><div className="continue-eyebrow">{t('continueCourseEyebrow')}</div><div className="continue-title">{c.course.lecture_title}</div>
            <div className="continue-meta">{c.course.course_title} — {c.course.done_count}/{c.course.total_count} {t('lecturesOf')}</div></div>
          <span className="btn"><span>{t('continueBtn')}</span>{Next}</span>
        </button>
      )}
      {c?.booklet && (
        <button className="continue-card glass" style={{ width: '100%', cursor: 'pointer', display: 'flex' }} onClick={() => nav(c.booklet.professor_id ? '/professors/' + c.booklet.professor_id : '/professors')}>
          <div className="continue-ring" style={{ '--p': 100 }} />
          <div className="continue-body"><div className="continue-eyebrow">{t('continueEyebrow')}</div><div className="continue-title">{c.booklet.title}</div><div className="continue-meta">{c.booklet.subject_name || ''}</div></div>
          <span className="btn"><span>{t('continueBtn')}</span>{Next}</span>
        </button>
      )}
    </>
  );
}

function Week() {
  const { t, lang } = useApp();
  const nav = useNavigate();
  const d = useLoad(() => apiFetch('/auth/me/daily?days=7'), []);
  if (!d) return null;
  const days = d.days || [];
  const answered = days.reduce((a, x) => a + x.answered, 0), correct = days.reduce((a, x) => a + x.correct, 0);
  const acc = answered ? Math.round(correct / answered * 100) : null;
  const prev = d.previous || { answered: 0, correct: 0 };
  const prevAcc = prev.answered ? Math.round(prev.correct / prev.answered * 100) : null;
  const dir = n => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
  const aPct = prev.answered ? Math.round((answered - prev.answered) / prev.answered * 100) : null;
  const cPts = acc !== null && prevAcc !== null ? acc - prevAcc : null;
  const GOAL = 20;
  const today = days.length ? days[days.length - 1] : { answered: 0 };
  const goal = Math.min(100, Math.round((today.answered || 0) / GOAL * 100));
  const loc = dateLocale(lang);
  return (
    <div className="wk-card glass">
      <div className="wk-head"><div className="wk-title">{t('wkTitle')}</div>
        {today.answered > 0 && <span className="daily-live"><i /><span>{t('dailyActiveToday')}</span></span>}</div>
      <div className="wk-goal"><div className="wk-goal-top"><span>{t('wkGoal')}</span><b>{(today.answered || 0) + ' / ' + GOAL}</b></div>
        <div className="wk-bar"><i className={goal >= 100 ? 'done' : ''} style={{ width: goal + '%' }} /></div></div>
      <div className="wk-days">
        {days.map(x => {
          const dt = new Date(x.date + 'T00:00:00Z');
          const on = x.answered > 0;
          return <div key={x.date} className={'wk-day ' + (on ? 'on ' : '') + (x.date === (days[days.length - 1] || {}).date ? 'today' : '')}
            title={`${dt.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} — ${x.correct}/${x.answered}`}>
            <i>{on ? x.answered : ''}</i><span>{dt.toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' })}</span></div>;
        })}
      </div>
      <div className="wk-stats">
        <div><b>{answered.toLocaleString('en-US')}</b><span>{t('dailyAnsweredWeek')}</span><em className={'d ' + dir(aPct ?? 0)}>{aPct === null ? '' : (aPct > 0 ? '+' : '') + aPct + '%'}</em></div>
        <div><b>{acc === null ? '—' : acc + '%'}</b><span>{t('dailyAccuracyWeek')}</span><em className={'d ' + dir(cPts ?? 0)}>{cPts === null ? '' : (cPts > 0 ? '+' : '') + cPts + ' ' + t('dailyPoints')}</em></div>
      </div>
      {!answered && <div className="daily-empty" style={{ display: 'block' }}>{t('dailyEmpty')}</div>}
      <button className="wk-more" onClick={() => nav('/account')}><span>{t('dailyDetails')}</span><Ic n="next" sw={2.4} /></button>
    </div>
  );
}

export default function Home() {
  const { t, user, toast } = useApp();
  const nav = useNavigate();
  const stats = useLoad(() => apiFetch('/auth/me/stats'), [user?.id]);
  const mistakes = useLoad(() => apiFetch('/api/me/mistakes?limit=3'), [user?.id]);
  const perf = useLoad(() => apiFetch('/auth/me/performance'), [user?.id]);
  const latest = useLoad(() => apiFetch('/api/professors/booklets/latest'), [user?.id]);
  const leaders = useLoad(() => apiFetch('/auth/leaderboard?limit=3'), [user?.id]);
  const cont = useLoad(() => apiFetch('/auth/me/continue'), [user?.id]);
  const first = user?.full_name ? user.full_name.split(' ')[0] : '';
  const acc = stats?.accuracy_pct;

  return (
    <div className="view active" id="view-home">   {/* the id the home-screen styles hang on */}
      <div className="home-main">
        <div className="hero glass">
          <div className="hero-top">
            <div><div className="hero-greeting">{first ? `${t('hi')} ${first} 👋` : t('greeting')}</div><div className="hero-sub">{t('greetingSub')}</div></div>
            <div className="stat-ring" style={{ '--p': acc ?? 0 }} title={t('accuracyTitle') || ''}><span>{acc == null ? '—' : acc + '%'}</span></div>
          </div>
          <div className="hero-stats">
            <div className="stat-chip"><Ic n="flame" /><b>{stats ? stats.streak_days : '—'}</b><span>{t('streakLabel')}</span></div>
            <div className="stat-chip"><Ic n="check" color="var(--accent)" /><b>{stats ? stats.answered_today : '—'}</b><span>{t('answeredLabel')}</span></div>
            <div className="stat-chip"><Ic n="flag" color="var(--accent)" /><b>{stats?.rank ? '#' + stats.rank : '—'}</b><span>{t('rankLabel')}</span></div>
          </div>
          <div className="hero-actions">
            <button className="btn" onClick={() => nav('/bank')}><Ic n="check" sw={2.2} size={16} /><span>{t('heroStartBtn')}</span></button>
            <button className="btn btn-ghost" onClick={() => nav('/anatomy')}><Ic n="anatomy" size={16} /><span>{t('anatomyHeroBtn')}</span></button>
          </div>
        </div>
        <div className="tiles">
          {TILES.map(x => (
            <button key={x.key} className={'tile glass' + (x.soon ? ' is-soon' : '')} aria-disabled={x.soon || undefined} onClick={() => (x.soon ? toast(t('comingSoon')) : nav(x.to))}>
              <span className="tile-icon"><Ic n={x.icon} color="#fff" /></span><span className="tile-label">{t(x.key)}</span>{x.soon && <span className="soon-badge">Soon</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="home-side">
        <Verify />
        <PathCard />
        <Continue c={cont} />
        <Week />
        {mistakes && mistakes.length > 0 && (
          <div className="section-block">
            <div className="section-head-row"><div className="section-title">{t('homeMistakesTitle')}</div><button className="link-more" onClick={() => nav('/review')}>{t('viewAll')}</button></div>
            {mistakes.map((m, i) => (
              <button key={i} className="item-card glass" style={{ width: '100%', textAlign: 'start', marginBottom: 8, cursor: 'pointer' }} onClick={() => nav('/review')}>
                <span className="item-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Ic n="warn" /></span>
                <span className="item-body"><span className="item-title" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</span><span className="item-meta" style={{ display: 'block' }}>{m.eyebrow || ''}</span></span>
              </button>
            ))}
          </div>
        )}
        {perf && perf.length > 0 && (
          <div className="section-block"><div className="section-title">{t('homePerfTitle')}</div>
            <div className="glass" style={{ padding: '12px 16px' }}>
              {perf.map((r, i) => (
                <div key={i} className="perf-row">
                  <div className="perf-head"><span className="perf-name">{r.subject_name}</span><span className="perf-pct">{r.accuracy_pct}%</span></div>
                  <div className="perf-bar"><div className="perf-fill" style={{ width: r.accuracy_pct + '%' }} /></div>
                  <div className="perf-count">{r.correct}/{r.answered} {t('perfAnswered')}</div>
                </div>
              ))}
            </div></div>
        )}
        {latest && (
          <div className="section-block"><div className="section-title">{t('homeLatestTitle')}</div>
            <div className="item-card glass">
              <span className="item-icon pdf"><Ic n="pdf" /></span>
              <span className="item-body"><span className="item-title" style={{ display: 'block' }}>{latest.title}</span><span className="item-meta" style={{ display: 'block' }}>{latest.subject_name || ''} · {latest.pages} {t('pages')}</span></span>
              {latest.file_url
                ? <a className="btn btn-ghost item-action" href={mediaUrl(latest.file_url)} target="_blank" rel="noopener noreferrer" onClick={() => post('/auth/me/recent-view', { content_type: 'booklet', content_id: latest.id }).catch(() => {})}>{t('open')}</a>
                : <button className="btn btn-ghost item-action" style={{ opacity: .6 }} onClick={() => toast(t('noFileYet'))}>{t('open')}</button>}
            </div></div>
        )}
        {leaders && leaders.length > 0 && (
          <div className="section-block">
            <div className="section-head-row"><div className="section-title">{t('homeLeaderTitle')}</div><button className="link-more" onClick={() => nav('/leaderboard')}>{t('viewAll')}</button></div>
            {leaders.map(r => (
              <div key={r.rank} className={'item-card glass ' + (r.is_you ? 'lb-you' : '')} style={{ marginBottom: 8 }}>
                <span className="rank-badge">{r.rank}</span>
                <span className="item-body"><span className="item-title" style={{ display: 'block' }}>{r.full_name}{r.is_you && <span className="item-meta" style={{ display: 'inline' }}> ({t('you')})</span>}</span>
                  <span className="item-meta" style={{ display: 'block' }}>{r.correct_count} {t('correctAnswers')}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer>{t('footerNote')}</footer>
    </div>
  );
}
