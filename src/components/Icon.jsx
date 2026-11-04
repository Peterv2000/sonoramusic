/* ══════════════════════════════════════════════════════════════════════════
   Iconos SVG de Ritmo Music.

   Conjunto propio, estilo línea (stroke) moderna — parecido a Lucide /
   Material Symbols. Todos heredan el color con `currentColor` y el tamaño con
   la prop `size`, así que se ven bien en cualquier tema (claro/oscuro) y
   escalan sin pixelarse.

       <Icon name="home" />
       <Icon name="play" size={22} />

   Si necesitas el emoji clásico, usa `<Icon name="…" emoji />`.
   ══════════════════════════════════════════════════════════════════════════ */

/* Cada entrada es el contenido interno del <svg> (viewBox 24×24, stroke). */
const PATHS = {
  /* ── Navegación ── */
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  library:
    '<path d="M4 4v16"/><path d="M8 4v16"/><rect x="11.5" y="4" width="8.5" height="16" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  charts:
    '<path d="M4 19V9"/><path d="M9.3 19V5"/><path d="M14.7 19v-7"/><path d="M20 19v-11"/>',

  /* ── Biblioteca ── */
  heart:
    '<path d="M12 20S3.5 14.7 3.5 9.2A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.5 3.2C20.5 14.7 12 20 12 20Z"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  album:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3v6.6"/>',
  artist:
    '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  playlist:
    '<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h7"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M20 17.5V9"/>',
  download:
    '<path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 19h16"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.7 1.1-5.9-4.3-4.1 5.9-.8z"/>',

  /* ── Reproductor ── */
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  pause: '<rect x="7" y="5" width="3.6" height="14" rx="1"/><rect x="13.4" y="5" width="3.6" height="14" rx="1"/>',
  next: '<path d="M6 5.5v13l9-6.5z"/><path d="M17.5 5.5v13"/>',
  prev: '<path d="M18 5.5v13l-9-6.5z"/><path d="M6.5 5.5v13"/>',
  shuffle:
    '<path d="M4 7h3.2l2.4 3"/><path d="M4 17h3.2l8-10H19"/><path d="m16.5 4.5 2.5 2.5-2.5 2.5"/><path d="M13.2 14 15.6 17H19"/><path d="m16.5 14.5 2.5 2.5-2.5 2.5"/>',
  repeat: '<path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="m16 3.5 2.5 2.5L16 8.5"/><path d="M20 12v2.5A3.5 3.5 0 0 1 16.5 18H5"/><path d="m8 15.5-2.5 2.5L8 20.5"/>',
  repeatOne:
    '<path d="M4 12V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="m16 3.5 2.5 2.5L16 8.5"/><path d="M20 12v2.5A3.5 3.5 0 0 1 16.5 18H5"/><path d="m8 15.5-2.5 2.5L8 20.5"/><path d="M12 11v4"/>',
  volume: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15 8.5a5 5 0 0 1 0 7"/><path d="M17.6 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="m15 9.5 4.5 4.5"/><path d="m19.5 9.5-4.5 4.5"/>',
  queue:
    '<path d="M4 6h10"/><path d="M4 12h10"/><path d="M4 18h7"/><path d="M16 12.5 21 15l-5 2.5z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3z"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor" stroke="none"/>',
  lyrics:
    '<path d="M5 5h14"/><path d="M5 10h9"/><path d="M5 15h11"/><path d="M5 20h6"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  chevronUp: '<path d="m5 15 7-7 7 7"/>',
  fullscreen: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  fullscreenExit: '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>',
  rewind: '<path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4v4.2h4.2"/>',
  forward: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.2h-4.2"/>',
  close: '<path d="M6 6 18 18"/><path d="M18 6 6 18"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6.5 7l1 13h9l1-13"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  share:
    '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6"/><path d="m8.2 13.2 7.6 3.6"/>',
  more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  radio:
    '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4"/><path d="M16.2 16.2a6 6 0 0 0 0-8.4"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2"/><path d="M19.1 19.1a10 10 0 0 0 0-14.2"/>',
  sparkles:
    '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/><path d="M18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.2l1.9 1.1M17.9 15.7l1.9 1.1M4.2 16.8l1.9-1.1M17.9 8.3l1.9-1.1"/>',
  device:
    '<rect x="3" y="5" width="13" height="9" rx="1.6"/><path d="M7 17h7"/><rect x="17.5" y="12" width="4" height="8" rx="1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
  fire: '<path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.6.7-3 1.5-4C9 9.5 10 11 11 11c0-3 1-6 1-8Z"/>',
  link: '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  warning: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chart: '<path d="M4 19V9"/><path d="M9.3 19V5"/><path d="M14.7 19v-7"/><path d="M20 19v-11"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/>',
  micVocal: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5 1.5 5h-15S6 14 6 10Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  lightning: '<path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5z"/>',
  headphones:
    '<path d="M4 15v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="14" width="4.5" height="7" rx="2"/><rect x="17" y="14" width="4.5" height="7" rx="2"/>',
  cast: '<path d="M3 20h.01"/><path d="M3 16a5 5 0 0 1 5 5"/><path d="M3 12a9 9 0 0 1 9 9"/><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/>',
  equalizer: '<path d="M6 4v16"/><path d="M6 9h2.5"/><path d="M12 4v16"/><path d="M12 14h2.5"/><path d="M18 4v16"/><path d="M18 7h2.5"/>',
  wave: '<path d="M4 12h2l2-5 3 10 3-14 3 9h3"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14 6 4 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.8 2.3c-.8.4-1.3 1-1.3 1.9"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>',
  flag: '<path d="M5 21V4"/><path d="M5 5h10.5l-1.5 3 1.5 3H5"/>',
  pulse: '<path d="M3 12h3.5l2-5 3.5 10 2.5-7 1.5 2H21"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
};

/** Emoji de reserva para nombres sin icono SVG (compatibilidad). */
const EMOJI = {
  home: '🏠', explore: '🧭', library: '📚', search: '🔍', charts: '📈',
  heart: '❤️', history: '🕘', album: '💿', artist: '👤', music: '🎵',
  playlist: '🎵', play: '▶', pause: '⏸', next: '⏭', prev: '⏮',
  shuffle: '🔀', repeat: '🔁', repeatOne: '🔂', volume: '🔊', mute: '🔈',
  queue: '☰', video: '🎬', lyrics: '🎤', close: '✕', trash: '🗑',
  plus: '＋', star: '✦', radio: '📻', sparkles: '✨', moon: '😴',
};

export function Icon({ name, size = 20, emoji = false, className = '', ...rest }) {
  const d = PATHS[name];
  const cls = `icon ${className}`.trim();
  if (!d || emoji) {
    return <span className={cls} style={{ fontSize: size * 0.9 }} aria-hidden="true" {...rest}>{EMOJI[name] || '•'}</span>;
  }
  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <g dangerouslySetInnerHTML={{ __html: d }} />
    </svg>
  );
}

/** Comprueba si existe un icono SVG con ese nombre. */
export const hasIcon = (name) => Boolean(PATHS[name]);

export default Icon;
