import { useCallback, useEffect, useRef } from 'react'

/**
 * Zoom da interface, com o nível guardado entre sessões.
 *
 * O nível efetivo é o que o main devolve, não o que pedimos: ele aplica limites
 * próprios, e guardar o valor pedido faria a preferência divergir do que está na
 * tela depois de bater no teto.
 *
 * O nível fica em `ref`, não em `state`: os atalhos leem para calcular o
 * próximo passo, e um `state` aqui re-renderizaria a árvore inteira a cada
 * Ctrl+= sem nada na tela depender dele — o zoom é aplicado pelo Electron.
 */

const KEY = 'prime-desk:zoom'
const STEP = 0.5

export interface Zoom {
  /** Passo relativo ao nível atual (`+0.5`, `-0.5`). */
  step: (delta: number) => void
  reset: () => void
}

export function useZoom(): Zoom {
  const level = useRef(0)

  const apply = useCallback(async (next: number) => {
    const r = await window.prime.setZoom(next)
    if (!r?.ok) return
    level.current = r.level as number
    localStorage.setItem(KEY, String(r.level))
  }, [])

  // Restaura antes de a janela aparecer.
  useEffect(() => {
    const saved = Number(localStorage.getItem(KEY))
    if (Number.isFinite(saved) && saved !== 0) void apply(saved)
  }, [apply])

  const step = useCallback((delta: number) => void apply(level.current + delta), [apply])
  const reset = useCallback(() => void apply(0), [apply])

  return { step, reset }
}

export { STEP as ZOOM_STEP }
