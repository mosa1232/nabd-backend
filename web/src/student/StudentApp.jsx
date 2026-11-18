import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app.jsx';
import Shell from './Shell.jsx';
import Home from './pages/Home.jsx';
import { BankSelect, BankSections, BankStudy, PageHead } from './pages/Bank.jsx';
import { Quiz, QuizSummary } from './pages/Quiz.jsx';
import { Landing, Login, TotpVerify, CompleteProfile, SetCredentials } from './pages/Auth.jsx';
import { Forgot, Reset } from './pages/Recover.jsx';
import { Account, AccountEdit } from './pages/Account.jsx';
import { Exam, ExamResult } from './pages/Exam.jsx';
import { Review, Leaderboard, StudentProfile } from './pages/Review.jsx';
import { Professors, Professor } from './pages/Professors.jsx';
import { Notifications, Support } from './pages/Inbox.jsx';
import studentCss from './student.css?inline';
import { useStyle } from '../lib/useStyle.js';

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
  useStyle(studentCss);   // the student stylesheet is only in the page while the student app is shown
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
        <Route path="/professors" element={<Professors />} />
        <Route path="/professors/:id" element={<Professor />} />
        <Route path="/exam/:examId" element={<Exam />} />
        <Route path="/exam-result/:attemptId" element={<ExamResult />} />
        <Route path="/students/:id" element={<StudentProfile />} />
        <Route path="/store/*" element={soon('tileStore')} />
        <Route path="/review" element={<Review />} />
        <Route path="/pearls" element={soon('pearlsTitle')} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/ai/*" element={soon('aiNavTitle')} />
        <Route path="/support" element={<Support />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/edit" element={<AccountEdit />} />
        <Route path="/academy/*" element={soon('tileVideo')} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
