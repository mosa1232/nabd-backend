// Sidebar definitions per role, and which permissions show which pages.
// The server enforces every permission itself; this only decides what is worth showing.
export const ALL_STAFF_PERMS = ['dashboard.analytics', 'users.manage', 'users.ban', 'catalog.manage', 'content.manage', 'store.manage', 'resellers.manage', 'support.manage'];
export const PROF_PERM_LIST = ['prof.questions', 'prof.exams', 'prof.courses', 'prof.booklets', 'prof.pearls', 'prof.students'];
export const PERM_LABELS = {
  'dashboard.analytics': 'الإحصائيات ونظرة عامة وسجل النشاطات',
  'users.manage': 'إدارة الحسابات والأدوار',
  'support.manage': 'الدعم: الرد على محادثات الطلاب',
  'users.ban': 'الحظر والطعون',
  'catalog.manage': 'إدارة المناهج',
  'content.manage': 'المحتوى: التدريب الصيفي والإشعارات والملفات',
  'store.manage': 'المتجر: المنتجات والأقسام والطلبات',
  'resellers.manage': 'إدارة المندوبين وصلاحياتهم',
  'codes.view': 'عرض الأكواد وسجل المبيعات',
  'codes.generate': 'توليد / أخذ أكواد جديدة',
  'prof.questions': 'رفع وتعديل الأسئلة',
  'prof.exams': 'إنشاء الامتحانات (الكوزات)',
  'prof.courses': 'الكورسات والمحاضرات',
  'prof.booklets': 'الملازم',
  'prof.pearls': 'اللمحات السريرية',
  'prof.students': 'مشاهدة الطلاب',
  'rep.codes': 'رفع أسماء الطلاب وتوليد أكواد التوثيق',
};

const STAFF_NAV = [
  { id: 'overview', label: 'نظرة عامة', icon: 'grid', perm: 'dashboard.analytics' },
  { id: 'accounts', label: 'الحسابات', icon: 'users', perm: 'users.manage' },
  { id: 'support', label: 'الدعم', icon: 'chat', perm: 'support.manage' },
  { id: 'roles', label: 'الأدوار', icon: 'key', perm: 'users.manage' },
  { id: 'admins', label: 'الأدمنية', icon: 'users', perm: 'users.manage' },
  { id: 'doctors', label: 'الدكاترة', icon: 'student', perm: 'users.manage' },
  { id: 'reps', label: 'الممثلون', icon: 'users', perm: 'users.manage' },
  { id: 'resellers', label: 'المندوبون', icon: 'key', perm: 'resellers.manage' },
  { id: 'notifications', label: 'الإشعارات', icon: 'bell', perm: 'content.manage' },
  { id: 'catalog', label: 'المناهج', icon: 'book', perm: 'catalog.manage' },
  { id: 'summer', label: 'التدريب الصيفي', icon: 'exam', perm: 'content.manage' },
  { id: 'students', label: 'الطلاب', icon: 'student', perm: 'dashboard.analytics' },
  { id: 'bans', label: 'الحظر', icon: 'ban', perm: 'users.ban' },
  { id: 'store', label: 'المتجر', icon: 'key', perm: 'store.manage' },
  { id: 'media', label: 'الملفات', icon: 'media', perm: 'content.manage' },
  { id: 'logs', label: 'سجل النشاطات', icon: 'log', perm: 'dashboard.analytics' },
  { id: 'importexport', label: 'استيراد وتصدير', icon: 'importexport', perm: 'content.manage' },
];
const PROF_NAV = [
  { id: 'p-overview', label: 'نظرة عامة', icon: 'grid', perm: 'any' },
  { id: 'p-questions', label: 'بنك أسئلتي', icon: 'pdf', perm: 'prof.questions' },
  { id: 'p-pearls', label: 'لمحات سريرية', icon: 'book', perm: 'prof.pearls' },
  { id: 'p-exams', label: 'امتحاناتي (كوزات)', icon: 'exam', perm: 'prof.exams' },
  { id: 'p-booklets', label: 'ملازمي', icon: 'pdf', perm: 'prof.booklets' },
  { id: 'p-courses', label: 'كورساتي', icon: 'log', perm: 'prof.courses' },
  { id: 'p-students', label: 'طلابي', icon: 'student', perm: 'prof.students' },
  { id: 'p-assistants', label: 'مساعدو الدكتور', icon: 'users', perm: 'owner' },
];
const RES_NAV = [
  { id: 'r-overview', label: 'رصيد الأكواد', icon: 'key', perm: 'codes.view' },
  { id: 'r-codes', label: 'الأكواد', icon: 'pdf', perm: 'codes.any' },
  { id: 'r-sales', label: 'سجل المبيعات', icon: 'log', perm: 'codes.view' },
];
const REP_NAV = [
  { id: 'rep-codes', label: 'أكواد التوثيق', icon: 'key', perm: 'rep.codes' },
  { id: 'p-questions', label: 'بنك الأسئلة', icon: 'pdf', perm: 'prof.questions', group: 'النشر باسمك' },
  { id: 'p-booklets', label: 'الملازم', icon: 'pdf', perm: 'prof.booklets' },
  { id: 'p-exams', label: 'الامتحانات (كوزات)', icon: 'exam', perm: 'prof.exams' },
  { id: 'p-pearls', label: 'لمحات سريرية', icon: 'book', perm: 'prof.pearls' },
];
// the owner also opens the other roles' own dashboards, acting as a chosen account
const VIEWAS_NAV = [
  { id: 'p-overview', label: 'نظرة عامة', icon: 'grid', perm: 'viewas', group: 'لوحة الدكتور' },
  { id: 'p-questions', label: 'بنك الأسئلة', icon: 'pdf', perm: 'viewas' },
  { id: 'p-pearls', label: 'لمحات سريرية', icon: 'book', perm: 'viewas' },
  { id: 'p-exams', label: 'الامتحانات (كوزات)', icon: 'exam', perm: 'viewas' },
  { id: 'p-booklets', label: 'الملازم', icon: 'pdf', perm: 'viewas' },
  { id: 'p-courses', label: 'الكورسات', icon: 'log', perm: 'viewas' },
  { id: 'p-students', label: 'الطلاب', icon: 'student', perm: 'viewas' },
  { id: 'p-assistants', label: 'المساعدون', icon: 'users', perm: 'viewas' },
  { id: 'r-overview', label: 'رصيد الأكواد', icon: 'key', perm: 'viewas', group: 'لوحة المندوب' },
  { id: 'r-codes', label: 'الأكواد', icon: 'pdf', perm: 'viewas' },
  { id: 'r-sales', label: 'سجل المبيعات', icon: 'log', perm: 'viewas' },
  { id: 'rep-codes', label: 'أكواد التوثيق', icon: 'key', perm: 'viewas', group: 'لوحة الممثل العام' },
  { id: 'repv-questions', label: 'بنك الأسئلة', icon: 'pdf', perm: 'viewas', alias: 'p-questions' },
  { id: 'repv-booklets', label: 'الملازم', icon: 'pdf', perm: 'viewas', alias: 'p-booklets' },
  { id: 'repv-exams', label: 'الامتحانات (كوزات)', icon: 'exam', perm: 'viewas', alias: 'p-exams' },
  { id: 'repv-pearls', label: 'لمحات سريرية', icon: 'book', perm: 'viewas', alias: 'p-pearls' },
];
export const ROLE_NAV = {
  owner: STAFF_NAV.concat(VIEWAS_NAV), admin: STAFF_NAV.concat(VIEWAS_NAV), supervisor: STAFF_NAV, store_manager: STAFF_NAV,
  professor: PROF_NAV, assistant: PROF_NAV, reseller: RES_NAV, representative: REP_NAV,
};
export const ROLE_LABELS = {
  owner: 'المالك', admin: 'أدمن', supervisor: 'مشرف', store_manager: 'مدير المتجر',
  professor: 'لوحة الدكتور', assistant: 'مساعد الدكتور', reseller: 'لوحة المندوب', representative: 'الممثل العام',
};
export const NAV_GROUP = {
  overview: 'الرئيسية',
  accounts: 'المستخدمون', roles: 'المستخدمون', admins: 'المستخدمون', doctors: 'المستخدمون', reps: 'المستخدمون', resellers: 'المستخدمون',
  students: 'الطلاب والدعم', support: 'الطلاب والدعم', bans: 'الطلاب والدعم',
  catalog: 'المحتوى', summer: 'المحتوى', notifications: 'المحتوى', media: 'المحتوى', importexport: 'المحتوى',
  store: 'المتجر', logs: 'النظام',
};
export const VIEWAS_VIEW_GROUPS = { doctor: 'professor', reseller: 'reseller', rep: 'representative' };
export const VIEWAS_WORD = { doctor: 'دكتور', reseller: 'مندوب', rep: 'ممثل' };

export const isDashboardRole = (role) => !!ROLE_NAV[role];
export const permsOf = (user) => new Set((user && user.effective_permissions) || []);
export function canSee(item, user) {
  const p = permsOf(user), role = user && user.role;
  if (item.perm === 'any') return PROF_PERM_LIST.some(x => p.has(x));
  if (item.perm === 'owner') return role === 'professor';
  if (item.perm === 'viewas') return role === 'owner' || ((role === 'admin' || role === 'supervisor') && p.has('users.manage'));
  if (item.perm === 'codes.any') return p.has('codes.view') || p.has('codes.generate');
  return p.has(item.perm);
}
export const itemsFor = (user) => (ROLE_NAV[user.role] || []).filter(i => canSee(i, user));
// which "view as" group a section belongs to (doctor / reseller / rep), if the signed-in user is staff
export function viewAsGroupOf(sectionId, forced) {
  if (!sectionId) return null;
  if (forced && sectionId.startsWith('p-')) return forced;
  if (sectionId.startsWith('rep-')) return 'rep';
  if (sectionId.startsWith('p-')) return 'doctor';
  if (sectionId.startsWith('r-')) return 'reseller';
  return null;
}
