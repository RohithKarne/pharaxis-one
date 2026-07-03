/**
 * Icon — a single consistent line-icon set for CP Portal.
 * Replaces emoji (which render differently per OS/device) with stroke SVGs that
 * inherit `currentColor`. Usage: <Icon name="shield" size={18} />
 */

const PATHS = {
  grid:      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  building:  '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  palette:   '<path d="M12 21a9 9 0 1 1 9-9c0 2-2 3-4 3h-1a2 2 0 0 0-1 3.5A2 2 0 0 1 12 21Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  sliders:   '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
  gate:      '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  message:   '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.8A8 8 0 1 1 21 12Z"/><path d="M8.5 11h7M8.5 14h4"/>',
  file:      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  news:      '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  shield:    '<path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6Z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
  folder:    '<path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  users:     '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c0-2.5-1.4-4.2-3.5-4.8"/>',
  help:      '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2.2-2.6 3.7"/><circle cx="12" cy="17" r="0.6"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  lock:      '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  form:      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  mail:      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  inbox:     '<path d="M4 13h4l1.5 3h5L20 13"/><path d="M4 13 6 5h12l2 8v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  link:      '<path d="M9 15l6-6M10.5 6.5 12 5a4 4 0 0 1 6 6l-1.5 1.5M13.5 17.5 12 19a4 4 0 0 1-6-6l1.5-1.5"/>',
  list:      '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  chart:     '<path d="M4 20V4M4 20h16M8 20v-5M13 20V9M18 20v-8"/>',
  key:       '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M17 4l2 2M14 7l2 2"/>',
  user:      '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
  send:      '<path d="M22 3 11 14M22 3l-7 18-4-7-7-4Z"/>',
  calendar:  '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>',
  check:     '<path d="m5 12 5 5L20 6"/>',
  clock:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  external:  '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  beaker:    '<path d="M9 3h6M10 3v5.5L5.2 17a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L14 8.5V3"/><path d="M7.5 14h9"/>',
  pill:      '<path d="M10.5 3.5a4.95 4.95 0 0 1 7 7l-7 7a4.95 4.95 0 0 1-7-7Z"/><path d="m7 7 7 7"/>',
  book:      '<path d="M5 4a2 2 0 0 1 2-2h11v16H7a2 2 0 0 0-2 2Z"/><path d="M5 20a2 2 0 0 1 2-2h11"/>',
}

export default function Icon({ name, size = 18, stroke = 1.7, className = '', style }) {
  const inner = PATHS[name] || PATHS.grid
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}
