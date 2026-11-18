// Line icons (24x24, same paths as the original app).
const P = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  bank: <><path d="M4 19.5V6a2 2 0 0 1 2-2h13v15" /><path d="M6 22a2 2 0 0 1 0-4h14" /></>,
  bankQ: <><path d="M4 19.5V6a2 2 0 0 1 2-2h13v15" /><path d="M6 22a2 2 0 0 1 0-4h14" /><path d="M9.5 8.5a1.8 1.8 0 1 1 2.6 1.6c-.7.4-1.1.9-1.1 1.7" /><circle cx="11" cy="14.3" r=".1" fill="currentColor" /></>,
  anatomy: <><circle cx="12" cy="4.5" r="2.2" /><path d="M12 7.5v6M7 9.5l5 1.2 5-1.2M12 13.5l-3.5 7M12 13.5l3.5 7" /></>,
  prof: <><path d="M22 9 12 5 2 9l10 4 10-4Z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></>,
  store: <><path d="M6 8V6a4 4 0 0 1 4 -4h0a4 4 0 0 1 4 4v2" /><rect x="4" y="8" width="16" height="13" rx="2" /></>,
  review: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" /></>,
  ai: <><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5-6-3.5Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  back: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  check: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>,
  flame: <><path d="M12 2c2 4-1 5-1 8a4 4 0 0 0 8 0c0-1-1-2-1-2 1 3-1 4-2 4a2 2 0 0 1-2-2c0-2 3-3 1-8Z" /><path d="M8 14a4 4 0 0 0 4 8 5 5 0 0 0 5-5" /></>,
  flag: <path d="M16 3H8a2 2 0 0 0-2 2v16l6-3 6 3V5a2 2 0 0 0-2-2Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  pdf: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></>,
  heart: <path d="M12 20.5S4 15.8 4 10.2A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 2.2c0 5.6-8 10.3-8 10.3Z" />,
  warn: <><path d="M12 8v5" /><circle cx="12" cy="16.5" r=".9" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="9" /></>,
  shield: <><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3Z" /><path d="m9.5 12 2 2 4-4" /></>,
};

export function Ic({ n, size, color, sw = 2, style, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ ...(size ? { width: size, height: size } : null), ...style }} aria-hidden="true">
      {P[n]}
    </svg>
  );
}

// raw inner markup of a few icons, for places that need a string
export const SEC_ICON = {
  booklet: P.bank,
  lecture: P.play,
  general: <><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /></>,
  all: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
};
export function SecIcon({ kind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{SEC_ICON[kind] || SEC_ICON.all}</svg>;
}
