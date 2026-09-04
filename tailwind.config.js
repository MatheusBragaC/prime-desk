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
        elevated: 'rgb(var(--p-elevated-rgb) / <alpha-value>)',
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
      /*
        Escala de sete degraus. Antes eram 21 tamanhos arbitrários
        (`text-[12.6px]` e parentes), o que impedia qualquer ritmo vertical.
      */
      fontSize: {
        micro: ['10.5px', { lineHeight: '1.4' }],
        xs: ['11.5px', { lineHeight: '1.45' }],
        sm: ['13px', { lineHeight: '1.5' }],
        base: ['15px', { lineHeight: '1.68' }],
        lg: ['18px', { lineHeight: '1.4' }],
        xl: ['24px', { lineHeight: '1.25' }],
        display: ['30px', { lineHeight: '1.15' }]
      },
      fontFamily: {
        display: ['Newsreader Variable', 'Georgia', 'serif'],
        sans: ['Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      /*
        Raios semânticos, somados aos do Tailwind: `card` para blocos de conteúdo,
        `field` para campos e menus, `composer` para a caixa de entrada.
      */
      borderRadius: {
        card: '12px',
        field: '16px',
        composer: '24px'
      },
      maxWidth: {
        col: 'var(--col)'
      },
      /*
        Camadas nomeadas. Antes os valores eram literais espalhados pelos
        componentes, e a mesma classe de UI aparecia em dois níveis: os
        dropdowns do ModelPicker ficavam em z-40 enquanto todos os outros
        estavam em z-50, então eles renderizavam por baixo dos irmãos. Com nome,
        errar a camada vira erro de vocabulário, não de aritmética.

        Ordem: cromo < véu < painel < dropdown < modal < aviso. O aviso fica no
        topo porque costuma reportar erro do que está embaixo dele.
      */
      zIndex: {
        chrome: '20',
        scrim: '30',
        panel: '40',
        dropdown: '50',
        modal: '60',
        toast: '70'
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        'pulse-soft': { '0%,100%': { opacity: '0.45' }, '50%': { opacity: '1' } }
      },
      animation: {
        'fade-up': 'fade-up .16s cubic-bezier(.2,.8,.2,1) both',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
