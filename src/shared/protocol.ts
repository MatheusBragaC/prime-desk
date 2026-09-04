/**
 * Tipos do protocolo RPC do prime-agent.
 * Derivados por inspeção de docs/rpc.md + smoke test real (ver docs/MAPEAMENTO.md).
 */

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const THINKING_LEVELS: ThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
]

export interface ModelCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ModelInfo {
  id: string
  name: string
  api: string
  provider: string
  reasoning?: boolean
  input?: string[]
  cost?: ModelCost
  contextWindow?: number
  maxTokens?: number
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

/**
 * Ocupação atual da janela de contexto, calculada pelo próprio agente.
 *
 * Não confundir com o consumo acumulado da sessão (`Usage`/`totals`): aqui o
 * número é o `totalTokens` da ÚLTIMA resposta do assistente, que é o tamanho
 * real do prompt no momento — sobe e desce. O agente aplica a mesma conta em
 * `calculateContextTokens` (core/compaction/compaction.js).
 */
export interface ContextUsage {
  /**
   * Tokens estimados na janela. `null` logo depois de compactar, enquanto não
   * houver resposta nova: o agente prefere admitir que não sabe a devolver o
   * número pré-compactação, que estaria errado.
   */
  tokens: number | null
  contextWindow: number
  /** Percentual da janela; `null` quando `tokens` é desconhecido. */
  percent: number | null
}

/** Resposta de `get_session_stats`. */
export interface SessionStats {
  sessionFile?: string
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  cost: number
  contextUsage?: ContextUsage
}

/** Blocos de conteúdo de uma mensagem. */
export type ContentBlock =
  | { type: 'text'; text: string; index?: number }
  | { type: 'thinking'; thinking: string; thinkingSignature?: string; index?: number }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown>; partialJson?: string; index?: number }
  | { type: 'image'; data: string; mimeType: string }

export interface AgentMessage {
  role: 'user' | 'assistant' | 'toolResult' | 'custom' | 'bashExecution'
  content: ContentBlock[] | string
  timestamp?: number
  model?: string
  provider?: string
  usage?: Usage
  stopReason?: string
}

export interface ToolResult {
  content?: { type: string; text?: string }[]
  details?: {
    durationMs?: number
    status?: string
    stdout?: string
    stderr?: string
    kernelRestarted?: boolean
  }
  isError?: boolean
}

export type QueueMode = 'all' | 'one-at-a-time'

/** Como uma mensagem entra quando o agente está ocupado. */
export type DeliveryBehavior = 'steer' | 'followUp'

/**
 * Fila de mensagens da sessão.
 *
 * `steering` e `followUps` são os TEXTOS já enfileirados — e já expandidos pelo
 * agente (skills e templates resolvidos), então não são o que a pessoa digitou.
 * Estavam tipados como `unknown[]` aqui, o que escondia que dá para exibi-los.
 *
 * Não há comando RPC para remover ou reordenar item: dá para enfileirar e ler.
 */
export interface SessionActions {
  /** Conta ações, não mensagens: não derive de `steering.length + followUps.length`. */
  queuedCount: number
  steering: readonly string[]
  followUps: readonly string[]
  /** O que está em curso agora. Ausente quando o agente está ocioso. */
  active?: {
    kind: 'turn' | 'session_command'
    phase: 'preparing' | 'committing' | 'running'
    label?: string
  }
}

// ------------------------------------------------- agendamentos e heartbeats

export type AgentCronJobStatus = 'active' | 'paused' | 'completed' | 'cancelled'
export type AgentCronScheduleKind = 'once' | 'cron' | 'interval'
export type AgentCronJobSource = 'cron' | 'heartbeat' | 'rlm_heartbeat'

/** `steer` interrompe o turno em andamento; `follow_up` espera terminar. */
export type AgentHeartbeatDeliveryMode = 'steer' | 'follow_up'

export interface AgentCronSchedule {
  kind: AgentCronScheduleKind
  expression: string
  intervalMs?: number
}

/**
 * Prompt agendado. Serve tanto para agendamento comum quanto para heartbeat —
 * o que os separa é o `source`.
 *
 * `list_schedules` é filtrado por sessão no servidor: são os jobs da conversa
 * aberta, não uma visão global.
 */
export interface AgentCronJob {
  id: string
  status: AgentCronJobStatus
  source?: AgentCronJobSource
  deliveryMode?: AgentHeartbeatDeliveryMode
  activeSessionId: string
  sessionId: string
  sessionFile: string
  cwd: string
  label?: string
  prompt: string
  schedule: AgentCronSchedule
  createdAt: string
  updatedAt: string
  nextRunAt?: string
  lastRunAt?: string
  lastSkippedAt?: string
  lastError?: string
  runCount: number
}

export interface GoalState {
  active: boolean
  status: string
  tokensUsed: number
  timeUsedSeconds: number
  continuationsUsed: number
  objective?: string
  tokenBudget?: number
}

export interface AgentState {
  model: ModelInfo
  thinkingLevel: ThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: QueueMode
  followUpMode: QueueMode
  sessionId: string
  /** Nome de exibição definido via `set_session_name`; ausente se não houver. */
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  sessionActions: SessionActions
  goal: GoalState
}

/** Eventos emitidos pelo agente em stdout. */
export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AgentMessage }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_end'; message: AgentMessage }
  | { type: 'message_update'; message: AgentMessage; assistantMessageEvent: { type: string; contentIndex?: number; delta?: string } }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_execution_update'; toolCallId: string; toolName: string; args: Record<string, unknown>; partialResult?: ToolResult }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: ToolResult; isError?: boolean }
  | { type: 'session_action_update'; actions: SessionActions }
  | { type: 'compaction_start'; reason: string }
  | { type: 'compaction_end'; reason: string; aborted: boolean }
  | { type: 'auto_retry_start'; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; finalError?: string }
  | { type: 'extension_error'; message?: string }
  | { type: string; [k: string]: unknown }

export interface RpcResponse<T = unknown> {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: T
  error?: string
}

/** Metadados de sessão salva, lidos direto do JSONL. */
export interface SessionSummary {
  id: string
  path: string
  cwd: string
  createdAt: string
  updatedAt: string
  title: string
  messageCount: number
  sizeBytes: number
}

export type BridgeStatus = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'

// ------------------------------------------------------------------ árvore RLM

export interface AgentNode {
  activeSessionId: string
  sessionId: string
  sessionFile: string
  /** Nome dado no spawn (`rlm(..., name=...)`). Vazio para o root. */
  name: string
  kind: 'root' | 'subagent'
  depth: number
  parentActiveSessionId?: string
  rlmChildId?: string
  /** Código Python que originou o subagente, reportado pelo daemon. */
  spawnCode?: string
  status: 'working' | 'idle' | 'done'
  taskState: string
  replied: boolean
  hasRunningChildren: boolean
  messageCount: number
  firstMessage: string
  cwd: string
  modelName: string
  lastActivityAt: string
  children: AgentNode[]
}

export interface AgentTreeSnapshot {
  roots: AgentNode[]
  total: number
  subagents: number
  at: number
}

// ----------------------------------------------------------------- pastas

export interface Folder {
  id: string
  name: string
  order: number
}

export interface FolderState {
  folders: Folder[]
  /** sessionId -> folderId */
  assignments: Record<string, string>
  /** chave de grupo -> colapsado */
  collapsed: Record<string, boolean>
  /** sessionId -> fixada no topo */
  pinned?: Record<string, boolean>
  /** sessionId -> arquivada (some da lista até habilitar exibição) */
  archived?: Record<string, boolean>
  /** sessionId -> título dado pelo usuário na GUI */
  titles?: Record<string, string>
}

// ----------------------------------------------------------------- arquivos

export interface DirEntry {
  name: string
  /** Caminho relativo à raiz do workspace. */
  path: string
  isDir: boolean
  size: number
}

// ------------------------------------------------------------------ uso

export interface UsageStats {
  sessions: number
  messages: number
  /** Soma de `totalTokens`, incluindo cache — igual ao que o agente reporta. */
  tokens: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  favoriteModel: string
  /** Hora do dia com mais mensagens; -1 quando não há dados. */
  peakHour: number
  days: { day: string; count: number }[]
}
