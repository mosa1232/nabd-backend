/*
 * Kiur — 3D anatomy simulator.
 *
 * The anatomy comes from Z-Anatomy (the libre 3D atlas of anatomy), which is itself built on
 * BodyParts3D:
 *   Z-Anatomy, (c) Gauthier Kervyn and contributors, CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)
 *   BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan.
 * static/anatomy/bp3d.bin + bp3d.json are a derivative of them (structures extracted, the
 * non-commercial and unclear-licence ones left out, thinned to a mobile-friendly size) and
 * stay under CC BY-SA. Terminology: Terminologia Anatomica (Latin names via Z-Anatomy's TA2 table).
 * The viewer code in this file is the platform's own, on three.js (MIT).
 *
 * Coordinates: 1 unit = 10 cm, +Y up, +Z toward the viewer (front of the
 * body), +X is the person's LEFT (the viewer's right in the front view).
 */
(function (global) {
  'use strict';
  const T = global.THREE;
  if (!T) { console.error('three.js is required'); return; }

  const DATA = '/static/anatomy/';
  const STR = {
    ar: {
      layers: {skin: 'الجلد', skeleton: 'الهيكل العظمي', muscles: 'العضلات', fascia: 'اللفافات والأغشية', organs: 'الأعضاء', vessels: 'الأوعية الدموية', nerves: 'الأعصاب'},
      reset: 'إعادة العرض', xray: 'شفاف', labels: 'التسميات', hot: 'نقاط',  rotate: 'دوران', front: 'أمامي', back: 'خلفي', left: 'يسار', right: 'يمين', head: 'الرأس', chest: 'الصدر', belly: 'البطن',
      search: 'ابحث عن عضو أو عظمة أو وعاء…', hint: 'اضغط على أي جزء من الجسم أو على الدوائر الصفراء لمعرفة اسمه ووظيفته، وشغّل الطبقات من الأسفل.',
      isolate: 'عزل', showAll: 'إظهار الكل', close: 'إغلاق', quiz: 'اختبرني', quizStop: 'إنهاء', ask: 'اضغط على: ', ok: 'صحيح ✓', no: 'ليس هذا — هذا هو: ', score: 'النتيجة',
      loading: 'جارٍ تحميل المجسّم…', noResults: 'لا توجد نتائج', parts: 'جزءًا تشريحيًا',
      note: 'التشريح من مشروع Z-Anatomy (CC BY-SA 4.0) المبني على BodyParts3D (© مركز قواعد بيانات علوم الحياة، اليابان) — مجسّم تعليمي، وليس بديلًا عن الأطالس الطبية.',
      gen: {skeleton: 'عظم أو غضروف أو رباط من الجهاز الهيكلي.', muscles: 'عضلة أو وتر من الجهاز العضلي.', fascia: 'لفافة أو غشاء يغلّف العضلات والأعضاء.', organs: 'عضو أو بنية داخلية.', vessels: 'وعاء دموي أو لمفاوي — الشرايين حمراء والأوردة زرقاء في المجسّم.', nerves: 'من الجهاز العصبي.', skin: 'الجلد.'},
      fail: 'تعذّر تحميل بيانات المجسّم.',
    },
    en: {
      layers: {skin: 'Skin', skeleton: 'Skeleton', muscles: 'Muscles', fascia: 'Fasciae & membranes', organs: 'Organs', vessels: 'Vessels', nerves: 'Nerves'},
      reset: 'Reset view', xray: 'X-ray', labels: 'Labels', hot: 'Hotspots',  rotate: 'Spin', front: 'Front', back: 'Back', left: 'Left', right: 'Right', head: 'Head', chest: 'Chest', belly: 'Abdomen',
      search: 'Search an organ, bone or vessel…', hint: 'Tap any part of the body, or a yellow ring, to see its name and function; switch layers below.',
      isolate: 'Isolate', showAll: 'Show all', close: 'Close', quiz: 'Quiz me', quizStop: 'Stop', ask: 'Tap on: ', ok: 'Correct ✓', no: 'Not that — this is the: ', score: 'Score',
      loading: 'Loading the 3D body…', noResults: 'No results', parts: 'anatomical parts',
      note: 'Anatomy from Z-Anatomy (CC BY-SA 4.0), built on BodyParts3D (© The Database Center for Life Science, Japan) — a teaching model, not a substitute for medical atlases.',
      gen: {skeleton: 'A bone, cartilage or ligament of the skeleton.', muscles: 'A muscle or tendon of the muscular system.', fascia: 'A fascia or membrane that wraps muscles and organs.', organs: 'An organ or internal structure.', vessels: 'A blood or lymphatic vessel — arteries are red and veins blue in the model.', nerves: 'Part of the nervous system.', skin: 'The skin.'},
      fail: 'Could not load the model data.',
    },
    ku: {
      layers: {skin: 'پێست', skeleton: 'ئێسکەپەیکەر', muscles: 'ماسولکە', fascia: 'پەردە و لەفافە', organs: 'ئەندامەکان', vessels: 'ڕەگەکانی خوێن', nerves: 'دەمارەکان'},
      reset: 'گەڕانەوە', xray: 'شەفاف', labels: 'ناوەکان', hot: 'خاڵەکان',  rotate: 'سوڕان', front: 'پێشەوە', back: 'پشتەوە', left: 'چەپ', right: 'ڕاست', head: 'سەر', chest: 'سنگ', belly: 'سک',
      search: 'بەدوای ئەندام، ئێسک یان ڕەگدا بگەڕێ…', hint: 'کلیک لە هەر بەشێکی جەستە بکە بۆ ناوەکەی، یان چینەکان لە خوارەوە بگۆڕە.',
      isolate: 'جیاکردنەوە', showAll: 'هەموو نیشان بدە', close: 'داخستن', quiz: 'تاقیم بکەوە', quizStop: 'کۆتایی', ask: 'کلیک بکە لەسەر: ', ok: 'ڕاستە ✓', no: 'ئەمە نییە — ئەمە: ', score: 'ئەنجام',
      loading: 'مۆدێلەکە بار دەکرێت…', noResults: 'هیچ ئەنجامێک نییە', parts: 'بەشی تەشریحی',
      note: 'تەشریحەکە لە Z-Anatomy وەرگیراوە (CC BY-SA 4.0) و لەسەر BodyParts3D بنیاتنراوە — مۆدێلێکی فێرکارییە، جێگرەوەی ئەتلەسی پزیشکی نییە.',
      gen: {skeleton: 'ئێسک، کڕکڕاگە یان بەستەر لە ئێسکەپەیکەر.', muscles: 'ماسولکە یان دەمارێکی ماسولکە.', fascia: 'لەفافە یان پەردەیەک ماسولکە و ئەندامەکان دەپێچێت.', organs: 'ئەندام یان پێکهاتەیەکی ناوەکی.', vessels: 'ڕەگی خوێن یان لیمفاوی — شادەمارەکان سوورن و دەمارەکان شین.', nerves: 'لە سیستەمی دەمارییە.', skin: 'پێست.'},
      fail: 'نەتوانرا زانیاری مۆدێلەکە بار بکرێت.',
    },
  };

  const SYS = ['skin', 'skeleton', 'muscles', 'fascia', 'organs', 'vessels', 'nerves'];
  const SYS_COLOR = {skin: '#9fb6ff', skeleton: '#e9dfc8', muscles: '#c0463f', fascia: '#d8c9a8', organs: '#e08f8f', vessels: '#d12b2b', nerves: '#f0d24a'};
  const DEFAULT_LAYERS = {skin: true, skeleton: false, muscles: true, fascia: false, organs: false, vessels: false, nerves: false};
  const UP = new T.Vector3(0, 1, 0);

  // search words -> English patterns, so "القلب" finds the ventricles, atria and valves
  const ALIAS_RX = {
    'قلب': /heart|ventric|atri|valve|cusp|papillary|coronary|myocard/, 'رئه': /lung|bronch|pulmon|trachea/, 'دماغ': /gyrus|cerebr|brain|lobule|thalam|hippocamp|ventricle|cerebell|pons|medulla|callosum|insula/,
    'مخ': /gyrus|cerebr|lobule/, 'كبد': /liver|hepatic|caudate/, 'كليه': /kidney|renal|ureter/, 'عين': /eye|lens|cornea|iris|sclera|retina|vitreous|choroid|eyelid|lacrimal/,
    'معده': /stomach/, 'امعاء': /intestin|colon|ileum|jejun|duoden|cecum|rectum|appendix/, 'عمود': /vertebra|intervertebral|atlas|axis|sacrum|coccyx/, 'ضلع': /\brib\b|costal/,
    'اصابع': /phalanx|thumb|finger|toe/, 'يد': /carpal|metacarpal|finger|thumb|scaphoid|lunate|capitate|hamate|pisiform|trapez|triquetral/, 'قدم': /tarsal|metatarsal|talus|calcaneus|navicular|cuboid|cuneiform|toe/,
    'جمجمه': /frontal|parietal|temporal bone|occipital|sphenoid|ethmoid|nasal|maxilla|mandible|zygomatic|lacrimal|palatine/, 'شريان': /artery/, 'وريد': /vein|vena/, 'اسنان': /tooth|teeth|incisor|canine|molar/,
  };
  const norm = x => String(x).toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/(^|\s)ال/g, '$1').replace(/ال(?=\S)/g, '');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ----------------------------------------------------------------- data
  const parts = {}, order = [], sysGroup = {};
  let loaded = null;

  // ghost silhouette: fresnel rim so the skin shows the outline without hiding anything
  const skinMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.FrontSide,
    uniforms: {uOp: {value: 0.85}, uCol: {value: new T.Color(0x9fb6ff)}},
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOp; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uCol, f * uOp * 0.6); }',
  });

  async function loadData() {
    if (loaded) return loaded;
    loaded = (async () => {
      const [cat, buf] = await Promise.all([
        fetch(DATA + 'bp3d.json').then(r => { if (!r.ok) throw new Error('catalogue'); return r.json(); }),
        fetch(DATA + 'bp3d.bin').then(r => { if (!r.ok) throw new Error('mesh data'); return r.arrayBuffer(); }),
      ]);
      SYS.forEach(k => { const g = new T.Group(); g.name = k; sysGroup[k] = g; });
      cat.parts.forEach(p => {
        const geo = new T.BufferGeometry();
        const q = new Uint16Array(buf, p.po, p.nv * 3), pos = new Float32Array(p.nv * 3);
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] = p.o[0] + q[i] / 65535 * p.k[0]; pos[i + 1] = p.o[1] + q[i + 1] / 65535 * p.k[1]; pos[i + 2] = p.o[2] + q[i + 2] / 65535 * p.k[2];
        }
        geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        geo.setIndex(new T.BufferAttribute(new Uint16Array(buf, p.io, p.nf * 3), 1));
        geo.computeVertexNormals();
        const mesh = new T.Mesh(geo, p.sys === 'skin' ? skinMaterial : new T.MeshStandardMaterial({color: p.col === 0xB5453F ? 0x93332E : p.col, roughness: p.sys === 'muscles' ? 0.75 : 0.6, metalness: 0, side: T.DoubleSide}));
        mesh.userData.part = p.id; mesh.userData.baseOp = 1;
        const def = {id: p.id, sys: p.sys, ar: p.ar || '', la: p.la || '', en: cap(p.name), name: p.name, side: p.side || 0, base: p.base || p.name, dar: p.dar || '', den: p.den || '',
                     meshes: [mesh], center: new T.Vector3(p.c[0], p.c[1], p.c[2]), size: new T.Vector3(p.s[0], p.s[1], p.s[2]),
                     label: !!p.dar && p.sys !== 'skin', hot: !!p.dar && p.sys !== 'skin', quiz: !!p.ar && p.sys !== 'skin', selectable: p.sys !== 'skin'};
        parts[p.id] = def; order.push(p.id); sysGroup[p.sys].add(mesh);
      });
      return cat;
    })();
    return loaded;
  }

  const displayName = (p, lang) => (lang === 'en' ? p.en : (p.ar || p.en));
  const describe = (p, lang) => (lang === 'en' ? (p.den || '') : (p.dar || ''));

  const CSS = `
  .ka{direction:inherit; font-family:inherit; color:var(--ink,#1c2033);}
  .ka-stage{position:relative; margin:0 16px; border-radius:18px; overflow:hidden; background:radial-gradient(120% 90% at 50% 30%, #1d2440 0%, #0d111d 70%); height:min(74vh,640px); min-height:380px; touch-action:none;}
  .ka-stage canvas{position:absolute; inset:0; width:100%; height:100%; display:block; outline:none;}
  .ka-labels{position:absolute; inset:0; pointer-events:none; overflow:hidden;}
  .ka-label{position:absolute; transform:translate(-50%,-100%); background:rgba(15,19,32,.82); color:#fff; font-size:.66rem; font-weight:700; padding:2px 7px; border-radius:99px; white-space:nowrap; border:1px solid rgba(255,255,255,.25);}
  .ka-hots{position:absolute; inset:0; pointer-events:none; overflow:hidden;}
  .ka-hot{position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; border:3px solid #f1d34a; background:rgba(20,20,20,.78); box-shadow:0 0 0 2px rgba(0,0,0,.35); cursor:pointer; pointer-events:auto; padding:0;}
  .ka-hot::after{content:""; position:absolute; inset:6px; border-radius:50%; background:#f1d34a;}
  .ka-hot.sel{border-color:#fff; box-shadow:0 0 0 3px #2b59ff;}
  .ka-hot.sel::after{background:#fff;}
  .ka-load{position:absolute; inset:0; display:grid; place-items:center; color:#cfd3e6; font-size:.85rem; background:#0d111d; z-index:3; transition:opacity .4s; text-align:center; padding:20px;}
  .ka-tools{position:absolute; top:10px; inset-inline-start:10px; display:flex; flex-direction:column; gap:6px; z-index:2;}
  .ka-tools2{position:absolute; top:10px; inset-inline-end:10px; display:flex; flex-direction:column; gap:6px; z-index:2; align-items:flex-end;}
  .ka-btn{border:1px solid rgba(255,255,255,.22); background:rgba(15,19,32,.72); color:#e6e9f5; border-radius:10px; padding:6px 10px; font:inherit; font-size:.72rem; font-weight:700; cursor:pointer; backdrop-filter:blur(6px);}
  .ka-btn.on{background:var(--accent,#4F5BD5); border-color:var(--accent,#4F5BD5); color:#fff;}
  .ka-quizbar{position:absolute; bottom:10px; inset-inline:10px; z-index:2; display:none; justify-content:space-between; gap:8px; align-items:center; background:rgba(15,19,32,.88); color:#fff; border-radius:12px; padding:10px 12px; font-size:.82rem; font-weight:700;}
  .ka-quizbar.show{display:flex;}
  .ka-quizbar .q{flex:1;}
  .ka-quizbar .fb{font-weight:800;}
  .ka-quizbar .ok{color:#6ee7a1;} .ka-quizbar .no{color:#ff8b8b;}
  .ka-views{display:flex; gap:6px; flex-wrap:wrap; margin:10px 16px 0;}
  .ka-chips{display:flex; gap:8px; flex-wrap:wrap; margin:10px 16px 0;}
  .ka-chip{display:inline-flex; align-items:center; gap:7px; border-radius:99px; padding:7px 13px; border:1.5px solid var(--glass-border,#0002); background:var(--glass-bg-strong,#fff8); color:var(--ink,#1c2033); font:inherit; font-size:.78rem; font-weight:700; cursor:pointer;}
  .ka-chip i{width:10px; height:10px; border-radius:50%; display:inline-block; background:var(--c); opacity:.35;}
  .ka-chip.on{border-color:var(--c); background:color-mix(in srgb, var(--c) 18%, transparent);}
  .ka-chip.on i{opacity:1;}
  .ka-info{margin:12px 16px 0; padding:14px 16px; border-radius:16px; background:var(--glass-bg-strong,#fff8); border:1px solid var(--glass-border,#0002);}
  .ka-info h3{margin:0 0 2px; font-size:1.05rem; font-weight:800;}
  .ka-info .la{font-size:.74rem; color:var(--ink-faint,#667); direction:ltr; text-align:start;}
  .ka-info .sys{display:inline-block; font-size:.66rem; font-weight:800; padding:2px 9px; border-radius:99px; color:#fff; margin-bottom:8px;}
  .ka-info p{margin:6px 0 10px; font-size:.86rem; line-height:1.8;}
  .ka-row{display:flex; gap:8px; flex-wrap:wrap;}
  .ka-btn2{border:1.5px solid var(--glass-border,#0002); background:transparent; color:var(--ink,#1c2033); border-radius:10px; padding:7px 13px; font:inherit; font-size:.76rem; font-weight:700; cursor:pointer;}
  .ka-search{margin:12px 16px 0;}
  .ka-search input{width:100%; padding:11px 14px; border-radius:12px; border:1.5px solid var(--glass-border,#0002); background:var(--glass-bg-strong,#fff8); color:var(--ink,#1c2033); font:inherit; font-size:.86rem;}
  .ka-results{display:flex; flex-direction:column; gap:4px; margin-top:6px; max-height:230px; overflow:auto;}
  .ka-res{display:flex; justify-content:space-between; gap:10px; text-align:start; padding:8px 12px; border-radius:10px; border:1px solid var(--glass-border,#0002); background:var(--glass-bg-strong,#fff8); color:var(--ink,#1c2033); font:inherit; font-size:.8rem; cursor:pointer;}
  .ka-res small{color:var(--ink-faint,#667); direction:ltr;}
  .ka-note{margin:12px 16px 4px; font-size:.7rem; color:var(--ink-faint,#667); line-height:1.7;}
  @media (min-width:900px){ .ka-stage{height:min(78vh,720px);} }`;

  const App = {mounted: false};
  let st = null;

  function mount(root, opts) {
    opts = opts || {};
    if (App.mounted) { App.setLang(opts.lang || st.lang); App.resume(); return App; }
    App.mounted = true;
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    st = {lang: opts.lang || 'ar', layers: Object.assign({}, DEFAULT_LAYERS), xray: false, labels: false, hot: true, spin: false,
          selected: null, isolate: false, quiz: null, down: null, anim: null, running: true, dirty: true, ready: false};
    const S = () => STR[st.lang] || STR.ar;
    root.innerHTML = `<div class="ka">
      <div class="ka-stage" id="kaStage">
        <canvas id="kaCanvas"></canvas><div class="ka-labels" id="kaLabels"></div><div class="ka-hots" id="kaHots"></div>
        <div class="ka-load" id="kaLoad"></div>
        <div class="ka-tools" id="kaTools"></div><div class="ka-tools2" id="kaTools2"></div>
        <div class="ka-quizbar" id="kaQuiz"></div>
      </div>
      <div class="ka-views" id="kaViews"></div>
      <div class="ka-chips" id="kaChips"></div>
      <div class="ka-info" id="kaInfo"></div>
      <div class="ka-search"><input id="kaSearch" type="search" autocomplete="off" /><div class="ka-results" id="kaResults"></div></div>
      <div class="ka-note" id="kaNote"></div>
    </div>`;
    const $ = id => root.querySelector('#' + id);
    const stage = $('kaStage'), canvas = $('kaCanvas');
    $('kaLoad').textContent = S().loading;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: true});
    const weak = (navigator.hardwareConcurrency || 4) <= 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, weak ? 1.5 : 2));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 200);
    camera.position.set(0, 9.6, 30);
    const controls = new T.OrbitControls(camera, canvas);
    controls.target.set(0, 9.0, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 1.5; controls.maxDistance = 50; controls.update();
    scene.add(new T.HemisphereLight(0xffffff, 0x445066, 0.9));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(4, 6, 8); camera.add(key); scene.add(camera);
    const fill = new T.DirectionalLight(0x9db4ff, 0.35); fill.position.set(-6, 2, -4); scene.add(fill);

    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.dirty = true;
    }
    new ResizeObserver(resize).observe(stage); resize();

    loadData().then(() => {
      SYS.forEach(k => scene.add(sysGroup[k]));
      st.ready = true; refreshAll();
      $('kaLoad').style.opacity = '0'; setTimeout(() => { $('kaLoad').style.display = 'none'; }, 450);
      renderUI(); st.dirty = true;
    }).catch(() => { $('kaLoad').textContent = S().fail; loaded = null; });

    function partOpacity(p, mesh) {
      let op = mesh.userData.baseOp;
      if (st.xray && p.sys !== 'skin') op = Math.min(op, 0.3);
      if (st.isolate && st.selected && st.selected !== p.id && p.sys !== 'skin') op = Math.min(op, 0.08);
      return op;
    }
    function refreshAll() {
      if (!st.ready) return;
      SYS.forEach(k => { sysGroup[k].visible = !!st.layers[k]; });
      skinMaterial.uniforms.uOp.value = st.xray ? 1.15 : 0.85;
      order.forEach(id => {
        const p = parts[id]; if (p.sys === 'skin') return;
        const sel = st.selected === id, hint = st.quiz && st.quiz.reveal === id;
        p.meshes.forEach(m => {
          const op = partOpacity(p, m);
          m.material.opacity = op; m.material.transparent = op < 1; m.material.depthWrite = op >= 0.5;
          m.material.emissive.setHex(sel ? 0x2b59ff : hint ? 0x16a34a : 0x000000);
          m.material.emissiveIntensity = sel || hint ? 0.75 : 0;
        });
      });
      st.dirty = true;
    }

    // ---------- picking
    const ray = new T.Raycaster(); const ptr = new T.Vector2();
    function pick(ev) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const list = [];
      order.forEach(id => { const p = parts[id]; if (!p.selectable || !st.layers[p.sys]) return; p.meshes.forEach(m => { if (m.material.opacity > 0.15) list.push(m); }); });
      const hit = ray.intersectObjects(list, false)[0];
      return hit ? hit.object.userData.part : null;
    }
    canvas.addEventListener('pointerdown', e => { st.down = {x: e.clientX, y: e.clientY, t: Date.now()}; if (st.spin) { st.spin = false; syncTools(); } });
    canvas.addEventListener('pointerup', e => {
      const d = st.down; st.down = null; if (!d || !st.ready) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || Date.now() - d.t > 600) return;
      const id = pick(e);
      if (st.quiz) { quizAnswer(id); return; }
      if (id) select(id, false); else if (st.selected) select(null);
    });
    controls.addEventListener('change', () => { st.dirty = true; });

    // ---------- selection / camera
    function focus(p) {
      const dist = Math.max(4, Math.min(24, Math.max(p.size.x, p.size.y, p.size.z) * 2.6 + 3));
      const dir = camera.position.clone().sub(controls.target).normalize();
      st.anim = {t: 0, fromT: controls.target.clone(), toT: p.center.clone(), fromP: camera.position.clone(), toP: p.center.clone().add(dir.multiplyScalar(dist))};
    }
    function select(id, doFocus) {
      st.selected = id;
      if (id && doFocus) { const p = parts[id]; if (!st.layers[p.sys]) st.layers[p.sys] = true; focus(p); }
      if (!id) st.isolate = false;
      refreshAll(); renderInfo(); renderChips();
    }
    function view(name) {
      const d = 30;
      const v = {front: [0, 9, 0, 0, 9.6, d], back: [0, 9, 0, 0, 9.6, -d], left: [0, 9, 0, d, 9.6, 0], right: [0, 9, 0, -d, 9.6, 0],
        head: [0, 15.4, 0, 0, 15.6, 8], chest: [0, 12.8, 0, 0, 13.0, 11], belly: [0, 10.4, 0, 0, 10.6, 11]}[name];
      st.anim = {t: 0, fromT: controls.target.clone(), toT: new T.Vector3(v[0], v[1], v[2]), fromP: camera.position.clone(), toP: new T.Vector3(v[3], v[4], v[5])};
    }

    // ---------- labels
    const labelEls = {};
    function updateLabels() {
      const box = $('kaLabels'); const w = stage.clientWidth, h = stage.clientHeight;
      order.forEach(id => {
        const p = parts[id]; if (!p.label) return;
        let el = labelEls[id];
        const vis = st.labels && st.layers[p.sys] && !(st.isolate && st.selected && st.selected !== id);
        if (!vis) { if (el) el.style.display = 'none'; return; }
        if (!el) { el = document.createElement('div'); el.className = 'ka-label'; box.appendChild(el); labelEls[id] = el; }
        const v = p.center.clone().project(camera);
        if (v.z > 1) { el.style.display = 'none'; return; }
        el.style.display = 'block'; el.textContent = displayName(p, st.lang).replace(/ \(.*\)$/, '');
        el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px'; el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
      });
    }

    // ---------- hot spots: tap a yellow ring to open that structure
    const hotEls = {};
    function updateHots() {
      const box = $('kaHots'); const w = stage.clientWidth, h = stage.clientHeight;
      const dist = camera.position.distanceTo(controls.target);
      order.forEach(id => {
        const p = parts[id]; if (!p.hot) return;
        let el = hotEls[id];
        const near = dist < 9 + p.size.length() * 2.2;                 // far away only the big structures get a ring
        const vis = st.hot && !st.quiz && st.layers[p.sys] && near && !(st.isolate && st.selected && st.selected !== id);
        if (!vis) { if (el) el.style.display = 'none'; return; }
        if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'ka-hot'; el.onclick = () => select(id, true); box.appendChild(el); hotEls[id] = el; }
        const v = p.center.clone().project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { el.style.display = 'none'; return; }
        el.style.display = 'block'; el.title = displayName(p, st.lang); el.classList.toggle('sel', st.selected === id);
        el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px'; el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
      });
    }

    // ---------- quiz
    const quizPool = () => order.filter(id => parts[id].quiz && st.layers[parts[id].sys] && (parts[id].size.length() > 1.0 || parts[id].dar));
    function quizNext() {
      const pool = quizPool().filter(id => id !== st.quiz.cur);
      if (!pool.length) { quizStop(); return; }
      st.quiz.cur = pool[Math.floor(Math.random() * pool.length)]; st.quiz.reveal = null; st.quiz.fb = '';
      renderQuiz(); refreshAll();
    }
    function quizStart() { st.selected = null; st.isolate = false; st.labels = false; st.quiz = {cur: null, score: 0, asked: 0, reveal: null, fb: ''}; quizNext(); renderInfo(); syncTools(); }
    function quizStop() { st.quiz = null; $('kaQuiz').classList.remove('show'); refreshAll(); renderInfo(); syncTools(); }
    function quizAnswer(id) {
      const q = st.quiz; if (!q || q.locked) return;
      const target = parts[q.cur];
      const okHit = id && id === q.cur;
      q.asked++;
      if (okHit) { q.score++; q.fb = `<span class="fb ok">${S().ok}</span>`; }
      else { q.reveal = q.cur; q.fb = `<span class="fb no">${S().no}${esc(displayName(target, st.lang))}</span>`; focus(target); }
      q.locked = true; renderQuiz(); refreshAll();
      setTimeout(() => { if (st.quiz === q) { q.locked = false; quizNext(); } }, okHit ? 900 : 2300);
    }
    function renderQuiz() {
      const q = st.quiz, el = $('kaQuiz'); if (!q) { el.classList.remove('show'); return; }
      el.classList.add('show');
      el.innerHTML = `<div class="q">${S().ask}<b>${esc(displayName(parts[q.cur], st.lang))}</b> ${q.fb || ''}</div><div>${S().score}: ${q.score}/${q.asked}</div><button class="ka-btn" id="kaQuizStop">${S().quizStop}</button>`;
      el.querySelector('#kaQuizStop').onclick = quizStop;
    }

    // ---------- UI
    function renderChips() {
      $('kaChips').innerHTML = SYS.map(k => `<button type="button" class="ka-chip ${st.layers[k] ? 'on' : ''}" style="--c:${SYS_COLOR[k]}" data-k="${k}"><i></i>${S().layers[k]}</button>`).join('');
      $('kaChips').querySelectorAll('.ka-chip').forEach(b => b.onclick = () => { const k = b.dataset.k; st.layers[k] = !st.layers[k]; if (st.selected && !st.layers[parts[st.selected].sys]) st.selected = null; refreshAll(); renderChips(); renderInfo(); });
    }
    function syncTools() {
      $('kaTools').innerHTML = `<button class="ka-btn ${st.xray ? 'on' : ''}" data-a="xray">${S().xray}</button>
        <button class="ka-btn ${st.hot ? 'on' : ''}" data-a="hot">${S().hot}</button>
        <button class="ka-btn ${st.labels ? 'on' : ''}" data-a="labels">${S().labels}</button>
        <button class="ka-btn ${st.spin ? 'on' : ''}" data-a="spin">${S().rotate}</button>
        <button class="ka-btn ${st.quiz ? 'on' : ''}" data-a="quiz">${st.quiz ? S().quizStop : S().quiz}</button>`;
      $('kaTools2').innerHTML = `<button class="ka-btn" data-a="reset">${S().reset}</button>`;
      root.querySelectorAll('.ka-btn[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'xray') st.xray = !st.xray;
        else if (a === 'labels') st.labels = !st.labels;
        else if (a === 'hot') st.hot = !st.hot;
        else if (a === 'spin') st.spin = !st.spin;
        else if (a === 'quiz') { st.quiz ? quizStop() : quizStart(); }
        else if (a === 'reset') { st.selected = null; st.isolate = false; st.xray = false; st.layers = Object.assign({}, DEFAULT_LAYERS); st.spin = false; if (st.quiz) quizStop(); view('front'); renderChips(); renderInfo(); }
        refreshAll(); syncTools(); st.dirty = true;
      });
    }
    function renderViews() {
      $('kaViews').innerHTML = ['front', 'back', 'left', 'right', 'head', 'chest', 'belly'].map(v => `<button type="button" class="ka-btn2" data-v="${v}">${S()[v]}</button>`).join('');
      $('kaViews').querySelectorAll('.ka-btn2').forEach(b => b.onclick = () => view(b.dataset.v));
    }
    function renderInfo() {
      const el = $('kaInfo');
      if (st.quiz) { el.style.display = 'none'; return; } el.style.display = '';
      if (!st.selected) { el.innerHTML = `<div class="item-meta">${S().hint}</div>`; return; }
      const p = parts[st.selected];
      el.innerHTML = `<span class="sys" style="background:${SYS_COLOR[p.sys]}">${S().layers[p.sys]}</span>
        <h3>${esc(displayName(p, st.lang))}</h3>${(st.lang !== 'en' || p.la) ? `<div class="la">${esc([p.la, st.lang !== 'en' ? p.en : ''].filter(Boolean).join(' · '))}</div>` : ''}
        <p>${esc(describe(p, st.lang) || S().gen[p.sys])}</p>
        <div class="ka-row"><button class="ka-btn2" id="kaIso">${st.isolate ? S().showAll : S().isolate}</button><button class="ka-btn2" id="kaClose">${S().close}</button></div>`;
      el.querySelector('#kaIso').onclick = () => { st.isolate = !st.isolate; refreshAll(); renderInfo(); };
      el.querySelector('#kaClose').onclick = () => select(null);
    }
    function renderResults() {
      const raw = $('kaSearch').value.trim(), q = norm(raw), box = $('kaResults');
      if (!q || !st.ready) { box.innerHTML = ''; return; }
      const rx = ALIAS_RX[q];
      const hits = order.filter(id => {
        const p = parts[id]; if (!p.selectable) return false;
        if (rx && rx.test(p.name.toLowerCase())) return true;
        return norm(p.ar + ' ' + p.name).includes(q);
      }).slice(0, 40);
      box.innerHTML = hits.map(id => `<button type="button" class="ka-res" data-id="${id}"><span>${esc(displayName(parts[id], st.lang))}</span><small>${esc(S().layers[parts[id].sys])}</small></button>`).join('') || `<div class="item-meta">${S().noResults}</div>`;
      box.querySelectorAll('.ka-res').forEach(b => b.onclick = () => { select(b.dataset.id, true); $('kaSearch').value = ''; box.innerHTML = ''; window.scrollTo({top: stage.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth'}); });
    }
    function renderUI() {
      $('kaSearch').placeholder = S().search;
      $('kaNote').textContent = `${S().note} · ${order.filter(i => parts[i].selectable).length} ${S().parts}`;
      renderChips(); renderViews(); syncTools(); renderInfo(); renderQuiz();
    }
    $('kaSearch').addEventListener('input', renderResults);
    renderUI();

    // ---------- loop
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function frame() {
      if (!st.running) return;
      requestAnimationFrame(frame);
      if (!stage.offsetParent) return;
      let moved = false;
      if (st.anim) {
        const a = st.anim; const now = performance.now(); a.t = Math.min(1, a.t + Math.min((now - (a.last || now)) / 650, 0.2)); a.last = now; const k = ease(a.t);
        controls.target.lerpVectors(a.fromT, a.toT, k); camera.position.lerpVectors(a.fromP, a.toP, k);
        if (a.t >= 1) st.anim = null; moved = true;
      }
      if (st.spin) { const off = camera.position.clone().sub(controls.target); off.applyAxisAngle(UP, 0.006); camera.position.copy(controls.target).add(off); moved = true; }
      if (controls.update() || moved || st.dirty) { renderer.render(scene, camera); if (st.ready) { updateLabels(); updateHots(); } st.dirty = false; }
    }
    frame();

    App.setLang = function (lang) { st.lang = STR[lang] ? lang : 'ar'; $('kaLoad').textContent = S().loading; if (st.ready) { renderUI(); renderResults(); } st.dirty = true; };
    App.pause = () => { st.running = false; };
    App.resume = () => { if (!st.running) { st.running = true; frame(); } st.dirty = true; resize(); };
    App.select = select;
    App.parts = parts;
    return App;
  }

  global.KiurAnatomy = {mount, pause: () => App.pause && App.pause(), setLang: l => App.setLang && App.setLang(l), _parts: parts};
})(window);
