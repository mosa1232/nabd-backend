import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { PageHead } from './Bank.jsx';

// three.js r128 and its two helpers are served from /static/vendor (the same files the
// current site uses); they are loaded once, on first visit to this page.
const loadScript = src => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed: ' + src));
  document.head.appendChild(s);
});
async function ensureThree() {
  if (!window.THREE) await loadScript('/static/vendor/three.min.js');
  if (!window.THREE.OrbitControls) await loadScript('/static/vendor/OrbitControls.js');
  if (!window.THREE.GLTFLoader) await loadScript('/static/vendor/GLTFLoader.js');
  return window.THREE;
}

let manifestCache = null, partsCache = null;
async function loadManifest() {
  if (manifestCache) return manifestCache;
  try { const r = await fetch('/static/models/manifest.json', { cache: 'no-cache' }); manifestCache = r.ok ? ((await r.json()).models || []) : []; }
  catch { manifestCache = []; }
  return manifestCache;
}
async function loadParts() {
  if (partsCache) return partsCache;
  try { const r = await fetch('/static/models/parts.json', { cache: 'no-cache' }); partsCache = r.ok ? await r.json() : { by: {}, regions: {} }; }
  catch { partsCache = { by: {}, regions: {} }; }
  return partsCache;
}

const ico = d => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;

export function Anatomy() {
  const { t, lang } = useApp();
  const L = lang === 'en' ? 'en' : lang === 'ku' ? 'ku' : 'ar';
  const stageRef = useRef(null);
  const mv = useRef(null);                   // the three.js viewer
  const [models, setModels] = useState(null);
  const [cur, setCur] = useState(null);
  const curRef = useRef(null); const modelsRef = useRef([]); const langRef = useRef(L);
  langRef.current = L; curRef.current = cur; modelsRef.current = models || [];
  const [loading, setLoading] = useState('');   // '' = hidden
  const [part, setPart] = useState(null);       // {title, text, note}
  const [auto, setAuto] = useState(false);
  const [full, setFull] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => { loadManifest().then(m => { setModels(m); if (m.length) setCur(m[0].id); }); }, []);

  const clearPart = useCallback(() => {
    const v = mv.current; if (!v) return;
    if (v.marker) { v.scene.remove(v.marker); v.marker.geometry.dispose(); v.marker = null; }
    if (v.hl) { v.hl.mesh.material = v.hl.orig; v.hl.tmp.dispose(); v.hl = null; }
    setPart(null);
  }, []);

  const pick = useCallback(async (cx, cy) => {
    const v = mv.current, THREE = window.THREE;
    if (!v || !v.obj) return;
    const parts = await loadParts();
    const rect = v.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, v.camera);
    const hit = ray.intersectObject(v.obj, true)[0];
    clearPart();
    if (!hit) return;
    const id = curRef.current;
    const m = modelsRef.current.find(x => x.id === id) || {};
    const pl = langRef.current === 'en' ? 'en' : 'ar';           // part texts exist in Arabic and English (Kurdish shows Arabic)
    const mesh = hit.object, mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const names = [mesh.name, mesh.parent && mesh.parent.name, mat && mat.name].filter(Boolean).join(' | ').toLowerCase();
    const byRule = (parts.by[id] || []).find(r => r.m.split('|').some(k => names.includes(k.toLowerCase())));
    let title = null, text = null, note = '';
    if (byRule) {
      title = byRule[pl === 'ar' ? 'ar' : 'en']; text = byRule['d_' + pl];
      if (mat && mat.emissive) {     // light the piece up
        const tmp = mat.clone(); tmp.emissive = new THREE.Color(0x3a5bff); tmp.emissiveIntensity = 0.55;
        v.hl = { mesh, orig: mesh.material, tmp }; mesh.material = tmp;
      }
    } else if (parts.regions[id]) {
      // unnamed pieces: the region under the tap, by position inside the model
      const box = new THREE.Box3().setFromObject(v.obj), size = box.getSize(new THREE.Vector3());
      const ny = (hit.point.y - box.min.y) / (size.y || 1), nz = (hit.point.z - box.min.z) / (size.z || 1);
      const ax = Math.abs(hit.point.x - (box.min.x + box.max.x) / 2) / ((size.x || 1) / 2);
      const spec = parts.regions[id];
      const reg = spec.list.find(r => ny >= r.ny[0] && ny < r.ny[1] + 1e-6 && (!r.ax || (ax >= r.ax[0] && ax <= r.ax[1])) && (!r.nz || (nz >= r.nz[0] && nz <= r.nz[1])));
      if (reg) {
        title = reg[pl]; const d = reg['d_' + pl]; text = typeof d === 'string' ? d : (d[spec.kind] || d.body || '');
        note = pl === 'ar' ? 'تحديد تقريبي حسب موضع اللمس' : 'Approximate: picked by where you tapped';
      }
    }
    if (!title) { title = m[pl] || m.en || ''; text = m['d_' + pl] || m.d_en || ''; note = pl === 'ar' ? 'هذا النموذج لا يفصل أجزاءه — اللمس يعرض اسم النموذج.' : 'This model does not separate its parts; tapping shows the model itself.'; }
    const dim = v.home ? v.home.dist / 1.9 : 1;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(dim * 0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd34d, depthTest: false }));
    marker.renderOrder = 999; marker.position.copy(hit.point); v.scene.add(marker); v.marker = marker;
    setPart({ title, text, note });
  }, [clearPart]);

  // build the viewer once
  useEffect(() => {
    let dead = false;
    (async () => {
      let THREE;
      try { THREE = await ensureThree(); } catch { setLoading('fail'); return; }
      if (dead || !stageRef.current) return;
      const stage = stageRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x10131c, 1);
      stage.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 4, 3); scene.add(dl);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.09;
      controls.rotateSpeed = 0.8; controls.zoomSpeed = 0.9; controls.panSpeed = 0.7; controls.screenSpacePanning = true; controls.autoRotateSpeed = 1.6;
      const v = { renderer, scene, camera, controls, obj: null, running: true, home: null, zoomTo: null, marker: null, hl: null };
      const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      v.resize = resize; mv.current = v;
      window.addEventListener('resize', resize);
      let down = null;
      const onDown = e => { setHint(false); down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
      const onUp = e => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
        if (moved < 7 && dt < 600) pick(e.clientX, e.clientY);
      };
      renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);
      const THREEv = THREE;
      const loop = () => {
        if (!v.running) return;
        if (v.zoomTo) {   // eased zoom / reset instead of a jump
          const c = v.controls, tgt = c.target, vec = v.camera.position.clone().sub(tgt), k = 0.16, want = v.zoomTo;
          if (want.pos) { v.camera.position.lerp(want.pos, k); c.target.lerp(new THREEv.Vector3(), k); if (v.camera.position.distanceTo(want.pos) < want.dist * 0.004) { v.camera.position.copy(want.pos); c.target.set(0, 0, 0); v.zoomTo = null; } }
          else { const d = vec.length(), nd = d + (want.d - d) * k; vec.setLength(nd); v.camera.position.copy(tgt).add(vec); if (Math.abs(want.d - d) < want.d * 0.004) v.zoomTo = null; }
        }
        v.controls.update(); v.renderer.render(v.scene, v.camera); v.raf = requestAnimationFrame(loop);
      };
      resize(); loop();
      v.cleanup = () => {
        v.running = false; cancelAnimationFrame(v.raf); window.removeEventListener('resize', resize);
        renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
        if (v.obj) v.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        controls.dispose(); renderer.dispose(); renderer.domElement.remove();
      };
      setViewerReady(n => n + 1);
    })();
    return () => { dead = true; if (mv.current && mv.current.cleanup) mv.current.cleanup(); mv.current = null; };
  }, [pick]);
  const [viewerReady, setViewerReady] = useState(0);

  // load the chosen model
  useEffect(() => {
    const v = mv.current, THREE = window.THREE;
    if (!v || !cur) return undefined;
    const m = modelsRef.current.find(x => x.id === cur);
    if (!m) return undefined;
    let dead = false;
    setLoading('loading'); clearPart();
    new THREE.GLTFLoader().load(m.url, gltf => {
      if (dead || mv.current !== v) return;
      if (v.obj) { v.scene.remove(v.obj); v.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      const obj = gltf.scene; v.obj = obj; v.scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const dim = Math.max(size.x, size.y, size.z) || 1;
      obj.position.sub(center);
      v.camera.position.set(0, 0, dim * 1.9); v.camera.near = dim / 100; v.camera.far = dim * 100; v.camera.updateProjectionMatrix();
      v.controls.target.set(0, 0, 0); v.controls.minDistance = dim * 0.25; v.controls.maxDistance = dim * 6; v.controls.update();
      v.home = { pos: v.camera.position.clone(), dist: dim * 1.9 }; v.zoomTo = null;
      setLoading('');
    }, undefined, () => { if (!dead) setLoading('fail'); });
    return () => { dead = true; };
  }, [cur, viewerReady]); // eslint-disable-line

  const m = (models || []).find(x => x.id === cur);
  const step = dir => { const list = models || []; const i = list.findIndex(x => x.id === cur); if (i >= 0) setCur(list[(i + dir + list.length) % list.length].id); };
  const zoom = f => { const v = mv.current; if (!v || !v.home) return; const c = v.controls, d = v.camera.position.distanceTo(c.target); v.zoomTo = { d: Math.min(c.maxDistance, Math.max(c.minDistance, d * f)) }; };
  const reset = () => { const v = mv.current; if (v && v.home) v.zoomTo = { pos: v.home.pos.clone(), dist: v.home.dist }; };
  const toggleAuto = () => { const v = mv.current; if (!v) return; v.controls.autoRotate = !v.controls.autoRotate; setAuto(v.controls.autoRotate); };
  const setFullscreen = useCallback((on) => {
    const stage = stageRef.current; setFull(on);
    document.body.classList.toggle('anat-fullscreen', on);
    try {
      if (on && stage && stage.requestFullscreen && !document.fullscreenElement) stage.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* the CSS full-screen layout works without the browser API */ }
    setTimeout(() => mv.current && mv.current.resize && mv.current.resize(), 60);
    setTimeout(() => mv.current && mv.current.resize && mv.current.resize(), 350);
  }, []);
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && full) setFullscreen(false); };
    const fs = () => { if (!document.fullscreenElement && full) setFullscreen(false); };
    document.addEventListener('keydown', esc); document.addEventListener('fullscreenchange', fs);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('fullscreenchange', fs); };
  }, [full, setFullscreen]);
  useEffect(() => () => document.body.classList.remove('anat-fullscreen'), []);

  const partBox = part && <>
    <button type="button" onClick={clearPart} aria-label="✕" style={full ? undefined : { display: 'none' }}>✕</button>
    <b>{part.title}</b><p>{part.text}</p><small>{part.note}</small>
  </>;
  return (
    <div className="view active">
      <PageHead title={t('anatomyTitle')} sub={t('anatomySub')} back="/" />
      {models && !models.length && <div className="empty-row">{t('anatomyFailed')}</div>}
      <div id="anatModels">
        <div className="anat-chips" role="tablist">
          {(models || []).map(x => <button key={x.id} type="button" className={'anat-chip' + (x.id === cur ? ' active' : '')} role="tab" onClick={() => setCur(x.id)}>{x[L] || x.en}</button>)}
        </div>
        <div className={'anat-stage' + (full ? ' anat-full' : '')} ref={stageRef}>
          {loading && <div className="anat-loading" style={{ display: 'grid' }}>{loading === 'fail' ? t('anatomyFailed') : t('anatomyLoadingModel')}</div>}
          <div className="anat-name-tag">{m ? (m[L] || m.en) : ''}</div>
          <div className="anat-tools">
            <button type="button" onClick={() => zoom(0.78)} aria-label={t('anatZoomIn')}>{ico(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></>)}</button>
            <button type="button" onClick={() => zoom(1.28)} aria-label={t('anatZoomOut')}>{ico(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></>)}</button>
            <button type="button" onClick={reset} aria-label={t('anatReset')}>{ico(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>)}</button>
            <button type="button" className={auto ? 'on' : ''} onClick={toggleAuto} aria-label={t('anatAuto')}>{ico(<><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" /><path d="M18.5 2v4h-4M5.5 22v-4h4" /></>)}</button>
            <button type="button" onClick={() => setFullscreen(!full)} aria-label={t('anatFull')}>{full ? ico(<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />) : ico(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />)}</button>
          </div>
          <button type="button" className="anat-nav prevx" onClick={() => step(-1)} aria-label="prev">{ico(<path d="M9 5l7 7-7 7" />)}</button>
          <button type="button" className="anat-nav nextx" onClick={() => step(1)} aria-label="next">{ico(<path d="M15 5l-7 7 7 7" />)}</button>
          {full && part && <div className="anat-part anat-part-over" style={{ display: 'block' }}>{partBox}</div>}
          <div className={'anat-hint' + (hint ? '' : ' gone')}>{t('anatHint')}</div>
        </div>
        <div className="anat-info">
          {!full && part && <div className="anat-part" style={{ display: 'block' }}>{partBox}</div>}
          <div style={{ fontWeight: 800 }}>{m ? (m[L] || m.en) : ''}</div>
          <div className="item-meta">{m ? (m['d_' + L] || m.d_en || '') : ''}</div>
          {m && <div className="anat-credit">{`${t('anatomyCreditPrefix')} «${m.title}» — @${m.author} · ${m.license || 'CC BY 4.0'}`}</div>}
        </div>
      </div>
    </div>
  );
}
