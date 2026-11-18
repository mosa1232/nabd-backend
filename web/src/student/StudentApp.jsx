import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app.jsx';
import Shell from './Shell.jsx';
import Home from './pages/Home.jsx';
import { BankSelect, BankSections, BankStudy, PageHead } from './pages/Bank.jsx';
import { Quiz, QuizSummary } from './pages/Quiz.jsx';
import { Landing, Login, TotpVerify, CompleteProfile, SetCredentials } from './pages/Auth.jsx';
import { Forgot, Reset } from './pages/Recover.jsx';
import './student.css';

// Pages still being moved over from the old app keep working there.
function Moving({ title }) {
  const nav = useNavigate();
  const { t } = useApp();
  const old = 'https://kiur.online' + location.pathname;
  return (
    <div className="view active">
      <PageHead title={title || '…'} back="/" />
      <div className="glass" style={{ margin: '16px', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>هذه الصفحة قيد النقل للنسخة الجديدة</div>
        <div className="item-meta" style={{ marginBottom: 16 }}>تعمل كاملة على النسخة الحالية للمنصة.</div>
        <a className="btn" href={'https://kiur.online/'} style={{ marginInlineEnd: 8 }}>افتح النسخة الحالية</a>
        <button className="btn btn-ghost" onClick={() => nav('/')}>{t('navHome')}</button>
      </div>
    </div>
  );
}

function Guard() {
  const { user, booted, pending } = useApp();
  if (!booted) return <div className="view active"><div className="empty-row" style={{ marginTop: 80 }}>…</div></div>;
  if (!user) return <Navigate to={pending.current.reset ? '/reset' : '/welcome'} replace />;
  if (user.profile_complete === false) return <Navigate to="/complete-profile" replace />;
  if (user.needs_credentials) return <Navigate to="/set-credentials" replace />;
  return <Shell />;
}

export default function StudentApp() {
  const { t } = useApp();
  const soon = (key) => <Moving title={t(key)} />;
  return (
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login register />} />
      <Route path="/2fa" element={<TotpVerify />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/set-credentials" element={<SetCredentials />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route element={<Guard />}>
        <Route path="/" element={<Home />} />
        <Route path="/bank" element={<BankSelect />} />
        <Route path="/bank/:subjectId" element={<BankSections />} />
        <Route path="/bank/:subjectId/study/:key" element={<BankStudy />} />
        <Route path="/quiz/:subjectId" element={<Quiz />} />
        <Route path="/quiz-summary" element={<QuizSummary />} />
        <Route path="/anatomy" element={soon('anatomyTitle')} />
        <Route path="/professors/*" element={soon('tileProf')} />
        <Route path="/store/*" element={soon('tileStore')} />
        <Route path="/review" element={soon('tileReview')} />
        <Route path="/pearls" element={soon('pearlsTitle')} />
        <Route path="/leaderboard" element={soon('tileLeaderboard')} />
        <Route path="/ai/*" element={soon('aiNavTitle')} />
        <Route path="/support" element={soon('supportTitle')} />
        <Route path="/notifications" element={soon('notifications')} />
        <Route path="/account/*" element={soon('accountTitle')} />
        <Route path="/academy/*" element={soon('tileVideo')} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
