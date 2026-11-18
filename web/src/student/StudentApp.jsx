import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from '../lib/app.jsx';
import Shell from './Shell.jsx';
import Home from './pages/Home.jsx';
import { BankSelect, BankSections, BankStudy } from './pages/Bank.jsx';
import { Quiz, QuizSummary } from './pages/Quiz.jsx';
import { Login, TotpVerify, CompleteProfile, SetCredentials } from './pages/Auth.jsx';
import { Forgot, Reset } from './pages/Recover.jsx';
import { Account, AccountEdit } from './pages/Account.jsx';
import { Exam, ExamResult } from './pages/Exam.jsx';
import { Review, Leaderboard, StudentProfile } from './pages/Review.jsx';
import { Professors, Professor } from './pages/Professors.jsx';
import { Notifications, Support } from './pages/Inbox.jsx';
import { AiList, AiChat } from './pages/AI.jsx';
import { Pearls, Summer } from './pages/Misc.jsx';
import { Anatomy } from './pages/Anatomy.jsx';
import { Landing } from './pages/Landing.jsx';
import { Banned } from './pages/Banned.jsx';
import { Academy, Course } from './pages/Academy.jsx';
import { StoreProvider, Store, Cart, Checkout, MyOrders } from './pages/Store.jsx';
import studentCss from './student.css?inline';
import { useStyle } from '../lib/useStyle.js';

function Guard() {
  const { user, booted, pending, banned } = useApp();
  if (!booted) return <div className="view active"><div className="empty-row" style={{ marginTop: 80 }}>…</div></div>;
  if (banned) return <Banned />;
  if (!user) return <Navigate to={pending.current.reset ? '/reset' : '/welcome'} replace />;
  if (user.profile_complete === false) return <Navigate to="/complete-profile" replace />;
  if (user.needs_credentials) return <Navigate to="/set-credentials" replace />;
  return <Shell />;
}

export default function StudentApp() {
  useStyle(studentCss);   // the student stylesheet is only in the page while the student app is shown
  return (
    <StoreProvider>
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
        <Route path="/anatomy" element={<Anatomy />} />
        <Route path="/summer" element={<Summer />} />
        <Route path="/professors" element={<Professors />} />
        <Route path="/professors/:id" element={<Professor />} />
        <Route path="/exam/:examId" element={<Exam />} />
        <Route path="/exam-result/:attemptId" element={<ExamResult />} />
        <Route path="/students/:id" element={<StudentProfile />} />
        <Route path="/store" element={<Store />} />
        <Route path="/store/cart" element={<Cart />} />
        <Route path="/store/checkout" element={<Checkout />} />
        <Route path="/store/orders" element={<MyOrders />} />
        <Route path="/review" element={<Review />} />
        <Route path="/pearls" element={<Pearls />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/ai" element={<AiList />} />
        <Route path="/ai/:id" element={<AiChat />} />
        <Route path="/support" element={<Support />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/edit" element={<AccountEdit />} />
        <Route path="/academy" element={<Academy />} />
        <Route path="/academy/:id" element={<Course />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </StoreProvider>
  );
}
