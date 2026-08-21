/**
 * Marca Prime — borboleta.
 *
 * Reconstrução vetorial: `assets/brand/prime-butterfly.svg` não é distribuído no
 * pacote npm, então a referência foi o ASCII pré-renderizado em
 * `dist/themes/prime-logo.js` (PRIME_BUTTERFLY_LOGO) — quatro asas com o eixo
 * maior na diagonal e corpo central fino.
 */
export function Butterfly({ size = 28, className = '' }: { size?: number; className?: string }) {
  const gid = `pbf-grad-${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Prime"
    >
      <defs>
        <linearGradient id={gid} x1="10" y1="54" x2="54" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--p-primary)" />
          <stop offset="1" stopColor="var(--p-primary-soft)" />
        </linearGradient>
      </defs>

      {/* asa superior direita */}
      <path
        d="M33.2 29.5C37.5 21 45 12.5 56.5 6.5C58 18.5 50.5 27.5 38.5 32.2C35.5 33.3 32.3 32.2 33.2 29.5Z"
        fill={`url(#${gid})`}
      />
      {/* asa superior esquerda */}
      <path
        d="M30.8 29.5C26.5 21 19 12.5 7.5 6.5C6 18.5 13.5 27.5 25.5 32.2C28.5 33.3 31.7 32.2 30.8 29.5Z"
        fill={`url(#${gid})`}
        opacity="0.9"
      />
      {/* asa inferior direita */}
      <path
        d="M33.8 34.4C38.6 37.2 44.6 42 48.6 49C42.6 53 35.8 50 33.8 43C33.1 40.2 33 36.6 33.8 34.4Z"
        fill={`url(#${gid})`}
        opacity="0.85"
      />
      {/* asa inferior esquerda */}
      <path
        d="M30.2 34.4C25.4 37.2 19.4 42 15.4 49C21.4 53 28.2 50 30.2 43C30.9 40.2 31 36.6 30.2 34.4Z"
        fill={`url(#${gid})`}
        opacity="0.75"
      />

      {/* corpo */}
      <path
        d="M32 24.2C33.5 24.2 34.3 25.7 34.1 27.7L33.3 41.4C33.2 43 32.7 43.8 32 43.8C31.3 43.8 30.8 43 30.7 41.4L29.9 27.7C29.7 25.7 30.5 24.2 32 24.2Z"
        fill="var(--p-fg)"
        opacity="0.88"
      />
      <circle cx="32" cy="22.2" r="2.2" fill="var(--p-fg)" opacity="0.88" />
      {/* antenas */}
      <path
        d="M31 20.6C29.6 18.2 27.4 16.4 24.6 15.4M33 20.6C34.4 18.2 36.6 16.4 39.4 15.4"
        stroke="var(--p-fg)"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  )
}
