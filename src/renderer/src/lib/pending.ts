import type { UiMessage } from '../store/agent'

/**
 * A resposta ainda não apareceu na tela.
 *
 * Ou o assistente nem começou, ou já começou mas só tem blocos vazios — o
 * agente abre a mensagem antes de ter conteúdo. Nos dois casos a pessoa precisa
 * de um sinal no lugar onde a resposta vai surgir, senão o clique em enviar
 * parece não ter feito nada.
 */
export function awaitingFirstBlock(
  messages: readonly UiMessage[],
  streaming: boolean
): boolean {
  if (!streaming) return false

  const last = messages[messages.length - 1]
  if (!last || last.role === 'user') return true
  if (last.role !== 'assistant') return false

  return !last.content.some(
    (b) =>
      (b.type === 'text' && b.text.trim().length > 0) ||
      (b.type === 'thinking' && b.thinking.trim().length > 0) ||
      b.type === 'toolCall'
  )
}
