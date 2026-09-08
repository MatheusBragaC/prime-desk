import { useEffect } from 'react'
import type { Dock } from '../components/StatusBar'
import { useAgent, abortTurn } from '../store/agent'
import type { Zoom } from './useZoom'
import { ZOOM_STEP } from './useZoom'

/**
 * Atalhos de teclado da janela.
 *
 * Um `keydown` só: um ouvinte por atalho multiplicaria os registros e a ordem
 * entre eles passaria a importar.
 *
 * As tabelas abaixo preservam uma assimetria que já existia: Shift é *exigido*
 * em F/D/S e *ignorado* em B, K e crase — ou seja, Ctrl+Shift+B abre a árvore
 * do mesmo jeito. Não é elegante, mas é o que as pessoas já têm no dedo, e um
 * refactor não é lugar para mudar atalho.
 */

/** Shift indiferente. Crase é onde VS Code e Claude Desktop põem o terminal. */
const DOCK_KEYS: Record<string, Dock> = { b: 'agents', '`': 'terminal' }
/** Shift obrigatório. */
const DOCK_KEYS_SHIFT: Record<string, Dock> = { f: 'files', d: 'diff', s: 'schedules' }

export interface Shortcuts {
  onPalette: () => void
  onDock: (kind: Dock) => void
  zoom: Zoom
}

export function useAppShortcuts({ onPalette, onDock, zoom }: Shortcuts): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Fora de qualquer modificador: interromper o turno em andamento.
      if (e.key === 'Escape' && useAgent.getState().state?.isStreaming) void abortTurn()

      if (!e.ctrlKey && !e.metaKey) return
      const key = e.key.toLowerCase()

      const dock = DOCK_KEYS[key] ?? (e.shiftKey ? DOCK_KEYS_SHIFT[key] : undefined)
      if (dock) {
        e.preventDefault()
        onDock(dock)
        return
      }

      if (key === 'k') {
        e.preventDefault()
        onPalette()
        return
      }

      // Zoom. `=` cobre o Ctrl+= sem Shift, comum em teclado ABNT.
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoom.step(ZOOM_STEP)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoom.step(-ZOOM_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        zoom.reset()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPalette, onDock, zoom])
}
