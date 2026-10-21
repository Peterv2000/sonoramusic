/* Logo de Ritmo Music: círculo con degradado + forma de onda (SVG, escala a
   cualquier tamaño y respeta el color de acento del tema). */
export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      className={`logo ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Ritmo Music"
    >
      <defs>
        <linearGradient id="ritmoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--red, #ff0033)" />
          <stop offset="1" stopColor="var(--accent, #ff4d6d)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill="url(#ritmoGrad)" />
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d="M13 24v0" />
        <path d="M18 18v12" />
        <path d="M24 12v24" />
        <path d="M30 16v16" />
        <path d="M35 21v6" />
      </g>
    </svg>
  );
}
