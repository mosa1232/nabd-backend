import { useMemo, useRef, useState } from 'react';
import { apiFetch, post, put, del, upload, mediaUrl } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { ax } from '../state.js';
import { Card, AddBtn, KpiGrid, StKpis, Table, Badge, RowActions, SmallBtn, TrashBtn, Loading, numAr, useData } from '../ui.jsx';

const BOOKLET_MAX_MB = 80;

// ------------------------------------------------------------------ overview
export function Overview() {
  const A = useAdmin();
  const { data: d, error, reload } = useData(() => apiFetch('/api/professors/me/dashboard'), []);
  const { data: subs } = useData(() => apiFetch('/api/professors/me/subjects').catch(() => []), []);
  const [title, setTitle] = useState(null); const [bio, setBio] = useState(null); const [msg, setMsg] = useState('');
  const photo = useRef(null);
  if (error) return <Card>{error}</Card>;
  if (!d) return <Loading />;
  const p = d.professor;
  const t = title ?? p.title ?? '', b = bio ?? p.bio ?? '';
  const save = async () => {
    setMsg('جارٍ الحفظ...');
    try { await put('/api/professors/me/profile', { title: t.trim(), bio: b.trim() }); setMsg('تم الحفظ ✓'); setTitle(null); setBio(null); reload(); }
    catch (e) { setMsg(e.detail || 'تعذّر الحفظ'); }
  };
  const uploadPhoto = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { await upload('/api/professors/me/photo', fd); A.toast('تم تحديث الصورة ✓'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر رفع الصورة', 'error'); }
  };
  return (
    <>
      <KpiGrid items={[['ملازمي', d.booklet_count], ['امتحاناتي', d.exam_count], ['الطلاب النشطون', d.student_count], ['متوسط أداء الطلاب', d.avg_student_score != null ? d.avg_student_score + '%' : '—']]} />
      <Card title="مرحباً بعودتك">
        <div style={{ fontSize: '.85rem', color: 'var(--ink-soft)', lineHeight: 1.8 }}>مرحباً {p.name} — {p.title} في {p.subject}. من هنا تقدر ترفع ملازم جديدة، تبني امتحانات، وتتابع مستوى طلابك.</div>
        {subs && subs.length > 1 && (
          <div style={{ margin: '10px 0' }}>
            <label style={{ fontSize: '.82rem', color: 'var(--ink-faint)' }}>المادة التي تعمل عليها</label>
            <select value={A.subject || subs[0].subject_id} onChange={e => { A.setSubject(e.target.value); A.bump(); }}
              style={{ display: 'block', marginTop: 4, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', width: '100%', maxWidth: 420 }}>
              {subs.map(x => <option key={x.subject_id} value={x.subject_id}>{x.subject_name}{x.department_name ? ' — ' + x.department_name : ''}{x.stage_name ? ' — ' + x.stage_name : ''}</option>)}
            </select>
          </div>
        )}
      </Card>
      <Card title="صفحتي العامة">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(145deg, var(--accent), var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.4rem' }}>
              {p.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.name || '').replace('د. ', '').split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 8, padding: '6px 12px', fontSize: '.72rem' }} onClick={() => photo.current.click()}>تغيير الصورة</button>
            <input ref={photo} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files[0])} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="form-field" style={{ marginBottom: 8 }}><input type="text" placeholder="اللقب الأكاديمي (مثال: أستاذ مساعد)" value={t} onChange={e => setTitle(e.target.value)} /></div>
            <div className="form-field" style={{ marginBottom: 8 }}><textarea rows={3} placeholder="نبذة عنك يشوفها الطلاب..." value={b} onChange={e => setBio(e.target.value)} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '.85rem', color: 'var(--ink)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)' }} /></div>
            <button className="btn" style={{ padding: '8px 16px', fontSize: '.8rem' }} onClick={save}>حفظ</button>
            {msg && <span style={{ fontSize: '.75rem', marginInlineStart: 8 }}>{msg}</span>}
          </div>
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ booklets
// where the booklet goes: nothing extra for a doctor with one subject, the full chain for the platform, subject + "publish as" for a representative
async function whereSpec(A) {
  const staff = ['owner', 'admin', 'supervisor'].includes(A.user.role);
  const asRep = A.user.role === 'representative' || (staff && A.pick.rep && !A.pick.doctor);
  const flat = subs => subs.map(s => ({ id: s.subject_id, name: `${s.subject_name}${s.department_name ? ' — ' + s.department_name : ''}${s.stage_name ? ' — ' + s.stage_name : ''}` }));
  if (staff && !asRep && (A.pick.doctor || '__platform__') === '__platform__') {
    const info = await apiFetch('/api/admin/platform');
    return { mode: 'platform', subs: info.subjects, subject: A.plat.subject };
  }
  if (asRep) {
    const [subs, teachers] = await Promise.all([apiFetch('/api/professors/me/subjects'), apiFetch('/api/professors/me/teachers')]);
    return { mode: 'rep', subs: flat(subs), teachers, subject: A.subject, teacher: A.teacher };
  }
  if (A.user.role === 'professor' || A.user.role === 'assistant') {
    const subs = await apiFetch('/api/professors/me/subjects');
    if (subs.length > 1) return { mode: 'flat', subs: flat(subs), subject: A.subject || subs[0].subject_id };
  }
  return null;
}

export function Booklets() {
  const A = useAdmin();
  const { data: d, error, reload } = useData(() => apiFetch('/api/professors/me/dashboard'), []);
  const input = useRef(null); const pending = useRef(null);
  if (error) return <Card>{error}</Card>;
  if (!d) return <Loading />;
  const list = d.booklets || [];

  const add = async () => {
    let spec = null;
    try { spec = await whereSpec(A); } catch (e) { return A.toast(e.detail || 'تعذّر تحميل المواد', 'error'); }
    A.dialogs.form({
      title: 'رفع ملزمة', submitLabel: 'رفع',
      fields: [
        ...(spec ? [{ id: 'where', type: 'where', title: 'وين تريد تنشر الملزمة؟', ...spec }] : []),
        { id: 'file', type: 'file', accept: 'application/pdf,image/*', label: `ملف الملزمة (PDF أو صورة — حتى ${BOOKLET_MAX_MB} ميغابايت)`,
          onPick: (f, setV, vals) => { if (f && !vals.title) setV('title', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()); } },
        { id: 'title', label: 'عنوان الملزمة (يؤخذ من اسم الملف إن تركته)' },
        { id: 'pages', type: 'number', label: 'عدد الصفحات (يُقرأ من الـ PDF تلقائيًا إن تركته فارغًا)', value: '' },
      ],
      onSubmit: async (v, say) => {
        const hdr = {};
        if (spec) {
          const w = v.where || {};
          if (!w.subject) throw { detail: spec.mode === 'platform' ? 'حدّد المكان كاملًا: نوع الكلية ← الجامعة ← القسم ← المرحلة ← المادة' : 'اختر المادة' };
          hdr['X-Subject-Id'] = w.subject;
          if (spec.mode === 'rep') {
            if (w.wantsNew && !w.newName) throw { detail: 'اكتب اسم الدكتور أو اختر النشر باسمك' };
          }
        }
        if (!v.file) throw { detail: 'اختر ملف الملزمة أولًا' };
        if (v.file.size > BOOKLET_MAX_MB * 1048576) throw { detail: `الملف ${(v.file.size / 1048576).toFixed(0)} ميغابايت — الحد الأقصى ${BOOKLET_MAX_MB}. اضغط الـ PDF ثم أعد الرفع.` };
        if (spec && spec.mode === 'rep') {
          let tid = v.where.teacher;
          if (v.where.wantsNew) tid = (await post('/api/professors/me/teachers', { name: v.where.newName })).id;
          hdr['X-Teacher-Id'] = tid || '';
          A.setTeacher(tid || '');
        }
        const fd = new FormData();
        fd.append('file', v.file); fd.append('title', (v.title || '').trim()); fd.append('pages', String(parseInt(v.pages, 10) || 0));
        await upload('/api/professors/me/booklets/with-file', fd, pct => say(pct < 100 ? `جارٍ الرفع… ${pct}%` : 'اكتمل الرفع — نحفظ الملزمة…'), hdr);
        A.toast('✓ تم رفع الملزمة');
        if (spec) {   // show the list of the place it was just saved in
          A.setSubject(v.where.subject);
          if (spec.mode === 'platform') { A.setPlat(p => ({ ...p, ...v.where.pick, subject: v.where.subject })); try { localStorage.setItem('kiur_platform_subject', v.where.subject); } catch { /* ignore */ } }
          A.bump();
        } else reload();
      },
    });
  };
  const edit = (b) => A.dialogs.form({
    title: 'تعديل ملزمة', fields: [{ id: 'title', label: 'عنوان الملزمة', value: b.title }, { id: 'pages', type: 'number', label: 'عدد الصفحات', value: b.pages }],
    onSubmit: async (v) => { if (!v.title.trim()) throw { detail: 'العنوان مطلوب' }; await put('/api/professors/me/booklets/' + b.id, { title: v.title.trim(), pages: parseInt(v.pages, 10) || 0 }); reload(); },
  });
  const remove = async (b) => {
    if (!await A.dialogs.confirm('حذف هذه الملزمة نهائياً؟')) return;
    try { await del('/api/professors/me/booklets/' + b.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر حذف الملزمة', 'error'); }
  };
  const replaceFile = async (file) => {
    if (!file || !pending.current) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      if (file.size > BOOKLET_MAX_MB * 1048576) throw { detail: `الملف ${(file.size / 1048576).toFixed(0)} ميغابايت — الحد الأقصى ${BOOKLET_MAX_MB}` };
      A.toast('جارٍ رفع الملف…');
      await upload('/api/professors/me/booklets/' + pending.current + '/file', fd);
      input.current.value = ''; A.toast('تم رفع الملف بنجاح'); reload();
    } catch (e) { A.toast(e.detail || 'تعذّر رفع الملف', 'error'); }
  };
  return (
    <>
      <StKpis items={[['الملازم', numAr(list.length)], ['مجموع الصفحات', numAr(list.reduce((a, x) => a + (x.pages || 0), 0))], ['بدون ملف مرفوع', numAr(list.filter(x => !x.file_url).length), list.some(x => !x.file_url) ? 'ارفع ملفها ليراها الطلاب' : '']]} />
      <Card title="ملازمي" actions={<AddBtn onClick={add}>رفع ملزمة جديدة</AddBtn>}>
        <input ref={input} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => replaceFile(e.target.files[0])} />
        <Table head={['العنوان', 'الصفحات', 'الملف', '']} empty="لا توجد ملازم بعد">
          {list.map(b => (
            <tr key={b.id}>
              <td><div className="cell-name">{b.title}</div></td><td>{b.pages}</td>
              <td>{b.file_url ? <a href={mediaUrl(b.file_url)} target="_blank" rel="noreferrer" className="badge badge-active" style={{ textDecoration: 'none' }}>عرض الملف</a> : <Badge kind="disabled">لا يوجد ملف</Badge>}</td>
              <RowActions>
                <SmallBtn onClick={() => { pending.current = b.id; input.current.click(); }}>{b.file_url ? 'تغيير الملف' : 'رفع ملف'}</SmallBtn>
                <SmallBtn onClick={() => edit(b)}>تعديل</SmallBtn>
                <TrashBtn label="حذف الملزمة" onClick={() => remove(b)} />
              </RowActions>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ exams
const EXAM_TYPES = [{ value: 'mcq', label: 'نظري — أسئلة اختيارات' }, { value: 'practical', label: 'عملي — محطات بصور (كل صورة بوقت محدد)' }, { value: 'mixed', label: 'مختلط' }];
function examBody(v) {
  const type = v.examType || 'mcq';
  const body = { title: v.title.trim(), question_count: parseInt(v.questionCount, 10) || 0, duration_minutes: parseInt(v.duration, 10) || 30, exam_type: type };
  body.bank_ids = v.bankIds || [];
  if (type === 'practical') { body.seconds_per_question = parseInt(v.stationSeconds, 10) || null; if (!body.seconds_per_question) throw { detail: 'حدّد مدة كل محطة بالثواني (5 إلى 600)' }; }
  return body;
}
export function Exams() {
  const A = useAdmin();
  const { data: d, error, reload } = useData(() => apiFetch('/api/professors/me/dashboard'), []);
  if (error) return <Card>{error}</Card>;
  if (!d) return <Loading />;
  const list = d.exams || [];
  const form = async (cur) => {
    let imgs = null; let banks = [];
    if (!cur) { try { imgs = (await apiFetch('/api/professors/me/exams/image-questions')).count; } catch { /* hint only */ } }
    try { banks = (await apiFetch('/api/professors/me/banks')).banks || []; } catch { /* no banks: the exam uses every question */ }
    A.dialogs.form({
      title: cur ? 'تعديل امتحان' : 'إنشاء امتحان',
      fields: [
        { id: 'title', label: 'عنوان الامتحان', value: cur?.title || '' },
        ...(banks.length ? [{ id: 'bankIds', type: 'checks', label: 'من أي بنوك تُسحب أسئلة الامتحان؟ (بدون اختيار = كل أسئلة المادة)', value: (cur?.bank_ids || []).filter(id => banks.some(b => b.id === id)), options: banks.map(b => ({ value: b.id, label: `${b.name} (${b.count} سؤال)` })) }] : []),
        { id: 'examType', type: 'select', label: 'نوع الامتحان', value: cur?.exam_type || 'mcq', options: EXAM_TYPES },
        { id: 'questionCount', type: 'number', label: 'عدد الأسئلة (المحطات في العملي)', value: cur?.question_count ?? 20 },
        { id: 'duration', type: 'number', label: 'المدة بالدقائق (للنظري والمختلط)', value: cur?.duration_minutes ?? 30 },
        { id: 'stationSeconds', type: 'number', label: 'العملي: مدة كل محطة بالثواني' + (imgs != null ? ` — عندك ${imgs} سؤال بصورة` : ''), value: cur?.seconds_per_question || 45 },
      ],
      onSubmit: async (v) => {
        if (!v.title.trim()) throw { detail: 'العنوان مطلوب' };
        const body = examBody(v);
        if (cur) await put('/api/professors/me/exams/' + cur.id, body); else await post('/api/professors/me/exams', body);
        reload();
      },
    });
  };
  // the link opens the exam for the student right after they sign in
  const share = async (e) => {
    const url = location.origin + '/exam/' + e.id;
    if (navigator.share) {
      try { await navigator.share({ title: e.title, text: `امتحان «${e.title}» على كيور`, url }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); A.toast('نُسخ رابط الامتحان — أرسله للطلاب'); }
    catch { window.prompt('انسخ رابط الامتحان وأرسله للطلاب', url); }
  };
  const remove = async (e) => {
    if (!await A.dialogs.confirm('حذف هذا الامتحان نهائياً؟')) return;
    try { await del('/api/professors/me/exams/' + e.id); reload(); } catch (err) { A.toast(err.detail || 'تعذّر حذف الامتحان', 'error'); }
  };
  return (
    <>
      <StKpis items={[['الامتحانات', numAr(list.length)], ['نظري', numAr(list.filter(x => x.exam_type !== 'practical').length)], ['عملي (صور)', numAr(list.filter(x => x.exam_type === 'practical').length)], ['مجموع الأسئلة', numAr(list.reduce((a, x) => a + (x.question_count || 0), 0))]]} />
      <Card title="امتحاناتي" actions={<AddBtn onClick={() => form(null)}>إنشاء امتحان</AddBtn>}>
        <Table head={['العنوان', 'النوع', 'عدد الأسئلة', 'المدة', '']} empty="لا توجد امتحانات بعد">
          {list.map(e => (
            <tr key={e.id}>
              <td><div className="cell-name">{e.title}</div>{e.bank_ids && e.bank_ids.length ? <div className="cell-sub">من {e.bank_ids.length} {e.bank_ids.length === 1 ? 'بنك' : 'بنوك'} محددة</div> : null}</td>
              <td>{e.exam_type === 'practical' ? <Badge kind="active">عملي (صور)</Badge> : <Badge kind="idle">نظري</Badge>}</td>
              <td>{e.question_count}</td>
              <td>{e.exam_type === 'practical' && e.seconds_per_question ? e.seconds_per_question + ' ث / محطة' : e.duration_minutes + ' د'}</td>
              <RowActions><SmallBtn onClick={() => share(e)} title="نسخ رابط الامتحان أو مشاركته">🔗 مشاركة</SmallBtn><SmallBtn onClick={() => form(e)}>تعديل</SmallBtn><TrashBtn label="حذف الامتحان" onClick={() => remove(e)} /></RowActions>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ courses & lectures
const dur = (sec) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
export function Courses() {
  const A = useAdmin();
  const { data: courses, error, reload } = useData(() => apiFetch('/api/professors/me/courses'), []);
  const [open, setOpen] = useState(null);
  const input = useRef(null); const pending = useRef(null);
  if (error) return <Card>{error}</Card>;
  if (!courses) return <Loading />;
  const course = courses.find(c => c.id === open);
  const lectures = course ? course.lectures.length : 0;
  const allLec = courses.flatMap(c => c.lectures || []);

  const courseForm = (c) => A.dialogs.form({ title: c ? 'تعديل كورس' : 'إضافة كورس', fields: [{ id: 'title', label: 'عنوان الكورس', value: c?.title || '' }],
    onSubmit: async (v) => { if (!v.title.trim()) throw { detail: 'العنوان مطلوب' }; if (c) await put('/api/professors/me/courses/' + c.id, { title: v.title.trim() }); else await post('/api/professors/me/courses', { title: v.title.trim() }); reload(); } });
  const delCourse = async (c) => { if (!await A.dialogs.confirm('حذف هذا الكورس وكل محاضراته نهائياً؟')) return; try { await del('/api/professors/me/courses/' + c.id); if (open === c.id) setOpen(null); reload(); } catch (e) { A.toast(e.detail || 'تعذّر حذف الكورس', 'error'); } };
  const lecForm = (l) => A.dialogs.form({ title: l ? 'تعديل محاضرة' : 'محاضرة جديدة', fields: [{ id: 'title', label: 'عنوان المحاضرة', value: l?.title || '' }, { id: 'minutes', type: 'number', label: 'المدة بالدقائق', value: l ? Math.round(l.duration_seconds / 60) : 15 }],
    onSubmit: async (v) => {
      if (!v.title.trim()) throw { detail: 'العنوان مطلوب' };
      const body = { title: v.title.trim(), duration_seconds: Math.round((parseFloat(v.minutes) || 0) * 60) };
      if (l) await put('/api/professors/me/lectures/' + l.id, body); else await post('/api/professors/me/courses/' + open + '/lectures', body);
      reload();
    } });
  const delLec = async (l) => { if (!await A.dialogs.confirm('حذف هذه المحاضرة نهائياً؟')) return; try { await del('/api/professors/me/lectures/' + l.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر حذف المحاضرة', 'error'); } };
  const uploadVideo = async (file) => {
    if (!file || !pending.current) return;
    const fd = new FormData(); fd.append('file', file);
    A.toast('جارٍ رفع الفيديو... قد يستغرق وقتاً حسب حجم الملف');
    try { await upload('/api/professors/me/lectures/' + pending.current + '/file', fd, pct => { if (pct % 25 === 0) A.toast(`جارٍ رفع الفيديو… ${pct}%`); }); input.current.value = ''; A.toast('تم رفع الفيديو بنجاح'); reload(); }
    catch (e) { A.toast(e.detail || 'تعذّر رفع الفيديو', 'error'); }
  };
  return (
    <>
      <StKpis items={[['الكورسات', numAr(courses.length)], ['المحاضرات', numAr(allLec.length)], ['بدون فيديو', numAr(allLec.filter(l => !l.video_url).length), allLec.some(l => !l.video_url) ? 'ارفع الفيديو ليظهر للطلاب' : ''], ['المدة الكلية', ((s) => s >= 3600 ? (s / 3600).toFixed(1) + ' ساعة' : Math.round(s / 60) + ' دقيقة')(allLec.reduce((a, l) => a + (l.duration_seconds || 0), 0))]]} />
      <Card title="كورساتي" style={{ marginBottom: 16 }} actions={<AddBtn onClick={() => courseForm(null)}>إضافة كورس</AddBtn>}>
        <Table head={['العنوان', 'عدد المحاضرات', '']} empty="لا توجد كورسات بعد">
          {courses.map(c => (
            <tr key={c.id}><td><div className="cell-name">{c.title}</div></td><td>{c.lectures.length}</td>
              <RowActions><SmallBtn onClick={() => setOpen(c.id)}>المحاضرات</SmallBtn><SmallBtn onClick={() => courseForm(c)}>تعديل</SmallBtn><TrashBtn label="حذف الكورس" onClick={() => delCourse(c)} /></RowActions></tr>
          ))}
        </Table>
      </Card>
      {course && (
        <Card title={'محاضرات: ' + course.title} actions={<AddBtn ghost onClick={() => lecForm(null)}>محاضرة جديدة</AddBtn>}>
          <input ref={input} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => uploadVideo(e.target.files[0])} />
          <Table head={['العنوان', 'المدة', 'الفيديو', '']} empty="لا توجد محاضرات بعد">
            {course.lectures.map(l => (
              <tr key={l.id}><td><div className="cell-name">{l.title}</div></td><td className="mono">{dur(l.duration_seconds)}</td>
                <td>{l.video_url ? <Badge kind="active">مرفوع</Badge> : <Badge kind="disabled">لا يوجد فيديو</Badge>}</td>
                <RowActions><SmallBtn onClick={() => { pending.current = l.id; input.current.click(); }}>{l.video_url ? 'تغيير الفيديو' : 'رفع فيديو'}</SmallBtn><SmallBtn onClick={() => lecForm(l)}>تعديل</SmallBtn><TrashBtn label="حذف المحاضرة" onClick={() => delLec(l)} /></RowActions></tr>
            ))}
          </Table>
        </Card>
      )}
      <span style={{ display: 'none' }}>{lectures}</span>
    </>
  );
}

// ------------------------------------------------------------------ my students
const SORTS = {
  answers: (a, b) => b.answered_count - a.answered_count, avg_hi: (a, b) => b.avg_score - a.avg_score, avg_lo: (a, b) => a.avg_score - b.avg_score,
  recent: (a, b) => at(b) - at(a), name: (a, b) => a.name.localeCompare(b.name, 'ar'),
};
function at(s) { const v = s.last_answered_at || ''; return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + 'Z').getTime(); }
export function Students() {
  const { data, error } = useData(() => apiFetch('/api/professors/me/students'), []);
  const [q, setQ] = useState(''); const [sort, setSort] = useState('answers');
  const list = useMemo(() => (data || []).filter(s => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())).sort(SORTS[sort]), [data, q, sort]);
  if (error) return <Card>{error}</Card>;
  if (!data) return <Loading />;
  const week = Date.now() - 7 * 864e5;
  const avg = data.length ? Math.round(data.reduce((a, s) => a + s.avg_score, 0) / data.length) : null;
  return (
    <>
      <StKpis items={[['طلاب أجابوا بمادتي', numAr(data.length)], ['المعدل العام', avg == null ? '—' : avg + '%'], ['نشطون آخر 7 أيام', numAr(data.filter(s => at(s) >= week).length)], ['يحتاجون دعمًا', numAr(data.filter(s => s.avg_score < 50).length), 'دقة أقل من 50%']]} />
      <Card title="طلابي" actions={<span className="cell-sub">{list.length} طالب</span>}>
        <div className="ops-filters">
          <input type="text" className="q" placeholder="ابحث باسم الطالب..." value={q} onChange={e => setQ(e.target.value)} />
          <select value={sort} onChange={e => setSort(e.target.value)}>
            {[['answers', 'الأكثر إجابات'], ['avg_hi', 'الأعلى دقة'], ['avg_lo', 'الأقل دقة (يحتاج دعمًا)'], ['recent', 'الأحدث نشاطًا'], ['name', 'الاسم']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div className="st-wrap"><table className="st-table"><thead><tr><th>الطالب</th><th>آخر نشاط</th><th>الإجابات</th><th>الدقة</th></tr></thead><tbody>
          {list.map((s, i) => <tr key={i}><td>{s.name}</td><td>{s.last_answered_at ? new Date(at(s)).toLocaleDateString('ar-IQ') : '—'}</td><td>{numAr(s.answered_count)}</td><td>{s.avg_score}%</td></tr>)}
          {!list.length && <tr><td colSpan={4} className="empty-row">لا يوجد طلاب بعد</td></tr>}
        </tbody></table></div>
      </Card>
    </>
  );
}

export { ax };
