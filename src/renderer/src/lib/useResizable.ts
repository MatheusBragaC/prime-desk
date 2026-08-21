import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Largura de painel arrastável, persistida em localStorage.
 *
 * Layout é preferência puramente visual do renderer: não passa pelo main nem
 * pelo prime-agent. localStorage já é escopado por app no Electron.
 */
export interface Resizable {
  width: number
  /** `left` = o painel cresce arrastando para a direita (painel na esquerda). */
  onMouseDown: (e: React.MouseEvent) => void
  reset: () => void
  dragging: boolean
}

export function useResizable(
  key: string,
  defaultWidth: number,
  min: number,
  max: number,
  edge: 'right' | 'left' = 'right'
): Resizable {
  const storageKey = `prime-desk:width:${key}`

  const [width, setWidth] = useState<number>(() => {
    const raw = localStorage.getItem(storageKey)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : defaultWidth
  })
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, w: 0 })

  useEffect(() => {
    localStorage.setItem(storageKey, String(width))
  }, [storageKey, width])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      start.current = { x: e.clientX, w: width }
      setDragging(true)
    },
    [width]
  )

  useEffect(() => {
    if (!dragging) return

    function onMove(e: MouseEvent) {
      const delta = e.clientX - start.current.x
      const raw = edge === 'right' ? start.current.w + delta : start.current.w - delta
      setWidth(Math.min(max, Math.max(min, raw)))
    }
    function onUp() {
      setDragging(false)
    }

    // Sem isso o arraste seleciona texto e o cursor pisca entre elementos.
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [dragging, edge, min, max])

  const reset = useCallback(() => setWidth(defaultWidth), [defaultWidth])

  return { width, onMouseDown, reset, dragging }
}
