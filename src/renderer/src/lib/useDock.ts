import { useCallback, useEffect, useState } from 'react'
import type { Dock } from '../components/StatusBar'
import { useAgent } from '../store/agent'

/**
 * O painel lateral direito — qual está aberto e quem pode abri-lo.
 *
 * Slot único por decisão de layout: dois painéis simultâneos espremiam a
 * conversa a ponto de o composer ficar inutilizável em janela normal.
 *
 * Junta aqui tudo que decide esse slot, que estava espalhado em quatro efeitos
 * do App: o fechamento automático em janela estreita, o pedido de terminal, o
 * pedido de painel vindo de outro canto da interface, e o ritmo do poller da
 * árvore de agentes — que depende do que está na tela e por isso não podia
 * morar no main.
 */

/** Ritmo do poller da árvore, em ms. `0` desliga. */
const CADENCE_OPEN = 2000
const CADENCE_STREAMING = 8000

export interface DockState {
  dock: Dock
  open: (kind: Dock) => void
  /** Abre, ou fecha se já era esse. É o que os atalhos e a barra usam. */
  toggle: (kind: Dock) => void
  close: () => void
}

export function useDock(narrow: boolean, streaming: boolean): DockState {
  const [dock, setDock] = useState<Dock>(null)
  const terminalRequest = useAgent((s) => s.terminalRequest)
  const dockRequest = useAgent((s) => s.dockRequest)

  // Painel lateral e conversa não cabem juntos abaixo do limite.
  useEffect(() => {
    if (narrow) setDock(null)
  }, [narrow])

  /*
    Pedido de terminal (ex.: trocar de conta) precisa do painel na tela para que
    o TerminalPanel monte e consuma o recado.
  */
  useEffect(() => {
    if (terminalRequest) setDock('terminal')
  }, [terminalRequest])

  // Pedido de painel vindo de outro canto (ex.: a fila levando à árvore).
  useEffect(() => {
    if (!dockRequest) return
    setDock(dockRequest as Dock)
    useAgent.getState().clearDockRequest()
  }, [dockRequest])

  /*
    Ritmo da árvore de agentes, decidido aqui porque é aqui que se sabe o que
    está na tela. Cada ciclo custa um `prime-agent list` — 0,67s de CPU medidos —
    então parado ele fica desligado: nada muda quando nada roda.
  */
  useEffect(() => {
    const ms = dock === 'agents' ? CADENCE_OPEN : streaming ? CADENCE_STREAMING : 0
    void window.prime.setAgentCadence(ms)
  }, [dock, streaming])

  const open = useCallback((kind: Dock) => setDock(kind), [])
  const toggle = useCallback((kind: Dock) => setDock((d) => (d === kind ? null : kind)), [])
  const close = useCallback(() => setDock(null), [])

  return { dock, open, toggle, close }
}
