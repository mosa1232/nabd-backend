import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, post, put, del, upload, getToken, mediaUrl } from '../../lib/api.js';
import { useAdmin } from '../ctx.js';
import { PROF_PERM_LIST, PERM_LABELS } from '../nav.js';
import { Card, AddBtn, StKpis, Table, Badge, RowActions, SmallBtn, TrashBtn, Loading, numAr, useData } from '../ui.jsx';

const QTYPE_LABEL = { mcq: 'اختيارات', true_false: 'صح / خطأ', essay: 'مقالي' };
const FIELD = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--glass-border)', background: 'var(--glass-bg-strong)', color: 'var(--ink)', font: 'inherit', fontSize: '.84rem' };
const AI_FILE_ACCEPT = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp';
const initialsOf = (n) => (n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');

// a full-screen page layer with a back button (same look as the old popups)
function Layer({ title, onClose, children, wide }) {
  return (
    <div className="page-layer" style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(10,15,30,.55)', zIndex: 998, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="dash-card glass" style={{ maxWidth: wide ? 600 : 460, width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" className="btn btn-ghost page-back" onClick={onClose}>→ رجوع</button>
        <div className="dash-card-head"><span className="dash-card-title">{title}</span></div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ question editor
function QuestionEditor({ q, onClose, onSaved, banks = [], defaultBank = '' }) {
  const A = useAdmin();
  const [bank, setBank] = useState(q ? (q.bank_id || '') : defaultBank);
  const [type, setType] = useState(q?.qtype || 'mcq');
  const [text, setText] = useState(q?.text || '');
  const [rationale, setRationale] = useState(q?.rationale || '');
  const [eyebrow, setEyebrow] = useState(q?.eyebrow || '');
  const [model, setModel] = useState(q?.model_answer || '');
  const [choices, setChoices] = useState(() => (q && q.qtype === 'mcq' && q.choices.length ? q.choices.map(c => ({ text: c.text, ok: !!c.is_correct })) : [1, 2, 3, 4].map(() => ({ text: '', ok: false }))));
  const [tf, setTf] = useState(q && q.qtype === 'true_false' ? ((q.choices.find(c => c.is_correct) || {}).text === 'خطأ' ? 'خطأ' : 'صح') : 'صح');
  const [image, setImage] = useState(q?.image_url || null);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(q ? (q.booklet_id ? 'booklet:' + q.booklet_id : q.lecture_id ? 'lecture:' + q.lecture_id : '') : '');
  const [msg, setMsg] = useState(null);
  useEffect(() => { apiFetch('/api/professors/me/question-sections').then(setSections).catch(() => {}); }, []);

  const pickImage = async (file) => {
    if (!file) return;
    setMsg({ t: 'جارٍ رفع الصورة...' });
    const fd = new FormData(); fd.append('file', file);
    try { const r = await upload('/api/professors/me/questions/image', fd); setImage(r.url); setMsg(null); } catch (e) { setMsg({ t: e.detail || 'تعذّر رفع الصورة', err: true }); }
  };
  const fail = (t) => setMsg({ t, err: true });
  const save = async () => {
    if (!text.trim()) return fail('اكتب نص السؤال');
    const body = { text: text.trim(), qtype: type, image_url: image, rationale: rationale.trim(), eyebrow: eyebrow.trim(), model_answer: '', choices: [] };
    body.bank_id = bank || null;
    if (sections.length > 1) { body.booklet_id = section.startsWith('booklet:') ? section.slice(8) : null; body.lecture_id = section.startsWith('lecture:') ? section.slice(8) : null; }
    if (type === 'mcq') {
      body.choices = choices.map(c => ({ text: c.text.trim(), is_correct: c.ok })).filter(c => c.text);
      if (body.choices.length < 2) return fail('أضف خيارين على الأقل');
      if (!body.choices.some(c => c.is_correct)) return fail('حدّد الخيار الصحيح بالضغط على الدائرة');
    } else if (type === 'true_false') body.choices = [{ text: tf, is_correct: true }];
    else { body.model_answer = model.trim(); if (!body.model_answer) return fail('اكتب الإجابة النموذجية'); }
    setMsg({ t: 'جارٍ الحفظ...' });
    try {
      if (q) await put('/api/professors/me/questions/' + q.id, body); else await post('/api/professors/me/questions', body);
      onClose(); onSaved();
    } catch (e) { fail(e.detail || 'تعذّر الحفظ'); }
  };
  const tabs = [['mcq', 'اختيارات'], ['true_false', 'صح / خطأ'], ['essay', 'مقالي']];
  return (
    <Layer title={q ? 'تعديل سؤال' : 'سؤال جديد'} onClose={onClose} wide>
      <div className="tab-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {tabs.map(([k, l]) => <button key={k} className={'tab-btn' + (type === k ? ' active' : '')} onClick={() => setType(k)}>{l}</button>)}
      </div>
      <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>نص السؤال</label><textarea rows={3} value={text} onChange={e => setText(e.target.value)} style={{ ...FIELD, resize: 'vertical' }} autoFocus /></div>
      <div className="form-field">
        <label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>صورة (اختياري)</label>
        {image && <div style={{ margin: '6px 0' }}><img src={mediaUrl(image)} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10 }} /> <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: '.7rem' }} onClick={() => setImage(null)}>إزالة</button></div>}
        <input type="file" accept="image/*" onChange={e => pickImage(e.target.files[0])} style={{ ...FIELD, border: '1.5px dashed var(--glass-border)' }} />
      </div>
      {type === 'mcq' && (
        <div>
          {choices.map((c, i) => (
            <div key={i} className="form-field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="qeCorrect" checked={c.ok} title="الإجابة الصحيحة" onChange={() => setChoices(cs => cs.map((x, j) => ({ ...x, ok: j === i })))} style={{ flex: 'none', width: 18, height: 18, padding: 0, border: 'none', background: 'none' }} />
              <input type="text" value={c.text} placeholder={'الخيار ' + (i + 1)} onChange={e => setChoices(cs => cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} style={{ ...FIELD, flex: 1 }} />
              <button type="button" className="icon-btn" style={{ width: 26, height: 26, flex: 'none' }} onClick={() => setChoices(cs => cs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ marginBottom: 10 }} onClick={() => setChoices(cs => [...cs, { text: '', ok: false }])}>+ خيار</button>
        </div>
      )}
      {type === 'true_false' && <div className="form-field" style={{ display: 'flex', gap: 18 }}>{['صح', 'خطأ'].map(v => <label key={v}><input type="radio" name="qeTf" checked={tf === v} onChange={() => setTf(v)} style={{ width: 'auto', padding: 0, marginInlineEnd: 6 }} />{v}</label>)}</div>}
      {type === 'essay' && <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الإجابة النموذجية</label><textarea rows={4} value={model} onChange={e => setModel(e.target.value)} style={{ ...FIELD, resize: 'vertical' }} /></div>}
      <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>شرح الإجابة (اختياري)</label><textarea rows={2} value={rationale} onChange={e => setRationale(e.target.value)} style={{ ...FIELD, resize: 'vertical' }} /></div>
      <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>التصنيف (اختياري — مثال: الجهاز الهيكلي)</label><input type="text" value={eyebrow} onChange={e => setEyebrow(e.target.value)} style={FIELD} /></div>
      {banks.length > 0 && <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>البنك</label>
        <select value={bank} onChange={e => setBank(e.target.value)} style={FIELD}><option value="">بدون بنك (أسئلة عامة)</option>{banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
      {sections.length > 1 && <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الملزمة / المحاضرة</label>
        <select value={section} onChange={e => setSection(e.target.value)} style={FIELD}>{sections.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>}
      {msg && <div style={{ fontSize: '.8rem', marginBottom: 8, color: msg.err ? 'var(--danger)' : 'var(--ink-faint)' }}>{msg.t}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={save}>حفظ</button>
        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>إلغاء</button>
      </div>
      <span style={{ display: 'none' }}>{A.version}</span>
    </Layer>
  );
}

// ------------------------------------------------------------------ AI generation / import (questions and pearls)
async function download(path, name) {
  const res = await fetch(path, { credentials: 'include', headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  if (!res.ok) throw new Error('تعذّر التنزيل');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function AiGen({ mode, onClose, onSaved, banks = [], defaultBank = '' }) {
  const A = useAdmin();
  const [bank, setBank] = useState(defaultBank);
  const [file, setFile] = useState(null);
  const [count, setCount] = useState(mode === 'pearls' ? 3 : 10);
  const [difficulty, setDifficulty] = useState('متوسط');
  const [types, setTypes] = useState(['mcq', 'true_false']);
  const [lang, setLang] = useState('ar');
  const [notes, setNotes] = useState(''); const [topic, setTopic] = useState('');
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);                     // {done,total,part,parts,secs,sinceBatch}
  const [drafts, setDrafts] = useState(null);               // {items, skipped, errors}
  const [picked, setPicked] = useState({});
  const cancel = useRef(false); const jobId = useRef(null);

  useEffect(() => {
    if (mode === 'import') return;
    apiFetch('/api/ai/status').then(st => { if (!st.enabled) setMsg({ t: 'الذكاء الاصطناعي غير مفعّل على هذا الخادم بعد — على مدير النظام ضبط مفتاح الذكاء الاصطناعي.', err: true }); }).catch(() => {});
  }, [mode]);

  const waitForJob = async (id, total) => {
    jobId.current = id; cancel.current = false;
    const started = Date.now(); let last = { done: 0, part: 0, parts: 0 }; let lastAt = Date.now();
    const tick = setInterval(() => setJob(j => ({ ...(j || {}), secs: Math.round((Date.now() - started) / 1000), sinceBatch: (Date.now() - lastAt) / 1000, total })), 1000);
    try {
      for (;;) {
        await new Promise(r => setTimeout(r, 1500));
        if (cancel.current) throw { detail: 'تم إلغاء التوليد' };
        let st;
        try { st = await apiFetch('/api/professors/me/ai/jobs/' + id); } catch (e) { if (e.status === 404) throw e; continue; }
        if (st.status === 'error') throw { detail: st.error || 'تعذّر التوليد' };
        if (st.done !== last.done || st.part !== last.part) lastAt = Date.now() - Math.round((st.batch_age || 0) * 1000);
        last = { done: st.done, part: st.part, parts: st.parts };
        setJob(j => ({ ...(j || {}), ...last, total }));
        if (st.status === 'done') return st;
      }
    } finally { clearInterval(tick); jobId.current = null; }
  };

  const run = async () => {
    const fd = new FormData();
    if (mode === 'import') { if (!file) return setMsg({ t: 'اختر ملفًا أولاً', err: true }); fd.append('file', file); }
    else if (mode === 'questions') {
      if (!file) return setMsg({ t: 'اختر ملفًا أولاً', err: true });
      if (!types.length) return setMsg({ t: 'اختر نوع سؤال واحدًا على الأقل', err: true });
      fd.append('file', file); fd.append('count', String(count)); fd.append('types', types.join(',')); fd.append('difficulty', difficulty); fd.append('notes', notes); fd.append('language', lang);
    } else {
      if (!file && !topic.trim()) return setMsg({ t: 'اكتب موضوعًا أو ارفع ملفًا', err: true });
      if (file) fd.append('file', file); fd.append('topic', topic.trim()); fd.append('count', String(count));
    }
    setBusy(true); setMsg({ t: mode === 'import' ? 'نقرأ الملف…' : 'يقرأ المساعد الملف ويصوغ المحتوى…' }); setJob(null);
    try {
      const path = mode === 'import' ? '/api/professors/me/questions/import' : mode === 'questions' ? '/api/professors/me/ai/generate-questions' : '/api/professors/me/ai/generate-pearls';
      let res = await upload(path, fd);
      if (res && res.job_id) res = await waitForJob(res.job_id, res.total);
      const items = mode === 'pearls' ? res.pearls : res.questions;
      setDrafts({ items, skipped: res.skipped || 0, errors: res.errors || [] });
      setPicked(Object.fromEntries(items.map((d, i) => [i, !d.duplicate_of])));
      setMsg(null); setJob(null);
    } catch (e) { setMsg({ t: e.detail || e.message || 'تعذّر التوليد', err: true }); }
    finally { setBusy(false); }
  };
  const stop = async () => { cancel.current = true; if (jobId.current) { try { await post('/api/professors/me/ai/jobs/' + jobId.current + '/cancel'); } catch { /* ignore */ } } };
  const saveDrafts = async () => {
    const chosen = drafts.items.filter((_, i) => picked[i]);
    if (!chosen.length) return setMsg({ t: 'لم تحدد شيئاً', err: true });
    if (mode !== 'pearls' && chosen.length > 300) return setMsg({ t: 'الحد الأقصى 300 سؤال في المرة', err: true });
    setBusy(true);
    try {
      const isQ = mode !== 'pearls';
      const res = await post(isQ ? '/api/professors/me/questions/bulk' : '/api/professors/me/pearls/bulk', isQ ? { questions: chosen.map(d => ({ ...d, bank_id: bank || null })) } : { pearls: chosen });
      A.toast(`تم حفظ ${res.saved} ${isQ ? 'سؤال' : 'لمحة'}`); onClose(); onSaved();
    } catch (e) { setBusy(false); setMsg({ t: e.detail || 'تعذّر الحفظ', err: true }); }
  };
  const title = mode === 'import' ? '📥 رفع أسئلة من ملف' : mode === 'questions' ? '✨ توليد أسئلة من ملف' : '✨ توليد لمحات سريرية';
  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const pct = job && job.total ? Math.max(2, Math.round(100 * Math.min(job.total - 0.5, (job.done || 0) + Math.min(((job.total / (job.parts || 1)) * 0.9), (job.total / (job.parts || 1)) * (1 - Math.exp(-(job.sinceBatch || 0) / 25)))) / job.total)) : 0;

  return (
    <Layer title={title} onClose={onClose} wide>
      {!drafts && (
        <div>
          {mode === 'import' && <>
            <div className="item-meta" style={{ marginBottom: 10 }}>ارفع ملف Excel (.xlsx) أو Word (.docx) فيه أسئلتك. <b>ستظهر لك معاينة</b> بالأسئلة المقروءة وأي سطر فيه مشكلة قبل الحفظ.</div>
            <div className="form-field"><input type="file" accept=".xlsx,.docx" onChange={e => setFile(e.target.files[0])} style={FIELD} /></div>
            <div className="item-meta" style={{ fontSize: '.78rem' }}>تنزيل قالب جاهز: <span style={{ color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }} onClick={() => download('/api/professors/me/questions/template/excel', 'قالب الأسئلة.xlsx').catch(e => A.toast(e.message, 'error'))}>قالب Excel</span> · <span style={{ color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }} onClick={() => download('/api/professors/me/questions/template/word', 'قالب الأسئلة.docx').catch(e => A.toast(e.message, 'error'))}>قالب Word</span></div>
            <div className="item-meta" style={{ fontSize: '.76rem', marginTop: 8, lineHeight: 1.8 }}>في Word: رقّم الأسئلة (1. 2. 3.) وخياراتها (أ) ب) ج) د)) وعلّم الصحيح بـ <b>*</b> أو ✓ أو اجعله <b>غامقاً</b>، أو اكتب «الإجابة: ب». أضف «الشرح:» و«الإجابة النموذجية:» عند الحاجة. حتى 300 سؤال.</div>
          </>}
          {mode === 'questions' && <>
            <div className="item-meta" style={{ marginBottom: 10 }}>ارفع المحاضرة أو الملزمة (PDF أو Word أو نص أو صورة) وسيصيغ الذكاء الاصطناعي الأسئلة منها. <b>تراجعها أنت قبل الحفظ</b> — لا يُحفظ شيء تلقائياً.</div>
            <div className="form-field"><input type="file" accept={AI_FILE_ACCEPT} onChange={e => setFile(e.target.files[0])} style={FIELD} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-field" style={{ flex: 1 }}><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>عدد الأسئلة (حتى 100 — الكثير يأخذ دقائق)</label><input type="number" min={1} max={100} value={count} onChange={e => setCount(e.target.value)} style={FIELD} /></div>
              <div className="form-field" style={{ flex: 1 }}><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>الصعوبة</label><select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={FIELD}><option>سهل</option><option>متوسط</option><option>صعب</option></select></div>
            </div>
            <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>أنواع الأسئلة</label>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4, fontSize: '.84rem' }}>
                {[['mcq', 'اختيارات'], ['true_false', 'صح / خطأ'], ['essay', 'مقالي']].map(([v, l]) => <label key={v}><input type="checkbox" checked={types.includes(v)} onChange={e => setTypes(t => (e.target.checked ? [...t, v] : t.filter(x => x !== v)))} style={{ width: 'auto', padding: 0, marginInlineEnd: 5 }} />{l}</label>)}
              </div></div>
            <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>لغة الأسئلة</label>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4, fontSize: '.84rem' }}>
                {[['ar', 'عربي'], ['en', 'English'], ['both', 'الاثنين معًا في نفس السؤال']].map(([v, l]) => <label key={v}><input type="radio" name="aiLang" checked={lang === v} onChange={() => setLang(v)} style={{ width: 'auto', padding: 0, marginInlineEnd: 5 }} />{l}</label>)}
              </div>
              <div className="item-meta" style={{ fontSize: '.74rem', marginTop: 4 }}>«الاثنين» يكتب كل سؤال بالإنجليزي والعربي معًا (والخيارات كذلك): 30 سؤال = 30 سؤال، كل واحد بلغتين.</div></div>
            <div className="form-field"><textarea rows={2} placeholder="تعليمات إضافية (اختياري) — مثال: ركّز على الفصل الثاني" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...FIELD, resize: 'vertical' }} /></div>
          </>}
          {mode === 'pearls' && <>
            <div className="item-meta" style={{ marginBottom: 10 }}>اكتب موضوعًا أو ارفع ملفًا (أو الاثنين) وسيكتب الذكاء الاصطناعي لمحات سريرية قصيرة تراجعها قبل الحفظ.</div>
            <div className="form-field"><input type="text" placeholder="الموضوع (مثال: الحصبة عند الأطفال)" value={topic} onChange={e => setTopic(e.target.value)} style={FIELD} /></div>
            <div className="form-field"><input type="file" accept={AI_FILE_ACCEPT} onChange={e => setFile(e.target.files[0])} style={FIELD} /></div>
            <div className="form-field"><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>عدد اللمحات</label><input type="number" min={1} max={10} value={count} onChange={e => setCount(e.target.value)} style={FIELD} /></div>
          </>}
        </div>
      )}
      {drafts && (
        <div>
          <div className="item-meta" style={{ marginBottom: 8 }}>
            {mode === 'import' ? `تمت قراءة ${drafts.items.length} سؤال` : `تم توليد ${drafts.items.length} ${mode === 'questions' ? 'سؤال' : 'لمحة'}`}{drafts.skipped ? ` (استُبعد ${drafts.skipped} غير صالح)` : ''}{drafts.errors.length ? ` — ${drafts.errors.length} سطر به مشكلة (تحت)` : ''} — ألغِ تحديد ما لا تريده، ويمكنك تعديل أي شيء بعد الحفظ.
          </div>
          {drafts.errors.length > 0 && <div className="ai-draft" style={{ display: 'block', borderColor: 'var(--danger)' }}><div className="cell-name" style={{ color: 'var(--danger)' }}>⚠ لم تُقرأ هذه الأسطر — صحّحها في الملف وأعد رفعه إن أردتها</div>{drafts.errors.map((er, i) => <div key={i} className="cell-sub" style={{ marginTop: 4 }}><b>{er.where}:</b> {er.message}</div>)}</div>}
          {drafts.items.map((d, i) => (
            <label key={i} className="ai-draft">
              <input type="checkbox" checked={!!picked[i]} onChange={e => setPicked(p => ({ ...p, [i]: e.target.checked }))} />
              <div>
                {mode === 'pearls'
                  ? <><div className="cell-name">{d.tag ? <span className="badge badge-active" style={{ marginInlineEnd: 6 }}>{d.tag}</span> : null}{d.title}</div><div className="cell-sub" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{d.body}</div></>
                  : <>
                    {d.duplicate_of && <div className="cell-sub" style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 4 }}>⚠ مشابه لسؤال موجود في بنكك ({Math.round(d.duplicate_of.similarity * 100)}%): {d.duplicate_of.text.slice(0, 70)} — لم يُحدَّد تلقائياً</div>}
                    <div className="cell-name"><span className="badge badge-idle" style={{ marginInlineEnd: 6 }}>{QTYPE_LABEL[d.qtype]}</span>{d.text}</div>
                    <div className="cell-sub" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{d.qtype === 'essay' ? 'الإجابة النموذجية: ' + d.model_answer : d.choices.map(c => (c.is_correct ? '✓ ' : '• ') + c.text).join('\n')}</div>
                    {d.rationale ? <div className="cell-sub" style={{ marginTop: 4, opacity: .8 }}>الشرح: {d.rationale}</div> : null}
                  </>}
              </div>
            </label>
          ))}
        </div>
      )}
      {job && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 6 }}><span>✍️ {job.part ? `الدفعة ${job.part} من ${job.parts}` : 'يقرأ الملف…'}</span><span>{job.done || 0} / {job.total} سؤال</span></div>
          <div style={{ height: 14, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', borderRadius: 99, background: 'linear-gradient(90deg,var(--accent),var(--accent-2))', transition: 'width 1s linear' }} /></div>
          <div className="item-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: '.74rem' }}>
            <span>مضى {fmt(job.secs || 0)} · هذه الدفعة منذ {Math.round(job.sinceBatch || 0)} ثانية{(job.sinceBatch || 0) > 90 ? ' — الخدمة بطيئة الآن، ما زلنا ننتظر' : ''}</span>
            <button type="button" className="btn btn-ghost" style={{ padding: '3px 12px', fontSize: '.72rem' }} onClick={stop}>إلغاء</button></div>
        </div>
      )}
      {mode !== 'pearls' && banks.length > 0 && <div className="form-field" style={{ marginTop: 12 }}><label style={{ fontSize: '.75rem', color: 'var(--ink-faint)' }}>احفظ الأسئلة في بنك</label>
        <select value={bank} onChange={e => setBank(e.target.value)} style={FIELD}><option value="">بدون بنك (أسئلة عامة)</option>{banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
      {msg && !job && <div style={{ fontSize: '.8rem', marginTop: 8, color: msg.err ? 'var(--danger)' : 'var(--ink-faint)' }}>{msg.t}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {!drafts
          ? <button className="btn" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={run}>{busy ? (job ? Math.round(100 * (job.done || 0) / (job.total || 1)) + '% …' : 'جارٍ العمل…') : mode === 'import' ? 'اقرأ الملف' : 'ولّد'}</button>
          : <><button className="btn" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={saveDrafts}>حفظ المحدد</button><button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setDrafts(null); setMsg(null); }}>رجوع</button></>}
        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>إلغاء</button>
      </div>
    </Layer>
  );
}

// ------------------------------------------------------------------ question bank
export function Questions() {
  const A = useAdmin();
  const { data: list, error, reload: reloadQs } = useData(() => apiFetch('/api/professors/me/questions'), []);
  const { data: bk, reload: reloadBanks } = useData(() => apiFetch('/api/professors/me/banks').catch(() => ({ banks: [], general_count: 0 })), []);
  const reload = () => { reloadQs(); reloadBanks(); };
  const banks = (bk && bk.banks) || [];
  const [bankSel, setBankSel] = useState('all');         // 'all' | 'none' (no bank) | a bank id
  const [type, setType] = useState('all'); const [q, setQ] = useState(''); const [shown, setShown] = useState(30);
  const [editor, setEditor] = useState(undefined);     // undefined closed, null new, object edit
  const [ai, setAi] = useState(null);
  const curBank = banks.find(b => b.id === bankSel) || null;
  const inBank = (x) => bankSel === 'all' || (bankSel === 'none' ? !x.bank_id : x.bank_id === bankSel);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list || []).filter(x => inBank(x) && (type === 'all' || (type === 'image' ? !!x.image_url : (x.qtype || 'mcq') === type)) &&
      (!s || [x.text, x.eyebrow, x.rationale, ...(x.choices || []).map(c => c.text)].some(v => (v || '').toLowerCase().includes(s))));
  }, [list, type, q, bankSel]); // eslint-disable-line
  if (error) return <Card>{error}</Card>;
  if (!list) return <Loading />;
  const generalN = list.filter(x => !x.bank_id).length;
  const newBank = () => A.dialogs.form({ title: 'بنك جديد', fields: [{ id: 'name', label: 'اسم البنك', placeholder: 'مثال: بنك الفصل الأول' }],
    onSubmit: async (v) => { const r = await post('/api/professors/me/banks', { name: v.name }); setBankSel(r.id); reload(); A.toast('تم إنشاء البنك'); } });
  const renameBank = () => A.dialogs.form({ title: 'تعديل اسم البنك', fields: [{ id: 'name', label: 'الاسم الجديد', value: curBank.name }],
    onSubmit: async (v) => { await put('/api/professors/me/banks/' + curBank.id, { name: v.name }); reload(); A.toast('تم تعديل الاسم'); } });
  const deleteBank = async () => {
    const n = curBank.count;
    if (!await A.dialogs.confirm(`حذف البنك «${curBank.name}»؟ سيُحذف معه ${n} سؤال نهائياً ولا يمكن التراجع.`)) return;
    try { const r = await del('/api/professors/me/banks/' + curBank.id); setBankSel('all'); reload(); A.toast(`حُذف البنك و${r.removed_questions} سؤال`); }
    catch (e) { A.toast(e.detail || 'تعذّر حذف البنك', 'error'); }
  };
  // move the questions on screen (or just one) into a bank
  const moveForm = (ids, title) => A.dialogs.form({ title, fields: [{ id: 'bank', type: 'select', label: 'انقلها إلى', value: '', options: [{ value: '', label: 'بدون بنك (أسئلة عامة)' }, ...banks.map(b => ({ value: b.id, label: b.name }))] }],
    onSubmit: async (v) => { const r = await post('/api/professors/me/questions/move', { question_ids: ids, bank_id: v.bank || null }); reload(); A.toast(`تم نقل ${r.moved} سؤال`); } });
  const by = t => list.filter(x => (x.qtype || 'mcq') === t).length;
  const types = [['all', 'الكل', list.length], ['mcq', 'اختيارات', by('mcq')], ['true_false', 'صح/خطأ', by('true_false')], ['essay', 'مقالي', by('essay')], ['image', 'بصور', list.filter(x => x.image_url).length]];
  const remove = async (x) => { if (!await A.dialogs.confirm('حذف هذا السؤال نهائياً؟')) return; try { await del('/api/professors/me/questions/' + x.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  return (
    <>
      <Card title={A.user.role === 'representative' || A.pick?.rep ? 'بنك الأسئلة' : 'بنك أسئلتي'} actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setAi('import')}>📥 رفع أسئلة من Excel / Word</button>
          <button className="btn btn-ghost" onClick={() => setAi('questions')}>✨ توليد من ملف بالذكاء الاصطناعي</button>
          <AddBtn onClick={() => setEditor(null)}>سؤال جديد</AddBtn>
        </div>}>
        <StKpis items={[['إجمالي الأسئلة', numAr(list.length), 'تظهر لطلاب مادتك تلقائيًا'], ['البنوك', numAr(banks.length)], ['اختيارات', numAr(by('mcq'))], ['صح / خطأ', numAr(by('true_false'))], ['مقالي', numAr(by('essay'))], ['بصور', numAr(list.filter(x => x.image_url).length)]]} />
        <div className="ops-filters" style={{ alignItems: 'center' }}>
          <b style={{ fontSize: '.8rem' }}>البنوك:</b>
          <button className={'cat-tab' + (bankSel === 'all' ? ' on' : '')} onClick={() => { setBankSel('all'); setShown(30); }}>كل الأسئلة <b>{list.length}</b></button>
          {banks.map(b => <button key={b.id} className={'cat-tab' + (bankSel === b.id ? ' on' : '')} onClick={() => { setBankSel(b.id); setShown(30); }}>{b.name} <b>{b.count}</b></button>)}
          {banks.length > 0 && generalN > 0 && <button className={'cat-tab' + (bankSel === 'none' ? ' on' : '')} onClick={() => { setBankSel('none'); setShown(30); }}>بدون بنك <b>{generalN}</b></button>}
          <button className="cat-tab plus" onClick={newBank}>+ بنك جديد</button>
        </div>
        {curBank && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 4px' }}>
          <span className="cell-sub">البنك: <b>{curBank.name}</b> — {curBank.count} سؤال</span>
          <SmallBtn onClick={renameBank}>تعديل اسم البنك</SmallBtn><SmallBtn danger onClick={deleteBank}>حذف البنك</SmallBtn></div>}
        {banks.length > 0 && filtered.length > 0 && <div style={{ margin: '4px 0 8px' }}><SmallBtn onClick={() => moveForm(filtered.map(x => x.id), `نقل ${filtered.length} سؤال إلى بنك`)}>نقل الأسئلة المعروضة ({filtered.length}) إلى بنك…</SmallBtn></div>}
        <div className="ops-filters">
          {types.map(([k, l, n]) => <button key={k} className={'cat-tab' + (k === type ? ' on' : '')} onClick={() => { setType(k); setShown(30); }}>{l} <b>{n}</b></button>)}
          <input type="text" className="q" placeholder="ابحث في نص السؤال أو الخيارات أو التصنيف..." value={q} onChange={e => { setQ(e.target.value); setShown(30); }} />
        </div>
        <div>
          {filtered.slice(0, shown).map(x => (
            <div key={x.id} className="item-card glass" style={{ alignItems: 'flex-start' }}>
              <div className="item-body">
                <div className="item-title"><span className="badge badge-idle" style={{ marginInlineEnd: 6 }}>{QTYPE_LABEL[x.qtype] || 'اختيارات'}</span>{x.image_url ? <span className="badge badge-active" style={{ marginInlineEnd: 6 }}>🖼 صورة</span> : null}{x.text}</div>
                <div className="item-meta">{x.qtype === 'essay' ? 'إجابة نموذجية: ' + (x.model_answer || '').slice(0, 90) : x.choices.map(c => (c.is_correct ? '✓ ' : '• ') + c.text).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none' }}>{banks.length > 0 && <SmallBtn onClick={() => moveForm([x.id], 'نقل السؤال إلى بنك')}>نقل</SmallBtn>}<SmallBtn onClick={() => setEditor(x)}>تعديل</SmallBtn><TrashBtn label="حذف السؤال" onClick={() => remove(x)} /></div>
            </div>
          ))}
          {!filtered.length && <div className="empty-row">لا توجد أسئلة بهذه المواصفات — اضغط «سؤال جديد»</div>}
        </div>
        {filtered.length > shown && <div className="ops-pager"><button className="btn btn-ghost" onClick={() => setShown(s => s + 30)}>عرض المزيد ({numAr(filtered.length - shown)})</button></div>}
      </Card>
      {editor !== undefined && <QuestionEditor q={editor} onClose={() => setEditor(undefined)} onSaved={reload} banks={banks} defaultBank={curBank ? curBank.id : ''} />}
      {ai && <AiGen mode={ai} onClose={() => setAi(null)} onSaved={reload} banks={banks} defaultBank={curBank ? curBank.id : ''} />}
    </>
  );
}

// ------------------------------------------------------------------ pearls
export function Pearls() {
  const A = useAdmin();
  const { data: list, error, reload } = useData(() => apiFetch('/api/professors/me/pearls'), []);
  const [ai, setAi] = useState(false);
  if (error) return <Card>{error}</Card>;
  if (!list) return <Loading />;
  const form = (cur) => A.dialogs.form({
    title: cur ? 'تعديل لمحة سريرية' : 'إضافة لمحة سريرية',
    fields: [
      { id: 'tag', label: 'التصنيف (مثال: طوارئ، تشخيص، أطفال)', value: cur?.tag || '' },
      { id: 'title', label: 'الحالة — يظهر للزائر قبل تسجيل الدخول (بدون ذكر التشخيص)', value: cur?.title || '' },
      { id: 'body', type: 'textarea', rows: 6, label: 'التشخيص والتفاصيل — لا تظهر إلا بعد تسجيل الدخول', value: cur?.body || '' },
    ],
    onSubmit: async (v) => {
      if (!v.title.trim()) throw { detail: 'العنوان مطلوب' };
      const body = { title: v.title.trim(), tag: v.tag.trim(), body: v.body.trim() };
      if (cur) await put('/api/professors/me/pearls/' + cur.id, body); else await post('/api/professors/me/pearls', body);
      reload();
    },
  });
  const remove = async (p) => { if (!await A.dialogs.confirm('حذف هذه اللمحة نهائياً؟')) return; try { await del('/api/professors/me/pearls/' + p.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  return (
    <>
      <Card title="لمحاتي السريرية" actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-ghost" onClick={() => setAi(true)}>✨ توليد بالذكاء الاصطناعي</button><AddBtn onClick={() => form(null)}>إضافة لمحة</AddBtn></div>}>
        <div className="item-meta" style={{ marginBottom: 12 }}>تظهر اللمحة لطلاب قسمك (الكلية) فقط. العنوان يراه الزائر قبل تسجيل الدخول، أما التفاصيل والتشخيص فلا تظهر إلا بعد الدخول.</div>
        <Table search="ابحث في اللمحات..." head={['التصنيف', 'العنوان', 'التفاصيل', '']} empty="لا توجد لمحات بعد — أضف واحدة أو ولّدها بالذكاء الاصطناعي">
          {list.map(p => (
            <tr key={p.id}><td>{p.tag ? <Badge kind="active">{p.tag}</Badge> : '—'}</td><td><div className="cell-name">{p.title}</div></td>
              <td><div className="cell-sub" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.body || '—'}</div></td>
              <RowActions><SmallBtn onClick={() => form(p)}>تعديل</SmallBtn><TrashBtn label="حذف" onClick={() => remove(p)} /></RowActions></tr>
          ))}
        </Table>
      </Card>
      {ai && <AiGen mode="pearls" onClose={() => setAi(false)} onSaved={reload} />}
    </>
  );
}

// ------------------------------------------------------------------ assistants (doctor's helpers)
const PERM_OPTIONS = PROF_PERM_LIST.map(c => ({ value: c, label: PERM_LABELS[c] }));
export function Assistants() {
  const A = useAdmin();
  const { data: list, error, reload } = useData(() => apiFetch('/api/professors/me/assistants'), []);
  if (error) return <Card>{error}</Card>;
  if (!list) return <Loading />;
  const add = () => A.dialogs.form({
    title: 'إضافة مساعد',
    fields: [{ id: 'fullName', label: 'اسم المساعد' }, { id: 'email', label: 'البريد الإلكتروني (لتسجيل دخوله)', dir: 'ltr' }, { id: 'password', type: 'password', label: 'كلمة المرور (8 أحرف على الأقل)' },
      { id: 'perms', type: 'checks', label: 'ماذا يستطيع المساعد أن يفعل؟', value: ['prof.questions'], options: PERM_OPTIONS }],
    onSubmit: async (v) => {
      if (!v.fullName.trim() || !v.email.trim()) throw { detail: 'الاسم والبريد مطلوبان' };
      await post('/api/professors/me/assistants', { full_name: v.fullName.trim(), email: v.email.trim(), password: v.password, permissions: v.perms }); reload();
    },
  });
  const perms = (a) => A.dialogs.form({ title: 'صلاحيات — ' + a.full_name, fields: [{ id: 'perms', type: 'checks', label: 'الصلاحيات', value: a.permissions, options: PERM_OPTIONS }],
    onSubmit: async (v) => { await put('/api/professors/me/assistants/' + a.id, { permissions: v.perms }); reload(); } });
  const remove = async (a) => { if (!await A.dialogs.confirm('حذف حساب هذا المساعد؟ لن يستطيع الدخول بعد الآن (الأسئلة التي رفعها تبقى).')) return; try { await del('/api/professors/me/assistants/' + a.id); reload(); } catch (e) { A.toast(e.detail || 'تعذّر الحذف', 'error'); } };
  return (
    <Card title="مساعدو الدكتور" actions={<AddBtn onClick={add}>إضافة مساعد</AddBtn>}>
      <div className="item-meta" style={{ marginBottom: 12 }}>أنت تنشئ حساب المساعد وتحدّد له ما يستطيع فعله داخل مادتك — ويمكنك تغيير ذلك أو حذف الحساب في أي وقت.</div>
      <Table search="ابحث باسم المساعد..." head={['المساعد', 'الصلاحيات', '']} empty="لا يوجد مساعدون — اضغط «إضافة مساعد»">
        {list.map(a => (
          <tr key={a.id}>
            <td><div className="cell-user"><div className="cell-avatar" style={{ background: 'var(--accent-2)' }}>{initialsOf(a.full_name)}</div><div><div className="cell-name">{a.full_name}</div><div className="cell-sub mono">{a.email}</div></div></div></td>
            <td>{a.permissions.length ? a.permissions.map(p => <span key={p} className="badge badge-active" style={{ margin: 2 }}>{PERM_LABELS[p] || p}</span>) : <Badge kind="disabled">بلا صلاحيات</Badge>}</td>
            <RowActions><SmallBtn onClick={() => perms(a)}>الصلاحيات</SmallBtn><SmallBtn danger onClick={() => remove(a)}>حذف</SmallBtn></RowActions>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
