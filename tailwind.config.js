/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // `rgb(var(--x-rgb) / <alpha-value>)` é o que habilita `bg-primary/15`.
      colors: {
        bg: 'rgb(var(--p-bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--p-surface-rgb) / <alpha-value>)',
        panel: 'rgb(var(--p-panel-rgb) / <alpha-value>)',
        fg: 'rgb(var(--p-fg-rgb) / <alpha-value>)',
        muted: 'rgb(var(--p-muted-rgb) / <alpha-value>)',
        dim: 'rgb(var(--p-dim-rgb) / <alpha-value>)',
        grid: 'rgb(var(--p-grid-rgb) / <alpha-value>)',
        primary: 'rgb(var(--p-primary-rgb) / <alpha-value>)',
        primarySoft: 'rgb(var(--p-primary-soft-rgb) / <alpha-value>)',
        ok: 'rgb(var(--p-success-rgb) / <alpha-value>)',
        warn: 'rgb(var(--p-warning-rgb) / <alpha-value>)',
        err: 'rgb(var(--p-error-rgb) / <alpha-value>)',
        info: 'rgb(var(--p-info-rgb) / <alpha-value>)',
        mint: 'rgb(var(--p-mint-rgb) / <alpha-value>)'
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
