import { useEffect, useState } from 'react'

/**
 * Largura da janela, para decidir o que cabe na tela.
 *
 * Um MacBook de 13" com a janela em meia tela fica perto de 700px. Com sidebar
 * de 272px e um painel lateral aberto, sobra menos que o mínimo utilizável para
 * a conversa — daí o recolhimento automático.
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    let frame = 0
    const onResize = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setWidth(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return width
}

/** Abaixo disto, um painel lateral e a conversa não convivem. */
export const DOCK_MIN_WIDTH = 1040

/** Abaixo disto, a sidebar vira sobreposição em vez de coluna fixa. */
export const SIDEBAR_MIN_WIDTH = 820
