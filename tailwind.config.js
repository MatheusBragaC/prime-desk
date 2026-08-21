/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--p-bg)',
        surface: 'var(--p-surface)',
        panel: 'var(--p-panel)',
        fg: 'var(--p-fg)',
        muted: 'var(--p-muted)',
        dim: 'var(--p-dim)',
        grid: 'var(--p-grid)',
        primary: 'var(--p-primary)',
        primarySoft: 'var(--p-primary-soft)',
        ok: 'var(--p-success)',
        warn: 'var(--p-warning)',
        err: 'var(--p-error)',
        info: 'var(--p-info)',
        mint: 'var(--p-mint)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        'pulse-soft': { '0%,100%': { opacity: '0.45' }, '50%': { opacity: '1' } }
      },
      animation: {
        'fade-up': 'fade-up .28s cubic-bezier(.2,.8,.2,1) both',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
