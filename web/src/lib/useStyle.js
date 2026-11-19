import { useLayoutEffect, useState } from 'react';

// The student app and the dashboard each ship their own stylesheet (they reuse class names), so only the
// stylesheet of the area on screen is in the document: added on mount, removed on leave.
//
// In the built app it is a real, cacheable CSS file linked in the page (downloaded and parsed in parallel with the
// scripts, then served from the phone's cache on every later visit); the dev server injects it as text instead.
// Returns true once the styles are applied, so an area never paints unstyled.
export function useAreaStyle(load) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let node = null; let off = false;
    load().then(m => {
      if (off) return;
      if (import.meta.env.PROD) {
        node = document.createElement('link'); node.rel = 'stylesheet'; node.href = m.default;
        node.onload = node.onerror = () => { if (!off) setReady(true); };
      } else {
        node = document.createElement('style'); node.textContent = m.default; setReady(true);
      }
      document.head.appendChild(node);
    });
    return () => { off = true; if (node) node.remove(); };
  }, []); // eslint-disable-line
  return ready;
}

// kept for any caller that already has the css text
export function useStyle(css) {
  useLayoutEffect(() => {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return () => el.remove();
  }, [css]);
}