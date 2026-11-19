import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from '../lib/app.jsx';
import Shell from './Shell.jsx';
import Home from './pages/Home.jsx';
import { StoreProvider } from './storeCtx.jsx';
import { useAreaStyle } from '../lib/useStyle.js';

const loadStudentCss = () => (import.meta.env.PROD ? import('./student.css?url') : import('./student.css?inline'));

// Every page except the home screen is its own chunk: a phone downloads and parses only the screen it opens.
const page = (load, name) => lazy(() => load().then(m => ({ default: m[name] })));
const BankSelect = page(() => import('./pages/Bank.jsx'), 'BankSelect');
const BankSections = page(() => import('./pages/Bank.jsx'), 'BankSections');
const BankStudy = page(() => import('./pages/Bank.jsx'), 'BankStudy');
const Quiz = page(() => import('./pages/Quiz.jsx'), 'Quiz');
const QuizSummary = page(() => import('./pages/Quiz.jsx'), 'QuizSummary');
const Login = page(() => import('./pages/Auth.jsx'), 'Login');
const TotpVerify = page(() => import('./pages/Auth.jsx'), 'TotpVerify');
const CompleteProfile = page(() => import('./pages/Auth.jsx'), 'CompleteProfile');
const SetCredentials = page(() => import('./pages/Auth.jsx'), 'SetCredentials');
const Forgot = page(() => import('./pages/Recover.jsx'), 'Forgot');
const Reset = page(() => import('./pages/Recover.jsx'), 'Reset');
const Account = page(() => import('./pages/Account.jsx'), 'Account');
const AccountEdit = page(() => import('./pages/Account.jsx'), 'AccountEdit');
const Exam = page(() => import('./pages/Exam.jsx'), 'Exam');
const ExamResult = page(() => import('./pages/Exam.jsx'), 'ExamResult');
const Review = page(() => import('./pages/Review.jsx'), 'Review');
const Leaderboard = page(() => import('./pages/Review.jsx'), 'Leaderboard');
const StudentProfile = page(() => import('./pages/Review.jsx'), 'StudentProfile');
const Professors = page(() => import('./pages/Professors.jsx'), 'Professors');
const Professor = page(() => import('./pages/Professors.jsx'), 'Professor');
const Notifications = page(() => import('./pages/Inbox.jsx'), 'Notifications');
const Support = page(() => import('./pages/Inbox.jsx'), 'Support');
const AiList = page(() => import('./pages/AI.jsx'), 'AiList');
const AiChat = page(() => import('./pages/AI.jsx'), 'AiChat');
const Pearls = page(() => import('./pages/Misc.jsx'), 'Pearls');
const Summer = page(() => import('./pages/Misc.jsx'), 'Summer');
const Anatomy = page(() => import('./pages/Anatomy.jsx'), 'Anatomy');
const Landing = page(() => import('./pages/Landing.jsx'), 'Landing');
const Academy = page(() => import('./pages/Academy.jsx'), 'Academy');
const Course = page(() => import('./pages/Academy.jsx'), 'Course');
const Store = page(() => import('./pages/Store.jsx'), 'Store');
const Cart = page(() => import('./pages/Store.jsx'), 'Cart');
const Checkout = page(() => import('./pages/Store.jsx'), 'Checkout');
const MyOrders = page(() => import('./pages/Store.jsx'), 'MyOrders');
const Banned = page(() => import('./pages/Banned.jsx'), 'Banned');

const Loading = () => <div className="view active"><div className="empty-row" style={{ marginTop: 80 }}>…</div></div>;

function Guard() {
  const { user, booted, pending, banned } = useApp();
  if (!booted) return <Loading />;
  if (banned) return <Suspense fallback={<Loading />}><Banned /></Suspense>;
  if (!user) {
    // remember a shared exam link so sign-in can bring the student straight back to it
    try { if (/^\/exam\/[\w-]+$/.test(location.pathname)) sessionStorage.setItem('kiur_after_login', location.pathname); } catch { /* storage blocked */ }
    return <Navigate to={pending.current.reset ? '/reset' : '/welcome'} replace />;
  }
  if (user.profile_complete === false) return <Navigate to="/complete-profile" replace />;
  if (user.needs_credentials) return <Navigate to="/set-credentials" replace />;
  try {   // came back from Google sign-in (a full page reload) to a shared exam link
    const back = sessionStorage.getItem('kiur_after_login');
    if (back && location.pathname === '/' && /^\/exam\/[\w-]+$/.test(back)) { sessionStorage.removeItem('kiur_after_login'); return <Navigate to={back} replace />; }
  } catch { /* storage blocked */ }
  return <Shell />;
}

export default function StudentApp() {
  const styled = useAreaStyle(loadStudentCss);   // the student stylesheet is only in the page while the student app is shown
  if (!styled) return null;
  return (
    <StoreProvider>
    <Suspense fallback={<Loading />}>
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
    </Suspense>
    </StoreProvider>
  );
}