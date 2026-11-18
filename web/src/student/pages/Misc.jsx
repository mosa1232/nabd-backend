import { useApp } from '../../lib/app.jsx';
import { apiFetch } from '../../lib/api.js';
import { PageHead } from './Bank.jsx';
import { useLoad, Empty } from '../ui.jsx';

const FLIP_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></svg>;

// The case on the front, its answer on the back — read the case, think, then turn it over.
function Pearl({ p }) {
  const { t } = useApp();
  const tag = p.tag ? <span className="pearl-flip-tag">{p.tag}</span> : null;
  const toggle = e => e.currentTarget.classList.toggle('flipped');
  return (
    <div className="pearl-flip" role="button" tabIndex={0} aria-label={p.title} onClick={toggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } }}>
      <div className="pearl-flip-inner">
        <div className="pearl-flip-face pearl-flip-front">{tag}<p className="pearl-flip-title" dir="auto">{p.title}</p><span className="pearl-flip-hint">{FLIP_ICON}{t('pearlFlipHintAnswer')}</span></div>
        <div className="pearl-flip-face pearl-flip-back">{tag}<p className="pearl-flip-body" dir="auto">{p.body}</p></div>
      </div>
    </div>
  );
}

export function Pearls() {
  const { t } = useApp();
  const [rows] = useLoad(() => apiFetch('/api/pearls'), []);
  return (
    <div className="view active">
      <PageHead title={t('pearlsTitle')} sub={t('pearlsSub')} back="/" />
      <div className={rows && rows.length ? 'pearl-flip-grid' : 'item-list'}>
        {rows === undefined ? <Empty>{t('loading')}</Empty> : rows === null ? <Empty>{t('pearlsLoadFailed')}</Empty> : !rows.length ? <Empty>{t('noPearlsYet')}</Empty> : rows.map(p => <Pearl key={p.id} p={p} />)}
      </div>
    </div>
  );
}

const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
export function Summer() {
  const { t } = useApp();
  const [rows] = useLoad(() => apiFetch('/api/summer-trainings'), []);
  return (
    <div className="view active">
      <PageHead title={t('summerTitle')} sub={t('summerSub')} back="/" />
      <div className="item-list">
        {rows === undefined ? <Empty>{t('loading')}</Empty> : rows === null ? <Empty>{t('pearlsLoadFailed')}</Empty> : !rows.length ? <Empty>{t('noSummerYet')}</Empty> : rows.map(s => {
          const dates = [s.starts_on, s.ends_on].filter(Boolean).join(' → ');
          const url = safeUrl(s.apply_url);
          return (
            <div className="glass" key={s.id} style={{ padding: '16px 18px', display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 800 }} dir="auto">{s.title}</div>
              {s.location ? <div className="item-meta">📍 {s.location}</div> : null}
              {dates ? <div className="item-meta">🗓 {dates}</div> : null}
              {s.description ? <div style={{ fontSize: '.86rem', lineHeight: 1.8, whiteSpace: 'pre-line' }} dir="auto">{s.description}</div> : null}
              {url ? <a className="btn" style={{ justifySelf: 'start', marginTop: 4 }} href={url} target="_blank" rel="noopener noreferrer">{t('summerApply')}</a> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
