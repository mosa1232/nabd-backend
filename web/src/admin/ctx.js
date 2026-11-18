import { createContext, useContext } from 'react';

// What every dashboard section can use: the signed-in user, their permissions,
// the dialogs, and the request context (which account / subject / doctor name).
export const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);
export const can = (ctx, perm) => ctx.perms.has(perm);
