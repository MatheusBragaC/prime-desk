import { execFile } from 'node:child_process'
import type { AgentNode, AgentTreeSnapshot } from '../shared/protocol.js'
import { agentBinary, agentEnv } from './agent-path.js'

/**
 * Árvore de agentes (root + descendentes RLM).
 *
 * Fonte: `prime-agent list --json`, que é a única superfície que expõe o vínculo
 * pai→filho. Campos relevantes confirmados empiricamente com um subagente real
 * (ver docs/MAPEAMENTO.md §9): `runtimeKind`, `rlmDepth`, `parentActiveSessionId`,
 * `sessionName`, `rlmChildId`, `spawnCode`, `taskState`, `activity`.
 *
 * O RPC não expõe isso; usamos a CLI em processo separado, de leitura apenas.
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

export async function getAgentTree(binary = agentBinary()): Promise<AgentTreeSnapshot> {
  const sessions = await runList(binary)
  const roots = buildTree(sessions)
  return {
    roots,
    total: sessions.length,
    subagents: sessions.filter((s) => s.runtimeKind === 'subagent').length,
    at: Date.now()
  }
}
