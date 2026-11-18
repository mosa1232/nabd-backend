import { useLayoutEffect } from 'react';

// The student app and the dashboard each ship their own stylesheet (they were
// two separate files and reuse class names). Only the stylesheet of the area
// being shown is in the document: it is added on mount and removed on leave.
export function useStyle(css) {
  useLayoutEffect(() => {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return () => el.remove();
  }, [css]);
}
