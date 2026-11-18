import { setHeaderHook } from '../lib/api.js';

// Request context of the dashboard. It lives outside React state on purpose:
// every API call reads it at call time, so a section that just changed the
// subject / doctor-name / "view as" account is always talking to the right one.
export const ax = {
  subject: '',        // X-Subject-Id: the subject a doctor / representative / the platform works in
  teacher: '',        // X-Teacher-Id: a representative publishing under a doctor's name
  viewAs: '',         // X-View-As: the account whose dashboard the owner/admin is opening
};

export function installHeaders() {
  setHeaderHook((path) => {
    const h = {};
    if (path.startsWith('/api/professors/')) {
      if (ax.subject) h['X-Subject-Id'] = ax.subject;
      if (ax.teacher && !path.startsWith('/api/professors/me/teachers')) h['X-Teacher-Id'] = ax.teacher;
    }
    if (ax.viewAs && !path.startsWith('/api/admin/') && !path.startsWith('/auth/')) h['X-View-As'] = ax.viewAs;
    return h;
  });
}
export function clearHeaders() { setHeaderHook(null); ax.subject = ax.teacher = ax.viewAs = ''; }
