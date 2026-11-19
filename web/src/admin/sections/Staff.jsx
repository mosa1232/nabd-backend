import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, post, put, del } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { Card, AddBtn, StKpis, Table, Badge, SmallBtn, Loading, numAr, useData } from '../ui.jsx';

const initialsOf = (n) => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
const SEL = { padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', fontSize: '.84rem' };
function ago(iso) {
  if (!iso) return 'لم يظهر';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z'); const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (m < 1) return 'الآن'; if (m < 60) return `قبل ${m} د`; if (m < 1440) return `قبل ${Math.round(m / 60)} س`; if (m < 43200) return `قبل ${Math.round(m / 1440)} يوم`;
  return d.toLocaleDateString('en-GB');
}
const AccPill = ({ v }) => (v == null ? <span className="cell-sub">—</span> : <span className={'acc-pill ' + (v >= 70 ? 'acc-hi' : v >= 50 ? 'acc-mid' : 'acc-lo')}>{v}%</span>);

// ------------------------------------------------------------------ catalogue (curriculum)
function nest(rows) {
  const secs = []; let sec = null, uni = null, dept = null, st = null;
  rows.forEach(r => {
    if (!r.id) return;
    if (r.type === 'section') { sec = { ...r, universities: [] }; secs.push(sec); uni = dept = st = null; }
    else if (r.type === 'university' && sec) { uni = { ...r, departments: [], stages: [] }; sec.universities.push(uni); dept = st = null; }
    else if (r.type === 'department' && uni) { dept = { ...r, stages: [] }; uni.departments.push(dept); st = null; }
    else if (r.type === 'stage' && dept) { st = { ...r, deptName: dept.name, subjects: [] }; dept.stages.push(st); uni.stages.push(st); }
    else if (r.type === 'subject' && st) st.subjects.push(r);
  });
  return secs;
}
const ENDPOINT = { section: 'sections', university: 'universities', department: 'departments', stage: 'stages', subject: 'subjects' };
const TYPE_LABEL = { section: 'الكلية', university: 'الجامعة', department: 'القسم', stage: 'المرحلة', subject: 'المادة' };
const ADD_NOUN = { root: 'كلية', section: 'جامعة', university: 'قسم', department: 'مرحلة', stage: 'مادة' };
const STAGE_PRESETS = ['المرحلة الأولى', 'المرحلة الثانية', 'المرحلة الثالثة', 'المرحلة الرابعة', 'المرحلة الخامسة', 'المرحلة السادسة'];
const splitNames = (s) => s.split(/[\n,،]+/).map(x => x.trim()).filter(Boolean);

export function Catalog() {
  const A = useAdmin();
  const { data: rows, error, reload } = useData(() => apiFetch('/api/admin/catalog'), []);
  const [nav, setNav] = useState({ sec: null, uni: null, dept: null });
  const [addText, setAddText] = useState({});
  const tree = useMemo(() => nest(rows || []), [rows]);
  if (error) return <Card>{error}</Card>;
  if (!rows) return <Loading />;
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const report = (res, noun) => A.toast(res.created && res.skipped ? `أُضيفت ${res.created} ${noun} — وتم تجاهل ${res.skipped} موجودة مسبقاً` : res.created ? `أُضيفت ${res.created} ${noun}` : res.skipped ? `لم يُضف شيء — كل الأسماء (${res.skipped}) موجودة مسبقاً` : 'لم تُدخل أي اسم');
  const bulk = async (parentType, parentId, names) => {
    try { const res = await post('/api/admin/catalog/bulk', { parent_type: parentType, parent_id: parentId || null, names }); report(res, ADD_NOUN[parentType]); reload(); }
    catch (e) { A.toast(e.detail || 'تعذّرت الإضافة', 'error'); }
  };
  const askAdd = (parentType, parentId, title, placeholder) => A.dialogs.form({ title, fields: [{ id: 'names', type: 'textarea', rows: 5, placeholder }],
    onSubmit: async (v) => { const names = splitNames(v.names); if (!names.length) throw { detail: 'اكتب اسمًا واحدًا على الأقل' }; const res = await post('/api/admin/catalog/bulk', { parent_type: parentType, parent_id: parentId || null, names }); report(res, ADD_NOUN[parentType]); reload(); } });
  const rename = (type, id) => A.dialogs.form({ title: 'تعديل ' + TYPE_LABEL[type], fields: [{ id: 'name', label: 'الاسم الجديد لـ ' + TYPE_LABEL[type], value: byId[id]?.name || '' }],
    onSubmit: async (v) => { if (!v.name.trim()) throw { detail: 'الاسم مطلوب' }; await put(`/api/admin/catalog/${ENDPOINT[type]}/${id}?` + new URLSearchParams({ name: v.name.trim() })); reload(); } });
  const remove = async (type, id) => { if (!await A.dialogs.confirm(`حذف ${TYPE_LABEL[type]} نهائياً؟`)) return; try { await del(`/api/admin/catalog/${ENDPOINT[type]}/${id}`); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  const quick = () => A.dialogs.form({ title: 'إعداد سريع لكلية كاملة', fields: [
    { id: 'section', label: 'اسم الكلية', placeholder: 'طب بشري' },
    { id: 'unis', type: 'textarea', rows: 4, label: 'الجامعات — اسم في كل سطر', placeholder: 'جامعة بغداد\nجامعة البصرة' },
    { id: 'depts', type: 'textarea', rows: 3, label: 'الأقسام — تُضاف لكل جامعة (اختياري، وإلا يُنشأ «القسم العام»)', placeholder: 'التشريح\nالفسلجة' },
    { id: 'stages', type: 'textarea', rows: 5, label: 'المراحل — تُضاف لكل قسم (اسم في كل سطر)', placeholder: 'المرحلة الأولى\nالمرحلة الثانية' }],
  onSubmit: async (v) => {
    if (!v.section.trim()) throw { detail: 'اسم الكلية مطلوب' };
    const res = await post('/api/admin/catalog/quick', { section_name: v.section, universities: v.unis.split('\n'), departments: v.depts.split('\n'), stages: v.stages.split('\n') });
    const c = res.created; A.toast(`تم: ${c.sections} كلية، ${c.universities} جامعة، ${c.departments} قسم، ${c.stages} مرحلة`); reload();
  } });
  const addDept = (uniId) => A.dialogs.form({ title: 'إضافة قسم', fields: [
    { id: 'names', type: 'textarea', rows: 3, label: 'اسم القسم (أو عدة أقسام، كل واحد بسطر)', placeholder: 'التشريح\nالفسلجة' },
    { id: 'stages', type: 'checks', label: 'اختر المراحل', value: STAGE_PRESETS.slice(), options: STAGE_PRESETS.map(n => ({ value: n, label: n })) },
    { id: 'extra', label: 'مراحل أخرى (اختياري، مفصولة بفاصلة)' }],
  onSubmit: async (v) => {
    const names = splitNames(v.names); if (!names.length) throw { detail: 'اكتب اسم القسم' };
    const stages = v.stages.concat(splitNames(v.extra || ''));
    await post('/api/admin/catalog/bulk', { parent_type: 'university', parent_id: uniId, names });
    if (stages.length) {
      const fresh = nest(await apiFetch('/api/admin/catalog')).flatMap(s => s.universities).find(u => u.id === uniId);
      for (const d of (fresh ? fresh.departments : []).filter(d => names.includes(d.name))) await post('/api/admin/catalog/bulk', { parent_type: 'department', parent_id: d.id, names: stages });
    }
    A.toast(`أُضيف ${names.length} قسم مع ${stages.length} مراحل`); reload();
  } });
  // copy a university / department / stage (structure only) once or many times, optionally into another parent
  const PARENT_PICK = { university: ['section', 'داخل الكلية'], department: ['university', 'داخل الجامعة'], stage: ['department', 'داخل القسم'] };
  const duplicate = (type, id) => {
    const row = byId[id]; if (!row) return;
    const pk = PARENT_PICK[type]; const fields = [];
    if (pk) {
      const options = rows.filter(r => r.type === pk[0] && r.id).map(r => ({ value: r.id, label: r.name }));
      const parentIdx = rows.findIndex(r => r.id === id); let parent = '';
      for (let i = parentIdx - 1; i >= 0; i--) if (rows[i].type === pk[0]) { parent = rows[i].id; break; }
      fields.push({ id: 'parent', label: pk[1], type: 'select', value: parent || (options[0] && options[0].value) || '', options });
    }
    fields.push({ id: 'names', label: 'اسم كل نسخة في سطر منفصل', type: 'textarea', rows: 7, value: `${row.name} (نسخة)` });
    A.dialogs.form({ title: `نسخ ${TYPE_LABEL[type]}: ${row.name}`, fields, onSubmit: async (v) => {
      const names = v.names.split('\n'); if (!names.some(n => n.trim())) throw { detail: 'اكتب اسماً واحداً على الأقل' };
      const res = await post('/api/admin/catalog/duplicate', { type, id, new_names: names, target_parent_id: v.parent || null });
      const bits = []; if (res.universities) bits.push(`${res.universities} جامعة`); if (res.departments) bits.push(`${res.departments} قسم`); if (res.stages) bits.push(`${res.stages} مرحلة`); if (res.subjects) bits.push(`${res.subjects} مادة`);
      A.toast(`تم إنشاء ${res.copies.length} نسخة${bits.length ? ' — ' + bits.join(' و') : ''}` + (res.skipped.length ? ` · وتم تجاهل ${res.skipped.length} موجودة مسبقاً` : '')); reload();
    } });
  };
  // paste a whole indented tree (college / university / department / stage / subject); preview first, then confirm
  const IMPORT_EXAMPLE = 'طب بشري\n  جامعة بغداد\n    قسم التشريح\n      المرحلة الأولى\n        التشريح العام\n        الكيمياء الطبية\n      المرحلة الثانية\n        التشريح\n    قسم الفسلجة\n      المرحلة الثانية\n        الفسلجة\n  جامعة البصرة\n    قسم التشريح\n      المرحلة الأولى\n        التشريح العام';
  const importTree = () => A.dialogs.form({
    title: 'استيراد منهج كامل', submitLabel: 'معاينة', note: 'الصق المنهج بمسافات بادئة: كلية ← جامعة ← قسم ← مرحلة ← مادة. تظهر لك معاينة قبل أي إضافة.',
    fields: [{ id: 'text', type: 'textarea', rows: 12, placeholder: IMPORT_EXAMPLE }],
    onSubmit: async (v) => {
      if (!v.text.trim()) throw { detail: 'اكتب أو الصق المنهج أولاً' };
      const pre = await post('/api/admin/catalog/import', { text: v.text, preview: true });
      const c = pre.created, rr = pre.reused;
      const reused = rr.sections + rr.universities + (rr.departments || 0) + rr.stages + rr.subjects;
      const problems = (pre.problems || []).map(p => '⚠ ' + p).join('\n');
      if (!pre.total_created) throw { detail: 'لا يوجد شيء جديد لإنشائه' + (reused ? ` (موجود مسبقاً: ${reused})` : '') + (problems ? '\n' + problems : '') };
      const sum = `سيُنشأ: ${c.sections} كلية، ${c.universities} جامعة، ${c.departments} قسم، ${c.stages} مرحلة، ${c.subjects} مادة` + (reused ? ` — وموجود مسبقاً: ${reused}` : '') + (problems ? '\n' + problems : '');
      if (!await A.dialogs.confirm(sum + '\n\nتأكيد الاستيراد؟')) return;
      const res = await post('/api/admin/catalog/import', { text: v.text, preview: false });
      A.toast(`تم استيراد ${res.total_created} عنصر`); reload();
    },
  });
  const menu = (type, id) => A.dialogs.form({ title: (TYPE_LABEL[type] || '') + (byId[id] ? ': ' + byId[id].name : ''), submitLabel: 'إغلاق', fields: [{ id: 'm', type: 'custom', render: () => (
    <div><button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 18px', marginBottom: 10 }} onClick={() => { document.querySelector('.page-layer .page-back')?.click(); rename(type, id); }}>تعديل الاسم</button>
      {PARENT_PICK[type] && <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 18px', marginBottom: 10 }} onClick={() => { document.querySelector('.page-layer .page-back')?.click(); duplicate(type, id); }}>نسخ مع كل ما تحته</button>}
      <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 18px', color: 'var(--danger)' }} onClick={() => { document.querySelector('.page-layer .page-back')?.click(); remove(type, id); }}>حذف</button></div>) }], onSubmit: async () => {} });

  if (!tree.length) return <Card title="المناهج"><div className="empty-row">لا يوجد منهج بعد<br /><button className="btn" style={{ marginTop: 12 }} onClick={() => askAdd('root', null, 'إضافة كليات', 'طب بشري\nطب أسنان\nصيدلة')}>+ أضف أول كلية</button></div></Card>;
  const sec = tree.find(x => x.id === nav.sec) || tree[0];
  const uni = sec.universities.find(x => x.id === nav.uni) || null;
  const dept = uni ? uni.departments.find(x => x.id === nav.dept) || null : null;
  const Kebab = ({ type, id }) => <button className="cat-kebab" title="خيارات" onClick={e => { e.stopPropagation(); menu(type, id); }}>⋯</button>;
  const catCard = (type, r, sub, onClick) => (
    <div key={r.id} className="cat-card" onClick={onClick}><Kebab type={type} id={r.id} /><div className="cat-avatar">{(r.name || '?').replace(/^(جامعة|قسم|كلية)\s+/, '').trim().charAt(0)}</div><div className="cat-card-name">{r.name}</div><div className="cat-card-sub">{sub}</div></div>
  );
  let body;
  if (!uni) {
    body = <>
      <div className="cat-tabs">{tree.map(x => <button key={x.id} className={'cat-tab' + (x.id === sec.id ? ' on' : '')} onClick={() => setNav({ sec: x.id, uni: null, dept: null })}>{x.name}</button>)}
        <button className="cat-tab plus" onClick={() => askAdd('root', null, 'إضافة كليات', 'طب بشري\nطب أسنان\nصيدلة')}>+ كلية</button><span style={{ marginInlineStart: 'auto' }}><Kebab type="section" id={sec.id} /></span></div>
      <div className="cat-grid">{sec.universities.map(u => catCard('university', u, `${u.departments.length} أقسام`, () => setNav({ sec: sec.id, uni: u.id, dept: null })))}
        <div className="cat-card addnew" onClick={() => askAdd('section', sec.id, 'أضف جامعة (أو عدة جامعات، كل واحدة بسطر)', 'جامعة بغداد\nجامعة البصرة')}>+ جامعة</div></div></>;
  } else if (!dept) {
    body = <><div className="cat-top"><button className="cat-back" onClick={() => setNav({ sec: sec.id, uni: null, dept: null })}>→ {sec.name}</button></div>
      <div className="cat-title2">{uni.name} <Kebab type="university" id={uni.id} /></div>
      <div className="cat-grid">{uni.departments.map(d => catCard('department', d, `${d.stages.length} مراحل`, () => setNav({ sec: sec.id, uni: uni.id, dept: d.id })))}<div className="cat-card addnew" onClick={() => addDept(uni.id)}>+ قسم</div></div></>;
  } else {
    const have = new Set(dept.stages.map(s => s.name)); const missing = STAGE_PRESETS.filter(n => !have.has(n));
    body = <><div className="cat-top"><button className="cat-back" onClick={() => setNav({ sec: sec.id, uni: uni.id, dept: null })}>→ {uni.name}</button></div>
      <div className="cat-title2">{dept.name} <Kebab type="department" id={dept.id} /></div>
      {dept.stages.map(st => (
        <div key={st.id} className="cat-stage">
          <div className="cat-stage-name">{st.name} <span className="cat-count">· {st.subjects.length} مواد</span> <span style={{ marginInlineStart: 'auto' }}><Kebab type="stage" id={st.id} /></span></div>
          <div className="cat-chips">{st.subjects.map(sb => <span key={sb.id} className="cat-chip">{sb.name}<button title="تعديل" onClick={() => rename('subject', sb.id)}>✎</button><button className="danger" title="حذف" onClick={() => remove('subject', sb.id)}>✕</button></span>)}</div>
          <div className="cat-add"><input placeholder="+ أضف مادة" value={addText[st.id] || ''} onChange={e => setAddText(t => ({ ...t, [st.id]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { const n = splitNames(addText[st.id] || ''); if (n.length) { bulk('stage', st.id, n); setAddText(t => ({ ...t, [st.id]: '' })); } } }} />
            <button className="btn btn-ghost" onClick={() => { const n = splitNames(addText[st.id] || ''); if (n.length) { bulk('stage', st.id, n); setAddText(t => ({ ...t, [st.id]: '' })); } }}>أضف</button></div>
        </div>))}
      {!dept.stages.length && <div className="empty-row">اختر المراحل من الأسفل</div>}
      {missing.length > 0 && <div className="cat-presets"><span className="cat-count" style={{ alignSelf: 'center' }}>إضافة مرحلة:</span>{missing.map(n => <button key={n} onClick={() => bulk('department', dept.id, [n])}>+ {n.replace('المرحلة ', '')}</button>)}</div>}</>;
  }
  return <Card title="المناهج" actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-ghost" onClick={quick}>⚡ إعداد سريع</button><button className="btn btn-ghost" onClick={importTree}>📥 استيراد منهج</button></div>}>{body}</Card>;
}

// ------------------------------------------------------------------ students register
export function Students() {
  const A = useAdmin();
  const [f, setF] = useState({ q: '', uni: '', stage: '', status: 'all', sort: 'joined', page: 1 });
  const [qText, setQText] = useState('');
  const { data: rows } = useData(() => apiFetch('/api/admin/catalog').catch(() => []), []);
  const tree = useMemo(() => nest(rows || []), [rows]);
  const unis = tree.flatMap(sx => sx.universities.map(u => [u.id, `${u.name} — ${sx.name}`]));
  const stages = (tree.flatMap(sx => sx.universities).find(u => u.id === f.uni)?.stages || []).map(x => [x.id, `${x.deptName ? x.deptName + ' — ' : ''}${x.name}`]);
  const { data: d, error } = useData(() => apiFetch('/api/admin/students/list?' + new URLSearchParams({ q: f.q, university_id: f.uni, stage_id: f.stage, status: f.status, sort: f.sort, page: f.page })), [f]);
  const { data: weak } = useData(() => apiFetch('/api/admin/weak-topics').catch(() => []), []);
  const timer = useRef(null);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setF(x => (x.q === qText ? x : { ...x, q: qText, page: 1 })), 350); return () => clearTimeout(timer.current); }, [qText]);
  const set = (k, v, extra = {}) => setF(x => ({ ...x, [k]: v, page: 1, ...extra }));
  const sm = d && d.summary;
  const pct = (v) => (v == null ? '—' : v + '%');
  return (
    <>
      {sm && <StKpis items={[['إجمالي الطلاب', numAr(sm.total)], ['نشطون هذا الأسبوع', numAr(sm.active_week), pct(Math.round(100 * sm.active_week / Math.max(1, sm.total))) + ' من الكل'], ['موثّقون', numAr(sm.verified), pct(Math.round(100 * sm.verified / Math.max(1, sm.total)))], ['بياناتهم غير مكتملة', numAr(sm.incomplete)], ['محظورون', numAr(sm.banned)]]} />}
      <Card title="سجل الطلاب" actions={<span className="cell-sub">{d ? numAr(d.total) + ' نتيجة' : ''}</span>} style={{ marginBottom: 16 }}>
        <div className="ops-filters">
          <input type="text" className="q" placeholder="ابحث بالاسم أو البريد أو الهاتف أو اسم المستخدم..." value={qText} onChange={e => setQText(e.target.value)} />
          <select style={SEL} value={f.uni} onChange={e => set('uni', e.target.value, { stage: '' })}><option value="">كل الجامعات</option>{unis.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select style={SEL} value={f.stage} onChange={e => set('stage', e.target.value)}><option value="">كل المراحل</option>{stages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select style={SEL} value={f.status} onChange={e => set('status', e.target.value)}>{[['all', 'كل الحالات'], ['active', 'نشط هذا الأسبوع'], ['inactive', 'خامل (30 يوم+)'], ['verified', 'موثّق'], ['unverified', 'غير موثّق'], ['incomplete', 'بياناته غير مكتملة'], ['banned', 'محظور']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select style={SEL} value={f.sort} onChange={e => set('sort', e.target.value)}>{[['joined', 'الأحدث تسجيلًا'], ['seen', 'آخر ظهور'], ['answers', 'الأكثر إجابات'], ['accuracy', 'الأعلى دقة'], ['name', 'الاسم']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        {error && <div className="empty-row">{error}</div>}
        {!d && !error && <Loading />}
        {d && <>
          <div className="stu-row stu-head"><span>الطالب</span><span>الجامعة · المرحلة</span><span>الإجابات</span><span>الدقة</span><span>آخر ظهور</span><span>الحالة</span></div>
          {d.items.map(x => (
            <div key={x.id} className="stu-row" onClick={() => A.go('accounts')}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}><span className="cell-avatar" style={{ background: 'var(--accent-2)', flex: 'none' }}>{initialsOf(x.name)}</span><span style={{ minWidth: 0 }}><b style={{ display: 'block' }}>{x.name}</b><span className="cell-sub" dir="ltr" style={{ display: 'block', textAlign: 'start', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.email}</span></span></span>
              <span>{x.university || '—'}<span className="cell-sub" style={{ display: 'block' }}>{x.graduate ? 'متخرج' : x.stage || '—'}</span></span>
              <span className="mono">{numAr(x.answers)}</span><span><AccPill v={x.accuracy} /></span><span className="cell-sub">{ago(x.last_seen)}</span>
              <span>{x.banned ? <Badge kind="disabled">محظور</Badge> : null}{x.verified ? <> <Badge kind="active">موثّق</Badge></> : null}{!x.banned && !x.verified ? <span className="cell-sub">—</span> : null}</span>
            </div>
          ))}
          {!d.items.length && <div className="empty-row">لا يوجد طلاب بهذه المواصفات</div>}
          {d.pages > 1 && <div className="ops-pager"><button className="btn btn-ghost" disabled={d.page <= 1} onClick={() => setF(x => ({ ...x, page: x.page - 1 }))}>→ السابق</button><span>صفحة {d.page} من {d.pages}</span><button className="btn btn-ghost" disabled={d.page >= d.pages} onClick={() => setF(x => ({ ...x, page: x.page + 1 }))}>التالي ←</button></div>}
        </>}
      </Card>
      <Card title="أكثر نقاط الضعف شيوعاً">
        {(weak || []).map((w, i) => <div key={i} className="weak-row"><span className="weak-label">{w.topic}</span><div className="weak-track"><div className="weak-fill" style={{ width: w.weakness_pct + '%' }} /></div><span className="weak-pct">{w.weakness_pct}%</span></div>)}
        {weak && !weak.length && <div className="empty-row">لا توجد بيانات كافية بعد</div>}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ bans and appeals
export function Bans() {
  const A = useAdmin();
  const { data: bans, error, reload } = useData(() => apiFetch('/api/admin/bans'), []);
  const [tab, setTab] = useState('active'); const [q, setQ] = useState('');
  if (error) return <Card>{error}</Card>;
  if (!bans) return <Loading />;
  const active = bans.filter(b => b.status === 'active'), appeals = bans.filter(b => b.status === 'appealed'), lifted = bans.filter(b => b.status === 'lifted');
  const repeat = new Set(bans.filter(b => b.times_banned >= 2).map(b => b.user_id)).size;
  const s = q.trim().toLowerCase();
  const list = (tab === 'active' ? active : tab === 'appeals' ? appeals : lifted).filter(b => !s || [b.user_name, b.user_email, b.reason].some(v => (v || '').toLowerCase().includes(s)));
  const lift = async (b) => { try { await post('/api/admin/users/' + b.user_id + '/unban'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر رفع الحظر', 'error'); } };
  const resolve = async (b, ok) => { try { await post('/api/admin/bans/' + b.id + '/' + (ok ? 'approve-appeal' : 'reject-appeal')); reload(); } catch (e) { A.toast(e.detail || 'تعذّر تنفيذ الإجراء', 'error'); } };
  const findStudent = () => A.dialogs.form({ title: 'حظر طالب', submitLabel: 'إغلاق', note: 'ابحث عن الطالب بالاسم أو البريد أو الهاتف، واختره لتحدد سبب الحظر.', fields: [{ id: 'f', type: 'custom', render: () => <FindStudent A={A} onDone={reload} /> }], onSubmit: async () => {} });
  const tabs = [['active', 'نشطة', active.length], ['appeals', 'طلبات إعفاء', appeals.length], ['history', 'السجل', lifted.length]];
  return (
    <>
      <StKpis items={[['حظر نشط', numAr(active.length)], ['طلبات إعفاء تنتظرك', numAr(appeals.length), appeals.length ? 'تحتاج قرارًا' : ''], ['حظر مرفوع', numAr(lifted.length)], ['تكرر حظرهم', numAr(repeat), 'أكثر من مرة']]} />
      <Card title="الحظر والطعون" actions={<AddBtn onClick={findStudent}>حظر طالب</AddBtn>}>
        <div className="ops-filters">{tabs.map(([k, l, n]) => <button key={k} className={'cat-tab' + (k === tab ? ' on' : '')} onClick={() => setTab(k)}>{l} <b>{n}</b></button>)}
          <input type="text" className="q" placeholder="ابحث بالاسم أو البريد أو السبب..." value={q} onChange={e => setQ(e.target.value)} /></div>
        {list.map(b => (
          <div key={b.id} className="ban-card">
            <div className="cell-avatar" style={{ background: 'var(--danger)' }}>{initialsOf(b.user_name)}</div>
            <div className="body"><div style={{ fontWeight: 800 }}>{b.user_name} {b.times_banned >= 2 ? <Badge kind="disabled">حُظر {b.times_banned} مرات</Badge> : null}</div>
              <div className="cell-sub" dir="ltr" style={{ textAlign: 'start' }}>{b.user_email || ''}</div>
              <div style={{ marginTop: 6 }}><Badge kind="disabled">{b.reason}</Badge> <span className="cell-sub">{ago(b.created_at)}</span></div>
              {b.appeal_message ? <div className="ban-quote"><b>طلب الإعفاء:</b> {b.appeal_message}{b.appealed_at ? <div className="cell-sub" style={{ marginTop: 4 }}>{ago(b.appealed_at)}</div> : null}</div> : null}</div>
            <div className="acts">
              {tab === 'appeals' && <><button className="btn" onClick={() => resolve(b, true)}>قبول ورفع الحظر</button><button className="btn btn-ghost" onClick={() => resolve(b, false)}>رفض</button></>}
              {tab === 'active' && <button className="btn btn-ghost" onClick={() => lift(b)}>رفع الحظر</button>}
              {tab === 'history' && <Badge kind="active">مرفوع</Badge>}
            </div>
          </div>
        ))}
        {!list.length && <div className="empty-row">{tab === 'active' ? 'لا توجد حالات حظر نشطة' : tab === 'appeals' ? 'لا توجد طلبات إعفاء حالياً' : 'لا يوجد سجل بعد'}</div>}
      </Card>
    </>
  );
}
function FindStudent({ A, onDone }) {
  const [q, setQ] = useState(''); const { data: accounts } = useData(() => apiFetch('/api/admin/users'), []);
  const list = q.trim() && accounts ? accounts.filter(a => a.role === 'student' && !a.is_banned && [a.full_name, a.email, a.phone, a.username].some(v => (v || '').toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 30) : [];
  const pick = (a) => { document.querySelector('.page-layer .page-back')?.click(); A.dialogs.form({ title: 'حظر ' + a.full_name, fields: [{ id: 'reason', label: 'سبب الحظر', placeholder: 'مثال: مشاركة الحساب' }],
    onSubmit: async (v) => { if (!v.reason.trim()) throw { detail: 'سبب الحظر مطلوب' }; await post('/api/admin/users/' + a.id + '/ban?' + new URLSearchParams({ reason: v.reason.trim() })); A.toast('تم حظر ' + a.full_name); onDone(); } }); };
  return (
    <div><input type="text" autoComplete="off" placeholder="اكتب اسم أو بريد..." value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      {!q.trim() && <div className="cell-sub" style={{ padding: '8px 2px' }}>ابدأ الكتابة لتظهر النتائج</div>}
      {list.map(a => <div key={a.id} onClick={() => pick(a)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, borderRadius: 14, border: '1px solid var(--glass-border)', background: 'var(--glass-bg-strong)', cursor: 'pointer' }}>
        <div className="cell-avatar" style={{ background: 'var(--accent)' }}>{initialsOf(a.full_name)}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{a.full_name}</div><div className="cell-sub mono" dir="ltr" style={{ textAlign: 'start' }}>{a.email}</div></div></div>)}
      {q.trim() && !list.length && <div className="empty-row">لا توجد حسابات مطابقة</div>}</div>
  );
}

// ------------------------------------------------------------------ notifications
export function Notifications() {
  const A = useAdmin();
  const { data: hist, reload } = useData(() => apiFetch('/api/admin/notifications'), []);
  const { data: rows } = useData(() => apiFetch('/api/admin/catalog').catch(() => []), []);
  const tree = useMemo(() => nest(rows || []), [rows]);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [target, setTarget] = useState('broadcast');
  const [aud, setAud] = useState({ sec: '', uni: '', stage: '' }); const [count, setCount] = useState('');
  const [sq, setSq] = useState(''); const [results, setResults] = useState([]); const [student, setStudent] = useState(null);
  const secs = aud.sec ? tree.filter(x => x.id === aud.sec) : tree;
  const unis = secs.flatMap(x => x.universities);
  const stages = unis.filter(u => !aud.uni || u.id === aud.uni).flatMap(u => u.stages.map(st => [st.id, `${unis.length > 1 ? u.name + ' — ' : ''}${st.deptName ? st.deptName + ' — ' : ''}${st.name}`]));
  useEffect(() => {
    if (target !== 'audience') return;
    apiFetch('/api/admin/notifications/audience?' + new URLSearchParams({ section_id: aud.sec, university_id: aud.uni, stage_id: aud.stage })).then(r => setCount(`سيصل لـ ${r.recipients} طالب`)).catch(e => setCount(e.detail || ''));
  }, [target, aud]);
  useEffect(() => {
    if (!sq.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => apiFetch('/api/students/search?q=' + encodeURIComponent(sq.trim())).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [sq]);
  const send = async () => {
    if (!title.trim()) return A.toast('عنوان الإشعار مطلوب', 'error');
    if (target === 'single' && !student) return A.toast('اختر طالباً أولاً', 'error');
    try {
      await post('/api/admin/notifications', { title: title.trim(), body: body.trim(), user_id: target === 'single' ? student.id : null, ...(target === 'audience' ? { section_id: aud.sec || null, university_id: aud.uni || null, stage_id: aud.stage || null } : {}) });
      A.toast('تم إرسال الإشعار'); setTitle(''); setBody(''); setStudent(null); setTarget('broadcast'); reload();
    } catch (e) { A.toast(e.detail || 'تعذّر إرسال الإشعار', 'error'); }
  };
  const remove = async (n) => { if (!await A.dialogs.confirm('حذف هذا الإشعار؟ سيختفي من عند الطلاب أيضًا.')) return; try { await del('/api/admin/notifications/' + n.id); A.toast('حُذف الإشعار'); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  return (
    <>
      <Card title="إرسال إشعار" style={{ marginBottom: 16 }}>
        <div className="form-field"><input type="text" placeholder="عنوان الإشعار" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="form-field"><textarea rows={3} placeholder="نص الإشعار (اختياري)" value={body} onChange={e => setBody(e.target.value)} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '.85rem', color: 'var(--ink)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)' }} /></div>
        <div className="tabs" style={{ margin: '12px 0' }}>{[['broadcast', 'للجميع'], ['audience', 'حسب الجامعة والمرحلة'], ['single', 'طالب معيّن']].map(([k, l]) => <button key={k} className={'tab-btn' + (target === k ? ' active' : '')} onClick={() => setTarget(k)}>{l}</button>)}</div>
        {target === 'audience' && <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            <select style={SEL} value={aud.sec} onChange={e => setAud({ sec: e.target.value, uni: '', stage: '' })}><option value="">كل الكليات</option>{tree.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select style={SEL} value={aud.uni} onChange={e => setAud(a => ({ ...a, uni: e.target.value, stage: '' }))}><option value="">كل الجامعات</option>{unis.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <select style={SEL} value={aud.stage} onChange={e => setAud(a => ({ ...a, stage: e.target.value }))}><option value="">كل المراحل</option>{stages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div><div className="item-meta" style={{ marginTop: 8 }}>{count}</div></div>}
        {target === 'single' && <div>
          <div className="form-field" style={{ position: 'relative' }}><input type="text" placeholder="ابحث عن طالب بالاسم..." autoComplete="off" value={sq} onChange={e => { setSq(e.target.value); setStudent(null); }} />
            {results.length > 0 && !student && <div style={{ position: 'absolute', zIndex: 5, top: '100%', right: 0, left: 0, background: 'var(--glass-bg-strong)', border: '1.5px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
              {results.map(s => <div key={s.id} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--glass-border)' }} onClick={() => { setStudent(s); setSq(''); setResults([]); }}>{s.full_name}</div>)}</div>}</div>
          {student && <div className="item-card glass" style={{ alignItems: 'center', marginTop: 8 }}><div className="item-body"><div className="item-title">{student.full_name}</div></div><button className="btn btn-ghost item-action" onClick={() => setStudent(null)}>إزالة</button></div>}
        </div>}
        <button className="btn" style={{ marginTop: 8 }} onClick={send}>إرسال</button>
      </Card>
      <Card title="الإشعارات المُرسلة" actions={<span className="cell-sub">{hist ? numAr(hist.length) + ' إشعار' : ''}</span>}>
        {!hist && <Loading />}
        {(hist || []).map(n => {
          const pct = n.recipients ? Math.round(100 * n.read_count / n.recipients) : 0;
          return (
            <div key={n.id} className="notif-card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 800 }}>{n.title}</div>{n.body ? <div className="cell-sub" style={{ marginTop: 3, lineHeight: 1.7 }}>{n.body}</div> : null}</div>
                <div style={{ display: 'flex', gap: 6 }}><SmallBtn onClick={() => { setTitle(n.title); setBody(n.body || ''); setTarget('broadcast'); window.scrollTo({ top: 0, behavior: 'smooth' }); A.toast('نُسخ النص — اختر الجمهور وأرسل'); }}>إعادة استخدام</SmallBtn><SmallBtn danger onClick={() => remove(n)}>حذف</SmallBtn></div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: '.76rem' }}>
                <span className={'badge ' + (n.broadcast ? 'badge-active' : '')}>{n.audience || (n.broadcast ? 'للجميع' : 'طالب محدد')}</span><span className="cell-sub">{ago(n.created_at)}</span><span className="cell-sub">وصل لـ {numAr(n.recipients)} · قرأه {numAr(n.read_count)} ({pct}%)</span></div>
              <div className="read-bar"><i style={{ width: pct + '%' }} /></div>
            </div>
          );
        })}
        {hist && !hist.length && <div className="empty-row">لا يوجد إشعارات مُرسلة بعد</div>}
      </Card>
    </>
  );
}
export { Table, put };
