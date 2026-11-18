import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/app.jsx';
import { apiFetch } from '../../lib/api.js';
import { Toasts } from '../Shell.jsx';
import { nextRouteFor } from './Auth.jsx';

const MARK_RING = <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="15" cy="15" r="10.5" strokeDasharray="0.6 3.6" /><circle cx="15" cy="15" r="5.6" strokeDasharray="0.6 3.2" /><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" /></svg>;
const MARK_RAYS = <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M15 3.5v5M15 21.5v5M3.5 15h5M21.5 15h5M6.9 6.9l3.5 3.5M19.6 19.6l3.5 3.5M23.1 6.9l-3.5 3.5M10.4 19.6l-3.5 3.5" /><circle cx="15" cy="15" r="3.6" /></svg>;
const MARK_WAVE = <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="15" cy="15" r="10.5" strokeDasharray="0.6 3.6" /><path d="M7 15h4l1.6-3.4 2.6 7 1.8-3.6H23" /></svg>;
const FLIP_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></svg>;
const LOCK_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
const KNOB = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>;
const glyph = d => <span className="glyph" aria-hidden="true"><svg viewBox="0 0 16 16">{d}</svg></span>;

const hexRgb = (hex, fallback) => {
  const h = (hex || '').trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  return /^[0-9a-f]{6}$/i.test(full) ? [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) : fallback;
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// One rAF for the whole page: dock magnification, pointer parallax and the ECG pulse canvas.
function useLandingEngine(rootRef, go) {
  const goRef = useRef(go); goRef.current = go;
  useEffect(() => {
    const root = rootRef.current; if (!root) return undefined;
    const hero = root.querySelector('#lpHero'), cv = root.querySelector('#lpPulse'), dockEl = root.querySelector('#lpDock'), bandEl = root.querySelector('#lpBand');
    const ctx = cv.getContext('2d');
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
    const FINE = matchMedia('(hover:hover) and (pointer:fine)');
    const LP = {
      running: true, raf: 0, W: 0, H: 0, dpr: 1, t0: performance.now(), last: 0,
      ptr: { x: -9999, y: -9999, cx: 0, cy: 0, moved: false }, sm: { x: 0, y: 0 }, lastPx: null, lastPy: null,
      bandY: 0, bandH: 180, motes: [], sprite: null, spawnAcc: 0, ptrAmt: 0, prevPtrX: null,
      dock: [...dockEl.querySelectorAll('[data-dock]')].map(el => ({ el, v: 0, target: 0 })), specAng: 2.4, specBr: 0,
      c: { a: [76, 95, 224], b: [123, 110, 246], dark: false },
    };
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      LP.c = { a: hexRgb(cs.getPropertyValue('--accent'), [76, 95, 224]), b: hexRgb(cs.getPropertyValue('--accent-2'), [123, 110, 246]), dark: document.documentElement.classList.contains('dark') };
      const sp = document.createElement('canvas'); sp.width = sp.height = 32;
      const g = sp.getContext('2d'); const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, rgba(LP.c.b, 1)); grad.addColorStop(.35, rgba(LP.c.b, .5)); grad.addColorStop(1, rgba(LP.c.b, 0));
      g.fillStyle = grad; g.fillRect(0, 0, 32, 32); LP.sprite = sp;
    };
    const beat = u => { const g = (c, w) => Math.exp(-(((u - c) / w) ** 2)); return -(g(.18, .035) * .12 - g(.30, .008) * .14 + g(.325, .010) - g(.35, .010) * .30 + g(.52, .05) * .22); };

    const draw = (t, dt) => {
      const { W, H } = LP; if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);
      const reduced = REDUCED.matches;
      const r0 = reduced ? 1 : Math.min(1, Math.max(0, (t - .45) / 1.9));
      const reveal = 1 - Math.pow(1 - r0, 3), revealX = reveal * (W + 40);
      const baseY = LP.bandY, A = LP.bandH * .46, period = Math.max(240, W * .24);
      const hr = hero.getBoundingClientRect();
      const px = LP.ptr.x - hr.left, py = LP.ptr.y - hr.top;
      const near = LP.ptr.x > -9000 && Math.abs(py - baseY) < LP.bandH * 1.3;
      LP.ptrAmt += ((near ? 1 : 0) - LP.ptrAmt) * (1 - Math.exp(-(dt || .016) * 5));
      const yAt = (x, phase, amp, drift) => {
        const u = (((x + phase) % period) + period) % period / period;
        const swell = 1 + .6 * LP.ptrAmt * Math.exp(-(((x - px) / 150) ** 2));
        return beat(u) * amp * swell + Math.sin(x * .004 + t * .35) * A * .10 * drift + Math.sin(x * .0113 - t * .2) * A * .05 * drift;
      };
      const scroll = reduced ? 0 : t * 34;
      ctx.beginPath();
      for (let x = 0; x <= Math.min(W, revealX); x += 3) {
        const y = baseY - LP.bandH * .42 + LP.sm.y * 6 + yAt(x + LP.sm.x * 22, period * .37 + scroll * .6, A * .5, 1);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = rgba(LP.c.a, .22); ctx.lineWidth = 1; ctx.stroke();

      const trail = W * .5, speed = Math.max(220, W * .19);
      const head = reduced ? W * .62 : ((t * speed) % (W + trail));
      const pts = [];
      for (let x = 0; x <= Math.min(W, revealX); x += 2) pts.push(x, baseY + yAt(x, scroll, A, 1));
      if (pts.length > 4) {
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        const floor = rgba(LP.c.a, .32), lit = rgba(LP.c.dark ? LP.c.b : LP.c.a, 1);
        const s0 = Math.min(1, Math.max(0, (head - trail) / W)), s1 = Math.min(1, Math.max(0, head / W));
        grad.addColorStop(0, floor);
        if (s0 > 0) grad.addColorStop(s0, floor);
        if (s1 > s0) grad.addColorStop(s1, lit);
        if (s1 < 1) grad.addColorStop(Math.min(1, s1 + .002), floor);
        grad.addColorStop(1, floor);
        const path = () => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); };
        ctx.save(); ctx.shadowColor = rgba(LP.c.b, .55); ctx.shadowBlur = 18;
        ctx.strokeStyle = grad; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; path(); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = grad; ctx.lineWidth = 1.1; path(); ctx.stroke();
        if (head <= Math.min(W, revealX)) {
          const hy = baseY + yAt(head, scroll, A, 1);
          const glow = ctx.createRadialGradient(head, hy, 0, head, hy, 28);
          glow.addColorStop(0, rgba(LP.c.b, .9)); glow.addColorStop(.25, rgba(LP.c.b, .35)); glow.addColorStop(1, rgba(LP.c.b, 0));
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(head, hy, 28, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (reduced) return;
      const cap = W < 900 ? 70 : 150;
      LP.spawnAcc += dt * (W < 900 ? 14 : 30);
      while (LP.spawnAcc > 1 && LP.motes.length < cap) {
        LP.spawnAcc -= 1;
        LP.motes.push({ x: Math.random() * W, y: H * (.35 + Math.random() * .75), vx: (Math.random() - .5) * 8, vy: -(6 + Math.random() * 18), life: 0, max: 4 + Math.random() * 6, s: 3 + Math.pow(Math.random(), 2.2) * 9, ph: Math.random() * 6.28 });
      }
      if (LP.spawnAcc > 1) LP.spawnAcc = 1;
      if (LP.ptrAmt > .2 && px > 0 && px < W) {
        const moved = LP.prevPtrX === null ? 0 : Math.abs(px - LP.prevPtrX);
        const n = Math.min(6, Math.floor(moved / 9));
        for (let k = 0; k < n && LP.motes.length < cap + 60; k++) {
          const mx = px + (Math.random() - .5) * 30;
          LP.motes.push({ x: mx, y: baseY + yAt(mx, scroll, A, 1), vx: (Math.random() - .5) * 40, vy: -(20 + Math.random() * 50), life: 0, max: 1.2 + Math.random(), s: 5 + Math.random() * 7, ph: Math.random() * 6.28 });
        }
      }
      LP.prevPtrX = LP.ptrAmt > .2 ? px : null;
      ctx.globalCompositeOperation = LP.c.dark ? 'lighter' : 'source-over';
      for (let i = LP.motes.length - 1; i >= 0; i--) {
        const m = LP.motes[i]; m.life += dt;
        if (m.life > m.max) { LP.motes.splice(i, 1); continue; }
        m.x += (m.vx + Math.sin(t * .8 + m.ph) * 6) * dt; m.y += m.vy * dt;
        const u = m.life / m.max;
        const a = Math.min(1, u * 8) * (1 - u) * (.55 + .45 * Math.sin(t * 1.7 + m.ph * 3)) * .55;
        if (a <= 0) continue;
        ctx.globalAlpha = a; ctx.drawImage(LP.sprite, m.x - m.s, m.y - m.s, m.s * 2, m.s * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    };

    const resize = () => {
      const w = hero.clientWidth, h = hero.clientHeight;
      LP.dpr = Math.min(devicePixelRatio || 1, w < 900 ? 1.25 : 1.6); LP.W = w; LP.H = h;
      cv.width = Math.max(1, Math.round(w * LP.dpr)); cv.height = Math.max(1, Math.round(h * LP.dpr));
      ctx.setTransform(LP.dpr, 0, 0, LP.dpr, 0, 0);
      const band = bandEl.getBoundingClientRect(), hr = hero.getBoundingClientRect();
      LP.bandH = Math.max(120, band.height); LP.bandY = band.top - hr.top + band.height * 0.5;
      if (REDUCED.matches && LP.running) draw(99, 0);
    };

    const dockStep = dt => {
      if (!FINE.matches || innerWidth <= 900) return;
      const { x, y } = LP.ptr, dr = dockEl.getBoundingClientRect();
      const catching = x > dr.left - 48 && x < dr.right + 48 && y > dr.top - 44 && y < dr.bottom + 104;
      for (const d of LP.dock) {
        if (LP.ptr.moved) {
          if (catching) { const r = d.el.getBoundingClientRect(); const p = Math.max(0, 1 - Math.abs(x - (r.left + r.width / 2)) / 128); d.target = p * p * (3 - 2 * p); } else d.target = 0;
        }
        const nv = d.v + (d.target - d.v) * (1 - Math.exp(-dt * 14));
        d.v = Math.abs(d.target - nv) < .002 ? d.target : nv;
        d.el.style.setProperty('--m', d.v.toFixed(3));
        d.el.dataset.near = d.target > .08 ? 'true' : 'false';
      }
      const cx = dr.left + dr.width / 2, cy = dr.top + dr.height / 2;
      const dx = Math.max(dr.left - x, 0, x - dr.right), dy = Math.max(dr.top - y, 0, y - dr.bottom);
      const dist = Math.hypot(dx, dy), tAng = Math.atan2(cy - y, x - cx);
      const raw = Math.max(0, 1 - dist / 260), tBr = raw * raw * (3 - 2 * raw);
      const diff = ((tAng - LP.specAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      LP.specAng += diff * (1 - Math.exp(-dt * 8)); LP.specBr += (tBr - LP.specBr) * (1 - Math.exp(-dt * 9));
      dockEl.style.setProperty('--spec-angle', LP.specAng.toFixed(4) + 'rad');
      dockEl.style.setProperty('--spec-bright', (LP.specBr * .92).toFixed(3));
    };

    const frame = now => {
      if (!LP.running) return;
      LP.raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = LP.last ? Math.min((now - LP.last) / 1000, .05) : .016; LP.last = now;
      const t = (now - LP.t0) / 1000;
      LP.sm.x += (LP.ptr.cx - LP.sm.x) * .055; LP.sm.y += (LP.ptr.cy - LP.sm.y) * .055;
      const nx = Math.round(LP.sm.x * 1000) / 1000, ny = Math.round(LP.sm.y * 1000) / 1000;
      if (nx !== LP.lastPx || ny !== LP.lastPy) { LP.lastPx = nx; LP.lastPy = ny; root.style.setProperty('--px', nx); root.style.setProperty('--py', ny); }
      dockStep(dt); LP.ptr.moved = false; draw(t, dt);
    };

    readColors();
    const mo = new MutationObserver(() => { readColors(); if (REDUCED.matches && LP.running) draw(99, 0); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const ro = new ResizeObserver(resize); ro.observe(hero);

    const onClick = e => {
      const el = e.target.closest('[data-go]'); if (!el) return;
      const g = el.dataset.go;
      if (g === 'login' || g === 'register') return goRef.current(g);
      const target = g === 'top' ? hero : root.querySelector('#' + g);
      if (!target || target.hidden) return;
      LP.dock.forEach(d => d.el.classList.toggle('is-active', d.el.dataset.section === target.id));
      target.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });
    };
    root.addEventListener('click', onClick);
    const onMove = e => {
      if (e.pointerType === 'touch') return;
      LP.ptr.x = e.clientX; LP.ptr.y = e.clientY; LP.ptr.moved = true;
      LP.ptr.cx = (e.clientX / innerWidth) * 2 - 1; LP.ptr.cy = (e.clientY / innerHeight) * 2 - 1;
    };
    const onLeave = () => { LP.ptr.x = LP.ptr.y = -9999; LP.ptr.cx = LP.ptr.cy = 0; LP.ptr.moved = true; };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    // liquid buttons: the sheen follows the pointer, a press throws a ripple
    const liquidOff = [...root.querySelectorAll('[data-liquid]')].map(btn => {
      const mv = e => { const r = btn.getBoundingClientRect(); btn.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%'); btn.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%'); };
      const dn = e => {
        if (REDUCED.matches) return;
        const r = btn.getBoundingClientRect(), ring = document.createElement('span');
        ring.className = 'lp-ripple'; ring.style.left = (e.clientX - r.left) + 'px'; ring.style.top = (e.clientY - r.top) + 'px';
        btn.appendChild(ring); setTimeout(() => ring.remove(), 950);
      };
      btn.addEventListener('pointermove', mv); btn.addEventListener('pointerdown', dn);
      return () => { btn.removeEventListener('pointermove', mv); btn.removeEventListener('pointerdown', dn); };
    });

    const io = new IntersectionObserver(entries => {
      for (const en of entries) { if (en.isIntersecting) LP.dock.forEach(d => d.el.classList.toggle('is-active', d.el.dataset.section === en.target.id)); }
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['lpHero', 'lpFeatures', 'lpPearls', 'lpSummer'].forEach(id => { const el = root.querySelector('#' + id); if (el) io.observe(el); });

    // replay the entrance every time the landing is shown
    root.classList.remove('lp-ready', 'lp-intro-done');
    void root.offsetHeight;
    let introTimer = 0;
    const r1 = requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.add('lp-ready');
      introTimer = setTimeout(() => root.classList.add('lp-intro-done'), REDUCED.matches ? 0 : 2900);
    }));
    resize();
    if (REDUCED.matches) draw(99, 0); else LP.raf = requestAnimationFrame(frame);

    return () => {
      LP.running = false; cancelAnimationFrame(LP.raf); cancelAnimationFrame(r1); clearTimeout(introTimer);
      mo.disconnect(); ro.disconnect(); io.disconnect();
      root.removeEventListener('click', onClick); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
      liquidOff.forEach(f => f());
    };
  }, [rootRef]);
}

export function Landing() {
  const { t, user, booted, toasts } = useApp();
  const nav = useNavigate();
  const rootRef = useRef(null);
  const [stats, setStats] = useState([]);
  const [pearls, setPearls] = useState(null);       // null = unknown / none
  const [flipped, setFlipped] = useState({});

  useEffect(() => {
    document.body.classList.add('auth-mode', 'landing-mode'); window.scrollTo(0, 0);
    return () => document.body.classList.remove('auth-mode', 'landing-mode');
  }, []);
  useEffect(() => {
    apiFetch('/api/public/stats').then(st => setStats([['questions', 'lpStatQuestions', MARK_RING], ['professors', 'lpStatProfessors', MARK_RAYS], ['lectures', 'lpStatLectures', MARK_WAVE]].filter(([k]) => Number(st[k]) > 0).map(([k, l, m]) => ({ k, l, m, n: Number(st[k]) })))).catch(() => setStats([]));
    apiFetch('/api/pearls/preview?limit=3').then(rows => setPearls(rows.length ? rows : null)).catch(() => setPearls(null));
  }, []);
  useLandingEngine(rootRef, g => nav(g === 'register' ? '/register' : '/login'));

  if (booted && user) return <Navigate to={nextRouteFor(user)} replace />;
  const note = pearls && pearls[0];
  const toggle = i => setFlipped(f => ({ ...f, [i]: !f[i] }));
  const gate = (extra) => ({ 'data-go': extra });
  const feature = (icon, title, desc) => (
    <button className="lp-feature" data-go="login">
      <figure className="lp-plate"><span className="lp-lock">{LOCK_ICON}<span>{t('locked')}</span></span><span className="lp-plate-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{icon}</svg></span></figure>
      <h3>{t(title)}</h3><p>{t(desc)}</p><span className="lp-knob" aria-hidden="true">{KNOB}</span>
    </button>
  );
  return (
    <>
      <div className="view active">
        <div className="lp" id="lpRoot" ref={rootRef}>
          <div className="lp-dock-wrap">
            <nav className="lp-dock" id="lpDock" aria-label="Kiur">
              <button className="lp-dock-item lp-dock-mark" data-dock data-go="top" aria-label="Kiur"><img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="" width="48" height="48" /></button>
              <button className="lp-dock-item is-active" data-dock data-go="top" data-section="lpHero">{glyph(<><path d="M2.5 7.4 8 2.8l5.5 4.6" /><path d="M4 6.6v6.6h8V6.6" /></>)}<span>{t('navHome')}</span></button>
              <button className="lp-dock-item" data-dock data-go="lpFeatures" data-section="lpFeatures">{glyph(<><path d="M3 12.6V3.9a1 1 0 0 1 1-1h8.4v9.7" /><path d="M4.2 14.2a1.2 1.2 0 0 1 0-2.4h8.2" /></>)}<span>{t('lpNavFeatures')}</span></button>
              <button className="lp-dock-item" data-dock data-go="lpPearls" data-section="lpPearls" hidden={!pearls}>{glyph(<><path d="M4 2.4h5.3L12 5.1v8.5H4z" /><path d="M9.2 2.4V5h2.7" /><path d="M5.9 9.4h1.4l.8-1.8 1.1 3.2.7-1.4h.9" /></>)}<span>{t('pearlsTitle')}</span></button>
              <button className="lp-dock-item" data-dock data-go="lpSummer" data-section="lpSummer">{glyph(<><circle cx="8" cy="8" r="2.6" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" /></>)}<span>{t('summerTitle')}</span></button>
              <button className="lp-dock-item lp-dock-enter" data-dock data-go="login">{glyph(<><path d="M9.4 2.5H4.3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h5.1" /><path d="M13.4 8H6.8" /><path d="m9 5.6-2.4 2.4L9 10.4" /></>)}<span>{t('landingSignIn')}</span></button>
            </nav>
          </div>

          <section className="lp-hero" id="lpHero">
            <canvas className="lp-pulse" id="lpPulse" aria-hidden="true" />
            <div className="lp-guides lp-fade" style={{ '--d': '900ms' }} aria-hidden="true"><i /><i /><i /></div>
            <div className="lp-ghost lp-fade" style={{ '--d': '1150ms' }} aria-hidden="true">KIUR</div>
            <div className="lp-stage">
              <div className="lp-copy">
                <h1 className="lp-headline lp-par" style={{ '--pd': 16, '--pr': 1.1 }}>
                  <span><i style={{ '--d': '260ms' }}>{t('lpHeadA')}</i></span>
                  <span><i style={{ '--d': '360ms' }}>{t('lpHeadB')}</i></span>
                </h1>
                <p className="lp-lede lp-reveal lp-par" style={{ '--d': '480ms', '--pd': 12, '--pr': 1 }}>{t('lpLede')}</p>
                <div className="lp-cta-row lp-reveal lp-par" style={{ '--d': '600ms', '--pd': 14, '--pr': 1.2, '--mr': '999px' }}>
                  <button className="lp-liquid" data-liquid data-go="register">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
                    <span>{t('landingSignUp')}</span>
                  </button>
                  <button className="lp-orb" data-liquid data-go="login" aria-label={t('landingSignIn')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M3 12h11" /><path d="m10 8 4 4-4 4" /></svg>
                  </button>
                </div>
              </div>
              <div className="lp-cards">
                <dl className="lp-stats lp-reveal lp-par" id="lpStats" style={{ '--d': '700ms', '--pd': 12 }} hidden={!stats.length}>
                  {stats.map(s => <div className="lp-stat" key={s.k}><span className="lp-stat-mark" aria-hidden="true">{s.m}</span><div><dt>{t(s.l)}</dt><dd>{s.n.toLocaleString('en-US')}</dd></div></div>)}
                </dl>
                <div className="lp-band" id="lpBand" aria-hidden="true" />
                <article className="lp-card lp-card--about lp-reveal lp-par" style={{ '--d': '760ms', '--pd': 10, '--pr': 2.2, '--pd2': '920ms' }}>
                  <figure className="lp-plate"><svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <defs>
                      <filter id="lpGlow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                      <radialGradient id="lpPlateLight" cx="30%" cy="100%" r="80%"><stop offset="0" stopColor="#ffffff" stopOpacity=".22" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
                      <pattern id="lpDots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ffffff" fillOpacity=".12" /></pattern>
                    </defs>
                    <rect width="320" height="150" fill="url(#lpDots)" /><rect width="320" height="150" fill="url(#lpPlateLight)" />
                    <path className="trace-far" d="M0 60 H70 L78 54 L86 60 H120 L128 44 L136 72 L142 60 H200 L214 50 L226 60 H320" />
                    <path className="trace" d="M-4 96 H46 C52 96 54 88 60 88 S66 96 72 96 H96 L102 104 L112 34 L122 118 L130 96 H158 C168 96 172 80 184 80 S198 96 208 96 H236 L242 104 L252 40 L262 116 L270 96 H324" />
                  </svg></figure>
                  <p className="lp-label">{t('lpEthosLabel')}</p>
                  <h2>{t('lpEthosTitle')}</h2>
                  <button className="lp-knob" data-go="lpFeatures" aria-label={t('lpNavFeatures')}>{KNOB}</button>
                </article>
                <article className="lp-card lp-card--note lp-reveal lp-par" style={{ '--d': '880ms', '--pd': 20, '--pr': 2.4, '--pd2': '1080ms' }}>
                  <p className="lp-label">{note ? t('lpNoteLabel') + (note.tag ? ' · ' + note.tag : '') : t('pearlsTitle')}</p>
                  <h2 dir="auto">{note ? note.title : t('lpNoteFallback')}</h2>
                  <figure className="lp-plate"><svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <rect width="320" height="150" fill="url(#lpDots)" /><rect width="320" height="150" fill="url(#lpPlateLight)" transform="translate(320 0) scale(-1 1)" />
                    <path className="trace-far" d="M0 104 H90 L100 96 L108 104 H170 L180 90 L190 116 L198 104 H320" />
                    <path className="trace" d="M-4 78 H30 L38 84 L50 22 L62 110 L70 78 H104 C116 78 120 62 134 62 S150 78 162 78 H190 L196 86 L208 30 L220 104 L228 78 H262 C272 78 276 66 286 66 S298 78 306 78 H324" />
                  </svg></figure>
                  <button className="lp-knob" {...gate(note ? 'lpPearls' : 'login')} aria-label={t('pearlsTitle')}>{KNOB}</button>
                </article>
              </div>
            </div>
            <button className="lp-scroll lp-reveal" style={{ '--d': '1040ms' }} data-go="lpFeatures"><span>{t('lpDiscover')}</span><span className="track" /></button>
          </section>

          <div className="lp-sections">
            <section className="lp-section" id="lpFeatures">
              <p className="lp-eyebrow">{t('lpNavFeatures')}</p>
              <h2 className="lp-h">{t('landingWaitingTitle')}</h2>
              <p className="lp-sub">{t('lpFeaturesSub')}</p>
              <div className="lp-grid">
                {feature(<><path d="M4 19.5V6a2 2 0 0 1 2-2h13v15" /><path d="M6 22a2 2 0 0 1 0-4h14" /><path d="M9.5 8.5a1.8 1.8 0 1 1 2.6 1.6c-.7.4-1.1.9-1.1 1.7" /><path d="M11 14.3h.01" /></>, 'tileBank', 'landingBankDesc')}
                {feature(<><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5-6-3.5Z" /></>, 'tileVideo', 'landingVideoDesc')}
                {feature(<><path d="M22 9 12 5 2 9l10 4 10-4Z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></>, 'tileProf', 'landingProfDesc')}
                {feature(<><circle cx="12" cy="4.5" r="2.2" /><path d="M12 7.5v6M7 9.5l5 1.2 5-1.2M12 13.5l-3.5 7M12 13.5l3.5 7" /></>, 'anatomyTitle', 'lpAnatomyDesc')}
              </div>
            </section>

            {/* real case titles only: the diagnosis never reaches the browser before sign-in */}
            <section className="lp-section" id="lpPearls" hidden={!pearls}>
              <p className="lp-eyebrow">{t('lpPearlsEyebrow')}</p>
              <h2 className="lp-h">{t('pearlsTitle')}</h2>
              <p className="lp-sub">{t('lpPearlsSub')}</p>
              <div className="lp-grid pearl-flip-grid">
                {(pearls || []).map((p, i) => (
                  <div key={p.id || i} className={'pearl-flip' + (flipped[i] ? ' flipped' : '')} role="button" tabIndex={0} aria-label={p.title} onClick={() => toggle(i)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(i); } }}>
                    <div className="pearl-flip-inner">
                      <div className="pearl-flip-face pearl-flip-front">{p.tag ? <span className="pearl-flip-tag">{p.tag}</span> : null}<p className="pearl-flip-title" dir="auto">{p.title}</p><span className="pearl-flip-hint">{FLIP_ICON}{t('pearlFlipHint')}</span></div>
                      <div className="pearl-flip-face pearl-flip-back"><span className="pearl-flip-lock">{LOCK_ICON}</span><p className="pearl-flip-title">{t('pearlsGateCta')}</p><button className="pearl-flip-cta" data-go="login">{t('landingSignIn')}</button></div>
                    </div>
                  </div>))}
              </div>
            </section>

            <section className="lp-section" id="lpSummer">
              <p className="lp-eyebrow">{t('summerTitle')}</p>
              <div className="lp-summer" aria-disabled="true">
                <span className="lp-summer-lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
                <div><h3>{t('summerLockedTitle')}</h3><p>{t('summerLockedBody')}</p></div>
                <div className="lp-summer-side"><span className="lp-soon">{t('comingSoon')}</span><span className="lp-status"><svg viewBox="0 0 24 24"><path d="M12 7v5l3 3" /><circle cx="12" cy="12" r="9" /></svg><span>{t('notAvailableYet')}</span></span></div>
              </div>
            </section>

            <section className="lp-section" id="lpHow">
              <p className="lp-eyebrow">{t('lpHowEyebrow')}</p>
              <h2 className="lp-h">{t('lpHowTitle')}</h2>
              <p className="lp-sub">{t('lpHowSub')}</p>
              <div className="lp-steps">
                {[1, 2, 3].map(n => <div className="lp-step" key={n}><b>{n}</b><h3>{t('lpStep' + n + 'T')}</h3><p>{t('lpStep' + n + 'B')}</p></div>)}
              </div>
            </section>

            <section className="lp-section" id="lpFaq">
              <p className="lp-eyebrow">{t('lpFaqEyebrow')}</p>
              <h2 className="lp-h">{t('lpFaqTitle')}</h2>
              <div className="lp-faq">
                {[1, 2, 3, 4].map(n => <details key={n}><summary><span>{t('lpFaq' + n + 'Q')}</span></summary><p>{t('lpFaq' + n + 'A')}</p></details>)}
              </div>
              <div className="lp-final">
                <h2>{t('lpFinalTitle')}</h2><p>{t('lpFinalSub')}</p>
                <button className="btn" data-go="register">{t('createAccount')}</button>
              </div>
            </section>

            <footer className="lp-foot">
              <span className="lp-foot-mark"><img className="kiur-logo" src="/static/brand/kiur-icon.svg" alt="" width="48" height="48" />Kiur</span>
              <span>{t('footerNote')}</span>
              <span className="lp-contact"><span>{t('lpSupportLine')}</span> <a href="mailto:support@kiur.online">support@kiur.online</a></span>
            </footer>
          </div>
        </div>
      </div>
      <Toasts toasts={toasts} />
    </>
  );
}
