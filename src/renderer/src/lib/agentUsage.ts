import type { AgentNode, AgentTreeSnapshot } from '../../../shared/protocol'

/**
 * Soma o gasto de uma árvore de agentes.
 *
 * O dado já vinha do `prime-agent list --json` — `usage: { inputTokens,
 * outputTokens, cost }` por sessão — mas a travessia do main descartava o
 * campo, e a árvore nunca mostrou quanto um subagente custou. Num turno como o
 * do incidente do Gnexum, com três subagentes rodando, isso era exatamente a
 * pergunta sem resposta: quanto cada um pesou.
 *
 * `usage` é o gasto PRÓPRIO do nó, não a soma dos filhos — por isso soma-se
 * aqui, não no main.
 */
export interface TreeUsage {
  inputTokens: number
  outputTokens: number
  cost: number
}

function walk(nodes: readonly AgentNode[], acc: TreeUsage): boolean {
  let found = false
  for (const node of nodes) {
    if (node.usage) {
      found = true
      acc.inputTokens += node.usage.inputTokens
      acc.outputTokens += node.usage.outputTokens
      acc.cost += node.usage.cost
    }
    if (walk(node.children, acc)) found = true
  }
  return found
}

/**
 * `null` quando NENHUM nó relatou uso — versão do prime-agent sem o campo, ou
 * árvore vazia. Ausência de dado não é o mesmo que gasto zero: mostrar "$0.00"
 * quando na verdade não se sabe seria pior que não mostrar nada.
 */
export function sumTreeUsage(snapshot: AgentTreeSnapshot | null): TreeUsage | null {
  if (!snapshot) return null
  const acc: TreeUsage = { inputTokens: 0, outputTokens: 0, cost: 0 }
  return walk(snapshot.roots, acc) ? acc : null
}
