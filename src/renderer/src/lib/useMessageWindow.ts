import { useEffect, useState } from 'react'
import type { UiMessage } from '@/store/agent'

/**
 * Janela de mensagens renderizadas.
 *
 * Conversas longas chegam a milhares de mensagens, e renderizar todas de uma vez
 * trava a troca de conversa: cada bloco reprocessa markdown e realce de sintaxe.
 * Mostramos as recentes e o resto sob demanda.
 */

/** Mensagens renderizadas por vez ao abrir uma conversa. */
export const PAGE_SIZE = 60

export interface MessageWindow {
  visible: readonly UiMessage[]
  /** Quantas ficaram para trás. `0` esconde o botão de carregar. */
  hidden: number
  loadOlder: () => void
}

export function useMessageWindow(
  messages: readonly UiMessage[],
  sessionId: string | undefined,
  loadingSession: boolean
): MessageWindow {
  const [count, setCount] = useState(PAGE_SIZE)

  // Ao trocar de conversa a janela volta ao tamanho padrão.
  useEffect(() => {
    setCount(PAGE_SIZE)
  }, [sessionId, loadingSession])

  const hidden = Math.max(0, messages.length - count)
  return {
    visible: hidden > 0 ? messages.slice(hidden) : messages,
    hidden,
    loadOlder: () => setCount((n) => n + PAGE_SIZE)
  }
}
