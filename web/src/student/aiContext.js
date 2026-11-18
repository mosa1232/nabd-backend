// What the student is looking at, handed to the floating assistant as context
// (never as an instruction). The quiz page fills it in; the panel reads it.
let ctx = '';
export const aiPage = { get: () => ctx, set: v => { ctx = v || ''; } };
