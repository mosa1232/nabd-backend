import { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Card, Loading, numAr, useData } from '../ui.jsx';

const COLORS = ['#4c5fe0', '#2eb67d', '#e8a33d', '#e5484d', '#8e6bf0', '#3aa6c9', '#94a3b8'];
const STATUS_AR = { pending: 'قيد الدفع', paid: 'مدفوع', fulfilled: 'مُسلَّم', cancelled: 'ملغي', idle: 'غير مستعمل', active: 'مفعّل', expired: 'منتهي', appealed: 'طعن مقدَّم', lifted: 'مرفوع', mcq: 'عادي', practical: 'عملي', mixed: 'مختلط', true_false: 'صح/خطأ', essay: 'مقالي' };
const TABS = [['overview', 'نظرة عامة'], ['students', 'الطلاب'], ['learning', 'التعلّم'], ['doctors', 'الدكاترة'], ['store', 'المتجر والأكواد'], ['security', 'الأمان والأجهزة']];
const pc = v => (v == null ? '—' : v + '%');
const fmtIQD = n => (n || 0).toLocaleString('en-US') + ' د.ع';
const lbl = o => Object.entries(o || {}).map(([k, v]) => ({ label: STATUS_AR[k] || k, count: v }));

const Kpis = ({ items }) => <div className="st-kpis">{items.map(([l, v, s], i) => <div key={i} className="st-kpi"><div className="l">{l}</div><div className="v mono">{v}</div>{s ? <div className="s">{s}</div> : null}</div>)}</div>;
const Two = ({ children }) => <div className="st-two">{children}</div>;
const Box = ({ title, children, note }) => <Card title={title}>{children}{note ? <div className="st-note">{note}</div> : null}</Card>;
function Bars({ series, axis }) {
  if (!series || !series.length || series.every(d => !d.count)) return <div className="empty-row">لا توجد بيانات بهذه الفترة</div>;
  const max = Math.max(1, ...series.map(d => d.count));
  const a0 = axis ? axis[0] : series[0].date.slice(5).replace('-', '/'), a1 = axis ? axis[1] : series[series.length - 1].date.slice(5).replace('-', '/');
  return <><div className="st-bars">{series.map((d, i) => <i key={i} title={`${d.label || d.date} — ${numAr(d.count)}`} style={{ height: Math.max(2, Math.round(100 * d.count / max)) + '%' }} />)}</div>
    <div className="st-axis"><span dir="ltr">{a0}</span><span>الأعلى {numAr(max)}</span><span dir="ltr">{a1}</span></div></>;
}
function List({ rows, unit }) {
  if (!rows || !rows.length) return <div className="empty-row">لا توجد بيانات</div>;
  const max = Math.max(1, ...rows.map(r => r.count));
  return rows.map((r, i) => <div key={i} className="st-row"><span className="n" title={r.name}>{r.name}</span><span className="b"><i style={{ width: Math.round(100 * r.count / max) + '%' }} /></span><span className="c">{numAr(r.count)}{unit || ''}</span></div>);
}
function Stack({ parts }) {
  const list = parts.filter(p => p.count > 0), tot = list.reduce((a, p) => a + p.count, 0);
  if (!tot) return <div className="empty-row">لا توجد بيانات</div>;
  return <><div className="st-stack">{list.map((p, i) => <i key={i} title={`${p.label}: ${numAr(p.count)}`} style={{ width: (100 * p.count / tot) + '%', background: COLORS[i % COLORS.length] }} />)}</div>
    <div className="st-legend">{list.map((p, i) => <span key={i} style={{ '--c': COLORS[i % COLORS.length] }}>{p.label}<b>{numAr(p.count)}</b> <span style={{ display: 'inline', color: 'var(--ink-faint)' }}>({Math.round(100 * p.count / tot)}%)</span></span>)}</div></>;
}
function Tbl({ heads, rows }) {
  if (!rows.length) return <div className="empty-row">لا توجد بيانات</div>;
  return <div className="st-wrap"><table className="st-table"><thead><tr>{heads.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'n' : ''}>{c}</td>)}</tr>)}</tbody></table></div>;
}

const RENDER = {
  overview: st => <>
    <Kpis items={[['إجمالي الطلاب', numAr(st.students), `+${numAr(st.new_students)} جديد في الفترة`], ['طلاب نشطون', numAr(st.active_students), 'أجابوا على سؤال واحد على الأقل'], ['أسئلة مجابة', numAr(st.answers), st.accuracy == null ? '' : `نسبة الصحيح ${st.accuracy}%`], ['الإيرادات', fmtIQD(st.revenue), `${numAr(st.orders)} طلب مدفوع`], ['أكواد فُعّلت', numAr(st.activations), ''], ['حظر معلّق', numAr(st.pending_bans), '']]} />
    <Two><Box title="الأسئلة المجابة يوميًا"><Bars series={st.daily_answers} /></Box><Box title="طلاب جدد يوميًا"><Bars series={st.daily_signups} /></Box></Two>
    <Two><Box title="أكثر المواد نشاطًا"><List rows={st.top_subjects} /></Box><Box title="الطلاب حسب الجامعة"><List rows={st.students_by_university} /></Box></Two></>,
  students: d => <>
    <Kpis items={[['إجمالي الطلاب', numAr(d.total), `+${numAr(d.new)} جديد`], ['نشطون', numAr(d.active), pc(Math.round(100 * d.active / Math.max(1, d.total))) + ' من الكل'], ['موثّقون', numAr(d.verified), pc(Math.round(100 * d.verified / Math.max(1, d.total)))], ['متخرجون', numAr(d.graduates), ''], ['بياناتهم غير مكتملة', numAr(d.profile_incomplete), 'بدون جامعة'], ['محظورون', numAr(d.banned), ''], ['تحقق بخطوتين', numAr(d.with_2fa), '']]} />
    <Two><Box title="تسجيلات جديدة يوميًا"><Bars series={d.daily_signups} /></Box>
      <Box title="طريقة التسجيل"><Stack parts={[{ label: 'Google فقط', count: d.signup_method.google - d.signup_method.both }, { label: 'كلمة مرور فقط', count: d.signup_method.password - d.signup_method.both }, { label: 'الاثنان', count: d.signup_method.both }]} /></Box></Two>
    <Two><Box title="آخر ظهور للطلاب" note="من يظهر «لم يدخل» سُجّل قبل تتبع الأجهزة أو لم يفتح التطبيق."><Stack parts={[{ label: 'اليوم', count: d.last_seen.today }, { label: 'آخر 7 أيام', count: d.last_seen.week }, { label: 'آخر 30 يوم', count: d.last_seen.month }, { label: 'أقدم', count: d.last_seen.older }, { label: 'لم يدخل بعد التحديث', count: d.last_seen.never }]} /></Box>
      <Box title="الطلاب حسب الكلية"><List rows={d.by_section} /></Box></Two>
    <Two><Box title="الطلاب حسب الجامعة"><List rows={d.by_university} /></Box><Box title="الطلاب حسب المرحلة"><List rows={d.by_stage} /></Box></Two>
    <Box title="أنشط الطلاب بالفترة"><Tbl heads={['الطالب', 'الأسئلة', 'الدقة']} rows={d.top_students.map(t => [t.name, numAr(t.answers), pc(t.accuracy)])} /></Box></>,
  learning: d => <>
    <Kpis items={[['أسئلة مجابة', numAr(d.answers), `نسبة الصحيح ${pc(d.accuracy)}`], ['محاولات الامتحانات', numAr(d.exams.attempts), `أُنهي ${numAr(d.exams.finished)} · معدل ${pc(d.exams.avg_score)}`], ['بنك الأسئلة', numAr(d.bank.total), `${numAr(d.bank.with_image)} بصور`], ['الامتحانات', numAr(d.exams.total), ''], ['الكورسات والمحاضرات', `${numAr(d.courses.courses)} / ${numAr(d.courses.lectures)}`, `${numAr(d.courses.completions)} إنهاء محاضرة`], ['الملازم', numAr(d.courses.booklets), '']]} />
    <Two><Box title="الأسئلة المجابة يوميًا"><Bars series={d.daily_answers} /></Box><Box title="الإجابات الصحيحة يوميًا"><Bars series={d.daily_correct} /></Box></Two>
    <Box title="أوقات الدراسة (ساعات اليوم بتوقيت UTC)" note="العراق = UTC+3، أي أضف ثلاث ساعات للقراءة بتوقيتك."><Bars series={d.by_hour.map(h => ({ date: h.hour, label: String(h.hour).padStart(2, '0') + ':00', count: h.count }))} axis={['00:00', '23:00']} /></Box>
    <Two><Box title="أكثر المواد إجابةً"><Tbl heads={['المادة', 'الإجابات', 'الدقة', 'طلاب']} rows={d.top_subjects.map(x => [x.name, numAr(x.answers), pc(x.accuracy), numAr(x.students)])} /></Box>
      <Box title="أصعب المواد (الأقل دقة)" note="تظهر المواد التي لها 20 إجابة فأكثر."><Tbl heads={['المادة', 'الإجابات', 'الدقة']} rows={d.hardest_subjects.map(x => [x.name, numAr(x.answers), pc(x.accuracy)])} /></Box></Two>
    <Box title="أصعب الأسئلة" note="أسئلة جرّبها 5 طلاب فأكثر، والأقل دقة أولًا — مرشحة للمراجعة."><Tbl heads={['السؤال', 'المادة', 'المحاولات', 'الدقة']} rows={d.hardest_questions.map(x => [x.text, x.subject, numAr(x.attempts), pc(x.accuracy)])} /></Box>
    <Two><Box title="بنك الأسئلة" note={`محفوظة عند الطلاب: ${numAr(d.bank.saved_by_students)}`}><Stack parts={[{ label: 'اختيارات', count: d.bank.by_type.mcq }, { label: 'صح/خطأ', count: d.bank.by_type.true_false }, { label: 'مقالي', count: d.bank.by_type.essay }]} /><div style={{ marginTop: 14 }}><List rows={d.bank.by_subject} /></div></Box>
      <Box title="الامتحانات"><Stack parts={Object.entries(d.exams.by_type).map(([k, v]) => ({ label: STATUS_AR[k] || k, count: v }))} /><div style={{ marginTop: 12 }}><Tbl heads={['الامتحان', 'المحاولات', 'المعدل']} rows={d.exams.top.map(x => [x.title, numAr(x.attempts), pc(x.avg)])} /></div></Box></Two>
    <Box title="أكثر المحاضرات إكمالًا"><List rows={d.courses.top_lectures} /></Box></>,
  doctors: d => <>
    <Kpis items={[['الدكاترة', numAr(d.doctors), ''], ['المساعدون', numAr(d.assistants), ''], ['ملفات تدريس', numAr(d.profiles), 'دكتور × مادة'], ['بدون مادة', numAr(d.doctors_without_subject), d.doctors_without_subject ? 'لا يفتحون لوحتهم' : ''], ['لمحات سريرية', numAr(d.pearls), '']]} />
    <Box title="نشاط كل دكتور" note="الإجابات والدقة والطلاب تخص الفترة المختارة، والباقي المجموع الكلي."><Tbl heads={['الدكتور', 'المادة', 'الأسئلة', 'الامتحانات', 'الملازم', 'الكورسات', 'المحاضرات', 'إجابات الطلاب', 'الدقة', 'طلاب', 'محاولات امتحان']} rows={d.rows.map(r => [r.name, r.subject, numAr(r.questions), numAr(r.exams), numAr(r.booklets), numAr(r.courses), numAr(r.lectures), numAr(r.answers), pc(r.accuracy), numAr(r.students), numAr(r.exam_attempts)])} /></Box></>,
  store: d => <>
    <Kpis items={[['إيرادات الفترة', fmtIQD(d.revenue), `${numAr(d.orders)} طلب مدفوع`], ['إجمالي الإيرادات', fmtIQD(d.total_revenue), 'منذ البداية'], ['متوسط الطلب', fmtIQD(d.avg_order), ''], ['أكواد فُعّلت', numAr(d.codes.activated), `من ${numAr(d.codes.total)} كود`], ['أكواد VIP', numAr(d.codes.vip), 'كل المواد'], ['أكواد التوثيق المستعملة', pc(d.verification.used_rate), `${numAr(d.verification.used)} من ${numAr(d.verification.codes)}`]]} />
    <Two><Box title="الإيرادات يوميًا (د.ع)"><Bars series={d.daily_revenue} /></Box><Box title="تفعيل الأكواد يوميًا"><Bars series={d.daily_activations} /></Box></Two>
    <Two><Box title="حالة الطلبات"><Stack parts={lbl(d.orders_by_status)} /></Box><Box title="حالة أكواد التفعيل"><Stack parts={lbl(d.codes.by_status)} /></Box></Two>
    <Box title="أكثر المنتجات مبيعًا"><Tbl heads={['المنتج', 'الكمية', 'الإيراد']} rows={d.top_products.map(x => [x.name, numAr(x.qty), fmtIQD(x.revenue)])} /></Box>
    <Box title="المندوبون"><Tbl heads={['المندوب', 'بحوزته', 'باع (الكل)', 'باع بالفترة', 'الحصة']} rows={d.resellers.map(r => [r.name, numAr(r.held), numAr(r.sold), numAr(r.sold_period), r.quota == null ? 'بلا حد' : numAr(r.quota)])} /></Box>
    <Box title="التوثيق عبر الممثلين"><div className="cell-sub">دفعات مرفوعة: {numAr(d.verification.batches)} · استُعمل {numAr(d.verification.used_period)} كود توثيق خلال الفترة.</div></Box></>,
  security: d => <>
    <Kpis items={[['تسجيلات الدخول', numAr(d.sessions), `${numAr(d.users)} مستخدم`], ['عناوين IP مختلفة', numAr(d.ips), ''], ['حسابات مقفولة الآن', numAr(d.locked_now), 'محاولات خاطئة'], ['إدارة بلا تحقق بخطوتين', `${numAr(d.staff_without_2fa)} / ${numAr(d.staff_total)}`, 'مالك وأدمن ومشرف ومدراء'], ['حظر بالفترة', numAr(d.bans.in_period), `طعون معلّقة ${numAr(d.bans.appeals)}`]]} />
    <Two><Box title="تسجيلات الدخول يوميًا"><Bars series={d.daily_sessions} /></Box><Box title="الأجهزة والمتصفحات"><List rows={d.devices} /></Box></Two>
    <Two><Box title="عناوين IP مشتركة بين 3 حسابات فأكثر" note="قد تكون شبكة جامعة أو سكن، وقد تكون مشاركة حساب — راجعها بعين الاعتبار."><List rows={d.shared_ips} unit=" حساب" /></Box>
      <Box title="حسابات دخلت من 3 عناوين IP أو أكثر" note="مؤشر محتمل لمشاركة الحساب (قاعدة الجلسة الواحدة تمنع الاستعمال المتزامن)."><Tbl heads={['الحساب', 'عناوين IP', 'مرات الدخول']} rows={d.many_ips.map(x => [x.name, numAr(x.ips), numAr(x.logins)])} /></Box></Two>
    <Two><Box title="حالة الحظر"><Stack parts={lbl(d.bans.by_status)} /></Box><Box title="أسباب الحظر"><List rows={d.bans.reasons} /></Box></Two></>,
};

export function Overview() {
  const [tab, setTab] = useState('overview'); const [days, setDays] = useState(30);
  // the answer is tagged with the tab it was asked for, so a tab never renders another tab's numbers
  const { data: got, error, loading } = useData(async () => ({ tab, days, d: await apiFetch((tab === 'overview' ? '/api/admin/stats?days=' : `/api/admin/stats/${tab}?days=`) + days) }), [tab, days]);
  const data = got && got.tab === tab && got.days === days ? got.d : null;
  return (
    <>
      <div className="st-head">
        <div className="st-tabs">{TABS.map(([k, l]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="st-period">{[7, 30, 90, 365].map(d => <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>{d === 365 ? 'سنة' : 'آخر ' + d + ' يوم'}</button>)}</div>
      </div>
      {error ? <div className="empty-row">{error}</div> : !data || loading ? <Loading /> : RENDER[tab](data)}
    </>
  );
}
