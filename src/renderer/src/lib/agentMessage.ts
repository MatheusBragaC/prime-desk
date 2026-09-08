import type { AgentNode, AgentTreeSnapshot } from '../../../shared/protocol'

/**
 * Reconhece um item de fila que veio de um subagente.
 *
 * O agente entrega esses itens como texto corrido — `Agent message received
 * from <quem>: <corpo>` — e a fila os mostrava crus, com o rótulo em inglês
 * ocupando o começo de cada linha e empurrando o conteúdo para fora da vista.
 *
 * O rótulo é constante conhecida do agente
 * (`AGENT_MESSAGE_RECEIVED_PREVIEW_LABEL` em `core/agent-messages.js`), e o
 * remetente é opcional porque nem toda entrega o inclui.
 */

const RECEIVED = /^Agent message received(?:\s+from\s+([^:]+?))?\s*:\s*/i

export interface QueueItem {
  /** Texto para exibir: sem o rótulo, quando ele existia. */
  body: string
  /** Quem mandou, se o agente informou. */
  from?: string
  /** Veio de um subagente, não de quem digitou. */
  fromAgent: boolean
}

export function parseQueueItem(text: string): QueueItem {
  const m = RECEIVED.exec(text)
  if (!m) return { body: text, fromAgent: false }

  const body = text.slice(m[0].length).trim()
  return {
    // Mensagem sem corpo mantém o texto original: melhor que mostrar vazio.
    body: body || text,
    ...(m[1] ? { from: m[1].trim() } : {}),
    fromAgent: true
  }
}

/**
 * Quantos SUBAGENTES estão trabalhando agora, na árvore inteira.
 *
 * `snapshot.subagents` conta todos os subagentes conhecidos, inclusive os que
 * já terminaram — para saber quem está ocupado é preciso descer nos nós.
 *
 * Nó `root` não entra na conta: é a própria conversa, e ela quase sempre está
 * `working` enquanto os subagentes rodam. Contá-la fazia o número estourar o
 * total (`3 de 3` com dois subagentes ocupados e um parado).
 */
export function countWorking(snapshot: AgentTreeSnapshot | null): number {
  if (!snapshot) return 0
  const walk = (nodes: AgentNode[]): number =>
    nodes.reduce(
      (n, node) =>
        n + (node.kind === 'subagent' && node.status === 'working' ? 1 : 0) + walk(node.children),
      0
    )
  return walk(snapshot.roots)
}
