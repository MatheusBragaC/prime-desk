import type { AgentNode } from '@shared/protocol'

/**
 * Estado do agente, com FORMA própria — não só cor.
 *
 * A árvore desenhava três aparências para sete situações: spinner, check verde
 * e círculo cinza. No círculo cinza caíam "concluiu sem responder ao pai",
 * "encerrado" e "nunca começou", que são coisas diferentes com consequências
 * diferentes. E a distinção que existia era só de tom — `text-dim` contra
 * `text-grid`, dois cinzas vizinhos —, o que some para quem não distingue cor.
 *
 * Cada estado ganha um desenho que se reconhece em escala de cinza.
 */

export type EstadoVisual =
  | 'working'
  | 'done'
  | 'mute'
  | 'stale'
  | 'ended'
  | 'idle'
  | 'waiting'

const CIRCULO = 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0'

const FORMA: Record<EstadoVisual, { d: string; marca?: string; dash?: string; cor: string; gira?: boolean }> = {
  working: { d: 'M21 12a9 9 0 1 1-6.219-8.56', cor: 'text-primary', gira: true },
  done: { d: CIRCULO, marca: 'm8.4 12.2 2.5 2.5 4.7-5.2', cor: 'text-ok' },
  mute: { d: CIRCULO, marca: 'M8.5 12h7', cor: 'text-warn' },
  stale: {
    d: 'M10.3 4.3 2.6 17.5a1.9 1.9 0 0 0 1.7 2.9h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z',
    marca: 'M12 9.4v3.7M12 16.6h.01',
    cor: 'text-err'
  },
  ended: { d: CIRCULO, marca: 'm5.8 5.8 12.4 12.4', cor: 'text-grid' },
  idle: { d: CIRCULO, dash: '3 3.2', cor: 'text-dim' },
  waiting: { d: CIRCULO, marca: 'M8.5 12h.01M12 12h.01M15.5 12h.01', cor: 'text-info' }
}

/**
 * Traduz o nó para o estado visual.
 *
 * `done` do protocolo se abre em dois: responder ao pai é o que diferencia
 * "entregou" de "terminou e sumiu", e só o primeiro fecha o ciclo. A raiz não
 * responde a ninguém, então nunca cai em `mute`.
 */
export function estadoDe(node: AgentNode): EstadoVisual {
  if (node.taskState === 'needs_input') return 'waiting'
  if (node.status === 'working') return 'working'
  if (node.status === 'stale') return 'stale'
  if (node.status === 'ended') return 'ended'
  if (node.status === 'done') {
    if (node.kind === 'root' || node.replied) return 'done'
    return 'mute'
  }
  return 'idle'
}

export function StatusIcon({ estado, size = 14 }: { estado: EstadoVisual; size?: number }) {
  const f = FORMA[estado]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={'shrink-0 ' + f.cor + (f.gira ? ' animate-spin' : '')}
    >
      <path d={f.d} strokeDasharray={f.dash} />
      {f.marca && <path d={f.marca} />}
    </svg>
  )
}
