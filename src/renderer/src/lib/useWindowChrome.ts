import { useEffect, useState } from 'react'
import { useWindowWidth, DOCK_MIN_WIDTH, SIDEBAR_MIN_WIDTH } from './useWindowWidth'

/**
 * Comportamentos que pertencem à janela, não à conversa.
 *
 * A sidebar deixa de ocupar coluna própria em janela estreita e passa a
 * sobrepor a conversa, como fazem os apps de chat em tela dividida.
 *
 * E bloqueia soltar arquivo fora do composer: sem isto o Electron navega para
 * o arquivo e a interface inteira é substituída pelo conteúdo dele — sem
 * caminho de volta a não ser recarregar.
 */

export interface WindowChrome {
  /** Sidebar sobreposta, com véu. */
  narrowSidebar: boolean
  /** Estreito demais para painel lateral e conversa juntos. */
  narrowDock: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean | ((v: boolean) => boolean)) => void
}

export function useWindowChrome(): WindowChrome {
  const width = useWindowWidth()
  const narrowSidebar = width < SIDEBAR_MIN_WIDTH
  const narrowDock = width < DOCK_MIN_WIDTH
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    setSidebarOpen(!narrowSidebar)
  }, [narrowSidebar])

  useEffect(() => {
    const block = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  return { narrowSidebar, narrowDock, sidebarOpen, setSidebarOpen }
}
