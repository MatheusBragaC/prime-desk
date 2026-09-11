import { execFile } from 'node:child_process'
import type { AgentNode, AgentTreeSnapshot } from '../shared/protocol.js'
import { agentBinary, agentEnv } from './agent-path.js'
import { readDiskTree } from './agent-tree-disk.js'

/**
 * Árvore de agentes (root + descendentes RLM).
 *
 * Fonte: `prime-agent list --json`, que é a única superfície que expõe o vínculo
 * pai→filho. Campos relevantes confirmados empiricamente com um subagente real
 * (ver docs/MAPEAMENTO.md §9): `runtimeKind`, `rlmDepth`, `parentActiveSessionId`,
 * `sessionName`, `rlmChildId`, `spawnCode`, `taskState`, `activity`.
 *
 * O RPC não expõe isso; usamos a CLI em processo separado, de leitura apenas.
 *
 * **A CLI sozinha não bastava.** `list --json` pergunta ao daemon quais sessões
 * ele acompanha, e o prime-desk sobe cada conversa como `prime-agent --mode rpc`
 * solto, sem `--daemon-socket` — o daemon nunca fica sabendo que ela existe.
 * Medido ao vivo: cinco subagentes reais trabalhando e o comando devolvendo
 * `{"sessions": []}`. Por isso a árvore da conversa da tela vem do disco
 * (`agent-tree-disk.ts`) e as duas fontes são fundidas aqui.
 *
 * A CLI continua: ela é a única que vê sessão residente (agendamento,
 * heartbeat) e traz `taskState`/`activeSessionId` de verdade. Onde as duas
 * descrevem a mesma sessão, a do daemon ganha — é a mais rica.
 */

interface RawSession {
  id: string
  activeSessionId?: string
  sessionId?: string
  sessionName?: string
  sessionFile?: string
  runtimeKind?: string
  rlmDepth?: number
  parentActiveSessionId?: string
  rlmChildId?: string
  spawnCode?: string
  lifecycle?: string
  activity?: string
  taskState?: string
  workerState?: string
  repliedSinceTask?: boolean
  hasRunningRlmChildren?: boolean
  isStreaming?: boolean
  isRunningTools?: boolean
  messageCount?: number
  firstMessage?: string
  cwd?: string
  lastActivityAt?: string
  model?: { name?: string }
  /**
   * Confirmado no `dist/modes/daemon/daemon-session-list.js` do 0.9.3: vem de
   * `session.getOwnUsageSummary()` (residente) ou `session.usage` (persistido em
   * disco) — os dois passam por `sessionUsageSummaryFrom` em `core/usage.js`, que
   * devolve exatamente este formato ou `undefined` quando tudo é zero. Gasto
   * PRÓPRIO do nó, não soma dos filhos — quem soma é o renderer.
   */
  usage?: { inputTokens: number; outputTokens: number; cost: number }
}

const LIST_TIMEOUT_MS = 12_000

function runList(binary: string): Promise<RawSession[]> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      ['list', '--json'],
      { timeout: LIST_TIMEOUT_MS, maxBuffer: 12 * 1024 * 1024, env: agentEnv({ NO_COLOR: '1' }) },
      (err, stdout) => {
        if (err) return reject(err)
        try {
          const parsed = JSON.parse(stdout) as { sessions?: RawSession[] }
          resolve(parsed.sessions ?? [])
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      }
    )
  })
}

function toNode(raw: RawSession): AgentNode {
  const busy = Boolean(raw.isStreaming || raw.isRunningTools) || raw.activity === 'working'
  return {
    activeSessionId: raw.activeSessionId ?? raw.id,
    sessionId: raw.sessionId ?? '',
    sessionFile: raw.sessionFile ?? '',
    name: raw.sessionName ?? '',
    kind: raw.runtimeKind === 'subagent' ? 'subagent' : 'root',
    depth: raw.rlmDepth ?? 0,
    parentActiveSessionId: raw.parentActiveSessionId,
    rlmChildId: raw.rlmChildId,
    spawnCode: raw.spawnCode,
    status: busy ? 'working' : raw.lifecycle === 'live' ? 'idle' : 'done',
    taskState: raw.taskState ?? '',
    replied: Boolean(raw.repliedSinceTask),
    hasRunningChildren: Boolean(raw.hasRunningRlmChildren),
    messageCount: raw.messageCount ?? 0,
    firstMessage: raw.firstMessage ?? '',
    cwd: raw.cwd ?? '',
    modelName: raw.model?.name ?? '',
    lastActivityAt: raw.lastActivityAt ?? '',
    usage: raw.usage,
    source: 'daemon',
    children: []
  }
}

/** Monta a floresta. Nós órfãos (pai já encerrado) sobem para a raiz. */
export function buildTree(sessions: RawSession[]): AgentNode[] {
  const nodes = new Map<string, AgentNode>()
  for (const raw of sessions) {
    const node = toNode(raw)
    nodes.set(node.activeSessionId, node)
  }

  const roots: AgentNode[] = []
  for (const node of nodes.values()) {
    const parentId = node.parentActiveSessionId
    const parent = parentId ? nodes.get(parentId) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const byActivity = (a: AgentNode, b: AgentNode) =>
    (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')

  const sortDeep = (list: AgentNode[]) => {
    list.sort(byActivity)
    for (const n of list) sortDeep(n.children)
  }
  sortDeep(roots)
  return roots
}

export interface AgentTreeQuery {
  /** Sessão da ponte ativa. Sem ela, só a fonte do daemon é consultada. */
  rootSessionId?: string
  rootBusy?: boolean
  binary?: string
}

/** Conta nós da floresta inteira: o resumo do painel tem de bater com o que ele desenha. */
function tally(roots: AgentNode[]): { total: number; subagents: number } {
  let total = 0
  let subagents = 0
  const walk = (nodes: AgentNode[]): void => {
    for (const n of nodes) {
      total += 1
      if (n.kind === 'subagent') subagents += 1
      walk(n.children)
    }
  }
  walk(roots)
  return { total, subagents }
}

function collectIds(nodes: AgentNode[], into: Set<string>): void {
  for (const n of nodes) {
    if (n.sessionId) into.add(n.sessionId)
    collectIds(n.children, into)
  }
}

/**
 * Funde o nó lido do disco no nó equivalente do daemon.
 *
 * O daemon vence no que é dele: `taskState`, e o `activeSessionId` que o
 * `observe` exige. O disco entra com o que só ele tem — a tarefa encomendada,
 * o início, a última ferramenta — e com os FILHOS, que é o que mais importa:
 * `prime-agent list --json` só enxerga sessão residente, então o nó do daemon
 * costuma chegar com `children: []` mesmo havendo subagentes trabalhando.
 */
function fundir(daemon: AgentNode, disco: AgentNode): AgentNode {
  const porId = new Map<string, AgentNode>()
  for (const c of disco.children) if (c.sessionId) porId.set(c.sessionId, c)

  const filhos = daemon.children.map((c) => {
    const par = c.sessionId ? porId.get(c.sessionId) : undefined
    if (par) porId.delete(c.sessionId)
    return par ? fundir(c, par) : c
  })
  // O que o daemon não conhecia entra na ordem em que o disco listou.
  const somenteDisco = disco.children.filter((c) => !c.sessionId || porId.has(c.sessionId))
  const todos = [...filhos, ...somenteDisco]

  return {
    ...daemon,
    firstMessage: daemon.firstMessage || disco.firstMessage,
    startedAt: daemon.startedAt ?? disco.startedAt,
    lastTool: daemon.lastTool ?? disco.lastTool,
    toolCount: daemon.toolCount ?? disco.toolCount,
    spawnCode: daemon.spawnCode ?? disco.spawnCode,
    usage: daemon.usage ?? disco.usage,
    children: todos,
    hasRunningChildren: todos.some((c) => c.status === 'working' || c.hasRunningChildren)
  }
}

/** Aplica `fundir` no nó da floresta cujo `sessionId` bate. */
function fundirNaFloresta(nodes: AgentNode[], disco: AgentNode): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].sessionId && nodes[i].sessionId === disco.sessionId) {
      nodes[i] = fundir(nodes[i], disco)
      return true
    }
    if (fundirNaFloresta(nodes[i].children, disco)) {
      nodes[i] = {
        ...nodes[i],
        hasRunningChildren: nodes[i].children.some(
          (c) => c.status === 'working' || c.hasRunningChildren
        )
      }
      return true
    }
  }
  return false
}

export async function getAgentTree(query: AgentTreeQuery = {}): Promise<AgentTreeSnapshot> {
  const binary = query.binary ?? agentBinary()

  /*
    As duas fontes são independentes e uma não pode derrubar a outra: sem daemon
    de pé, `list` falha, e a árvore da conversa continua valendo. O caminho
    inverso também — daí `allSettled` em vez de `all`.
  */
  const [listed, fromDisk] = await Promise.allSettled([
    runList(binary),
    query.rootSessionId
      ? readDiskTree({ rootSessionId: query.rootSessionId, rootBusy: query.rootBusy })
      : Promise.resolve(null)
  ])

  const roots = listed.status === 'fulfilled' ? buildTree(listed.value) : []

  const diskRoot = fromDisk.status === 'fulfilled' ? fromDisk.value : null
  if (diskRoot) {
    /*
      Funde, não descarta.

      Antes: se o `sessionId` da raiz de disco aparecesse em QUALQUER nó do
      daemon, a árvore de disco inteira era jogada fora — filhos inclusive. E o
      nó do daemon chega sem filhos, porque `list --json` só vê sessão
      residente. O resultado era a árvore esvaziar justamente quando o daemon
      conhecia a conversa.
    */
    const known = new Set<string>()
    collectIds(roots, known)
    if (!known.has(diskRoot.sessionId)) roots.unshift(diskRoot)
    else fundirNaFloresta(roots, diskRoot)
  }

  /*
    Erro só quando NADA sobrou. Com a árvore do disco na mão, a falha do `list`
    é irrelevante para quem está olhando — e virar erro vermelho no painel seria
    ruído sobre uma informação que está correta.
  */
  if (roots.length === 0 && listed.status === 'rejected') throw listed.reason

  return { roots, ...tally(roots), at: Date.now() }
}
