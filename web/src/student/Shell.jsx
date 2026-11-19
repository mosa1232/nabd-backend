import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp, initials } from '../lib/app.jsx';
import { apiFetch, mediaUrl } from '../lib/api.js';
import { Ic } from '../lib/icons.jsx';
// the floating assistant button loads after the screen, not before it
const AiFab = lazy(() => import('./pages/AI.jsx').then(m => ({ default: m.AiFab })));

// Which sidebar / bottom-nav item lights up for each page
const NAV = [
  { to: '/', key: 'navHome', icon: 'home', group: 'navGroupStudy', end: true },
  { to: '/bank', key: 'tileBank', icon: 'bank' },
  { to: '/anatomy', key: 'anatomyTitle', icon: 'anatomy' },
  { to: '/professors', key: 'tileProf', icon: 'prof' },
  { to: '/representative', key: 'tileRep', icon: 'user' },
  { to: '/store', key: 'tileStore', icon: 'store' },
  { to: '/review', key: 'tileReview', icon: 'review', group: 'navGroupRecord' },
  { to: '/leaderboard', key: 'tileLeaderboard', icon: 'trophy' },
  { to: '/ai', key: 'aiNavTitle', icon: 'ai' },
  { to: '/support', key: 'supportTitle', icon: 'chat' },
  { to: '/account', key: 'accountTitle', icon: 'user' },
];
const BOTTOM = [
  { to: '/', key: 'navHome', icon: 'home', end: true },
  { to: '/bank', key: 'tileBank', icon: 'bank' },
  { to: '/anatomy', key: 'anatomyShort', icon: 'anatomy' },
  { to: '/ai', key: 'aiNavTitle', icon: 'ai', cls: 'bn-ai' },
  { to: '/store', key: 'tileStore', icon: 'store' },
  { to: '/account', key: 'navAccount', icon: 'user' },
];

// the stylesheet keys a few phone layouts on the old view ids
function viewId(path) {
  if (path.startsWith('/quiz/')) return 'view-quiz';
  if (path.startsWith('/exam/')) return 'view-exam';
  if (/^\/ai\/.+/.test(path)) return 'view-ai-chat';
  if (path === '/support') return 'view-support';
  return 'view' + path.replace(/\//g, '-');
}

export default function Shell() {
  const { user, t, lang, setLang, dark, toggleTheme, logout, toasts } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [stage, setStage] = useState('');
  const [unread, setUnread] = useState(0);

  useEffect(() => { document.body.classList.toggle('sidebar-collapsed', collapsed); }, [collapsed]);
  useEffect(() => { document.body.classList.remove('auth-mode', 'landing-mode'); document.body.dataset.view = viewId(loc.pathname); }, [loc.pathname]);

  // the stage the student studies for, shown under the name
  useEffect(() => {
    let off = false;
    (async () => {
      if (user?.is_graduate) return setStage(t('graduated'));
      if (!user?.stage_id) return setStage('');
      try {
        const tree = await apiFetch('/api/catalog/tree');
        for (const s of tree) for (const u of s.universities) { const st = u.stages.find(x => x.id === user.stage_id); if (st && !off) setStage(st.name); }
      } catch { /* leave empty */ }
    })();
    return () => { off = true; };
  }, [user?.stage_id, user?.is_graduate, t]);

  useEffect(() => {
    let off = false;
    apiFetch('/api/me/notifications/unread-count').then(r => { if (!off) setUnread(r?.count ?? 0); }).catch(() => {});
    return () => { off = true; };
  }, [loc.pathname]);

  const cycleLang = () => setLang({ ar: 'en', en: 'ku', ku: 'ar' }[lang] || 'ar');
  const name = user?.full_name || t('navAccount');
  const avatar = user?.photo_url ? <img src={mediaUrl(user.photo_url)} alt={name} /> : initials(user?.full_name);
  let lastGroup = '';

  return (
    <>
      <div className="shell">
        <nav className="sidebar" id="sidebar">
          <div className="brand" style={{ padding: '0 6px 18px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img className="kiur-logo brand-mark" src="/static/brand/kiur-icon.svg" alt="Kiur" width="48" height="48" />
              <span className="brand-name display">Kiur</span>
            </div>
            <button className="sb-collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label={t('toggleSidebar')}><Ic n="back" sw={2.2} /></button>
          </div>
          {stage && <div className="sb-context" style={{ display: 'flex' }}><span className="sb-context-label">{t('studyingFor')}</span><span className="sb-context-value">{stage}</span></div>}
          {NAV.map(item => {
            const head = item.group && item.group !== lastGroup ? <div key={item.group} className="sb-group">{t(item.group)}</div> : null;
            if (item.group) lastGroup = item.group;
            return [head,
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => 'sb-item' + (isActive ? ' active' : '')}>
                <Ic n={item.icon} /><span>{t(item.key)}</span>
              </NavLink>];
          })}
          <div className="sb-group">{t('navGroupSoon')}</div>
          <button className="sb-item is-soon" aria-disabled="true" onClick={() => {}}><Ic n="play" /><span>{t('tileVideo')}</span><span className="soon-badge">Soon</span></button>
          <div style={{ flex: 1 }} />
          <div className="sb-foot">
            <button className="sb-profile" onClick={() => nav('/account')}>
              <span className="sb-profile-avatar">{avatar}</span>
              <span style={{ minWidth: 0 }}><span className="sb-profile-name">{name}</span><span className="sb-profile-stage" style={{ display: 'block' }}>{stage}</span></span>
            </button>
            <button className="sb-signout" onClick={async () => { await logout(); nav('/welcome'); }} aria-label={t('logout')} title={t('logout')}><Ic n="logout" /></button>
          </div>
        </nav>

        <div className="app">
          <div className="topbar">
            <div className="brand">
              <img className="kiur-logo brand-mark" src="/static/brand/kiur-icon.svg" alt="Kiur" width="48" height="48" />
              <span className="brand-name display">Kiur</span>
            </div>
            <div className="top-actions">
              <div className="lang-pills" role="group" aria-label="language">
                {['ar', 'ku', 'en'].map(l => <button key={l} className={'lang-pill' + (lang === l ? ' active' : '')} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
              </div>
              <button className="icon-btn ph-lang" aria-label="language" onClick={cycleLang}>{lang.toUpperCase()}</button>
              <button className="icon-btn" onClick={toggleTheme} aria-label="theme"><Ic n={dark ? 'moon' : 'sun'} /></button>
              <button className="icon-btn" onClick={() => nav('/support')} aria-label={t('supportTitle')}><Ic n="chat" /></button>
              <button className="icon-btn" onClick={() => nav('/notifications')} aria-label="notifications" style={{ position: 'relative' }}>
                <Ic n="bell" />
                {unread > 0 && <span style={{ position: 'absolute', top: 2, left: 2, background: 'var(--danger)', color: '#fff', fontSize: '.6rem', fontWeight: 700, minWidth: 15, height: 15, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{unread}</span>}
              </button>
            </div>
          </div>
          <Suspense fallback={<div className="view active"><div className="empty-row" style={{ marginTop: 60 }}>…</div></div>}><Outlet /></Suspense>
        </div>
      </div>

      <nav className="bottom-nav" id="bottomNav">
        {BOTTOM.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => 'bn-item ' + (item.cls || '') + (isActive ? ' active' : '')}>
            <Ic n={item.icon} /><span>{t(item.key)}</span>
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={null}><AiFab /></Suspense>
      <Toasts toasts={toasts} />
    </>
  );
}

export function Toasts({ toasts }) {
  return (
    <div id="toastStack" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none', width: '100%', maxWidth: 420, padding: '0 16px' }}>
      {toasts.map(x => <div key={x.id} style={{ pointerEvents: 'auto', background: 'var(--ink)', color: '#fff', padding: '12px 18px', borderRadius: 12, fontSize: '.85rem', boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '100%', textAlign: 'center' }}>{x.message}</div>)}
    </div>
  );
}
