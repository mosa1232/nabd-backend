/*
 * Kiur — 3D anatomy simulator.
 *
 * Every shape here is generated in code (three.js primitives, MIT) — there is
 * no third-party model or texture, so there is nothing to credit or license.
 * It is a simplified teaching model: positions, relations and names follow
 * standard anatomy, but the forms are schematic, not scans.
 *
 * Coordinates: 1 unit = 10 cm, +Y up, +Z toward the viewer (front of the
 * body), +X is the person's LEFT (the viewer's right in the front view).
 */
(function (global) {
  'use strict';
  const T = global.THREE;
  if (!T) { console.error('three.js is required'); return; }

  // ------------------------------------------------------------------ texts
  const STR = {
    ar: {
      layers: {skin: 'الجلد', skeleton: 'الهيكل العظمي', muscles: 'العضلات', organs: 'الأعضاء', vessels: 'الأوعية الدموية', nerves: 'الأعصاب'},
      reset: 'إعادة العرض', xray: 'شفاف', labels: 'التسميات', rotate: 'دوران', front: 'أمامي', back: 'خلفي', left: 'يسار', right: 'يمين', head: 'الرأس', chest: 'الصدر', belly: 'البطن',
      search: 'ابحث عن عضو أو عظمة أو عضلة…', hint: 'اضغط على أي جزء من الجسم لمعرفة اسمه ووظيفته، أو شغّل الطبقات من الأسفل.',
      isolate: 'عزل', showAll: 'إظهار الكل', close: 'إغلاق', quiz: 'اختبرني', quizStop: 'إنهاء', ask: 'اضغط على: ', ok: 'صحيح ✓', no: 'ليس هذا — هذا هو: ', score: 'النتيجة',
      loading: 'جارٍ بناء النموذج…', system: 'الجهاز', sideL: ' (يسار)', sideR: ' (يمين)', noResults: 'لا توجد نتائج',
      note: 'نموذج تعليمي مبسّط مبني داخل المنصة، وليس بديلاً عن الأطالس الطبية.', parts: 'جزءًا',
    },
    en: {
      layers: {skin: 'Skin', skeleton: 'Skeleton', muscles: 'Muscles', organs: 'Organs', vessels: 'Vessels', nerves: 'Nerves'},
      reset: 'Reset view', xray: 'X-ray', labels: 'Labels', rotate: 'Spin', front: 'Front', back: 'Back', left: 'Left', right: 'Right', head: 'Head', chest: 'Chest', belly: 'Abdomen',
      search: 'Search an organ, bone or muscle…', hint: 'Tap any part of the body to see its name and function, or switch layers below.',
      isolate: 'Isolate', showAll: 'Show all', close: 'Close', quiz: 'Quiz me', quizStop: 'Stop', ask: 'Tap on: ', ok: 'Correct ✓', no: 'Not that — this is the: ', score: 'Score',
      loading: 'Building the model…', system: 'System', sideL: ' (left)', sideR: ' (right)', noResults: 'No results',
      note: 'A simplified teaching model built inside the platform — not a substitute for medical atlases.', parts: 'parts',
    },
    ku: {
      layers: {skin: 'پێست', skeleton: 'ئێسکەپەیکەر', muscles: 'ماسولکە', organs: 'ئەندامەکان', vessels: 'ڕەگەکانی خوێن', nerves: 'دەمارەکان'},
      reset: 'گەڕانەوە', xray: 'شەفاف', labels: 'ناوەکان', rotate: 'سوڕان', front: 'پێشەوە', back: 'پشتەوە', left: 'چەپ', right: 'ڕاست', head: 'سەر', chest: 'سنگ', belly: 'سک',
      search: 'بەدوای ئەندام، ئێسک یان ماسولکەدا بگەڕێ…', hint: 'کلیک لە هەر بەشێکی جەستە بکە بۆ ناو و ئەرکەکەی، یان چینەکان لە خوارەوە بگۆڕە.',
      isolate: 'جیاکردنەوە', showAll: 'هەموو نیشان بدە', close: 'داخستن', quiz: 'تاقیم بکەوە', quizStop: 'کۆتایی', ask: 'کلیک بکە لەسەر: ', ok: 'ڕاستە ✓', no: 'ئەمە نییە — ئەمە: ', score: 'ئەنجام',
      loading: 'مۆدێلەکە دروست دەکرێت…', system: 'سیستەم', sideL: ' (چەپ)', sideR: ' (ڕاست)', noResults: 'هیچ ئەنجامێک نییە',
      note: 'مۆدێلێکی سادەکراوی فێرکارییە لە ناو پلاتفۆرمەکە دروستکراوە — جێگرەوەی ئەتلەسی پزیشکی نییە.', parts: 'بەش',
    },
  };

  const SYS = ['skin', 'skeleton', 'muscles', 'organs', 'vessels', 'nerves'];
  const SYS_COLOR = {skin: '#9fb6ff', skeleton: '#e9dfc8', muscles: '#c0463f', organs: '#e08f8f', vessels: '#d12b2b', nerves: '#f0d24a'};
  const DEFAULT_LAYERS = {skin: true, skeleton: true, muscles: false, organs: true, vessels: true, nerves: true};

  const COL = {
    bone: 0xe9dfc8, cart: 0xcfe3ea, dark: 0x2a2420, tooth: 0xf7f3e8,
    muscle: 0xb5453f, brain: 0xe7aaa6, cereb: 0xd99a96, stem: 0xdcb4a4, heart: 0xb81d2b, lung: 0xf2adb0,
    liver: 0x7d3b29, gall: 0x3f8a3a, stomach: 0xe58c7c, spleen: 0x6c2f4c, panc: 0xe3c36a, intest: 0xe9a58b,
    colon: 0xd68f78, kidney: 0x8f2f2a, adren: 0xf0d060, bladder: 0xe8c070, trachea: 0xbfd7e0, eye: 0xf6f6f6,
    iris: 0x3b5b7a, diaph: 0xd9776a, thyroid: 0xb86a52, artery: 0xd22a2a, vein: 0x2a58d2, pulm: 0x6a7fd6,
    portal: 0x7a4bb0, nerve: 0xf1d54a, cord: 0xf3e08a,
  };

  let muscleTex = null;
  function muscleTexture() {
    if (muscleTex) return muscleTex;
    const w = 256, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let x = 0; x < w; x++) {
      const n = 0.5 + 0.5 * Math.sin(x * 0.9) * Math.sin(x * 0.23 + 1.3) + 0.25 * Math.sin(x * 2.1);
      const l = 24 + Math.round(n * 12);
      g.fillStyle = `hsl(3, 62%, ${l}%)`; g.fillRect(x, 0, 1, h);
    }
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(236,214,178,0.95)'); grad.addColorStop(0.16, 'rgba(236,214,178,0)');
    grad.addColorStop(0.84, 'rgba(236,214,178,0)'); grad.addColorStop(1, 'rgba(236,214,178,0.95)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    muscleTex = new T.CanvasTexture(c); muscleTex.wrapS = T.RepeatWrapping; muscleTex.repeat.set(3, 1);
    return muscleTex;
  }

  // -------------------------------------------------------------- registries
  const parts = {};      // id -> definition + meshes
  const order = [];
  const sysGroup = {};
  const toV = a => (a && a.isVector3) ? a : new T.Vector3(a[0], a[1], a[2]);
  const UP = new T.Vector3(0, 1, 0);
  const G_SPH = new T.SphereGeometry(1, 22, 16);

  function reg(id, sys, ar, en, la, dar, den, o) {
    if (parts[id]) return parts[id];
    const p = Object.assign({id, sys, ar, en, la: la || '', dar: dar || '', den: den || '', meshes: [], side: 0}, o || {});
    parts[id] = p; order.push(id);
    return p;
  }
  function add(id, mesh, ck, o) {
    const p = parts[id];
    const op = (o && o.op) || 1;
    mesh.material = new T.MeshStandardMaterial({
      color: COL[ck], roughness: (o && o.rough) || 0.62, metalness: 0,
      transparent: op < 1, opacity: op, side: (o && o.side) || T.FrontSide,
    });
    if (ck === 'muscle') { mesh.material.map = muscleTexture(); mesh.material.color.setHex(0xffffff); }
    mesh.userData.part = id; mesh.userData.baseOp = op; mesh.userData.baseColor = COL[ck];
    p.meshes.push(mesh); sysGroup[p.sys].add(mesh);
    return mesh;
  }
  function ell(id, ck, pos, sc, rot, o) {
    const m = new T.Mesh(G_SPH, null);
    m.position.set(pos[0], pos[1], pos[2]); m.scale.set(sc[0], sc[1], sc[2]);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    return add(id, m, ck, o);
  }
  function box(id, ck, pos, size, rot, o) {
    const m = new T.Mesh(new T.BoxGeometry(size[0], size[1], size[2]), null);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    return add(id, m, ck, o);
  }
  function seg(id, ck, a, b, r0, r1, o) {
    a = toV(a); b = toV(b);
    const len = a.distanceTo(b);
    const m = new T.Mesh(new T.CylinderGeometry(r1, r0, len, 12, 1), null);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return add(id, m, ck, o);
  }
  function tube(id, ck, pts, r, o) {
    const curve = new T.CatmullRomCurve3(pts.map(toV));
    const g = new T.TubeGeometry(curve, (o && o.segs) || Math.max(10, pts.length * 12), r, (o && o.radial) || 8, false);
    return add(id, new T.Mesh(g, null), ck, o);
  }
  function chaikin(pts, n) {
    for (let k = 0; k < n; k++) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      pts = out;
    }
    return pts;
  }
  function extrude(id, ck, pts, depth, pos, rot, o, holes) {
    pts = chaikin(pts, 3);
    holes = (holes || []).map(h => chaikin(h, 2));
    const sh = new T.Shape(pts.map(p => new T.Vector2(p[0], p[1])));
    holes.forEach(h => { const path = new T.Path(h.map(p => new T.Vector2(p[0], p[1]))); sh.holes.push(path); });
    const g = new T.ExtrudeGeometry(sh, {depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 10});
    g.translate(0, 0, -depth / 2);
    const m = new T.Mesh(g, null);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    return add(id, m, ck, Object.assign({side: T.DoubleSide}, o || {}));
  }
  // x mirrored for the person's right side; side +1 = left (+x), -1 = right (-x)
  const mx = (s, p) => [p[0] * s, p[1], p[2]];
  const mpts = (s, pts) => pts.map(p => mx(s, p));
  const sid = (id, s) => id + (s > 0 ? '_L' : '_R');
  function regB(id, s, sys, ar, en, la, dar, den, o) {
    return reg(sid(id, s), sys, ar, en, la, dar, den, Object.assign({side: s, base: id}, o || {}));
  }
  function bi(fn) { fn(1); fn(-1); }

  // ----------------------------------------------------------- body geometry
  // The spine's front-back position at a given height.
  const SPINE = [[15.9, -0.3], [14.7, -0.5], [13.5, -0.8], [12.5, -0.95], [11.6, -0.85], [10.5, -0.55], [9.7, -0.35], [8.8, -0.55], [7.9, -0.85]];
  function spineZ(y) {
    for (let i = 0; i < SPINE.length - 1; i++) {
      const a = SPINE[i], b = SPINE[i + 1];
      if (y <= a[0] && y >= b[0]) { const t = (a[0] - y) / (a[0] - b[0]); return a[1] + (b[1] - a[1]) * t; }
    }
    return y > SPINE[0][0] ? SPINE[0][1] : SPINE[SPINE.length - 1][1];
  }
  const VERT = [];   // {id, y, r, region}
  (function () {
    for (let i = 1; i <= 7; i++) VERT.push({id: 'C' + i, y: 15.85 - (i - 1) * 0.19, r: 0.2 + (i - 1) * 0.013, region: 'C', n: i});
    for (let i = 1; i <= 12; i++) VERT.push({id: 'T' + i, y: 14.45 - (i - 1) * 0.255, r: 0.28 + (i - 1) * 0.009, region: 'T', n: i});
    for (let i = 1; i <= 5; i++) VERT.push({id: 'L' + i, y: 11.4 - (i - 1) * 0.34, r: 0.42 + (i - 1) * 0.02, region: 'L', n: i});
  })();
  const canalZ = v => spineZ(v.y) - v.r - 0.13;

  // ------------------------------------------------------------------- build
  function buildSkeleton() {
    // skull
    reg('skull', 'skeleton', 'الجمجمة', 'Skull', 'Cranium',
      'صندوق عظمي يحمي الدماغ ويحدد ملامح الوجه؛ يتكوّن من عظام القحف وعظام الوجه.',
      'A bony case that protects the brain and shapes the face; made of cranial and facial bones.', {label: true, quiz: true});
    ell('skull', 'bone', [0, 16.55, -0.05], [0.82, 0.88, 0.98]);
    ell('skull', 'bone', [0, 15.85, 0.5], [0.6, 0.5, 0.42]);
    ell('skull', 'bone', [0, 15.95, 0.2], [0.72, 0.4, 0.62]);
    bi(s => ell('skull', 'dark', mx(s, [0.3, 16.12, 0.86]), [0.2, 0.18, 0.12]));             // orbits
    ell('skull', 'dark', [0, 15.85, 0.9], [0.1, 0.17, 0.08]);                               // nasal aperture
    // teeth
    const teeth = (y, z0, n) => { for (let i = 0; i < n; i++) { const a = -0.9 + 1.8 * i / (n - 1); box('skull', 'tooth', [Math.sin(a) * 0.34, y, z0 + Math.cos(a) * 0.28], [0.075, 0.11, 0.06], [0, a, 0]); } };
    teeth(15.52, 0.42, 9);
    reg('mandible', 'skeleton', 'الفك السفلي', 'Mandible', 'Mandibula',
      'العظم المتحرك الوحيد في الجمجمة؛ يحمل الأسنان السفلية ويتمفصل أمام الأذن.',
      'The only movable bone of the skull; it carries the lower teeth and articulates in front of the ear.', {quiz: true});
    tube('mandible', 'bone', [[-0.62, 15.95, -0.05], [-0.58, 15.35, 0.0], [-0.35, 15.12, 0.45], [0, 15.05, 0.68], [0.35, 15.12, 0.45], [0.58, 15.35, 0.0], [0.62, 15.95, -0.05]], 0.085, {segs: 48});
    teeth(15.4, 0.4, 9);

    // vertebrae, discs, canal rings
    reg('discs', 'skeleton', 'الأقراص بين الفقرية', 'Intervertebral discs', 'Disci intervertebrales',
      'وسائد غضروفية بين الفقرات تمتص الصدمات وتمنح العمود الفقري مرونته.',
      'Cartilage cushions between vertebrae that absorb shock and give the spine its flexibility.');
    VERT.forEach((v, i) => {
      const reg_ = v.region, nm = {C: ['الرقبية', 'cervical', 'cervicalis'], T: ['الصدرية', 'thoracic', 'thoracica'], L: ['القطنية', 'lumbar', 'lumbalis']}[reg_];
      let ar = `الفقرة ${nm[0]} ${v.n}`, en = `${nm[1][0].toUpperCase() + nm[1].slice(1)} vertebra ${v.id}`;
      if (v.id === 'C1') { ar = 'الفقرة الرقبية الأولى (الأطلس)'; en = 'Atlas (C1)'; }
      if (v.id === 'C2') { ar = 'الفقرة الرقبية الثانية (المحور)'; en = 'Axis (C2)'; }
      const dar = {C: 'فقرة رقبية: تحمل الرأس وتسمح بحركته، وفيها ثقب لمرور الشريان الفقري.', T: 'فقرة صدرية: تتمفصل مع الأضلاع وتشكّل خلف القفص الصدري.', L: 'فقرة قطنية: الأضخم في العمود الفقري لأنها تحمل وزن الجزء العلوي من الجسم.'}[reg_];
      const den = {C: 'A cervical vertebra: carries the head and lets it move; its foramen transmits the vertebral artery.', T: 'A thoracic vertebra: articulates with the ribs and forms the back of the thoracic cage.', L: 'A lumbar vertebra: the largest, as it bears the weight of the upper body.'}[reg_];
      const id = 'vert_' + v.id;
      reg(id, 'skeleton', ar, en, `Vertebra ${nm[2]} ${v.id}`, dar, den, {quiz: v.id === 'C1' || v.id === 'T6' || v.id === 'L3'});
      const z = spineZ(v.y), h = (reg_ === 'C' ? 0.15 : reg_ === 'T' ? 0.21 : 0.27);
      const body = new T.Mesh(new T.CylinderGeometry(v.r, v.r * 1.05, h, 16), null);
      body.position.set(0, v.y, z); add(id, body, 'bone');
      const ring = new T.Mesh(new T.TorusGeometry(0.15, 0.04, 8, 16), null);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, v.y, z - v.r - 0.13); add(id, ring, 'bone');
      box(id, 'bone', [0, v.y - 0.04, z - v.r - 0.36], [0.07, h * 1.3, 0.3], [0.35, 0, 0]);
      bi(s => box(id, 'bone', [s * (v.r + 0.14), v.y, z - v.r - 0.1], [0.3, 0.06, 0.1]));
      if (i < VERT.length - 1) {
        const d = new T.Mesh(new T.CylinderGeometry(v.r * 0.97, v.r * 0.97, 0.07, 16), null);
        d.position.set(0, v.y - h / 2 - 0.03, z); add('discs', d, 'cart');
      }
    });

    // sacrum + coccyx
    reg('sacrum', 'skeleton', 'العجز', 'Sacrum', 'Os sacrum',
      'عظم مثلثي من خمس فقرات ملتحمة؛ يربط العمود الفقري بالحوض ويشكّل جداره الخلفي.',
      'A triangular bone of five fused vertebrae; it links the spine to the pelvis and forms its back wall.', {label: true, quiz: true});
    extrude('sacrum', 'bone', [[-0.55, 0], [0.55, 0], [0.38, -1.3], [0, -1.5], [-0.38, -1.3]], 0.34, [0, 9.55, -0.62], [-0.38, 0, 0]);
    reg('coccyx', 'skeleton', 'العصعص', 'Coccyx', 'Os coccygis', 'نهاية العمود الفقري؛ بقايا ذيل ضامر من 3–5 فقرات صغيرة ملتحمة.', 'The end of the spine: a vestigial tail of 3–5 small fused vertebrae.');
    seg('coccyx', 'bone', [0, 8.2, -0.58], [0, 7.7, -0.42], 0.17, 0.05);

    // hip bones, pubic symphysis
    bi(s => {
      regB('hip', s, 'skeleton', 'عظم الورك', 'Hip bone', 'Os coxae',
        'عظم الحوض؛ يتكوّن من الحرقفة والإسك والعانة، وفيه الحُق الذي يستقبل رأس عظم الفخذ.',
        'The pelvic bone: made of ilium, ischium and pubis; its acetabulum receives the head of the femur.', {label: s > 0, quiz: true});
      let pts = [[0.3, 8.1], [0.35, 9.2], [0.9, 10.15], [1.6, 10.05], [1.88, 9.3], [1.62, 8.5], [1.55, 7.7], [1.2, 7.1], [0.65, 7.0], [0.4, 7.5]].map(p => [p[0] * s, p[1]]);
      let hole = [[0.9, 7.55], [1.1, 7.45], [1.2, 7.7], [1.05, 7.9], [0.88, 7.8]].map(p => [p[0] * s, p[1]]);
      if (s < 0) { pts = pts.reverse(); hole = hole.reverse(); }
      extrude(sid('hip', s), 'bone', pts, 0.32, [0, 0, -0.18], [0, -0.5 * s, 0], null, [hole]);
      tube(sid('hip', s), 'bone', [[0.65 * s, 7.15, -0.1], [0.35 * s, 6.95, 0.25], [0.1 * s, 7.0, 0.55]], 0.085);
      tube(sid('hip', s), 'bone', [[0.8 * s, 7.05, -0.12], [0.85 * s, 6.85, -0.4], [0.7 * s, 7.0, -0.55]], 0.09);
    });

    // ribs, costal cartilage, sternum
    const sternumZ = y => 0.55 + (13.9 - y) / 2.1 * 0.55;
    reg('sternum', 'skeleton', 'القَصّ', 'Sternum', 'Sternum',
      'العظم المسطح في منتصف الصدر؛ يتكوّن من المقبض والجسم والنتوء الخنجري، وترتبط به الأضلاع الحقيقية.',
      'The flat bone in the middle of the chest, made of manubrium, body and xiphoid process; the true ribs attach to it.', {label: true, quiz: true});
    box('sternum', 'bone', [0, 13.65, sternumZ(13.65)], [0.55, 0.55, 0.13], [-0.25, 0, 0]);
    box('sternum', 'bone', [0, 12.75, sternumZ(12.75)], [0.4, 1.7, 0.11], [-0.25, 0, 0]);
    const xi = new T.Mesh(new T.ConeGeometry(0.1, 0.35, 8), null); xi.position.set(0, 11.85, sternumZ(11.85)); xi.rotation.x = Math.PI; add('sternum', xi, 'bone');
    const rxs = [0.8, 1.05, 1.28, 1.42, 1.5, 1.55, 1.55, 1.5, 1.4, 1.25, 1.0, 0.85];
    const ends = {};
    bi(s => {
      regB('costal', s, 'skeleton', 'الغضاريف الضلعية', 'Costal cartilages', 'Cartilagines costales',
        'غضاريف تربط الأضلاع بالقص وتمنح القفص الصدري مرونة أثناء التنفس.', 'Cartilages that join the ribs to the sternum and let the chest cage flex with breathing.');
      for (let k = 1; k <= 12; k++) {
        const y0 = 14.45 - 0.255 * (k - 1), yf = k <= 7 ? 13.7 - 0.28 * (k - 1) : y0 - 1.15;
        const zBack = spineZ(y0) - 0.1;
        const uEnd = k <= 7 ? 0.14 : 0.14 + (k - 7) * 0.2;
        const rx = rxs[k - 1], u0 = Math.PI - Math.asin(0.35 / rx);
        const zFront = k <= 7 ? sternumZ(yf) : zBack + 1.0 + 0.06 * (k - 7);
        const rz = Math.max(0.5, (zFront - zBack) / (0.97 + Math.cos(uEnd)));
        const zc = zBack + 0.97 * rz;
        const pts = [];
        for (let i = 0; i <= 28; i++) {
          const q = i / 28, u = u0 + (uEnd - u0) * q;
          pts.push([s * rx * Math.sin(u), y0 + (yf - y0) * q, zc + rz * Math.cos(u)]);
        }
        const kind = k <= 7 ? ['ضلع حقيقي', 'True rib'] : k <= 10 ? ['ضلع كاذب', 'False rib'] : ['ضلع سائب (عائم)', 'Floating rib'];
        const dar = k <= 7 ? 'يتصل مباشرة بالقص عبر غضروفه.' : k <= 10 ? 'يتصل بالقص بشكل غير مباشر عبر غضروف الضلع الذي فوقه.' : 'نهايته الأمامية حرة ولا تصل القص.';
        const den = k <= 7 ? 'Joins the sternum directly through its own cartilage.' : k <= 10 ? 'Joins the sternum indirectly, through the cartilage of the rib above.' : 'Its front end is free and does not reach the sternum.';
        regB('rib' + k, s, 'skeleton', `${kind[0]} ${k}`, `${kind[1]} ${k}`, 'Costa ' + k, dar, den, {quiz: k === 1 || k === 6 || k === 12});
        tube(sid('rib' + k, s), 'bone', pts.map(p => [p[0], p[1], p[2]]), 0.062, {segs: 40, radial: 6});
        const last = pts[pts.length - 1];
        ends[sid('rib' + k, s)] = last;
        if (k <= 7) tube(sid('costal', s), 'cart', [last, [s * 0.1, yf + 0.02, sternumZ(yf)]], 0.07, {segs: 8, radial: 6});
        else if (k <= 10) tube(sid('costal', s), 'cart', [last, ends[sid('rib' + (k - 1), s)]], 0.06, {segs: 8, radial: 6});
      }
    });

    // shoulder girdle and arm
    bi(s => {
      regB('clavicle', s, 'skeleton', 'الترقوة', 'Clavicle', 'Clavicula', 'عظم رفيع على شكل حرف S يربط القص بالكتف ويحافظ على بعد الذراع عن الصدر.',
        'A slim S-shaped bone linking the sternum to the shoulder and holding the arm away from the chest.', {label: s > 0, quiz: true});
      tube(sid('clavicle', s), 'bone', mpts(s, [[0.2, 13.85, 0.62], [0.9, 14.05, 0.72], [1.5, 14.05, 0.45], [2.0, 13.95, -0.05]]), 0.08, {segs: 28});
      regB('scapula', s, 'skeleton', 'لوح الكتف', 'Scapula', 'Scapula', 'عظم مثلثي مسطح في أعلى الظهر؛ يتمفصل مع عظم العضد ويعطي نقطة ارتكاز لعضلات الكتف.',
        'A flat triangular bone of the upper back; it articulates with the humerus and anchors the shoulder muscles.', {quiz: true});
      extrude(sid('scapula', s), 'bone', [[-0.55, 0.7], [0.5, 0.78], [0.2, 0.2], [0.15, -1.15], [-0.15, -1.2], [-0.5, -0.1]].map(p => [p[0] * s, p[1]]),
        0.07, [1.2 * s, 13.0, -0.88], [0.1, 0.35 * s, 0.08 * s]);
      regB('humerus', s, 'skeleton', 'عظم العضد', 'Humerus', 'Humerus', 'عظم الذراع العلوي؛ رأسه الكروي يتمفصل مع الكتف ونهايته السفلية مع الساعد عند المرفق.',
        'The upper-arm bone; its round head fits the shoulder and its lower end forms the elbow.', {label: s > 0, quiz: true});
      ell(sid('humerus', s), 'bone', [1.95 * s, 13.68, 0.05], [0.29, 0.29, 0.29]);
      seg(sid('humerus', s), 'bone', [1.97 * s, 13.5, 0.05], [2.2 * s, 10.95, 0.05], 0.16, 0.14);
      ell(sid('humerus', s), 'bone', [2.2 * s, 10.78, 0.05], [0.26, 0.2, 0.22]);
      regB('ulna', s, 'skeleton', 'الزند', 'Ulna', 'Ulna', 'عظم الساعد الإنسي (جهة الخنصر)؛ يشكّل المرفق مع العضد.', 'The medial forearm bone (little-finger side); it forms the elbow with the humerus.', {quiz: true});
      seg(sid('ulna', s), 'bone', [2.12 * s, 10.7, 0.0], [2.32 * s, 8.15, 0.12], 0.085, 0.06);
      regB('radius', s, 'skeleton', 'الكعبرة', 'Radius', 'Radius', 'عظم الساعد الوحشي (جهة الإبهام)؛ يدور حول الزند فتنقلب راحة اليد.', 'The lateral forearm bone (thumb side); it rotates around the ulna to turn the palm.', {quiz: true});
      seg(sid('radius', s), 'bone', [2.3 * s, 10.7, 0.12], [2.46 * s, 8.15, 0.2], 0.07, 0.085);
      // hand
      regB('carpals', s, 'skeleton', 'عظام الرسغ', 'Carpal bones', 'Ossa carpi', 'ثمانية عظام صغيرة في رسغ اليد في صفّين، تمنح اليد مرونة الحركة.', 'Eight small wrist bones in two rows that give the hand its flexibility.');
      regB('metacarpals', s, 'skeleton', 'مشط اليد', 'Metacarpals', 'Ossa metacarpi', 'خمسة عظام طويلة في راحة اليد تصل الرسغ بالأصابع.', 'Five long bones of the palm that connect the wrist to the fingers.');
      regB('phalanges', s, 'skeleton', 'السُّلاميات (أصابع اليد)', 'Phalanges (fingers)', 'Phalanges manus', 'عظام الأصابع: ثلاث سلاميات لكل إصبع وسلاميتان للإبهام.', 'The finger bones: three phalanges per finger and two for the thumb.', {quiz: true});
      for (let i = 0; i < 8; i++) ell(sid('carpals', s), 'bone', [(2.4 + (i % 4 - 1.5) * 0.1) * s, 7.98 - Math.floor(i / 4) * 0.12, 0.18], [0.075, 0.07, 0.07]);
      const offs = [0.3, 0.1, -0.03, -0.15, -0.27], lens = [[0.3, 0.25], [0.42, 0.28, 0.22], [0.46, 0.3, 0.23], [0.42, 0.28, 0.21], [0.33, 0.22, 0.18]];
      offs.forEach((o, f) => {
        const x0 = (2.4 + o * 0.55) * s, x1 = (2.4 + o * 1.05) * s;
        const y1 = f === 0 ? 7.2 : 6.95;
        seg(sid('metacarpals', s), 'bone', [x0, 7.82, 0.18], [x1, y1, 0.18], 0.05, 0.045);
        let y = y1 - 0.02;
        lens[f].forEach(L => { seg(sid('phalanges', s), 'bone', [x1, y, 0.18], [x1 + (f === 0 ? 0.04 : 0) * s, y - L, 0.18], 0.04, 0.035); y -= L + 0.015; });
      });
    });

    // leg
    bi(s => {
      regB('femur', s, 'skeleton', 'عظم الفخذ', 'Femur', 'Femur', 'أطول عظم وأقواه في الجسم؛ يتمفصل رأسه مع الحُق في الحوض ونهايته السفلية مع الركبة.',
        'The longest and strongest bone of the body; its head sits in the hip socket and its lower end forms the knee.', {label: s > 0, quiz: true});
      ell(sid('femur', s), 'bone', [0.9 * s, 8.4, 0.02], [0.27, 0.27, 0.27]);
      seg(sid('femur', s), 'bone', [0.9 * s, 8.4, 0.02], [1.32 * s, 8.0, 0.0], 0.12, 0.13);
      ell(sid('femur', s), 'bone', [1.36 * s, 7.95, 0.0], [0.2, 0.22, 0.2]);
      seg(sid('femur', s), 'bone', [1.2 * s, 7.85, 0.0], [0.97 * s, 4.75, 0.05], 0.16, 0.17);
      ell(sid('femur', s), 'bone', [(0.97 + 0.15) * s, 4.62, 0.02], [0.22, 0.22, 0.26]);
      ell(sid('femur', s), 'bone', [(0.97 - 0.15) * s, 4.62, 0.02], [0.22, 0.22, 0.26]);
      regB('patella', s, 'skeleton', 'الرضفة (صابونة الركبة)', 'Patella', 'Patella', 'عظم سمسماني أمام الركبة يحمي المفصل ويزيد قوة عضلة الفخذ الرباعية.', 'A sesamoid bone in front of the knee that protects the joint and increases quadriceps power.', {quiz: true});
      ell(sid('patella', s), 'bone', [0.97 * s, 4.78, 0.4], [0.17, 0.2, 0.07]);
      regB('tibia', s, 'skeleton', 'الظنبوب', 'Tibia', 'Tibia', 'عظم الساق الأمامي الإنسي الضخم؛ يحمل وزن الجسم وتتحسس حافته الأمامية تحت الجلد.', 'The large medial shin bone; it bears body weight and its front edge can be felt under the skin.', {quiz: true});
      seg(sid('tibia', s), 'bone', [0.97 * s, 4.5, 0.05], [0.86 * s, 1.15, 0.03], 0.15, 0.1);
      ell(sid('tibia', s), 'bone', [0.97 * s, 4.52, 0.04], [0.3, 0.1, 0.27]);
      ell(sid('tibia', s), 'bone', [0.82 * s, 1.0, 0.03], [0.17, 0.14, 0.17]);
      regB('fibula', s, 'skeleton', 'الشظية', 'Fibula', 'Fibula', 'عظم الساق الرفيع الوحشي؛ لا يحمل وزنًا يُذكر لكنه يثبّت الكاحل ويعطي ارتكازًا للعضلات.', 'The slim lateral shin bone; it bears little weight but steadies the ankle and anchors muscles.', {quiz: true});
      seg(sid('fibula', s), 'bone', [1.18 * s, 4.38, 0.0], [1.08 * s, 1.05, 0.0], 0.06, 0.07);
      ell(sid('fibula', s), 'bone', [1.08 * s, 0.98, 0.0], [0.09, 0.15, 0.09]);
      // foot
      regB('tarsals', s, 'skeleton', 'عظام رسغ القدم', 'Tarsal bones', 'Ossa tarsi', 'سبعة عظام في مؤخرة القدم أكبرها العقب (الكعب) والقَعبة.', 'Seven bones of the hindfoot, the largest being the calcaneus (heel) and talus.', {quiz: true});
      regB('metatarsals', s, 'skeleton', 'مشط القدم', 'Metatarsals', 'Ossa metatarsi', 'خمسة عظام طويلة في مقدمة القدم تشكّل قوس القدم.', 'Five long bones of the forefoot that form the arch of the foot.');
      regB('toes', s, 'skeleton', 'سلاميات القدم', 'Phalanges (toes)', 'Phalanges pedis', 'عظام أصابع القدم؛ لكل إصبع ثلاث سلاميات عدا الإبهام له اثنتان.', 'The toe bones; three per toe except the big toe, which has two.');
      ell(sid('tarsals', s), 'bone', [0.82 * s, 0.9, 0.0], [0.17, 0.17, 0.2]);
      ell(sid('tarsals', s), 'bone', [0.82 * s, 0.42, -0.28], [0.2, 0.28, 0.34]);
      ell(sid('tarsals', s), 'bone', [0.82 * s, 0.45, 0.2], [0.16, 0.14, 0.14]);
      for (let i = 0; i < 3; i++) ell(sid('tarsals', s), 'bone', [(0.7 + i * 0.12) * s, 0.3, 0.45], [0.07, 0.08, 0.1]);
      ell(sid('tarsals', s), 'bone', [1.05 * s, 0.3, 0.3], [0.1, 0.1, 0.13]);
      for (let f = 0; f < 5; f++) {
        const x = (0.62 + f * 0.13) * s, x2 = (0.56 + f * 0.15) * s;
        seg(sid('metatarsals', s), 'bone', [x, 0.28, 0.58], [x2, 0.17, 1.35], 0.05, 0.045);
        let z = 1.37; const L = f === 0 ? [0.28, 0.22] : [0.2, 0.14, 0.1];
        L.forEach(l => { seg(sid('toes', s), 'bone', [x2, 0.16, z], [x2, 0.14, z + l], 0.04, 0.035); z += l + 0.015; });
      }
    });
  }

  function buildMuscles() {
    // [id, ar, en, la, dar, den, pos, scale, rotZ, rotX, quiz]
    const M = [
      ['pectoralis', 'العضلة الصدرية الكبرى', 'Pectoralis major', 'M. pectoralis major', 'عضلة مروحية على الصدر تقرّب الذراع من الجسم وتدوّرها للداخل.', 'A fan-shaped chest muscle that brings the arm toward the body and rotates it inward.', [0.78, 13.0, 0.82], [0.78, 0.55, 0.2], 0.35, -0.15, true],
      ['rectus_abd', 'العضلة المستقيمة البطنية', 'Rectus abdominis', 'M. rectus abdominis', 'العضلة ذات «المربعات الستة»؛ تثني الجذع وتضغط البطن.', 'The "six-pack" muscle; it flexes the trunk and compresses the abdomen.', [0.2, 10.5, 0.85], [0.2, 1.75, 0.14], 0, 0, true],
      ['oblique', 'العضلة المائلة الخارجية', 'External oblique', 'M. obliquus externus', 'أكبر عضلات جدار البطن الجانبية؛ تدوّر الجذع وتثنيه جانبيًا.', 'The largest lateral abdominal wall muscle; it rotates and side-bends the trunk.', [1.1, 10.8, 0.42], [0.38, 1.3, 0.3], 0.1, 0, false],
      ['trapezius', 'العضلة المنحرفة (شبه المنحرفة)', 'Trapezius', 'M. trapezius', 'عضلة مثلثة كبيرة على الظهر والرقبة ترفع الكتف وتحرّك لوح الكتف.', 'A large triangular muscle of the back and neck that lifts the shoulder and moves the scapula.', [0.55, 13.5, -0.95], [0.95, 1.5, 0.14], 0.4, 0, true],
      ['latissimus', 'العضلة الظهرية العريضة', 'Latissimus dorsi', 'M. latissimus dorsi', 'أعرض عضلة في الظهر؛ تسحب الذراع للأسفل والخلف وتقرّبه من الجسم.', 'The widest muscle of the back; it pulls the arm down and back toward the body.', [1.0, 11.5, -0.82], [0.75, 1.5, 0.14], -0.25, 0, true],
      ['deltoid', 'العضلة الدالية', 'Deltoid', 'M. deltoideus', 'عضلة مدورة تغطي الكتف؛ ترفع الذراع جانبًا وللأمام وللخلف.', 'A rounded muscle capping the shoulder; it raises the arm sideways, forward and back.', [2.05, 13.6, 0.05], [0.46, 0.62, 0.48], 0.15, 0, true],
      ['biceps', 'العضلة ذات الرأسين العضدية', 'Biceps brachii', 'M. biceps brachii', 'تثني المرفق وتقلب الساعد لتواجه راحة اليد الأعلى.', 'Flexes the elbow and turns the forearm so the palm faces up.', [2.1, 12.2, 0.32], [0.3, 1.15, 0.27], 0.05, 0, true],
      ['triceps', 'العضلة ذات الثلاثة رؤوس العضدية', 'Triceps brachii', 'M. triceps brachii', 'تمدّ المرفق؛ هي العضلة المضادة لذات الرأسين.', 'Straightens the elbow; the opposing muscle of the biceps.', [2.12, 12.2, -0.22], [0.3, 1.15, 0.27], 0.05, 0, true],
      ['forearm_f', 'عضلات الساعد القابضة', 'Forearm flexors', 'Mm. flexores antebrachii', 'تثني الرسغ والأصابع.', 'Flex the wrist and fingers.', [2.3, 9.45, 0.2], [0.25, 1.2, 0.2], 0.07, 0, false],
      ['forearm_e', 'عضلات الساعد الباسطة', 'Forearm extensors', 'Mm. extensores antebrachii', 'تمدّ الرسغ والأصابع.', 'Extend the wrist and fingers.', [2.35, 9.45, -0.05], [0.24, 1.2, 0.19], 0.07, 0, false],
      ['gluteus', 'العضلة الإليوية الكبرى', 'Gluteus maximus', 'M. gluteus maximus', 'أكبر عضلات الجسم؛ تمدّ الورك وتحافظ على استقامة الجذع عند الوقوف.', 'The largest muscle of the body; it extends the hip and keeps the trunk upright.', [0.85, 8.5, -0.8], [0.78, 0.7, 0.5], 0, 0, true],
      ['quadriceps', 'العضلة الرباعية الفخذية', 'Quadriceps femoris', 'M. quadriceps femoris', 'أربعة رؤوس على مقدمة الفخذ تمدّ الركبة، وهي الأقوى في الجسم.', 'Four heads on the front of the thigh that extend the knee; the strongest in the body.', [1.0, 6.35, 0.4], [0.55, 1.85, 0.45], 0.04, 0, true],
      ['hamstrings', 'عضلات الفخذ الخلفية', 'Hamstrings', 'Mm. ischiocrurales', 'تثني الركبة وتمدّ الورك.', 'Flex the knee and extend the hip.', [1.0, 6.35, -0.3], [0.5, 1.8, 0.4], 0.04, 0, true],
      ['adductors', 'العضلات الضامّة', 'Adductors', 'Mm. adductores', 'تقرّب الفخذ من الخط الوسطي للجسم.', 'Draw the thigh toward the midline.', [0.55, 6.9, 0.05], [0.32, 1.5, 0.32], -0.05, 0, false],
      ['gastrocnemius', 'العضلة التوأمية (بطة الساق)', 'Gastrocnemius', 'M. gastrocnemius', 'عضلة بطة الساق؛ تثني الكاحل للأسفل (الوقوف على أطراف الأصابع) وتثني الركبة.', 'The calf muscle; it points the foot down (rising on tiptoe) and flexes the knee.', [0.95, 3.3, -0.35], [0.38, 1.15, 0.34], 0.03, 0, true],
      ['tibialis', 'العضلة الظنبوبية الأمامية', 'Tibialis anterior', 'M. tibialis anterior', 'ترفع القدم للأعلى وتقلبها للداخل.', 'Lifts the foot up and turns it inward.', [0.88, 3.1, 0.25], [0.2, 1.3, 0.2], 0.02, 0, false],
      ['soleus', 'العضلة النعلية', 'Soleus', 'M. soleus', 'تقع تحت التوأمية وتثني الكاحل؛ تعمل بالوقوف الطويل وتساعد على عود الدم الوريدي.', 'Lies beneath the gastrocnemius and flexes the ankle; it works in prolonged standing and aids venous return.', [1.0, 2.7, -0.2], [0.3, 1.0, 0.25], 0.03, 0, false],
      ['peroneus', 'العضلة الشظوية الطويلة', 'Peroneus longus', 'M. fibularis longus', 'على الجانب الوحشي للساق؛ تقلب القدم للخارج وتدعم قوسها.', 'On the outer side of the leg; it turns the foot outward and supports its arch.', [1.12, 3.3, 0.02], [0.17, 1.1, 0.17], 0.04, 0, false],
      ['sartorius', 'العضلة الخياطية', 'Sartorius', 'M. sartorius', 'أطول عضلة في الجسم؛ تعبر الفخذ قُطريًا وتثني الورك والركبة (وضع «التربّع»).', 'The longest muscle of the body; it crosses the thigh diagonally and flexes the hip and knee (the cross-legged position).', [0.95, 6.5, 0.62], [0.1, 2.0, 0.1], -0.2, 0, false],
      ['erector', 'العضلة الناصبة للفقار', 'Erector spinae', 'M. erector spinae', 'عضلتان طويلتان على جانبي العمود الفقري تمدّانه وتحافظان على استقامة الجذع.', 'Two long muscles along the spine that extend it and keep the trunk upright.', [0.42, 11.6, -1.1], [0.2, 2.3, 0.18], 0, 0, false],
      ['infraspinatus', 'العضلة تحت الشوكة', 'Infraspinatus', 'M. infraspinatus', 'إحدى عضلات الكفة المدوّرة؛ تدوّر الذراع للخارج وتثبّت مفصل الكتف.', 'One of the rotator cuff muscles; it rotates the arm outward and steadies the shoulder joint.', [1.2, 13.1, -1.02], [0.42, 0.38, 0.1], 0.3, 0, false],
      ['serratus', 'العضلة المنشارية الأمامية', 'Serratus anterior', 'M. serratus anterior', 'على جانب القفص الصدري تسحب لوح الكتف للأمام؛ تُسمّى «عضلة الملاكم».', 'On the side of the rib cage, it pulls the scapula forward; known as the "boxer\'s muscle".', [1.5, 12.2, 0.15], [0.12, 0.95, 0.5], 0.05, 0, false],
    ];
    M.forEach(m => {
      bi(s => {
        regB(m[0], s, 'muscles', m[1], m[2], m[3], m[4], m[5], {quiz: m[10], label: m[10] && s > 0});
        ell(sid(m[0], s), 'muscle', [m[6][0] * s, m[6][1], m[6][2]], m[7], [m[9] || 0, 0, -(m[8] || 0) * s], {rough: 0.78});
      });
    });
    bi(s => {
      regB('scm', s, 'muscles', 'العضلة القصية الترقوية الخشائية', 'Sternocleidomastoid', 'M. sternocleidomastoideus', 'عضلة بارزة جانب الرقبة تدوّر الرأس وتثنيه جانبيًا.', 'The prominent neck muscle that turns and tilts the head.', {quiz: true});
      tube(sid('scm', s), 'muscle', [[0.6 * s, 15.75, -0.2], [0.42 * s, 14.9, 0.2], [0.18 * s, 13.95, 0.55]], 0.13, {rough: 0.78});
      regB('masseter', s, 'muscles', 'العضلة الماضغة', 'Masseter', 'M. masseter', 'أقوى عضلات المضغ؛ ترفع الفك السفلي لإغلاق الفم.', 'The strongest chewing muscle; it lifts the mandible to close the mouth.');
      ell(sid('masseter', s), 'muscle', [0.62 * s, 15.6, 0.3], [0.14, 0.3, 0.24], null, {rough: 0.78});
      regB('temporalis', s, 'muscles', 'العضلة الصدغية', 'Temporalis', 'M. temporalis', 'مروحة على جانب الجمجمة؛ ترفع الفك السفلي وتشارك في المضغ.', 'A fan on the side of the skull; it raises the mandible and helps chewing.');
      ell(sid('temporalis', s), 'muscle', [0.78 * s, 16.3, 0.1], [0.1, 0.45, 0.5], null, {rough: 0.78});
    });
  }

  function buildFaceRing() {
    reg('orb_oris', 'muscles', 'العضلة الحلقية للفم', 'Orbicularis oris', 'M. orbicularis oris', 'حلقة حول الفم تغلق الشفتين وتشارك في الكلام والتقبيل.', 'A ring around the mouth that closes the lips and takes part in speech and kissing.');
    const m = new T.Mesh(new T.TorusGeometry(0.22, 0.06, 8, 20), null); m.scale.set(1, 0.55, 1); m.position.set(0, 15.55, 0.88); add('orb_oris', m, 'muscle', {rough: 0.78});
  }

  function brainGeo() {
    const g = new T.SphereGeometry(1, 56, 40), pos = g.attributes.position, v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const n = v.clone().normalize();
      const d = 0.05 * (Math.sin(n.x * 15 + n.y * 8) * Math.sin(n.y * 14 - n.z * 11) + 0.7 * Math.sin(n.z * 17 + n.x * 7));
      v.multiplyScalar(1 + d); pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }

  function buildOrgans() {
    // brain
    reg('cerebrum', 'organs', 'المخ', 'Cerebrum', 'Cerebrum', 'أكبر أجزاء الدماغ؛ نصفاه الكرويان مسؤولان عن التفكير والذاكرة والحس والحركة الإرادية.', 'The largest part of the brain; its two hemispheres handle thought, memory, sensation and voluntary movement.', {label: true, quiz: true});
    const bg = brainGeo();
    bi(s => { const m = new T.Mesh(bg, null); m.position.set(0.37 * s, 16.7, 0.0); m.scale.set(0.4, 0.55, 0.8); add('cerebrum', m, 'brain'); });
    reg('cerebellum', 'organs', 'المخيخ', 'Cerebellum', 'Cerebellum', 'يقع خلف جذع الدماغ؛ ينسّق الحركة والتوازن.', 'Sits behind the brainstem; it coordinates movement and balance.', {quiz: true});
    ell('cerebellum', 'cereb', [0, 16.0, -0.58], [0.5, 0.28, 0.3]);
    reg('brainstem', 'organs', 'جذع الدماغ', 'Brainstem', 'Truncus encephali', 'يصل المخ بالنخاع الشوكي ويتحكم بالتنفس ونبض القلب والوعي.', 'Joins the brain to the spinal cord and controls breathing, heartbeat and consciousness.', {quiz: true});
    seg('brainstem', 'stem', [0, 16.25, -0.2], [0, 15.15, -0.38], 0.2, 0.12);
    // eyes
    bi(s => {
      regB('eye', s, 'organs', 'العين', 'Eye', 'Oculus', 'عضو البصر؛ تجمع القرنية والعدسة الضوء على الشبكية فتتحول إلى إشارات عصبية.', 'The organ of sight; the cornea and lens focus light on the retina, which turns it into nerve signals.', {quiz: s > 0});
      ell(sid('eye', s), 'eye', [0.3 * s, 16.12, 0.82], [0.17, 0.17, 0.17]);
      ell(sid('eye', s), 'iris', [0.3 * s, 16.12, 0.97], [0.085, 0.085, 0.03]);
      ell(sid('eye', s), 'dark', [0.3 * s, 16.12, 0.995], [0.04, 0.04, 0.015]);
    });
    // thyroid, larynx/trachea
    reg('thyroid', 'organs', 'الغدة الدرقية', 'Thyroid gland', 'Glandula thyroidea', 'غدة على شكل فراشة أمام القصبة الهوائية؛ تفرز هرمونات تنظّم الأيض.', 'A butterfly-shaped gland in front of the windpipe; its hormones regulate metabolism.', {quiz: true});
    bi(s => ell('thyroid', 'thyroid', [0.2 * s, 14.55, 0.22], [0.16, 0.3, 0.12], [0, 0, -0.1 * s]));
    box('thyroid', 'thyroid', [0, 14.45, 0.24], [0.25, 0.08, 0.08]);
    reg('trachea', 'organs', 'القصبة الهوائية', 'Trachea', 'Trachea', 'أنبوب غضروفي ينقل الهواء من الحنجرة إلى الرئتين ثم ينقسم إلى قصبتين.', 'A cartilage tube that carries air from the larynx to the lungs and then divides into two bronchi.', {label: true, quiz: true});
    tube('trachea', 'trachea', [[0, 15.2, 0.05], [0, 14.3, 0.04], [0, 13.35, 0.0]], 0.14, {segs: 20});
    reg('bronchi', 'organs', 'القصبات الهوائية', 'Main bronchi', 'Bronchi principales', 'فرعا القصبة الهوائية إلى الرئتين؛ الأيمن أقصر وأعرض وأكثر عمودية.', 'The two branches of the trachea into the lungs; the right is shorter, wider and more vertical.');
    tube('bronchi', 'trachea', [[0, 13.35, 0.0], [-0.3, 13.15, -0.02], [-0.65, 12.85, -0.05]], 0.1);
    tube('bronchi', 'trachea', [[0, 13.35, 0.0], [0.3, 13.1, -0.02], [0.7, 12.7, -0.05]], 0.09);
    // lungs
    const lungDesc = {R: 'ثلاثة فصوص (علوي وأوسط وسفلي) تفصلها شقوق؛ هنا يتبادل الدم الأكسجين وثاني أكسيد الكربون.', L: 'فصّان (علوي وسفلي) مع «انطباع القلب»؛ أصغر من اليمنى لإفساح مكان للقلب.'};
    [['lung_RU', -1, 'الفص العلوي للرئة اليمنى', 'Right lung — upper lobe', [-0.98, 13.5, 0.0], [0.62, 0.8, 0.68], 'R'],
     ['lung_RM', -1, 'الفص الأوسط للرئة اليمنى', 'Right lung — middle lobe', [-0.95, 12.65, 0.36], [0.6, 0.4, 0.5], 'R'],
     ['lung_RL', -1, 'الفص السفلي للرئة اليمنى', 'Right lung — lower lobe', [-0.98, 12.05, -0.2], [0.7, 0.82, 0.8], 'R'],
     ['lung_LU', 1, 'الفص العلوي للرئة اليسرى', 'Left lung — upper lobe', [0.95, 13.45, 0.0], [0.58, 0.85, 0.65], 'L'],
     ['lung_LL', 1, 'الفص السفلي للرئة اليسرى', 'Left lung — lower lobe', [0.95, 12.0, -0.15], [0.63, 0.85, 0.8], 'L']].forEach(l => {
      reg(l[0], 'organs', l[2], l[3], 'Pulmo', lungDesc[l[6]], l[6] === 'R' ? 'Three lobes (upper, middle, lower) separated by fissures; blood exchanges oxygen and carbon dioxide here.' : 'Two lobes (upper, lower) with the cardiac notch; smaller than the right to leave room for the heart.', {label: l[0] === 'lung_RU', quiz: true});
      ell(l[0], 'lung', l[4], l[5], null, {op: 0.62});
    });
    reg('diaphragm', 'organs', 'الحجاب الحاجز', 'Diaphragm', 'Diaphragma', 'عضلة قبّية تفصل الصدر عن البطن؛ انقباضها هو المحرّك الرئيسي للشهيق.', 'A dome-shaped muscle separating chest from abdomen; its contraction drives inspiration.', {label: true, quiz: true});
    const dg = new T.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dm = new T.Mesh(dg, null); dm.position.set(0, 11.2, -0.05); dm.scale.set(1.55, 0.8, 1.1); add('diaphragm', dm, 'diaph', {op: 0.42, side: T.DoubleSide});
    // heart
    const heartDesc = {
      RA: ['الأذين الأيمن', 'Right atrium', 'يستقبل الدم غير المؤكسج من الوريدين الأجوفين.', 'Receives deoxygenated blood from the venae cavae.'],
      RV: ['البطين الأيمن', 'Right ventricle', 'يضخ الدم إلى الرئتين عبر الشريان الرئوي.', 'Pumps blood to the lungs through the pulmonary artery.'],
      LA: ['الأذين الأيسر', 'Left atrium', 'يستقبل الدم المؤكسج من الأوردة الرئوية.', 'Receives oxygenated blood from the pulmonary veins.'],
      LV: ['البطين الأيسر', 'Left ventricle', 'أقوى حجرة في القلب؛ يضخ الدم المؤكسج إلى الجسم كله عبر الأبهر.', 'The strongest chamber; it pumps oxygenated blood to the whole body through the aorta.'],
    };
    Object.keys(heartDesc).forEach(k => reg('heart_' + k, 'organs', heartDesc[k][0], heartDesc[k][1], 'Cor', heartDesc[k][2], heartDesc[k][3], {label: k === 'LV', quiz: true}));
    ell('heart_RV', 'heart', [0.12, 12.0, 0.58], [0.38, 0.52, 0.32], [0, 0, 0.25]);
    ell('heart_RA', 'heart', [-0.32, 12.5, 0.32], [0.27, 0.4, 0.27]);
    ell('heart_LV', 'heart', [0.58, 11.95, 0.32], [0.42, 0.62, 0.4], [0, 0, -0.45]);
    ell('heart_LA', 'heart', [0.32, 12.85, 0.0], [0.34, 0.26, 0.3]);
    // digestive
    reg('esophagus', 'organs', 'المريء', 'Esophagus', 'Oesophagus', 'أنبوب عضلي بطول نحو 25 سم ينقل الطعام من البلعوم إلى المعدة بالتمعّج.', 'A muscular tube about 25 cm long that carries food from the pharynx to the stomach by peristalsis.', {quiz: true});
    tube('esophagus', 'stomach', [[0, 15.0, -0.12], [0, 13.6, -0.25], [0.1, 12.3, -0.22], [0.38, 11.45, 0.12]], 0.095, {segs: 30});
    reg('stomach', 'organs', 'المعدة', 'Stomach', 'Gaster', 'كيس عضلي يخزّن الطعام ويهضمه بالحمض والإنزيمات قبل مروره للأمعاء.', 'A muscular sac that stores and digests food with acid and enzymes before it passes to the intestine.', {label: true, quiz: true});
    ell('stomach', 'stomach', [0.7, 10.75, 0.4], [0.55, 0.52, 0.36], [0, 0, 0.5]);
    tube('stomach', 'stomach', [[0.38, 11.3, 0.12], [0.35, 11.0, 0.4], [0.15, 10.35, 0.5], [-0.25, 10.35, 0.4]], 0.17);
    reg('liver', 'organs', 'الكبد', 'Liver', 'Hepar', 'أكبر غدة في الجسم، في أعلى يمين البطن؛ تُنقّي الدم وتصنع الصفراء والبروتينات وتخزّن الغلايكوجين.', 'The largest gland, in the upper right abdomen; it filters blood, makes bile and proteins, and stores glycogen.', {label: true, quiz: true});
    ell('liver', 'liver', [-0.7, 10.78, 0.28], [1.15, 0.6, 0.72], [0, 0, -0.12]);
    ell('liver', 'liver', [0.3, 10.62, 0.42], [0.7, 0.4, 0.5], [0, 0, 0.1]);
    reg('gallbladder', 'organs', 'المرارة', 'Gallbladder', 'Vesica biliaris', 'كيس صغير تحت الكبد يخزّن الصفراء ويركّزها ثم يفرغها في الاثني عشر عند تناول الدهون.', 'A small sac under the liver that stores and concentrates bile and releases it into the duodenum with fatty food.', {quiz: true});
    ell('gallbladder', 'gall', [-0.55, 10.25, 0.5], [0.14, 0.3, 0.14], [0, 0, 0.2]);
    reg('spleen', 'organs', 'الطحال', 'Spleen', 'Splen', 'أكبر عضو لمفاوي؛ يرشّح الدم ويتخلص من الكريات القديمة وينتج أجسامًا مضادة.', 'The largest lymphoid organ; it filters blood, removes old red cells and makes antibodies.', {quiz: true});
    ell('spleen', 'spleen', [1.3, 10.95, -0.4], [0.22, 0.5, 0.3], [0, 0, 0.15]);
    reg('pancreas', 'organs', 'البنكرياس', 'Pancreas', 'Pancreas', 'غدة خلف المعدة تفرز إنزيمات الهضم وهرمونات الإنسولين والغلوكاغون.', 'A gland behind the stomach that secretes digestive enzymes and the hormones insulin and glucagon.', {quiz: true});
    tube('pancreas', 'panc', [[-0.6, 10.45, 0.05], [-0.15, 10.6, 0.0], [0.4, 10.75, -0.15], [1.0, 10.95, -0.3]], 0.14, {segs: 20});
    reg('small_intestine', 'organs', 'الأمعاء الدقيقة', 'Small intestine', 'Intestinum tenue', 'أنبوب ملتف بطول 6–7 أمتار؛ فيه يتم معظم الهضم وامتصاص الغذاء.', 'A coiled tube 6–7 metres long, where most digestion and nutrient absorption take place.', {label: true, quiz: true});
    const si = [];
    for (let i = 0; i <= 260; i++) { const t = i / 260; si.push([0.8 * Math.sin(t * Math.PI * 2 * 6.5) * (1 - 0.12 * t), 10.0 - t * 1.5 + 0.1 * Math.sin(t * Math.PI * 2 * 13), 0.5 + 0.1 * Math.cos(t * Math.PI * 2 * 11)]); }
    tube('small_intestine', 'intest', si, 0.1, {segs: 520, radial: 6});
    reg('colon', 'organs', 'الأمعاء الغليظة (القولون)', 'Large intestine (colon)', 'Colon', 'تحيط بالأمعاء الدقيقة؛ تمتص الماء والأملاح وتكوّن البراز: الصاعد، المستعرض، النازل، السيني.', 'Frames the small intestine; it absorbs water and salts and forms stool: ascending, transverse, descending, sigmoid.', {label: true, quiz: true});
    tube('colon', 'colon', [[-1.0, 8.55, 0.3], [-1.08, 9.4, 0.35], [-1.05, 10.35, 0.2], [-0.6, 10.2, 0.6], [0, 9.95, 0.68], [0.6, 10.2, 0.6], [1.05, 10.35, 0.2], [1.1, 9.4, 0.15], [1.0, 8.6, 0.1], [0.7, 8.05, 0.2], [0.35, 8.25, 0.1], [0.1, 7.9, -0.25]], 0.17, {segs: 140});
    reg('cecum_app', 'organs', 'الأعور والزائدة الدودية', 'Cecum and appendix', 'Caecum et appendix vermiformis', 'الأعور بداية القولون، وتتدلى منه الزائدة الدودية؛ التهابها يسبب التهاب الزائدة.', 'The cecum begins the colon and the appendix hangs from it; its inflammation is appendicitis.', {quiz: true});
    ell('cecum_app', 'colon', [-1.0, 8.4, 0.3], [0.24, 0.24, 0.24]);
    tube('cecum_app', 'colon', [[-0.95, 8.2, 0.3], [-0.8, 7.95, 0.35], [-0.7, 7.85, 0.3]], 0.05);
    reg('rectum', 'organs', 'المستقيم والشرج', 'Rectum and anal canal', 'Rectum et canalis analis', 'نهاية الجهاز الهضمي؛ يخزّن البراز حتى التبرّز.', 'The end of the digestive tract; it stores stool until defecation.');
    tube('rectum', 'colon', [[0.1, 7.9, -0.25], [0.0, 7.45, -0.45], [0, 6.95, -0.55]], 0.15);
    // urinary
    bi(s => {
      regB('kidney', s, 'organs', 'الكلية', 'Kidney', 'Ren', 'عضو على شكل حبة الفاصولياء خلف البريتوان؛ تنقّي الدم وتنتج البول وتنظّم الماء والأملاح وضغط الدم.', 'A bean-shaped organ behind the peritoneum; it filters blood, makes urine and regulates water, salts and blood pressure.', {label: s > 0, quiz: true});
      ell(sid('kidney', s), 'kidney', [0.75 * s, 10.6, -0.55], [0.27, 0.5, 0.22], [0, 0, 0.12 * s]);
      regB('adrenal', s, 'organs', 'الغدة الكظرية', 'Adrenal gland', 'Glandula suprarenalis', 'قبعة صغيرة فوق الكلية تفرز الكورتيزول والأدرينالين.', 'A small cap above the kidney that secretes cortisol and adrenaline.');
      ell(sid('adrenal', s), 'adren', [0.68 * s, 11.2, -0.55], [0.17, 0.1, 0.12]);
      regB('ureter', s, 'organs', 'الحالب', 'Ureter', 'Ureter', 'أنبوب عضلي ينقل البول من الكلية إلى المثانة بالتمعّج.', 'A muscular tube that carries urine from the kidney to the bladder by peristalsis.');
      tube(sid('ureter', s), 'bladder', [[0.7 * s, 10.15, -0.5], [0.65 * s, 9.0, -0.5], [0.45 * s, 8.0, -0.15], [0.22 * s, 7.75, 0.35]], 0.04);
    });
    reg('bladder', 'organs', 'المثانة البولية', 'Urinary bladder', 'Vesica urinaria', 'كيس عضلي في الحوض يخزّن البول حتى التبول.', 'A muscular pelvic sac that stores urine until urination.', {label: true, quiz: true});
    ell('bladder', 'bladder', [0, 7.65, 0.42], [0.34, 0.3, 0.32], null, {op: 0.92});
  }

  function off(pts, dx, dz) { return pts.map(p => [p[0] + dx, p[1], p[2] + (dz || 0)]); }

  function buildVessels() {
    const A = (id, ar, en, la, dar, den, pts, r, o) => { reg(id, 'vessels', ar, en, la, dar, den, o); tube(id, 'artery', pts, r, {segs: 60}); };
    const V = (id, ar, en, la, dar, den, pts, r, o) => { reg(id, 'vessels', ar, en, la, dar, den, o); tube(id, 'vein', pts, r, {segs: 60}); };
    A('aorta', 'الأبهر (الأورطي)', 'Aorta', 'Aorta', 'أكبر شريان في الجسم؛ يخرج من البطين الأيسر ويقوّس فوق القلب ثم ينزل أمام العمود الفقري موزّعًا الدم المؤكسج.',
      'The largest artery; it leaves the left ventricle, arches over the heart and descends in front of the spine, distributing oxygenated blood.',
      [[0.4, 12.55, 0.25], [0.3, 13.15, 0.2], [0.0, 13.6, 0.0], [0.3, 13.5, -0.3], [0.42, 13.1, -0.5], [0.38, 11.9, -0.55], [0.22, 10.8, -0.47], [0.1, 9.85, -0.42]], 0.15, {label: true, quiz: true});
    bi(s => {
      regB('carotid', s, 'vessels', 'الشريان السباتي', 'Common carotid artery', 'A. carotis communis', 'يغذّي الدماغ والرأس والرقبة؛ يمكن جس نبضه جانب الرقبة.', 'Supplies the brain, head and neck; its pulse can be felt at the side of the neck.', {quiz: s > 0});
      tube(sid('carotid', s), 'artery', mpts(s, [[0.05, 13.55, 0.02], [0.3, 14.5, 0.2], [0.33, 15.6, 0.15], [0.3, 16.25, 0.3]]), 0.065, {segs: 30});
      regB('arm_artery', s, 'vessels', 'شريان الذراع (تحت الترقوة ← العضدي)', 'Subclavian–brachial artery', 'A. subclavia / brachialis', 'يمتد من الأبهر تحت الترقوة ثم الإبط ثم العضد لإيصال الدم إلى الذراع واليد؛ يُقاس به ضغط الدم عند المرفق.', 'Runs from the aorta under the clavicle, through the axilla and down the arm to the hand; blood pressure is measured over it at the elbow.', {quiz: s > 0});
      tube(sid('arm_artery', s), 'artery', mpts(s, [[0.2, 13.65, 0.0], [1.2, 13.95, 0.2], [1.95, 13.4, 0.18], [2.15, 11.8, 0.22], [2.2, 10.6, 0.27], [2.3, 9.3, 0.3], [2.38, 8.1, 0.32], [2.42, 7.7, 0.32]]), 0.045, {segs: 70});
      regB('leg_artery', s, 'vessels', 'شريان الساق (الحرقفي ← الفخذي ← الظنبوبي)', 'Iliac–femoral artery', 'A. iliaca / femoralis', 'يتفرع من نهاية الأبهر ثم ينزل أمام الفخذ ويخلف الركبة ليغذي الساق والقدم؛ ينبض في أعلى الفخذ.', 'Branches from the end of the aorta and runs down the front of the thigh and behind the knee to the leg and foot; its pulse is felt in the groin.', {quiz: s > 0});
      tube(sid('leg_artery', s), 'artery', mpts(s, [[0.1, 9.8, -0.4], [0.55, 9.2, -0.2], [0.85, 8.5, 0.1], [0.9, 8.1, 0.28], [0.95, 6.5, 0.32], [0.95, 4.8, 0.27], [0.95, 4.4, -0.05], [0.88, 2.8, 0.0], [0.85, 1.2, 0.0]]), 0.075, {segs: 90});
      regB('renal_a', s, 'vessels', 'الشريان الكلوي', 'Renal artery', 'A. renalis', 'يفرع من الأبهر البطني ليغذي الكلية بنحو خُمس النتاج القلبي.', 'Branches off the abdominal aorta to the kidney, receiving about a fifth of cardiac output.');
      tube(sid('renal_a', s), 'artery', mpts(s, [[0.15, 10.5, -0.45], [0.45, 10.55, -0.5], [0.65, 10.6, -0.52]]), 0.045);
      regB('jugular', s, 'vessels', 'الوريد الوداجي', 'Jugular vein', 'V. jugularis', 'يعيد الدم من الرأس والدماغ إلى القلب.', 'Returns blood from the head and brain to the heart.', {quiz: s > 0});
      tube(sid('jugular', s), 'vein', mpts(s, [[0.3, 16.0, 0.0], [0.45, 15.2, 0.1], [0.42, 14.3, 0.15], [0.25, 13.7, 0.1]]), 0.075, {segs: 30});
      regB('leg_vein', s, 'vessels', 'وريد الساق (الفخذي والحرقفي)', 'Femoral–iliac vein', 'V. femoralis / iliaca', 'يعيد الدم من الساق إلى الوريد الأجوف السفلي.', 'Returns blood from the leg to the inferior vena cava.');
      tube(sid('leg_vein', s), 'vein', mpts(s, [[0.05, 9.75, -0.3], [0.45, 9.1, -0.1], [0.78, 8.5, 0.15], [0.82, 6.5, 0.22], [0.85, 4.8, 0.2], [0.85, 4.4, -0.1], [0.8, 2.8, -0.05], [0.78, 1.2, -0.03]]), 0.08, {segs: 90});
      regB('arm_vein', s, 'vessels', 'وريد الذراع', 'Brachial–axillary vein', 'V. brachialis / axillaris', 'يعيد الدم من الذراع إلى القلب عبر الوريد الأجوف العلوي.', 'Returns blood from the arm to the heart via the superior vena cava.');
      tube(sid('arm_vein', s), 'vein', mpts(s, [[0.25, 13.75, 0.05], [1.2, 14.0, 0.18], [1.9, 13.4, 0.1], [2.05, 11.8, 0.12], [2.1, 10.6, 0.17], [2.22, 9.3, 0.2], [2.32, 8.1, 0.22]]), 0.04, {segs: 70});
      regB('renal_v', s, 'vessels', 'الوريد الكلوي', 'Renal vein', 'V. renalis', 'يحمل الدم المنقّى من الكلية إلى الوريد الأجوف السفلي.', 'Carries filtered blood from the kidney to the inferior vena cava.');
      tube(sid('renal_v', s), 'vein', mpts(s, [[-0.25, 10.4, -0.35], [0.3, 10.45, -0.5], [0.62, 10.5, -0.52]]).map(p => [p[0] + (s > 0 ? 0 : 0), p[1] - 0.1, p[2]]), 0.05);
    });
    V('ivc', 'الوريد الأجوف السفلي', 'Inferior vena cava', 'V. cava inferior', 'أكبر وريد في الجسم؛ يجمع دم الجزء السفلي من الجسم ويصبّ في الأذين الأيمن.', 'The largest vein; it gathers blood from the lower body and empties into the right atrium.',
      [[-0.28, 9.8, -0.35], [-0.3, 11.0, -0.3], [-0.3, 11.9, -0.1], [-0.3, 12.4, 0.15]], 0.12, {quiz: true});
    V('svc', 'الوريد الأجوف العلوي', 'Superior vena cava', 'V. cava superior', 'يجمع دم الرأس والذراعين والصدر ويصبّ في الأذين الأيمن.', 'Gathers blood from the head, arms and chest and empties into the right atrium.',
      [[-0.28, 12.75, 0.2], [-0.27, 13.6, 0.1], [-0.28, 14.2, 0.05]], 0.1, {quiz: true});
    reg('pulmonary', 'vessels', 'الأوعية الرئوية', 'Pulmonary vessels', 'Truncus et venae pulmonales', 'الشريان الرئوي ينقل الدم غير المؤكسج إلى الرئتين (أزرق)، والأوردة الرئوية تعيد الدم المؤكسج إلى الأذين الأيسر (أحمر) — عكس الشرايين الأخرى.', 'The pulmonary artery carries deoxygenated blood to the lungs (blue); the pulmonary veins return oxygenated blood to the left atrium (red) — the reverse of other vessels.', {quiz: true});
    tube('pulmonary', 'pulm', [[0.1, 12.35, 0.6], [0.15, 12.95, 0.4], [0.5, 13.1, 0.1], [0.85, 12.9, -0.05]], 0.09);
    tube('pulmonary', 'pulm', [[0.15, 12.95, 0.4], [-0.3, 13.05, 0.15], [-0.85, 12.95, 0.0]], 0.09);
    tube('pulmonary', 'artery', [[0.75, 12.55, -0.15], [0.5, 12.8, -0.05], [0.3, 12.85, 0.0]], 0.055);
    tube('pulmonary', 'artery', [[-0.75, 12.5, -0.15], [-0.2, 12.75, -0.05], [0.25, 12.85, 0.0]], 0.055);
    reg('coronary', 'vessels', 'الشرايين التاجية', 'Coronary arteries', 'Arteriae coronariae', 'تتفرع من جذر الأبهر وتحيط بالقلب لتغذي عضلته؛ انسدادها يسبب الجلطة القلبية.', 'They branch from the aortic root and wrap the heart to feed its muscle; blockage causes a heart attack.', {quiz: true});
    tube('coronary', 'artery', [[0.35, 12.85, 0.55], [0.5, 12.3, 0.72], [0.55, 11.6, 0.7]], 0.03);
    tube('coronary', 'artery', [[0.0, 12.75, 0.5], [-0.4, 12.35, 0.55], [-0.3, 11.75, 0.58]], 0.03);
    reg('portal', 'vessels', 'الوريد البابي', 'Portal vein', 'V. portae hepatis', 'ينقل الدم الغني بالغذاء من الأمعاء والطحال إلى الكبد لمعالجته.', 'Carries nutrient-rich blood from the gut and spleen to the liver for processing.', {quiz: true});
    tube('portal', 'portal', [[0.0, 10.1, -0.05], [-0.25, 10.5, 0.1], [-0.55, 10.95, 0.25]], 0.065);
  }

  function buildNerves() {
    reg('spinal_cord', 'nerves', 'النخاع الشوكي', 'Spinal cord', 'Medulla spinalis', 'حبل عصبي داخل القناة الفقرية؛ ينقل الإشارات بين الدماغ والجسم ويتحكم بالمنعكسات.', 'A nerve cord inside the vertebral canal; it carries signals between brain and body and handles reflexes.', {label: true, quiz: true});
    const cord = [[0, 15.2, -0.4]];
    VERT.forEach(v => cord.push([0, v.y, canalZ(v)]));
    cord.push([0, 9.65, canalZ({y: 9.65, r: 0.5})]);
    tube('spinal_cord', 'cord', cord, 0.07, {segs: 120});
    bi(s => {
      regB('plexus', s, 'nerves', 'الضفيرة العضدية', 'Brachial plexus', 'Plexus brachialis', 'شبكة أعصاب من C5–T1 تغذي الذراع كلها حسًّا وحركة.', 'A network of nerves from C5–T1 supplying the whole arm with sensation and movement.', {quiz: s > 0});
      [-0.08, 0, 0.08].forEach(d => tube(sid('plexus', s), 'nerve', mpts(s, [[0.2, 14.55 + d, -0.55], [1.0, 14.0 + d, -0.05], [1.8, 13.55 + d, 0.05]]), 0.03));
      regB('median', s, 'nerves', 'العصب المتوسط', 'Median nerve', 'N. medianus', 'يمر أمام الساعد ويغذي معظم عضلات القبض وحس الإبهام والسبابة والوسطى؛ انضغاطه عند الرسغ هو متلازمة النفق الرسغي.', 'Runs down the front of the forearm; it supplies most flexor muscles and the thumb, index and middle fingers — its compression at the wrist is carpal tunnel syndrome.', {quiz: s > 0});
      tube(sid('median', s), 'nerve', mpts(s, [[1.9, 13.5, 0.2], [2.1, 11.8, 0.3], [2.2, 10.6, 0.34], [2.35, 9.3, 0.32], [2.4, 7.9, 0.37]]), 0.035, {segs: 50});
      regB('ulnar', s, 'nerves', 'العصب الزندي', 'Ulnar nerve', 'N. ulnaris', 'يمر خلف اللقمة الإنسية للمرفق («العظمة المضحكة») ويغذي الخنصر وجزءًا من البنصر.', 'Passes behind the medial epicondyle of the elbow (the "funny bone") and supplies the little finger and half of the ring finger.');
      tube(sid('ulnar', s), 'nerve', mpts(s, [[1.85, 13.5, 0.0], [2.0, 11.5, -0.05], [2.12, 10.75, -0.14], [2.25, 9.3, -0.02], [2.3, 7.9, 0.06]]), 0.033, {segs: 50});
      regB('radial', s, 'nerves', 'العصب الكعبري', 'Radial nerve', 'N. radialis', 'يلتف حول عظم العضد ويغذي عضلات الباسطة للمرفق والرسغ.', 'Winds around the humerus and supplies the extensor muscles of the elbow and wrist.');
      tube(sid('radial', s), 'nerve', mpts(s, [[1.9, 13.4, -0.1], [2.2, 12.0, -0.36], [2.32, 10.8, 0.2], [2.45, 9.3, -0.1]]), 0.033, {segs: 50});
      regB('vagus', s, 'nerves', 'العصب المبهم', 'Vagus nerve', 'N. vagus', 'العصب القحفي العاشر؛ يمتد من الدماغ إلى القلب والرئتين والجهاز الهضمي ويبطّئ القلب وينشّط الهضم.', 'The tenth cranial nerve; it runs from the brain to the heart, lungs and gut, slowing the heart and driving digestion.', {quiz: s > 0});
      tube(sid('vagus', s), 'nerve', mpts(s, [[0.2, 15.7, -0.2], [0.36, 14.6, 0.1], [0.42, 13.4, 0.02], [0.18, 12.1, 0.08], [0.3, 11.5, 0.15]]), 0.03, {segs: 50});
      regB('phrenic', s, 'nerves', 'العصب الحجابي', 'Phrenic nerve', 'N. phrenicus', 'يغذي الحجاب الحاجز حركيًا (C3–C5) فيتحكم بالتنفس.', 'Supplies the diaphragm with movement (C3–C5), controlling breathing.');
      tube(sid('phrenic', s), 'nerve', mpts(s, [[0.45, 14.5, 0.1], [0.55, 13.0, 0.14], [0.65, 11.9, 0.2]]), 0.03);
      regB('femoral_n', s, 'nerves', 'العصب الفخذي', 'Femoral nerve', 'N. femoralis', 'يغذي عضلات مقدمة الفخذ (الرباعية) وحس جلدها.', 'Supplies the front thigh muscles (quadriceps) and skin sensation.');
      tube(sid('femoral_n', s), 'nerve', mpts(s, [[0.5, 9.3, -0.25], [0.75, 8.5, 0.2], [0.9, 7.0, 0.38], [0.92, 5.3, 0.38]]), 0.04, {segs: 40});
      regB('sciatic', s, 'nerves', 'العصب الوركي', 'Sciatic nerve', 'N. ischiadicus', 'أطول وأسمك عصب في الجسم؛ ينزل خلف الفخذ ثم ينقسم إلى العصب الظنبوبي والشظوي المشترك.', 'The longest, thickest nerve; it descends behind the thigh and splits into the tibial and common fibular nerves.', {label: s > 0, quiz: s > 0});
      tube(sid('sciatic', s), 'nerve', mpts(s, [[0.5, 8.7, -0.6], [0.9, 7.8, -0.7], [0.95, 6.3, -0.46], [0.95, 5.0, -0.32]]), 0.06, {segs: 40});
      tube(sid('sciatic', s), 'nerve', mpts(s, [[0.95, 5.0, -0.32], [0.9, 3.0, -0.2], [0.85, 1.0, -0.1]]), 0.04, {segs: 40});
      tube(sid('sciatic', s), 'nerve', mpts(s, [[0.95, 5.0, -0.32], [1.15, 4.5, -0.1], [1.1, 3.5, 0.15], [1.0, 1.5, 0.3]]), 0.035, {segs: 40});
      regB('optic', s, 'nerves', 'العصب البصري', 'Optic nerve', 'N. opticus', 'العصب القحفي الثاني؛ ينقل الصورة من الشبكية إلى الدماغ.', 'The second cranial nerve; it carries the image from the retina to the brain.');
      tube(sid('optic', s), 'nerve', mpts(s, [[0.3, 16.12, 0.65], [0.22, 16.12, 0.25], [0.08, 16.05, 0.0]]), 0.045);
    });
  }

  // ghost silhouette — fresnel rim so overlapping primitives don't show seams
  const skinMaterial = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.FrontSide,
    uniforms: {uOp: {value: 0.85}, uCol: {value: new T.Color(0x9fb6ff)}},
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOp; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uCol, f * uOp * 0.55); }',
  });
  function buildSkin() {
    reg('skin', 'skin', 'الجلد', 'Skin', 'Cutis', 'أكبر أعضاء الجسم؛ يحمي من الجراثيم والجفاف ويحسّ باللمس والحرارة ويساعد على تنظيم حرارة الجسم.', 'The body\'s largest organ; it guards against germs and drying, senses touch and heat, and helps regulate temperature.', {selectable: false});
    const part = (g, x, y, z, sx, sy, sz, rx, rz) => { const m = new T.Mesh(g, skinMaterial); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; m.userData.part = 'skin'; parts.skin.meshes.push(m); sysGroup.skin.add(m); return m; };
    const S = G_SPH;
    part(S, 0, 16.35, 0.05, 0.92, 1.18, 1.08);                       // head
    part(new T.CylinderGeometry(0.46, 0.55, 1.0, 20), 0, 14.95, -0.05); // neck
    part(S, 0, 12.7, -0.02, 1.8, 1.7, 1.2);                           // chest
    part(S, 0, 10.4, 0.0, 1.55, 1.6, 1.1);                            // abdomen
    part(S, 0, 8.5, -0.12, 1.72, 1.3, 1.1);                           // pelvis
    bi(s => {
      part(S, 2.0 * s, 13.75, 0.05, 0.62, 0.62, 0.62);                                                  // shoulder
      const lim = (a, b, r0, r1) => { const A = toV(a), B = toV(b), len = A.distanceTo(B); const m = part(new T.CylinderGeometry(r1, r0, len, 18), 0, 0, 0); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize()); };
      lim([1.98 * s, 13.6, 0.05], [2.2 * s, 10.75, 0.05], 0.47, 0.37);
      part(S, 2.2 * s, 10.7, 0.05, 0.4, 0.4, 0.4);
      lim([2.2 * s, 10.7, 0.08], [2.4 * s, 8.15, 0.18], 0.38, 0.25);
      part(S, 2.4 * s, 7.35, 0.18, 0.3, 0.95, 0.17);                                                    // hand
      lim([0.9 * s, 8.5, 0.05], [0.97 * s, 4.7, 0.08], 0.82, 0.55);
      part(S, 0.97 * s, 4.65, 0.08, 0.52, 0.52, 0.52);
      lim([0.97 * s, 4.6, 0.05], [0.85 * s, 1.05, 0.03], 0.53, 0.3);
      part(S, 0.85 * s, 0.3, 0.55, 0.42, 0.3, 1.05);                                                    // foot
    });
  }

  // ------------------------------------------------------------------- app
  const CSS = `
  .ka{--ka-bg:#0f1320; direction:inherit; font-family:inherit; color:var(--ink,#1c2033);}
  .ka-stage{position:relative; margin:0 16px; border-radius:18px; overflow:hidden; background:radial-gradient(120% 90% at 50% 30%, #1d2440 0%, #0d111d 70%); height:min(74vh,640px); min-height:380px; touch-action:none;}
  .ka-stage canvas{position:absolute; inset:0; width:100%; height:100%; display:block; outline:none;}
  .ka-labels{position:absolute; inset:0; pointer-events:none; overflow:hidden;}
  .ka-label{position:absolute; transform:translate(-50%,-100%); background:rgba(15,19,32,.82); color:#fff; font-size:.66rem; font-weight:700; padding:2px 7px; border-radius:99px; white-space:nowrap; border:1px solid rgba(255,255,255,.25);}
  .ka-load{position:absolute; inset:0; display:grid; place-items:center; color:#cfd3e6; font-size:.85rem; background:#0d111d; z-index:3; transition:opacity .4s;}
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
  .ka-info .la{font-size:.74rem; color:var(--ink-faint,#667); font-style:italic; direction:ltr; text-align:start;}
  .ka-info .sys{display:inline-block; font-size:.66rem; font-weight:800; padding:2px 9px; border-radius:99px; color:#fff; margin-bottom:8px;}
  .ka-info p{margin:6px 0 10px; font-size:.86rem; line-height:1.8;}
  .ka-row{display:flex; gap:8px; flex-wrap:wrap;}
  .ka-btn2{border:1.5px solid var(--glass-border,#0002); background:transparent; color:var(--ink,#1c2033); border-radius:10px; padding:7px 13px; font:inherit; font-size:.76rem; font-weight:700; cursor:pointer;}
  .ka-search{margin:12px 16px 0;}
  .ka-search input{width:100%; padding:11px 14px; border-radius:12px; border:1.5px solid var(--glass-border,#0002); background:var(--glass-bg-strong,#fff8); color:var(--ink,#1c2033); font:inherit; font-size:.86rem;}
  .ka-results{display:flex; flex-direction:column; gap:4px; margin-top:6px; max-height:230px; overflow:auto;}
  .ka-res{display:flex; justify-content:space-between; gap:10px; text-align:start; padding:8px 12px; border-radius:10px; border:1px solid var(--glass-border,#0002); background:var(--glass-bg-strong,#fff8); color:var(--ink,#1c2033); font:inherit; font-size:.8rem; cursor:pointer;}
  .ka-res small{color:var(--ink-faint,#667); direction:ltr;}
  .ka-note{margin:12px 16px 4px; font-size:.7rem; color:var(--ink-faint,#667);}
  @media (min-width:900px){ .ka-stage{height:min(78vh,720px);} }`;

  const App = {mounted: false};
  let st = null;

  function displayName(p, lang) {
    const base = p[lang === 'en' ? 'en' : 'ar'] || p.ar;
    const S = STR[lang] || STR.ar;
    return base + (p.side > 0 ? S.sideL : p.side < 0 ? S.sideR : '');
  }
  function describe(p, lang) { return lang === 'en' ? (p.den || p.dar) : p.dar; }

  function buildScene() {
    SYS.forEach(k => { const g = new T.Group(); g.name = k; sysGroup[k] = g; });
    buildSkin(); buildSkeleton(); buildMuscles(); buildFaceRing(); buildOrgans(); buildVessels(); buildNerves();
    // centers (for labels and focusing)
    order.forEach(id => {
      const p = parts[id]; const box = new T.Box3();
      p.meshes.forEach(m => box.expandByObject(m));
      p.center = box.getCenter(new T.Vector3()); p.size = box.getSize(new T.Vector3());
    });
  }

  function mount(root, opts) {
    opts = opts || {};
    if (App.mounted) { App.setLang(opts.lang || st.lang); App.resume(); return App; }
    App.mounted = true;
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    st = {
      lang: opts.lang || 'ar', layers: Object.assign({}, DEFAULT_LAYERS), xray: false, labels: false, spin: false,
      selected: null, isolate: false, quiz: null, down: null, anim: null, running: true,
    };
    const S = () => STR[st.lang] || STR.ar;
    root.innerHTML = `<div class="ka">
      <div class="ka-stage" id="kaStage">
        <canvas id="kaCanvas"></canvas><div class="ka-labels" id="kaLabels"></div>
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

    const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 9.5, 31);
    const controls = new T.OrbitControls(camera, canvas);
    controls.target.set(0, 9.1, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 2.5; controls.maxDistance = 48; controls.update();
    scene.add(new T.HemisphereLight(0xffffff, 0x445066, 0.85));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(4, 6, 8); camera.add(key); scene.add(camera);
    const fill = new T.DirectionalLight(0x9db4ff, 0.35); fill.position.set(-6, 2, -4); scene.add(fill);

    // build after first paint so the loader shows
    setTimeout(() => {
      buildScene();
      SYS.forEach(k => scene.add(sysGroup[k]));
      refreshAll();
      $('kaLoad').style.opacity = '0'; setTimeout(() => { $('kaLoad').style.display = 'none'; }, 450);
      renderUI(); st.dirty = true;
    }, 30);

    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.dirty = true;
    }
    new ResizeObserver(resize).observe(stage); resize();

    // ---------- appearance
    function partOpacity(p, mesh) {
      let op = mesh.userData.baseOp;
      if (st.xray && p.sys !== 'skin') op = Math.min(op, 0.32);
      if (st.isolate && st.selected && st.selected !== p.id && p.sys !== 'skin') op = Math.min(op, 0.1);
      return op;
    }
    function refreshAll() {
      SYS.forEach(k => { sysGroup[k].visible = !!st.layers[k]; });
      skinMaterial.uniforms.uOp.value = st.xray ? 1.1 : 0.85;
      order.forEach(id => {
        const p = parts[id]; if (p.sys === 'skin') return;
        const sel = st.selected === id, hint = st.quiz && st.quiz.reveal === id;
        p.meshes.forEach(m => {
          const op = partOpacity(p, m);
          m.material.opacity = op; m.material.transparent = op < 1; m.material.depthWrite = op >= 0.5;
          m.material.emissive.setHex(sel ? 0x2b59ff : hint ? 0x16a34a : 0x000000);
          m.material.emissiveIntensity = sel || hint ? 0.7 : 0;
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
      order.forEach(id => { const p = parts[id]; if (p.sys === 'skin' || p.selectable === false || !st.layers[p.sys]) return; p.meshes.forEach(m => { if (m.material.opacity > 0.2) list.push(m); }); });
      const hits = ray.intersectObjects(list, false);
      if (!hits.length) return null;
      let hit = hits[0];
      // Lungs and diaphragm are see-through by design: when something solid lies
      // just behind them (the heart behind a lung, say), that is what was meant.
      if (hit.object.userData.baseOp < 0.7) {
        const inner = hits.find(h => h.object.userData.baseOp >= 0.7 && h.distance - hit.distance < 2.5 && parts[h.object.userData.part].sys === 'organs');
        if (inner) hit = inner;
      }
      return hit.object.userData.part;
    }
    canvas.addEventListener('pointerdown', e => { st.down = {x: e.clientX, y: e.clientY, t: Date.now()}; st.spin = false; syncTools(); });
    canvas.addEventListener('pointerup', e => {
      const d = st.down; st.down = null; if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || Date.now() - d.t > 600) return;
      const id = pick(e);
      if (st.quiz) { quizAnswer(id); return; }
      if (id) select(id, false); else if (st.selected) { select(null); }
    });
    controls.addEventListener('change', () => { st.dirty = true; });

    // ---------- selection / camera focus
    function focus(p) {
      const dist = Math.max(5, Math.min(26, Math.max(p.size.x, p.size.y, p.size.z) * 2.4 + 3));
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
      const t = controls.target.clone(); const d = 31;
      const tgt = {front: [0, 9.1, 0, 0, 9.5, d], back: [0, 9.1, 0, 0, 9.5, -d], left: [0, 9.1, 0, d, 9.5, 0], right: [0, 9.1, 0, -d, 9.5, 0],
        head: [0, 16.0, 0, 0, 16.2, 9], chest: [0, 12.4, 0, 0, 12.6, 12], belly: [0, 9.6, 0, 0, 9.8, 12]}[name];
      st.anim = {t: 0, fromT: t, toT: new T.Vector3(tgt[0], tgt[1], tgt[2]), fromP: camera.position.clone(), toP: new T.Vector3(tgt[3], tgt[4], tgt[5])};
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

    // ---------- quiz
    const quizPool = () => order.filter(id => parts[id].quiz && st.layers[parts[id].sys]);
    function quizNext() {
      const pool = quizPool().filter(id => id !== st.quiz.cur);
      if (!pool.length) { quizStop(); return; }
      st.quiz.cur = pool[Math.floor(Math.random() * pool.length)]; st.quiz.reveal = null; st.quiz.fb = '';
      renderQuiz(); refreshAll();
    }
    function quizStart() {
      st.selected = null; st.isolate = false; st.labels = false;
      st.quiz = {cur: null, score: 0, asked: 0, reveal: null, fb: ''};
      quizNext(); renderInfo(); syncTools();
    }
    function quizStop() { st.quiz = null; $('kaQuiz').classList.remove('show'); refreshAll(); renderInfo(); syncTools(); }
    function quizAnswer(id) {
      const q = st.quiz; if (!q || q.locked) return;
      const target = parts[q.cur];
      const okHit = id && (id === q.cur || (target.base && parts[id].base === target.base));
      q.asked++;
      if (okHit) { q.score++; q.fb = `<span class="fb ok">${S().ok}</span>`; }
      else { q.reveal = q.cur; q.fb = `<span class="fb no">${S().no}${esc(displayName(target, st.lang))}</span>`; focus(target); }
      q.locked = true; renderQuiz(); refreshAll();
      setTimeout(() => { if (st.quiz === q) { q.locked = false; quizNext(); } }, okHit ? 900 : 2200);
    }
    function renderQuiz() {
      const q = st.quiz, el = $('kaQuiz'); if (!q) { el.classList.remove('show'); return; }
      el.classList.add('show');
      el.innerHTML = `<div class="q">${S().ask}<b>${esc(displayName(parts[q.cur], st.lang))}</b> ${q.fb || ''}</div><div>${S().score}: ${q.score}/${q.asked}</div><button class="ka-btn" id="kaQuizStop">${S().quizStop}</button>`;
      el.querySelector('#kaQuizStop').onclick = quizStop;
    }

    // ---------- UI
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    function renderChips() {
      $('kaChips').innerHTML = SYS.map(k => `<button type="button" class="ka-chip ${st.layers[k] ? 'on' : ''}" style="--c:${SYS_COLOR[k]}" data-k="${k}"><i></i>${S().layers[k]}</button>`).join('');
      $('kaChips').querySelectorAll('.ka-chip').forEach(b => b.onclick = () => { const k = b.dataset.k; st.layers[k] = !st.layers[k]; if (st.selected && !st.layers[parts[st.selected].sys]) st.selected = null; refreshAll(); renderChips(); renderInfo(); });
    }
    function syncTools() {
      const tools = $('kaTools'), t2 = $('kaTools2');
      tools.innerHTML = `<button class="ka-btn ${st.xray ? 'on' : ''}" data-a="xray">${S().xray}</button>
        <button class="ka-btn ${st.labels ? 'on' : ''}" data-a="labels">${S().labels}</button>
        <button class="ka-btn ${st.spin ? 'on' : ''}" data-a="spin">${S().rotate}</button>
        <button class="ka-btn ${st.quiz ? 'on' : ''}" data-a="quiz">${st.quiz ? S().quizStop : S().quiz}</button>`;
      t2.innerHTML = `<button class="ka-btn" data-a="reset">${S().reset}</button>`;
      root.querySelectorAll('.ka-btn[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'xray') st.xray = !st.xray;
        else if (a === 'labels') st.labels = !st.labels;
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
        <h3>${esc(displayName(p, st.lang))}</h3><div class="la">${esc(p.la || p.en)}</div>
        <p>${esc(describe(p, st.lang))}</p>
        <div class="ka-row"><button class="ka-btn2" id="kaIso">${st.isolate ? S().showAll : S().isolate}</button><button class="ka-btn2" id="kaClose">${S().close}</button></div>`;
      el.querySelector('#kaIso').onclick = () => { st.isolate = !st.isolate; refreshAll(); renderInfo(); };
      el.querySelector('#kaClose').onclick = () => select(null);
    }
    // Arabic search that ignores the definite article, hamza forms and ta marbuta.
    const norm = x => String(x).toLowerCase().replace(/[\u064B-\u0652]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/(^|\s)ال/g, '$1').replace(/ال(?=\S)/g, '');
    const ALIAS = {heart_RA: 'القلب heart', heart_RV: 'القلب heart', heart_LA: 'القلب heart', heart_LV: 'القلب heart', lung_RU: 'الرئه الرئتين lung', lung_RM: 'الرئه الرئتين lung', lung_RL: 'الرئه الرئتين lung', lung_LU: 'الرئه الرئتين lung', lung_LL: 'الرئه الرئتين lung',
      cerebrum: 'الدماغ brain', cerebellum: 'الدماغ brain', brainstem: 'الدماغ brain', small_intestine: 'الامعاء الدقيقه intestine bowel', colon: 'الامعاء القولون intestine bowel', carpals: 'اليد hand', metacarpals: 'اليد hand', phalanges: 'اليد الاصابع hand fingers', tarsals: 'القدم foot', metatarsals: 'القدم foot', toes: 'القدم الاصابع foot'};
    function renderResults() {
      const q = norm($('kaSearch').value.trim()), box = $('kaResults');
      if (!q) { box.innerHTML = ''; return; }
      const hits = order.filter(id => { const p = parts[id]; if (p.selectable === false) return false; return norm(p.ar + ' ' + p.en + ' ' + p.la + ' ' + (ALIAS[id] || '')).includes(q); }).slice(0, 24);
      box.innerHTML = hits.map(id => `<button type="button" class="ka-res" data-id="${id}"><span>${esc(displayName(parts[id], st.lang))}</span><small>${esc(parts[id].la || parts[id].en)}</small></button>`).join('') || `<div class="item-meta">${S().noResults}</div>`;
      box.querySelectorAll('.ka-res').forEach(b => b.onclick = () => { select(b.dataset.id, true); $('kaSearch').value = ''; box.innerHTML = ''; window.scrollTo({top: stage.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth'}); });
    }
    function renderUI() {
      $('kaSearch').placeholder = S().search;
      $('kaNote').textContent = `${S().note} · ${order.filter(i => parts[i].selectable !== false).length} ${S().parts}`;
      renderChips(); renderViews(); syncTools(); renderInfo(); renderQuiz();
    }
    $('kaSearch').addEventListener('input', renderResults);
    renderUI();

    // ---------- loop
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function frame() {
      if (!st.running) return;
      requestAnimationFrame(frame);
      if (!stage.offsetParent) return;                  // hidden view: do no work
      let moved = false;
      if (st.anim) {
        const a = st.anim; a.t = Math.min(1, a.t + 0.045); const k = ease(a.t);
        controls.target.lerpVectors(a.fromT, a.toT, k); camera.position.lerpVectors(a.fromP, a.toP, k);
        if (a.t >= 1) st.anim = null; moved = true;
      }
      if (st.spin) { const off = camera.position.clone().sub(controls.target); off.applyAxisAngle(UP, 0.006); camera.position.copy(controls.target).add(off); moved = true; }
      if (controls.update() || moved || st.dirty) {
        renderer.render(scene, camera); updateLabels(); st.dirty = false;
      }
    }
    frame();

    App.setLang = function (lang) { st.lang = STR[lang] ? lang : 'ar'; $('kaLoad').textContent = S().loading; if (parts.skin) { renderUI(); renderResults(); st.dirty = true; } };
    App.pause = () => { st.running = false; };
    App.resume = () => { if (!st.running) { st.running = true; frame(); } st.dirty = true; resize(); };
    App.select = select;
    App.parts = parts;
    return App;
  }

  global.KiurAnatomy = {mount, pause: () => App.pause && App.pause(), setLang: l => App.setLang && App.setLang(l), _parts: parts};
})(window);
